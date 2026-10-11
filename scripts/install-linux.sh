#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="ASCII Motion"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
TAURI_DIR="$FRONTEND_DIR/src-tauri"

fail() {
    printf '\nERROR: %s\n' "$*" >&2
    exit 1
}

note() {
    printf '\n==> %s\n' "$*"
}

[[ $EUID -ne 0 ]] || fail \
    "No ejecutes como root. Ejecuta este script con tu usuario normal."

[[ -f "$FRONTEND_DIR/package.json" ]] || fail \
    "No encuentro frontend/package.json."

[[ -f "$TAURI_DIR/Cargo.toml" ]] || fail \
    "No encuentro frontend/src-tauri/Cargo.toml."

[[ -d "$ROOT_DIR/src/ascii_motion" ]] || fail \
    "No encuentro el código fuente del backend FastAPI."

[[ -r /etc/os-release ]] || fail \
    "No se pudo identificar tu distribución Linux."

# shellcheck disable=SC1091
. /etc/os-release

DISTRO="${ID:-unknown}"
PACKAGES=()

case "$DISTRO" in
    arch|endeavouros|manjaro)
        DISTRO_FAMILY="arch"
        PACKAGES=(
            base-devel
            webkit2gtk-4.1
            curl wget file openssl
            appmenu-gtk-module
            libappindicator-gtk3
            librsvg xdotool
            git nodejs npm
            python python-pip
            rust cargo pkgconf
        )
        ;;
    void)
        DISTRO_FAMILY="void"
        PACKAGES=(
            base-devel
            libwebkit2gtk41-devel
            gtk+3-devel
            curl wget file
            openssl-devel librsvg-devel xdotool
            git nodejs
            python3 python3-pip python3-devel
            rust cargo pkg-config
        )
        ;;
    *)
        fail "Distribución no contemplada: ${PRETTY_NAME:-$DISTRO}. Usa Arch Linux o Void Linux."
        ;;
esac

command -v sudo >/dev/null 2>&1 || fail \
    "Se necesita sudo para instalar dependencias del sistema."

printf '\n'
printf '============================================\n'
printf '  %s — instalador para %s\n' \
    "$APP_NAME" "${PRETTY_NAME:-$DISTRO}"
printf '============================================\n\n'

printf 'El instalador realizará estas operaciones:\n'
printf '  1. Instalar las dependencias del sistema.\n'
printf '  2. Instalar las dependencias del frontend.\n'
printf '  3. Crear el entorno Python del backend.\n'
printf '  4. Compilar la aplicación Tauri.\n'
printf '  5. Instalar el ejecutable para tu usuario.\n'
printf '  6. Crear un lanzador y una entrada en el menú gráfico.\n\n'

printf 'Paquetes que se comprobarán; solo se instalarán los que falten:\n'
printf '  - %s\n' "${PACKAGES[@]}"
printf '\n'
printf 'También se descargarán dependencias de npm, Rust y Python.\n'
printf 'Se necesita conexión a Internet y espacio para compilar.\n'

if [[ "$DISTRO_FAMILY" == "arch" ]]; then
    printf '\nAVISO: pacman -Syu actualizará el sistema además de instalar los paquetes.\n'
else
    printf '\nAVISO: Void utilizará los índices XBPS disponibles sin forzar una sincronización global.\n'
fi

printf '\n'
read -r -p '¿Confirmas la instalación de dependencias y la compilación? [Y/N]: ' answer

case "$answer" in
    [Yy]|[Yy][Ee][Ss]) ;;
    *)
        printf '\nInstalación cancelada. No se instalaron dependencias.\n'
        exit 0
        ;;
esac

note "Solicitando permisos"
sudo -v

note "Comprobando dependencias del sistema"
MISSING_PACKAGES=()

if [[ "$DISTRO_FAMILY" == "arch" ]]; then
    for package in "${PACKAGES[@]}"; do
        if [[ "$package" == "base-devel" ]] &&
           command -v cc >/dev/null 2>&1 &&
           command -v make >/dev/null 2>&1 &&
           command -v pkg-config >/dev/null 2>&1; then
            continue
        fi

        if ! pacman -Qq "$package" >/dev/null 2>&1; then
            MISSING_PACKAGES+=("$package")
        fi
    done

    if (("${#MISSING_PACKAGES[@]}" > 0)); then
        printf '\nSe instalarán los paquetes ausentes en Arch:\n'
        printf '  - %s\n' "${MISSING_PACKAGES[@]}"
        printf 'Aviso: pacman -Syu puede actualizar otros paquetes del sistema.\n'
        sudo pacman -Syu --needed "${MISSING_PACKAGES[@]}"
    else
        note "Todas las dependencias del sistema ya están instaladas"
    fi
else
    for package in "${PACKAGES[@]}"; do
        if ! xbps-query -p pkgver "$package" >/dev/null 2>&1; then
            MISSING_PACKAGES+=("$package")
        fi
    done

    if (("${#MISSING_PACKAGES[@]}" > 0)); then
        printf '\nSe comprobará la disponibilidad de estos paquetes en los índices XBPS existentes:\n'
        printf '  - %s\n' "${MISSING_PACKAGES[@]}"

        for package in "${MISSING_PACKAGES[@]}"; do
            if ! xbps-query -R -p pkgver "$package" >/dev/null 2>&1; then
                printf '\nERROR: no se encuentra el paquete %s en los índices disponibles.\n' "$package" >&2
                printf 'No se ha modificado la configuración de repositorios.\n' >&2
                printf 'Revisa los repositorios e índices XBPS antes de continuar.\n' >&2
                exit 1
            fi
        done

        sudo xbps-install -y "${MISSING_PACKAGES[@]}"
    else
        note "Todas las dependencias del sistema ya están instaladas"
    fi
fi

for cmd in git npm node python3 cargo rustc; do
    command -v "$cmd" >/dev/null 2>&1 || fail \
        "No se encuentra el comando $cmd después de instalar dependencias."
done

note "Instalando dependencias del frontend"
cd "$FRONTEND_DIR"

if [[ -f package-lock.json ]]; then
    npm ci
else
    npm install
fi

note "Compilando el frontend"
npm run build

note "Compilando Tauri"
npm run tauri -- build --no-bundle

note "Identificando el ejecutable generado"
CARGO_NAME="$(
    python3 - "$TAURI_DIR/Cargo.toml" <<'PY'
import sys
import tomllib

with open(sys.argv[1], "rb") as f:
    cargo = tomllib.load(f)

package = cargo.get("package", {})
name = package.get("default-run") or package.get("name")

if not name:
    raise SystemExit("No se pudo identificar el binario Tauri.")

print(name)
PY
)" || fail "No pude leer el nombre del ejecutable Tauri."

BUILT_BINARY=""
for candidate in \
    "$TAURI_DIR/target/release/$CARGO_NAME" \
    "$TAURI_DIR/target/release/${CARGO_NAME//-/_}"; do
    if [[ -x "$candidate" && -f "$candidate" ]]; then
        BUILT_BINARY="$candidate"
        break
    fi
done

[[ -n "$BUILT_BINARY" ]] || fail \
    "La compilación terminó, pero no se encontró el ejecutable esperado. Revisa frontend/src-tauri/target/release/."

note "Preparando la instalación local"

APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/ascii-motion"
BIN_DIR="$APP_ROOT/bin"
SOURCE_DIR="$APP_ROOT/src"
VENV_DIR="$APP_ROOT/venv"
LAUNCHER_DIR="$HOME/.local/bin"
LAUNCHER="$LAUNCHER_DIR/ascii-motion-launcher"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/ascii-motion.desktop"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/ascii-motion"

mkdir -p "$BIN_DIR" "$SOURCE_DIR" "$LAUNCHER_DIR" "$DESKTOP_DIR" "$STATE_DIR"

# Crear o actualizar el entorno Python de la instalación.
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip

if [[ -f "$ROOT_DIR/requirements.txt" ]]; then
    "$VENV_DIR/bin/python" -m pip install -r "$ROOT_DIR/requirements.txt"
else
    # Leer dependencias PEP 621 si existen en pyproject.toml.
    DEP_FILE="$(mktemp)"
    if [[ -f "$ROOT_DIR/pyproject.toml" ]]; then
        python3 - "$ROOT_DIR/pyproject.toml" > "$DEP_FILE" <<'PY'
import sys
import tomllib

with open(sys.argv[1], "rb") as f:
    config = tomllib.load(f)

for dependency in config.get("project", {}).get("dependencies", []):
    print(dependency)
PY
    fi

    if [[ -s "$DEP_FILE" ]]; then
        "$VENV_DIR/bin/python" -m pip install -r "$DEP_FILE"
    else
        "$VENV_DIR/bin/python" -m pip install fastapi
    fi
    rm -f "$DEP_FILE"
fi

# Dependencias necesarias para ejecutar la API y procesar imágenes/GIF.
"$VENV_DIR/bin/python" -m pip install \
    fastapi uvicorn pillow python-multipart

note "Copiando el backend y el ejecutable"

install -m 0755 "$BUILT_BINARY" "$BIN_DIR/ascii-motion"

# Se actualiza únicamente el módulo de ASCII Motion dentro de su propia instalación.
mkdir -p "$SOURCE_DIR/ascii_motion"
cp -a "$ROOT_DIR/src/ascii_motion/." "$SOURCE_DIR/ascii_motion/"

"$VENV_DIR/bin/python" -c \
    'import fastapi, uvicorn, PIL, multipart' ||
    fail "Falta una dependencia Python necesaria para ejecutar el backend."

# Tauri espera este ejecutable y se encargará de iniciar y detener la API.
cat > "$BIN_DIR/ascii-motion-api" <<'API_WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/ascii-motion"
PYTHON="$APP_ROOT/venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
    printf 'ERROR: no se encontró el entorno Python de ASCII Motion.\n' >&2
    exit 1
fi

export PYTHONPATH="$APP_ROOT/src${PYTHONPATH:+:$PYTHONPATH}"
exec "$PYTHON" -m uvicorn ascii_motion.api.main:app \
    --app-dir "$APP_ROOT/src" "$@"
API_WRAPPER

chmod 0755 "$BIN_DIR/ascii-motion-api"

note "Creando el lanzador de escritorio"

cat > "$LAUNCHER" <<'LAUNCHER_SCRIPT'
#!/usr/bin/env bash
set -u

APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/ascii-motion"
APP_BINARY="$APP_ROOT/bin/ascii-motion"
BACKEND="$APP_ROOT/bin/ascii-motion-api"

notify_user() {
    if command -v notify-send >/dev/null 2>&1; then
        notify-send "ASCII Motion" "$1" >/dev/null 2>&1 || true
    fi
    printf '%s\n' "$1" >&2
}

if [[ ! -x "$APP_BINARY" || ! -x "$BACKEND" ]]; then
    notify_user "Falta el ejecutable gráfico o el backend. Vuelve a ejecutar el instalador."
    exit 1
fi

# El hook de inicio de Tauri es quien debe iniciar el backend.
# No arrancamos Uvicorn aquí para evitar dos servidores compitiendo por el puerto.
exec "$APP_BINARY" "$@"
LAUNCHER_SCRIPT

chmod 0755 "$LAUNCHER"

ICON_NAME="applications-graphics"
for icon_candidate in \
    "$TAURI_DIR/icons/icon.png" \
    "$TAURI_DIR/icons/128x128.png" \
    "$TAURI_DIR/icons/128x128@2x.png"; do
    if [[ -f "$icon_candidate" ]]; then
        install -m 0644 "$icon_candidate" "$APP_ROOT/ascii-motion.png"
        ICON_NAME="$APP_ROOT/ascii-motion.png"
        break
    fi
done

cat > "$DESKTOP_FILE" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=ASCII Motion
Comment=Convierte imágenes y GIF en arte ASCII
Exec="$LAUNCHER"
Icon=$ICON_NAME
Terminal=false
Categories=Graphics;Utility;
StartupNotify=true
DESKTOP_ENTRY

chmod 0644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

printf '\n============================================\n'
printf 'ASCII Motion se instaló para tu usuario.\n\n'
printf 'Menú de aplicaciones: ASCII Motion\n'
printf 'Ejecutable: %s\n' "$BIN_DIR/ascii-motion"
printf 'Lanzador:   %s\n' "$LAUNCHER"
printf 'Registro API: %s/backend.log\n' "$STATE_DIR"
printf '\nPuedes abrirlo desde el menú o ejecutar:\n%s\n' "$LAUNCHER"
printf '============================================\n'
