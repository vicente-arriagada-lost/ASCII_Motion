import json

import pytest

from ascii_motion.models.frame import Frame
from ascii_motion.renderers.text_renderer import (
    load_animation_file,
    save_animation,
)


def test_animation_round_trip_preserves_frames(tmp_path):
    original = [
        Frame(content="@@@\n###", duration_ms=100),
        Frame(content="   \n   ", duration_ms=250),
    ]
    path = tmp_path / "animation.txt"

    save_animation(original, path)
    restored = load_animation_file(path)

    assert restored == original


def test_load_animation_rejects_invalid_json(tmp_path):
    path = tmp_path / "broken.txt"
    path.write_text("{invalid json", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid animation file"):
        load_animation_file(path)


@pytest.mark.parametrize(
    "content",
    [
        [],
        "not an object",
        {"format": "wrong-format", "version": 1, "frames": []},
        {"format": "ascii-motion-animation", "version": 99, "frames": []},
        {"format": "ascii-motion-animation", "version": True, "frames": []},
        {"format": "ascii-motion-animation", "version": 1, "frames": []},
        {
            "format": "ascii-motion-animation",
            "version": 1,
            "frames": "not a list",
        },
    ],
)
def test_load_animation_rejects_invalid_document(tmp_path, content):
    path = tmp_path / "invalid.txt"
    path.write_text(json.dumps(content), encoding="utf-8")

    with pytest.raises(ValueError):
        load_animation_file(path)


@pytest.mark.parametrize(
    "frame_data",
    [
        None,
        "invalid frame",
        {},
        {"content": "", "duration_ms": 100},
        {"content": "ASCII", "duration_ms": -1},
        {"content": "ASCII", "duration_ms": 1.5},
        {"content": "ASCII", "duration_ms": True},
        {"content": 123, "duration_ms": 100},
    ],
)
def test_load_animation_rejects_invalid_frames(tmp_path, frame_data):
    path = tmp_path / "invalid_frame.txt"
    path.write_text(
        json.dumps(
            {
                "format": "ascii-motion-animation",
                "version": 1,
                "frames": [frame_data],
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        load_animation_file(path)


def test_load_animation_rejects_too_many_frames(tmp_path):
    path = tmp_path / "too_many.txt"
    frames = [{"content": "ASCII", "duration_ms": 100} for _ in range(501)]
    path.write_text(
        json.dumps(
            {
                "format": "ascii-motion-animation",
                "version": 1,
                "frames": frames,
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="exceeds the limit"):
        load_animation_file(path)


def test_save_animation_rejects_too_many_frames(tmp_path):
    frames = [Frame(content="ASCII", duration_ms=100) for _ in range(501)]

    with pytest.raises(ValueError, match="exceeds the limit"):
        save_animation(frames, tmp_path / "too_many.txt")


def test_animation_files_require_txt_extension(tmp_path):
    with pytest.raises(ValueError, match=r"\.txt"):
        load_animation_file(tmp_path / "animation.json")

    with pytest.raises(ValueError, match=r"\.txt"):
        save_animation(
            [Frame(content="ASCII", duration_ms=100)],
            tmp_path / "animation.json",
        )


def test_load_animation_rejects_invalid_utf8(tmp_path):
    path = tmp_path / "invalid_utf8.txt"
    path.write_bytes(b"\xff\xfe\xfa")

    with pytest.raises(ValueError, match="valid UTF-8"):
        load_animation_file(path)
