from pathlib import Path

from ascii_motion.core.animation import load_animation
from ascii_motion.core.converter import convert_to_ascii
from ascii_motion.core.image_loader import load_image
from ascii_motion.models.frame import Frame
from ascii_motion.models.settings import ConversionSettings


def convert_image_file(
    input_path: str | Path,
    settings: ConversionSettings | None = None,
) -> str:
    """Load an image file and convert it to ASCII art."""
    if settings is None:
        settings = ConversionSettings()

    image = load_image(input_path)

    return convert_to_ascii(image, settings=settings)


def convert_gif_file(
    input_path: str | Path,
    settings: ConversionSettings | None = None,
    max_frames: int = 500,
) -> list[Frame]:
    """Load a GIF file and convert its frames to ASCII art."""
    if settings is None:
        settings = ConversionSettings()

    return load_animation(
        input_path,
        settings=settings,
        max_frames=max_frames,
    )
