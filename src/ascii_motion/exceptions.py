"""Exceptions raised by ASCII Motion."""


class AsciiMotionError(Exception):
    """Base exception for expected ASCII Motion errors."""


class ImageLoadError(AsciiMotionError):
    """Raised when an image cannot be loaded or is unsupported."""


class AnimationLoadError(AsciiMotionError):
    """Raised when an animation cannot be loaded or processed."""
