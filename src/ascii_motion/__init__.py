"""Public API for ASCII Motion."""

from ascii_motion.core.service import convert_gif_file, convert_image_file
from ascii_motion.exceptions import (
    AnimationLoadError,
    AsciiMotionError,
    ImageLoadError,
)
from ascii_motion.models.frame import Frame
from ascii_motion.models.settings import ConversionSettings

__all__ = [
    "AnimationLoadError",
    "AsciiMotionError",
    "ConversionSettings",
    "Frame",
    "ImageLoadError",
    "convert_gif_file",
    "convert_image_file",
]
