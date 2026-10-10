import pytest
from PIL import Image

from ascii_motion.core.converter import convert_to_ascii


def test_output_has_requested_width():
    image = Image.new("RGB", (100, 50), "gray")

    result = convert_to_ascii(image, width=40)

    assert all(len(row) == 40 for row in result.splitlines())


def test_output_height_preserves_approximate_aspect_ratio():
    image = Image.new("RGB", (100, 50), "white")

    result = convert_to_ascii(image, width=40)

    assert len(result.splitlines()) == 10


def test_custom_charset_is_used():
    image = Image.new("L", (2, 1))
    image.putpixel((0, 0), 0)
    image.putpixel((1, 0), 255)

    result = convert_to_ascii(image, width=2, charset="# ")

    assert result == "# "


def test_invert_reverses_brightness_mapping():
    image = Image.new("L", (2, 1))
    image.putpixel((0, 0), 0)
    image.putpixel((1, 0), 255)

    normal = convert_to_ascii(image, width=2, charset="# ")
    inverted = convert_to_ascii(image, width=2, charset="# ", invert=True)

    assert normal == "# "
    assert inverted == " #"


def test_empty_charset_is_rejected():
    image = Image.new("RGB", (10, 10), "white")

    with pytest.raises(ValueError, match="Charset cannot be empty"):
        convert_to_ascii(image, charset="")


def test_invalid_width_is_rejected():
    image = Image.new("RGB", (10, 10), "white")

    with pytest.raises(ValueError, match="Width must be greater than zero"):
        convert_to_ascii(image, width=0)


def test_named_blocks_charset():
    image = Image.new("L", (2, 1))
    image.putpixel((0, 0), 0)
    image.putpixel((1, 0), 255)

    result = convert_to_ascii(image, width=2, charset="blocks")

    assert result == "█ "


def test_named_simple_charset():
    image = Image.new("L", (2, 1))
    image.putpixel((0, 0), 0)
    image.putpixel((1, 0), 255)

    result = convert_to_ascii(image, width=2, charset="simple")

    assert result == "# "


def test_custom_charset_still_works():
    image = Image.new("L", (2, 1))
    image.putpixel((0, 0), 0)
    image.putpixel((1, 0), 255)

    result = convert_to_ascii(image, width=2, charset="X ")

    assert result == "X "
