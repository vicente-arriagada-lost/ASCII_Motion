from pathlib import Path

from PIL import Image, UnidentifiedImageError

from ascii_motion.core.converter import (
    DEFAULT_CHARSET,
    convert_to_ascii,
    convert_to_ascii_with_colors,
)
from ascii_motion.exceptions import AnimationLoadError
from ascii_motion.models.frame import Frame
from ascii_motion.models.settings import ConversionSettings

DEFAULT_MAX_PIXELS = 20_000_000


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
    include_colors: bool = False,
    max_pixels: int = DEFAULT_MAX_PIXELS,
) -> list[Frame]:
    """Load a GIF and convert its frames to ASCII."""
    if (
        not isinstance(max_frames, int)
        or isinstance(max_frames, bool)
        or max_frames < 1
    ):
        raise ValueError("Maximum frame count must be a positive integer")

    if (
        not isinstance(max_pixels, int)
        or isinstance(max_pixels, bool)
        or max_pixels < 1
    ):
        raise ValueError("Maximum pixel count must be a positive integer")

    animation_path = Path(path).expanduser()

    if not animation_path.exists():
        raise AnimationLoadError(f"File not found: {animation_path}")

    if not animation_path.is_file():
        raise AnimationLoadError(f"Path is not a file: {animation_path}")

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

    if not isinstance(include_colors, bool):
        raise ValueError("include_colors must be a boolean")

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

                width_px, height_px = image.size

                if width_px * height_px > max_pixels:
                    raise AnimationLoadError(
                        f"Frame {index} exceeds pixel limit of {max_pixels}"
                    )

                frame_image = image.convert("RGB")
                if include_colors:
                    ascii_art, color_map = convert_to_ascii_with_colors(
                        frame_image, settings=settings
                    )
                else:
                    ascii_art = convert_to_ascii(frame_image, settings=settings)
                    color_map = None

                duration_ms = image.info.get("duration", 100)

                if not isinstance(duration_ms, (int, float)):
                    duration_ms = 100

                frames.append(
                    Frame(
                        content=ascii_art,
                        duration_ms=max(0, int(duration_ms)),
                        colors=color_map,
                    )
                )

    except UnidentifiedImageError as exc:
        raise AnimationLoadError(f"File is not a valid GIF: {animation_path}") from exc
    except OSError as exc:
        raise AnimationLoadError(f"Could not read animation: {animation_path}") from exc

    return frames
