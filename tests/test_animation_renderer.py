import json

import pytest

from ascii_motion.models.frame import Frame
from ascii_motion.renderers.text_renderer import (
    render_animation,
    save_animation,
    save_to_file,
)


def test_render_animation_prints_all_frames(monkeypatch, capsys):
    frames = [
        Frame(content="###", duration_ms=100),
        Frame(content="...", duration_ms=200),
    ]

    monkeypatch.setattr(
        "ascii_motion.renderers.text_renderer.time.sleep",
        lambda _: None,
    )

    render_animation(frames, clear_screen=False)

    captured = capsys.readouterr()

    assert captured.out == "###\n...\n"


def test_render_animation_rejects_empty_frames():
    with pytest.raises(ValueError, match="at least one frame"):
        render_animation([])


def test_render_animation_rejects_negative_loops():
    frames = [Frame(content="###", duration_ms=100)]

    with pytest.raises(ValueError, match="Loops cannot be negative"):
        render_animation(frames, loops=-1)


def test_render_animation_repeats_requested_number_of_loops(
    monkeypatch,
    capsys,
):
    frames = [Frame(content="ABC", duration_ms=50)]

    monkeypatch.setattr(
        "ascii_motion.renderers.text_renderer.time.sleep",
        lambda _: None,
    )

    render_animation(frames, loops=3, clear_screen=False)

    captured = capsys.readouterr()

    assert captured.out == "ABC\nABC\nABC\n"


def test_save_animation_preserves_frames_and_durations(tmp_path):
    output = tmp_path / "animation.txt"
    frames = [
        Frame(content="@@\n##", duration_ms=100),
        Frame(content="██\n░░", duration_ms=250),
    ]

    saved_path = save_animation(frames, output)
    data = json.loads(saved_path.read_text(encoding="utf-8"))

    assert saved_path == output
    assert data["format"] == "ascii-motion-animation"
    assert data["version"] == 1
    assert data["frames"] == [
        {"duration_ms": 100, "content": "@@\n##"},
        {"duration_ms": 250, "content": "██\n░░"},
    ]


def test_save_animation_creates_parent_directories(tmp_path):
    output = tmp_path / "exports" / "animation.txt"

    save_animation(
        [Frame(content="###", duration_ms=100)],
        output,
    )

    assert output.is_file()


def test_save_animation_rejects_empty_frames(tmp_path):
    with pytest.raises(ValueError, match="at least one frame"):
        save_animation([], tmp_path / "animation.txt")


def test_save_animation_rejects_wrong_extension(tmp_path):
    frames = [Frame(content="###", duration_ms=100)]

    with pytest.raises(ValueError, match=r"\.txt"):
        save_animation(frames, tmp_path / "animation.json")


@pytest.mark.parametrize("loops", [True, False, 1.5, "2", None])
def test_render_animation_rejects_invalid_loop_types(loops):
    frames = [Frame(content="ABC", duration_ms=0)]

    with pytest.raises(TypeError, match="Loops must be an integer"):
        render_animation(frames, loops=loops, clear_screen=False)


@pytest.mark.parametrize("clear_screen", [1, "yes", None])
def test_render_animation_rejects_invalid_clear_screen(clear_screen):
    frames = [Frame(content="ABC", duration_ms=0)]

    with pytest.raises(TypeError, match="clear_screen must be a boolean"):
        render_animation(frames, clear_screen=clear_screen)


@pytest.mark.parametrize("frames", ["ABC", b"ABC", None, 123])
def test_render_animation_rejects_invalid_frame_sequences(frames):
    with pytest.raises(TypeError, match="sequence of Frame objects"):
        render_animation(frames, clear_screen=False)


def test_render_animation_rejects_non_frame_items():
    with pytest.raises(TypeError, match="Frame instances"):
        render_animation(["not a frame"], clear_screen=False)


def test_save_animation_rejects_non_frame_items(tmp_path):
    with pytest.raises(TypeError, match="Frame instances"):
        save_animation(["not a frame"], tmp_path / "animation.txt")


def test_save_to_file_rejects_non_string_content(tmp_path):
    with pytest.raises(TypeError, match="ASCII art must be a string"):
        save_to_file(123, tmp_path / "output.txt")
