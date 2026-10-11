use std::{
    fs,
    io,
    net::{SocketAddr, TcpListener, TcpStream},
    path::Path,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use tauri::{Manager, State};

struct BackendState {
    base_url: String,
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn backend_base_url(state: State<'_, BackendState>) -> String {
    state.base_url.clone()
}

#[cfg(unix)]
fn terminate_backend(child: &mut Child) {
    let process_group = child.id() as libc::pid_t;

    unsafe {
        libc::kill(-process_group, libc::SIGTERM);
    }

    let deadline = Instant::now() + Duration::from_secs(2);

    loop {
        let _ = child.try_wait();
        let group_alive = unsafe { libc::kill(-process_group, 0) == 0 };

        if !group_alive {
            break;
        }

        if Instant::now() >= deadline {
            unsafe {
                libc::kill(-process_group, libc::SIGKILL);
            }
            break;
        }

        thread::sleep(Duration::from_millis(50));
    }

    let _ = child.wait();
}

#[cfg(windows)]
fn terminate_backend(child: &mut Child) {
    use std::os::windows::process::CommandExt;

    let pid = child.id().to_string();

    let _ = Command::new("taskkill")
        .args(["/PID", pid.as_str(), "/T", "/F"])
        .creation_flags(0x08000000)
        .status();

    let _ = child.wait();
}

#[cfg(not(any(unix, windows)))]
fn terminate_backend(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    suggested_name: String,
    extension: String,
    content_base64: String,
    companion_base64: Option<String>,
    companion_suffix: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        use tauri_plugin_dialog::DialogExt;

        let extension = extension.trim().trim_start_matches('.').to_lowercase();
        let dialog = app.dialog().file().set_file_name(suggested_name);
        let dialog = if extension.is_empty() {
            dialog
        } else {
            dialog.add_filter("Archivo exportado", &[extension.as_str()])
        };

        let Some(selected_path) = dialog.blocking_save_file() else {
            return Ok(None);
        };

        let mut path = selected_path
            .into_path()
            .map_err(|error| format!("No se pudo resolver la ruta elegida: {error}"))?;
        if !extension.is_empty()
            && !path
                .extension()
                .and_then(|part| part.to_str())
                .is_some_and(|part| part.eq_ignore_ascii_case(&extension))
        {
            path.set_extension(&extension);
        }
        let bytes = STANDARD
            .decode(content_base64.as_bytes())
            .map_err(|error| format!("El contenido para exportar no es válido: {error}"))?;

        fs::write(&path, bytes)
            .map_err(|error| format!("No se pudo guardar '{}': {error}", path.display()))?;

        match (companion_base64, companion_suffix) {
            (Some(encoded), Some(suffix)) => {
                if !suffix.starts_with('.')
                    || !suffix.chars().all(|character| {
                        character.is_ascii_alphanumeric()
                            || character == '.'
                            || character == '_'
                            || character == '-'
                    })
                {
                    return Err("La extensión del proyecto complementario no es válida.".to_string());
                }
                let stem = path
                    .file_stem()
                    .and_then(|part| part.to_str())
                    .ok_or_else(|| "No se pudo obtener el nombre del archivo exportado.".to_string())?;
                let companion_path = path
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .join(format!("{stem}{suffix}"));
                let companion_bytes = STANDARD
                    .decode(encoded.as_bytes())
                    .map_err(|error| format!("El proyecto complementario no es válido: {error}"))?;
                fs::write(&companion_path, companion_bytes).map_err(|error| {
                    format!(
                        "El archivo principal se guardó, pero no se pudo guardar el proyecto complementario '{}': {error}",
                        companion_path.display()
                    )
                })?;
            }
            (None, None) => {}
            _ => {
                return Err(
                    "La exportación complementaria requiere contenido y extensión.".to_string(),
                );
            }
        }

        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|error| format!("Falló el proceso de guardado: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let mut child_to_manage = None;

            let base_url = if cfg!(debug_assertions) {
                // En desarrollo, concurrently inicia FastAPI en el puerto 8000.
                "http://127.0.0.1:8000".to_string()
            } else {
                // El sidecar de producción está junto al ejecutable de Tauri.
                let executable = std::env::current_exe()?;
                let app_dir = executable.parent().ok_or_else(|| {
                    io::Error::other("No se pudo encontrar el directorio de la aplicación")
                })?;

                #[cfg(windows)]
                let sidecar_name = "ascii-motion-api.exe";

                #[cfg(not(windows))]
                let sidecar_name = "ascii-motion-api";

                let sidecar_path = app_dir.join(sidecar_name);

                if !sidecar_path.is_file() {
                    return Err(io::Error::new(
                        io::ErrorKind::NotFound,
                        format!("No se encontró el backend: {}", sidecar_path.display()),
                    )
                    .into());
                }

                let listener = TcpListener::bind("127.0.0.1:0")?;
                let port = listener.local_addr()?.port();
                drop(listener);

                let port_arg = port.to_string();
                let mut command = Command::new(&sidecar_path);

                command
                    .arg("--port")
                    .arg(&port_arg)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());

                // El sidecar y sus descendientes comparten un grupo exclusivo.
                #[cfg(unix)]
                {
                    use std::os::unix::process::CommandExt;
                    command.process_group(0);
                }

                let mut child = command.spawn()?;
                let address = SocketAddr::from(([127, 0, 0, 1], port));
                let deadline = Instant::now() + Duration::from_secs(20);

                let ready = loop {
                    if TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok() {
                        break true;
                    }

                    if let Some(status) = child.try_wait()? {
                        terminate_backend(&mut child);
                        return Err(io::Error::other(format!(
                            "El backend terminó antes de responder: {status}"
                        ))
                        .into());
                    }

                    if Instant::now() >= deadline {
                        break false;
                    }

                    thread::sleep(Duration::from_millis(100));
                };

                if !ready {
                    terminate_backend(&mut child);
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "El backend no respondió en 20 segundos",
                    )
                    .into());
                }

                child_to_manage = Some(child);
                format!("http://127.0.0.1:{port}")
            };

            app.manage(BackendState {
                base_url,
                child: Mutex::new(child_to_manage),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_base_url, save_export_file])
        .build(tauri::generate_context!())
        .expect("Error al construir ASCII Motion");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<BackendState>() {
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(mut child) = guard.take() {
                        terminate_backend(&mut child);
                    }
                }
            }
        }
    });
}
