use std::{
    io,
    net::{SocketAddr, TcpListener, TcpStream},
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![backend_base_url])
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
