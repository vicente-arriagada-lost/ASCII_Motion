from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Frame:
    """A validated animation frame and its duration in milliseconds."""

    content: str
    duration_ms: int

    def __post_init__(self) -> None:
        if not isinstance(self.content, str):
            raise TypeError("Frame content must be a string")

        if self.content == "":
            raise ValueError("Frame content cannot be empty")

        if not isinstance(self.duration_ms, int) or isinstance(self.duration_ms, bool):
            raise TypeError("Frame duration must be an integer")

        if self.duration_ms < 0:
            raise ValueError("Frame duration cannot be negative")
