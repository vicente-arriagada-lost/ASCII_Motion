import pytest
from PIL import Image

from ascii_motion.core.resizer import resize_image


def test_resize_preserves_requested_width():
    image = Image.new("RGB", (40, 20))

    result = resize_image(image, width=100)

    assert result.width == 100


def test_resize_calculates_character_height():
    image = Image.new("RGB", (40, 20))

    result = resize_image(
        image,
        width=20,
        character_aspect_ratio=1.0,
    )

    assert result.size == (20, 10)


def test_resize_never_returns_zero_height():
    image = Image.new("RGB", (10000, 1))

    result = resize_image(image, width=1)

    assert result.height == 1


@pytest.mark.parametrize("width", [0, -1])
def test_resize_rejects_invalid_width(width):
    image = Image.new("RGB", (20, 10))

    with pytest.raises(ValueError, match="Width must be greater than zero"):
        resize_image(image, width=width)


@pytest.mark.parametrize("ratio", [0, -0.5])
def test_resize_rejects_invalid_aspect_ratio(ratio):
    image = Image.new("RGB", (20, 10))

    with pytest.raises(
        ValueError,
        match="Character aspect ratio must be greater than zero",
    ):
        resize_image(image, character_aspect_ratio=ratio)


@pytest.mark.parametrize("width", [0, -1, 1.5, True])
def test_resize_image_rejects_invalid_width(width):
    image = Image.new("RGB", (10, 10), "black")

    with pytest.raises(ValueError, match="Width must be greater than zero"):
        resize_image(image, width=width)


def test_resize_uses_explicit_height():
    image = Image.new("RGB", (40, 20))

    result = resize_image(image, width=20, height=7)

    assert result.size == (20, 7)


@pytest.mark.parametrize("height", [0, -1, 1.5, True])
def test_resize_rejects_invalid_height(height):
    image = Image.new("RGB", (20, 10))

    with pytest.raises(ValueError, match="Height must be greater than zero"):
        resize_image(image, height=height)
