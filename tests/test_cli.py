import json
import sys

import pytest
from PIL import Image

from ascii_motion.cli.main import main
from ascii_motion.models.frame import Frame
from ascii_motion.renderers.text_renderer import save_animation


def create_test_gif(path):
    first = Image.new("RGB", (20, 10), "black")
    second = Image.new("RGB", (20, 10), "white")

    first.save(
        path,
        format="GIF",
        save_all=True,
        append_images=[second],
        duration=[100, 250],
        loop=0,
    )


def test_list_charsets(capsys, monkeypatch):
    monkeypatch.setattr(
        sys,
        "argv",
        ["ascii-motion", "--list-charsets"],
    )

    result = main()
    captured = capsys.readouterr()

    assert result == 0
    assert "standard" in captured.out
    assert "blocks" in captured.out
    assert "dense" in captured.out
    assert "simple" in captured.out


def test_cli_saves_ascii_file(tmp_path, monkeypatch, capsys):
    source = tmp_path / "source.png"
    output = tmp_path / "result.txt"

    Image.new("RGB", (40, 20), "white").save(source)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "ascii-motion",
            str(source),
            "--width",
            "20",
            "--contrast",
            "1.5",
            "--output",
            str(output),
        ],
    )

    result = main()
    captured = capsys.readouterr()

    assert result == 0
    assert output.exists()
    assert len(output.read_text(encoding="utf-8").splitlines()) == 5
    assert "ASCII art saved to:" in captured.out


def test_cli_rejects_invalid_width(tmp_path, monkeypatch, capsys):
    source = tmp_path / "source.png"
    Image.new("RGB", (20, 10), "white").save(source)

    monkeypatch.setattr(
        sys,
        "argv",
        ["ascii-motion", str(source), "--width", "0"],
    )

    result = main()
    captured = capsys.readouterr()

    assert result == 1
    assert "Width must be greater than zero" in captured.err


def test_cli_reports_missing_image(monkeypatch, capsys):
    monkeypatch.setattr(
        sys,
        "argv",
        ["ascii-motion", "/nonexistent/ascii-motion-image.png"],
    )

    result = main()
    captured = capsys.readouterr()

    assert result == 1
    assert "File not found" in captured.err


def test_cli_exports_gif_animation(tmp_path, monkeypatch, capsys):
    source = tmp_path / "source.gif"
    output = tmp_path / "animation.txt"
    create_test_gif(source)

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "ascii-motion",
            str(source),
            "--export-animation",
            str(output),
            "--width",
            "20",
        ],
    )

    result = main()
    captured = capsys.readouterr()

    assert result == 0
    assert output.is_file()
    assert "ASCII animation saved to:" in captured.out

    data = json.loads(output.read_text(encoding="utf-8"))

    assert data["format"] == "ascii-motion-animation"
    assert len(data["frames"]) == 2
    assert [frame["duration_ms"] for frame in data["frames"]] == [
        100,
        250,
    ]


def test_cli_plays_saved_animation(tmp_path, monkeypatch):
    source = tmp_path / "animation.txt"
    frames = [
        Frame(content="###", duration_ms=100),
        Frame(content="...", duration_ms=250),
    ]
    save_animation(frames, source)

    captured = {}

    def fake_render_animation(received_frames, loops=1, clear_screen=True):
        captured["frames"] = received_frames
        captured["loops"] = loops

    monkeypatch.setattr(
        "ascii_motion.cli.main.render_animation",
        fake_render_animation,
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "ascii-motion",
            "--play-file",
            str(source),
            "--loops",
            "3",
        ],
    )

    result = main()

    assert result == 0
    assert captured["frames"] == frames
    assert captured["loops"] == 3


def test_cli_rejects_conflicting_play_modes(monkeypatch):
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "ascii-motion",
            "animation.gif",
            "--play",
            "--export-animation",
            "animation.txt",
        ],
    )

    with pytest.raises(SystemExit) as exc_info:
        main()

    assert exc_info.value.code == 2
