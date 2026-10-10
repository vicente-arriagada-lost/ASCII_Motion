import pytest
from PIL import Image

from ascii_motion.core.image_loader import load_image
from ascii_motion.exceptions import ImageLoadError


def test_load_png_returns_rgb_image(tmp_path):
    path = tmp_path / "test.png"
    Image.new("RGBA", (20, 10), (255, 0, 0, 128)).save(path)

    result = load_image(path)

    assert result.size == (20, 10)
    assert result.mode == "RGB"


def test_load_missing_file_raises_error(tmp_path):
    path = tmp_path / "missing.png"

    with pytest.raises(ImageLoadError, match="File not found"):
        load_image(path)


def test_load_invalid_file_raises_error(tmp_path):
    path = tmp_path / "invalid.png"
    path.write_text("This is not an image")

    with pytest.raises(ImageLoadError):
        load_image(path)


def test_load_gif_returns_first_frame(tmp_path):
    path = tmp_path / "test.gif"

    first = Image.new("RGB", (10, 10), "red")
    second = Image.new("RGB", (10, 10), "blue")

    first.save(
        path,
        save_all=True,
        append_images=[second],
        duration=[100, 100],
        loop=0,
    )

    result = load_image(path)

    assert result.size == (10, 10)
    assert result.getpixel((0, 0)) == (255, 0, 0)
