#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Linux" ]]; then
    echo "ERROR: este script genera AppImage para Linux."
    exit 1
fi

for command in node npm rustc cargo; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "ERROR: falta el comando requerido: $command"
        exit 1
    fi
done

if [[ ! -x "$ROOT_DIR/.venv/bin/python" ]]; then
    echo "ERROR: no existe .venv/bin/python."
    exit 1
fi

REAL_PKGCONF="$(PATH=/usr/bin:/bin command -v pkgconf || true)"
if [[ -z "$REAL_PKGCONF" || ! -x "$REAL_PKGCONF" ]]; then
    echo "ERROR: instala pkgconf antes de compilar."
    exit 1
fi

# Adaptación para Void Linux: normalizar /usr/lib64 a /usr/lib
# al consultar rutas GTK durante el empaquetado AppImage.
BUILD_TOOLS="$ROOT_DIR/.build-tools/ascii-motion"
mkdir -p "$BUILD_TOOLS"

cat > "$BUILD_TOOLS/pkg-config" <<'SH'
#!/bin/sh

output=$(/usr/bin/pkgconf "$@")
status=$?

if [ "$status" -ne 0 ]; then
    if [ -n "$output" ]; then
        printf '%s\n' "$output"
    fi
    exit "$status"
fi

if [ -n "$output" ]; then
    printf '%s\n' "$output" | sed 's#/usr/lib64#/usr/lib#g'
fi

exit 0
SH

chmod +x "$BUILD_TOOLS/pkg-config"
ln -sfn pkg-config "$BUILD_TOOLS/pkgconf"
export PATH="$BUILD_TOOLS:$PATH"

GTK_LIBDIR="$(pkg-config --variable=libdir gtk+-3.0)"
if [[ "$GTK_LIBDIR" != "/usr/lib" ]]; then
    echo "ERROR: ruta GTK inesperada: $GTK_LIBDIR"
    exit 1
fi

source "$ROOT_DIR/.venv/bin/activate"

echo "===== 1. COMPILANDO BACKEND PYTHON ====="
python -m PyInstaller \
    --noconfirm \
    --clean \
    --onefile \
    --name ascii-motion-api \
    --paths src \
    --collect-submodules ascii_motion \
    --collect-all uvicorn \
    src/ascii_motion/desktop_api.py

echo
echo "===== 2. PREPARANDO SIDECAR ====="
TARGET="$(rustc --print host-tuple)"
SIDECAR="$ROOT_DIR/frontend/src-tauri/binaries/ascii-motion-api-$TARGET"

mkdir -p "$ROOT_DIR/frontend/src-tauri/binaries"
install -m 755 "$ROOT_DIR/dist/ascii-motion-api" "$SIDECAR"
echo "Sidecar preparado: $SIDECAR"

echo
echo "===== 3. CONSTRUYENDO APPIMAGE ====="
cd "$ROOT_DIR/frontend"
npm run tauri -- build --bundles appimage

APPIMAGE_DIR="$ROOT_DIR/frontend/src-tauri/target/release/bundle/appimage"
APPIMAGE="$(find "$APPIMAGE_DIR" -maxdepth 1 -type f -name '*.AppImage' \
    -printf '%T@ %p\n' | sort -nr | sed -n '1s/^[^ ]* //p')"

if [[ -z "$APPIMAGE" || ! -f "$APPIMAGE" ]]; then
    echo "ERROR: no se encontró el AppImage generado."
    exit 1
fi

VERSION="$(python -c \
    'import json; print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"

OUTPUT_DIR="$ROOT_DIR/release/linux-$TARGET"
OUTPUT="$OUTPUT_DIR/ASCII-Motion_${VERSION}_${TARGET}.AppImage"

mkdir -p "$OUTPUT_DIR"
install -m 755 "$APPIMAGE" "$OUTPUT"

echo
echo "===== COMPILACIÓN COMPLETADA ====="
echo "Archivo: $OUTPUT"
ls -lh "$OUTPUT"
