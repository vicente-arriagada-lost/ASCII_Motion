import pytest

from ascii_motion.renderers.text_renderer import (
    render_to_terminal,
    save_to_file,
)


def test_render_to_terminal(capsys):
    ascii_art = "###\n..."

    render_to_terminal(ascii_art)

    captured = capsys.readouterr()

    assert captured.out == "###\n...\n"


def test_save_to_file(tmp_path):
    ascii_art = "###\n..."

    output_path = save_to_file(
        ascii_art,
        tmp_path / "output.txt",
    )

    assert output_path.exists()
    assert output_path.read_text(encoding="utf-8") == ascii_art


def test_save_to_file_creates_parent_directories(tmp_path):
    output_path = tmp_path / "exports" / "ascii.txt"

    save_to_file("###", output_path)

    assert output_path.exists()
    assert output_path.read_text(encoding="utf-8") == "###"


def test_save_to_file_rejects_wrong_extension(tmp_path):
    with pytest.raises(ValueError, match=r"\.txt extension"):
        save_to_file("###", tmp_path / "output.png")
