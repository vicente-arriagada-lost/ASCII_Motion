"""Local API for the ASCII Motion frontend."""

from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from ascii_motion.core.service import convert_image_file
from ascii_motion.models.settings import ConversionSettings

app = FastAPI(
    title="ASCII Motion API",
    description="Local API for converting images into ASCII art.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Desarrollo con Vite
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Aplicación de escritorio Tauri 2
        "tauri://localhost",
        "http://tauri.localhost",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
MAX_FILE_SIZE = 25 * 1024 * 1024


@app.get("/health")
def health_check() -> dict[str, str]:
    """Report whether the local API is running."""
    return {"status": "ok", "application": "ASCII Motion"}


@app.post("/convert/image")
async def convert_image(
    file: UploadFile = File(...),
    width: int = Form(default=80, ge=10, le=300),
    charset: str = Form(default="standard"),
    contrast: float = Form(default=1.0, ge=0.1, le=3.0),
    brightness: float = Form(default=1.0, ge=0.1, le=3.0),
    invert: bool = Form(default=False),
    character_aspect_ratio: float = Form(default=0.5, ge=0.1, le=2.0),
    gamma: float = Form(default=1.0, ge=0.1, le=3.0),
    normalize_contrast: bool = Form(default=False),
) -> dict[str, object]:
    """Convert an uploaded still image to ASCII art locally."""
    suffix = Path(file.filename or "").suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Formato no compatible. Usa PNG, JPG, WEBP o BMP.",
        )

    content = await file.read(MAX_FILE_SIZE + 1)

    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="El archivo supera el límite de 25 MB.",
        )

    settings = ConversionSettings(
        width=width,
        charset=charset,
        contrast=contrast,
        brightness=brightness,
        invert=invert,
        character_aspect_ratio=character_aspect_ratio,
        gamma=gamma,
        normalize_contrast=normalize_contrast,
    )

    try:
        with NamedTemporaryFile(suffix=suffix) as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            ascii_content = convert_image_file(temporary_file.name, settings)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "No se pudo convertir la imagen. Comprueba que el archivo sea válido."
            ),
        ) from exc
    finally:
        await file.close()

    return {
        "content": ascii_content,
        "width": width,
        "charset": charset,
    }
