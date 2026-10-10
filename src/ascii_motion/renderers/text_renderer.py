import json
import sys
import time
from collections.abc import Sequence
from pathlib import Path

from ascii_motion.models.frame import Frame

ANIMATION_FORMAT = "ascii-motion-animation"
ANIMATION_VERSION = 1
MAX_ANIMATION_FRAMES = 500


def render_to_terminal(ascii_art: str) -> None:
    """Print ASCII art to the terminal."""
    print(ascii_art)


def save_to_file(ascii_art: str, output_path: str | Path) -> Path:
    """Save ASCII art to a UTF-8 text file."""
    if not isinstance(ascii_art, str):
        raise TypeError("ASCII art must be a string")

    path = Path(output_path).expanduser()

    if path.suffix.lower() != ".txt":
        raise ValueError("Output file must have a .txt extension")

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(ascii_art, encoding="utf-8")
    except OSError as exc:
        raise OSError(f"Could not save ASCII art to: {path}") from exc

    return path


def _validate_frames(frames: Sequence[Frame]) -> None:
    """Validate an animation's frame sequence."""
    if isinstance(frames, (str, bytes)) or not isinstance(frames, Sequence):
        raise TypeError("Frames must be a sequence of Frame objects")

    if not frames:
        raise ValueError("Animation must contain at least one frame")

    if any(not isinstance(frame, Frame) for frame in frames):
        raise TypeError("All animation frames must be Frame instances")


def render_animation(
    frames: Sequence[Frame],
    loops: int = 1,
    clear_screen: bool = True,
) -> None:
    """Play ASCII animation frames in the terminal."""
    _validate_frames(frames)

    if not isinstance(loops, int) or isinstance(loops, bool):
        raise TypeError("Loops must be an integer")

    if loops < 0:
        raise ValueError("Loops cannot be negative")

    if not isinstance(clear_screen, bool):
        raise TypeError("clear_screen must be a boolean")

    if loops == 0:
        while True:
            _play_once(frames, clear_screen)
    else:
        for _ in range(loops):
            _play_once(frames, clear_screen)


def _play_once(frames: Sequence[Frame], clear_screen: bool) -> None:
    """Play all frames once."""
    for frame in frames:
        if clear_screen:
            sys.stdout.write("\033[H\033[J")

        sys.stdout.write(frame.content)
        sys.stdout.write("\n")
        sys.stdout.flush()
        time.sleep(frame.duration_ms / 1000)


def save_animation(
    frames: Sequence[Frame],
    output_path: str | Path,
) -> Path:
    """Save ASCII animation frames and durations to a JSON text file."""
    _validate_frames(frames)

    if len(frames) > MAX_ANIMATION_FRAMES:
        raise ValueError(
            f"Animation exceeds the limit of {MAX_ANIMATION_FRAMES} frames"
        )

    path = Path(output_path).expanduser()

    if path.suffix.lower() != ".txt":
        raise ValueError("Output file must have a .txt extension")

    data = {
        "format": ANIMATION_FORMAT,
        "version": ANIMATION_VERSION,
        "frames": [
            {
                "duration_ms": frame.duration_ms,
                "content": frame.content,
            }
            for frame in frames
        ],
    }

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        raise OSError(f"Could not save ASCII animation to: {path}") from exc

    return path


def load_animation_file(input_path: str | Path) -> list[Frame]:
    """Load and validate an ASCII Motion animation text file."""
    path = Path(input_path).expanduser()

    if path.suffix.lower() != ".txt":
        raise ValueError("Animation file must have a .txt extension")

    try:
        raw_content = path.read_text(encoding="utf-8")
    except UnicodeError as exc:
        raise ValueError(f"Animation file is not valid UTF-8: {path}") from exc
    except OSError as exc:
        raise OSError(f"Could not read ASCII animation from: {path}") from exc

    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid animation file: {path}") from exc

    if not isinstance(data, dict):
        raise ValueError("Animation file must contain a JSON object")

    if data.get("format") != ANIMATION_FORMAT:
        raise ValueError("Unrecognized animation file format")

    version = data.get("version")
    if (
        not isinstance(version, int)
        or isinstance(version, bool)
        or version != ANIMATION_VERSION
    ):
        raise ValueError("Unsupported animation file version")

    raw_frames = data.get("frames")

    if not isinstance(raw_frames, list) or not raw_frames:
        raise ValueError("Animation must contain at least one frame")

    if len(raw_frames) > MAX_ANIMATION_FRAMES:
        raise ValueError(
            f"Animation exceeds the limit of {MAX_ANIMATION_FRAMES} frames"
        )

    frames: list[Frame] = []

    for index, item in enumerate(raw_frames):
        if not isinstance(item, dict):
            raise ValueError(f"Invalid frame at index {index}")

        content = item.get("content")
        duration_ms = item.get("duration_ms")

        if not isinstance(content, str) or content == "":
            raise ValueError(f"Frame {index} content must be a non-empty string")

        if (
            not isinstance(duration_ms, int)
            or isinstance(duration_ms, bool)
            or duration_ms < 0
        ):
            raise ValueError(f"Frame {index} duration must be a non-negative integer")

        frames.append(Frame(content=content, duration_ms=duration_ms))

    return frames
