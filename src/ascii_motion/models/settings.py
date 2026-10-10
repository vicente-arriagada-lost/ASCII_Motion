from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ConversionSettings:
    """Configuration shared by image and animation conversions."""

    width: int = 80
    charset: str = "standard"
    contrast: float = 1.0
    brightness: float = 1.0
    invert: bool = False
    character_aspect_ratio: float = 0.5
    gamma: float = 1.0
    normalize_contrast: bool = False

    def __post_init__(self) -> None:
        if self.width < 1:
            raise ValueError("Width must be greater than zero")

        if not self.charset:
            raise ValueError("Charset cannot be empty")

        if self.contrast < 0:
            raise ValueError("Contrast cannot be negative")

        if self.brightness < 0:
            raise ValueError("Brightness cannot be negative")

        if self.character_aspect_ratio <= 0:
            raise ValueError("Character aspect ratio must be greater than zero")

        if self.gamma <= 0:
            raise ValueError("Gamma must be greater than zero")
