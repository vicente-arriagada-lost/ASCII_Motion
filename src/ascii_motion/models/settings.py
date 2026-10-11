import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ConversionSettings:
    """Configuration shared by image and animation conversions."""

    width: int = 80
    height: int | None = None
    charset: str = "standard"
    contrast: float = 1.0
    brightness: float = 1.0
    invert: bool = False
    character_aspect_ratio: float = 0.5
    gamma: float = 1.0
    normalize_contrast: bool = False

    def __post_init__(self) -> None:
        if (
            not isinstance(self.width, int)
            or isinstance(self.width, bool)
            or self.width < 1
        ):
            raise ValueError("Width must be greater than zero")

        if self.height is not None and (
            not isinstance(self.height, int)
            or isinstance(self.height, bool)
            or self.height < 1
        ):
            raise ValueError("Height must be greater than zero")

        if not isinstance(self.charset, str) or not self.charset:
            raise ValueError("Charset cannot be empty")

        self._validate_number("contrast", self.contrast, minimum=0)
        self._validate_number("brightness", self.brightness, minimum=0)
        self._validate_number(
            "character_aspect_ratio",
            self.character_aspect_ratio,
            minimum=0,
            exclusive=True,
        )
        self._validate_number("gamma", self.gamma, minimum=0, exclusive=True)

        if not isinstance(self.invert, bool):
            raise ValueError("Invert must be a boolean")

        if not isinstance(self.normalize_contrast, bool):
            raise ValueError("Normalize contrast must be a boolean")

    @staticmethod
    def _validate_number(
        name: str,
        value: object,
        *,
        minimum: float,
        exclusive: bool = False,
    ) -> None:
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ValueError(
                f"{name.replace('_', ' ').capitalize()} must be a finite number"
            )

        is_below_minimum = value <= minimum if exclusive else value < minimum
        if is_below_minimum:
            if name == "character_aspect_ratio":
                raise ValueError("Character aspect ratio must be greater than zero")
            if name == "gamma":
                raise ValueError("Gamma must be greater than zero")
            raise ValueError(f"{name.capitalize()} cannot be negative")
