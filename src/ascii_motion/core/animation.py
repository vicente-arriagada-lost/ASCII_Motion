from pathlib import Path

from PIL import Image, UnidentifiedImageError

from ascii_motion.core.converter import DEFAULT_CHARSET, convert_to_ascii
from ascii_motion.exceptions import AnimationLoadError
from ascii_motion.models.frame import Frame
from ascii_motion.models.settings import ConversionSettings


def load_animation(
    path: str | Path,
    width: int = 80,
    charset: str = DEFAULT_CHARSET,
    contrast: float = 1.0,
    brightness: float = 1.0,
    invert: bool = False,
    character_aspect_ratio: float = 0.5,
    gamma: float = 1.0,
    normalize_contrast: bool = False,
    max_frames: int = 500,
    *,
    settings: ConversionSettings | None = None,
) -> list[Frame]:
    """Load a GIF and convert its frames to ASCII."""
    animation_path = Path(path).expanduser()

    if not animation_path.exists():
        raise AnimationLoadError(f"File not found: {animation_path}")

    if not animation_path.is_file():
        raise AnimationLoadError(f"Path is not a file: {animation_path}")

    if max_frames < 1:
        raise ValueError("Maximum frame count must be greater than zero")

    if settings is None:
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

    frames: list[Frame] = []

    try:
        with Image.open(animation_path) as image:
            if image.format != "GIF":
                raise AnimationLoadError(
                    f"Unsupported animation format: {image.format}"
                )

            if image.n_frames > max_frames:
                raise AnimationLoadError(
                    f"Animation has {image.n_frames} frames; limit is {max_frames}"
                )

            for index in range(image.n_frames):
                image.seek(index)
                frame_image = image.convert("RGB")

                ascii_art = convert_to_ascii(
                    frame_image,
                    settings=settings,
                )

                duration_ms = image.info.get("duration", 100)
                if not isinstance(duration_ms, (int, float)):
                    duration_ms = 100

                frames.append(
                    Frame(
                        content=ascii_art,
                        duration_ms=max(0, int(duration_ms)),
                    )
                )

    except UnidentifiedImageError as exc:
        raise AnimationLoadError(f"File is not a valid GIF: {animation_path}") from exc
    except OSError as exc:
        raise AnimationLoadError(f"Could not read animation: {animation_path}") from exc

    return frames
