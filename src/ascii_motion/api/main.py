"""Local API for the ASCII Motion frontend."""

from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from ascii_motion.core.service import (
    convert_gif_file,
    convert_image_file_with_colors,
)
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
    height: int | None = Form(default=None, ge=1, le=300),
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
        height=height,
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
            ascii_content, color_map = convert_image_file_with_colors(
                temporary_file.name, settings
            )

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
        "colors": color_map,
        "width": width,
        "height": len(ascii_content.splitlines()),
        "charset": charset,
    }



@app.post("/export/gif")
async def export_ascii_gif(
    project_json: str = Form(...),
    foreground: str = Form(default="#d0baff"),
    background: str = Form(default="#0c0c11"),
    font_size: int = Form(default=12, ge=6, le=16),
):
    """Render ASCII animation into a GIF and embed the editable project."""
    import json
    import math
    import re
    from io import BytesIO

    from fastapi.responses import Response
    from PIL import Image, ImageDraw, ImageFont

    encoded_project = project_json.encode("utf-8")
    if len(encoded_project) > 55 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="El proyecto es demasiado grande para incrustarlo en el GIF.",
        )

    try:
        project = json.loads(project_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail="El proyecto enviado no contiene JSON válido.",
        ) from exc

    if (
        not isinstance(project, dict)
        or project.get("format") != "ASCII Motion Project"
        or project.get("version") != 1
    ):
        raise HTTPException(
            status_code=422,
            detail="No se recibió un proyecto compatible de ASCII Motion.",
        )

    if not re.fullmatch(r"#[0-9a-fA-F]{6}", foreground or ""):
        raise HTTPException(status_code=422, detail="Color de texto no válido.")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", background or ""):
        raise HTTPException(status_code=422, detail="Color de fondo no válido.")

    output = project.get("output")
    frames = output.get("frames") if isinstance(output, dict) else None

    if not isinstance(frames, list) or not 1 <= len(frames) <= 500:
        raise HTTPException(
            status_code=422,
            detail="El proyecto debe incluir entre 1 y 500 fotogramas.",
        )

    validated_frames = []
    total_characters = 0

    for frame in frames:
        if not isinstance(frame, dict) or not isinstance(frame.get("content"), str):
            raise HTTPException(
                status_code=422,
                detail="El proyecto contiene un fotograma no válido.",
            )

        content = frame["content"]
        if not content:
            raise HTTPException(
                status_code=422,
                detail="El proyecto contiene un fotograma vacío.",
            )

        lines = content.splitlines() or [""]
        columns = max(len(line) for line in lines)

        if columns > 300 or len(lines) > 300:
            raise HTTPException(
                status_code=422,
                detail="Un fotograma supera las dimensiones admitidas.",
            )

        total_characters += len(content)
        if total_characters > 10_000_000:
            raise HTTPException(
                status_code=413,
                detail="La animación contiene demasiados caracteres.",
            )

        try:
            duration = float(frame.get("duration_ms", 100))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="Un fotograma tiene una duración no válida.",
            ) from exc

        if not math.isfinite(duration) or duration < 0 or duration > 60000:
            raise HTTPException(
                status_code=422,
                detail="La duración de un fotograma está fuera de rango.",
            )

        # GIF almacena las duraciones en centésimas de segundo.
        duration = max(20, min(60000, round(duration / 10) * 10))
        colors = frame.get("colors")
        if colors is not None and (
            not isinstance(colors, str)
            or len(colors) != sum(len(line) for line in lines) * 6
            or re.fullmatch(r"[0-9a-fA-F]*", colors) is None
        ):
            raise HTTPException(
                status_code=422,
                detail="Un fotograma contiene un mapa de colores no válido.",
            )

        validated_frames.append((content, int(duration), lines, columns, colors))

    font_candidates = (
        "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/TTF/LiberationMono-Regular.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf",
    )

    font = None
    for candidate in font_candidates:
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue

    if font is None:
        try:
            font = ImageFont.truetype("DejaVuSansMono.ttf", font_size)
        except OSError:
            font = ImageFont.load_default()

    cell_width = max(1, round(font.getlength("M")))
    ascent, descent = font.getmetrics()
    line_height = max(font_size + 2, ascent + descent + 1)
    padding = max(2, font_size // 3)

    canvas_columns = max(frame[3] for frame in validated_frames)
    canvas_rows = max(len(frame[2]) for frame in validated_frames)
    pixel_width = canvas_columns * cell_width + padding * 2
    pixel_height = canvas_rows * line_height + padding * 2

    if (
        pixel_width > 8192
        or pixel_height > 8192
        or pixel_width * pixel_height > 30_000_000
    ):
        raise HTTPException(
            status_code=413,
            detail="La resolución del GIF sería demasiado grande.",
        )

    text_rgb = tuple(
        int(foreground[index:index + 2], 16) for index in (1, 3, 5)
    )
    background_rgb = tuple(
        int(background[index:index + 2], 16) for index in (1, 3, 5)
    )

    palette_enum = getattr(Image, "Palette", None)
    palette_mode = getattr(palette_enum, "ADAPTIVE", None)
    if palette_mode is None:
        palette_mode = getattr(Image, "ADAPTIVE", 1)

    rendered_frames = []
    durations = []

    preserve_image_colors = bool(
        project.get("settings", {}).get("preserveImageColors", True)
        if isinstance(project.get("settings"), dict)
        else True
    )

    for content, duration, lines, _, colors in validated_frames:
        image = Image.new(
            "RGB", (pixel_width, pixel_height), background_rgb
        )
        drawing = ImageDraw.Draw(image)
        if preserve_image_colors and colors:
            color_offset = 0
            for row_index, line in enumerate(lines):
                y = padding + row_index * line_height
                for column_index, character in enumerate(line):
                    color_hex = colors[color_offset:color_offset + 6]
                    color_offset += 6
                    char_rgb = tuple(
                        int(color_hex[index:index + 2], 16)
                        for index in (0, 2, 4)
                    )
                    if character != " ":
                        drawing.text(
                            (padding + column_index * cell_width, y),
                            character,
                            fill=char_rgb,
                            font=font,
                        )
        else:
            drawing.multiline_text(
                (padding, padding),
                content,
                fill=text_rgb,
                font=font,
                spacing=max(1, font_size // 6),
            )
        rendered_frames.append(
            image.convert("P", palette=palette_mode, colors=256)
        )
        durations.append(duration)

    buffer = BytesIO()
    try:
        rendered_frames[0].save(
            buffer,
            format="GIF",
            save_all=True,
            append_images=rendered_frames[1:],
            duration=durations,
            loop=0,
            disposal=2,
            optimize=False,
            comment=encoded_project,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo generar el GIF animado.",
        ) from exc

    return Response(
        content=buffer.getvalue(),
        media_type="image/gif",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/project/gif-metadata")
async def read_gif_project_metadata(file: UploadFile = File(...)):
    """Read an ASCII Motion project embedded in a GIF comment extension."""
    import json
    from io import BytesIO

    from PIL import Image, UnidentifiedImageError

    try:
        if not (file.filename or "").lower().endswith(".gif"):
            raise HTTPException(
                status_code=415,
                detail="Selecciona un archivo GIF.",
            )

        content = await file.read(60 * 1024 * 1024 + 1)
        if not content:
            raise HTTPException(status_code=400, detail="El GIF está vacío.")
        if len(content) > 60 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="El GIF supera el límite de 60 MB.",
            )

        try:
            with Image.open(BytesIO(content)) as image:
                if image.format != "GIF":
                    raise HTTPException(
                        status_code=415,
                        detail="El archivo seleccionado no es un GIF válido.",
                    )
                comment = image.info.get("comment")
        except UnidentifiedImageError as exc:
            raise HTTPException(
                status_code=422,
                detail="No se pudo leer el GIF seleccionado.",
            ) from exc

        if isinstance(comment, bytes):
            try:
                comment_text = comment.decode("utf-8")
            except UnicodeDecodeError:
                return {"project": None}
        elif isinstance(comment, str):
            comment_text = comment
        else:
            return {"project": None}

        if len(comment_text.encode("utf-8")) > 55 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Los metadatos del GIF son demasiado grandes.",
            )

        try:
            project = json.loads(comment_text)
        except json.JSONDecodeError:
            return {"project": None}

        if (
            not isinstance(project, dict)
            or project.get("format") != "ASCII Motion Project"
            or project.get("version") != 1
        ):
            return {"project": None}

        return {"project": project}
    finally:
        await file.close()


@app.post("/convert/gif")
async def convert_gif(
    file: UploadFile = File(...),
    width: int = Form(default=80, ge=10, le=300),
    height: int | None = Form(default=None, ge=1, le=300),
    charset: str = Form(default="standard"),
    contrast: float = Form(default=1.0, ge=0.1, le=3.0),
    brightness: float = Form(default=1.0, ge=0.1, le=3.0),
    invert: bool = Form(default=False),
    character_aspect_ratio: float = Form(default=0.5, ge=0.1, le=2.0),
    gamma: float = Form(default=1.0, ge=0.1, le=3.0),
    normalize_contrast: bool = Form(default=False),
    max_frames: int = Form(default=200, ge=1, le=500),
) -> dict[str, object]:
    """Convert a GIF into ASCII frames while preserving frame durations."""
    suffix = Path(file.filename or "").suffix.lower()

    if suffix != ".gif":
        await file.close()
        raise HTTPException(
            status_code=415,
            detail="Formato no compatible. Selecciona un archivo GIF.",
        )

    try:
        content = await file.read(MAX_FILE_SIZE + 1)

        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="El GIF supera el límite de 25 MB.",
            )

        settings = ConversionSettings(
            width=width,
            height=height,
            charset=charset,
            contrast=contrast,
            brightness=brightness,
            invert=invert,
            character_aspect_ratio=character_aspect_ratio,
            gamma=gamma,
            normalize_contrast=normalize_contrast,
        )

        with NamedTemporaryFile(suffix=".gif") as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()

            frames = convert_gif_file(
                temporary_file.name,
                settings=settings,
                max_frames=max_frames,
                include_colors=True,
            )

        total_characters = sum(len(frame.content) for frame in frames)
        if total_characters > 10_000_000:
            raise HTTPException(
                status_code=413,
                detail=(
                    "La animación convertida es demasiado grande. "
                    "Prueba con menos fotogramas o dimensiones menores."
                ),
            )

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "No se pudo convertir el GIF. Comprueba que la animación "
                "sea válida y que no supere los límites admitidos."
            ),
        ) from exc
    finally:
        await file.close()

    return {
        "frames": [
            {
                "content": frame.content,
                "duration_ms": frame.duration_ms,
                "colors": frame.colors,
            }
            for frame in frames
        ],
        "frame_count": len(frames),
        "width": width,
        "height": len(frames[0].content.splitlines()) if frames else 0,
        "charset": charset,
    }
