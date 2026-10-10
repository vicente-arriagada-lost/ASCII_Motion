from pathlib import Path

from PIL import Image, UnidentifiedImageError

from ascii_motion.exceptions import ImageLoadError

SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "GIF"}


def load_image(path: str | Path) -> Image.Image:
    """Load an image and return its first frame as an independent RGB image."""
    image_path = Path(path).expanduser()

    if not image_path.exists():
        raise ImageLoadError(f"File not found: {image_path}")

    if not image_path.is_file():
        raise ImageLoadError(f"Path is not a file: {image_path}")

    try:
        with Image.open(image_path) as image:
            if image.format not in SUPPORTED_FORMATS:
                raise ImageLoadError(f"Unsupported image format: {image.format}")

            image.seek(0)
            image.load()

            return image.convert("RGB")

    except UnidentifiedImageError as exc:
        raise ImageLoadError(
            f"File is not a valid or supported image: {image_path}"
        ) from exc
    except OSError as exc:
        raise ImageLoadError(f"Could not read image: {image_path}") from exc
