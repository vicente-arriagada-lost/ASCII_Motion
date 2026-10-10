import pytest
from PIL import Image

from ascii_motion.core.converter import convert_to_ascii
from ascii_motion.core.preprocessing import preprocess_image


def test_preprocessing_returns_grayscale_image():
    image = Image.new("RGB", (10, 10), (100, 150, 200))

    result = preprocess_image(image)

    assert result.mode == "L"
    assert result.size == image.size


def test_gamma_above_one_brightens_midtones():
    image = Image.new("RGB", (10, 10), (64, 64, 64))

    normal = preprocess_image(image, gamma=1.0)
    brighter = preprocess_image(image, gamma=1.5)

    assert brighter.getpixel((0, 0)) > normal.getpixel((0, 0))


def test_gamma_below_one_darkens_midtones():
    image = Image.new("RGB", (10, 10), (128, 128, 128))

    normal = preprocess_image(image, gamma=1.0)
    darker = preprocess_image(image, gamma=0.7)

    assert darker.getpixel((0, 0)) < normal.getpixel((0, 0))


def test_normalize_contrast_expands_tonal_range():
    image = Image.new("L", (2, 1))
    image.putdata([50, 200])

    result = preprocess_image(image, normalize_contrast=True)

    assert result.getpixel((0, 0)) == 0
    assert result.getpixel((1, 0)) == 255


@pytest.mark.parametrize("gamma", [0, -1, -0.5])
def test_preprocessing_rejects_invalid_gamma(gamma):
    image = Image.new("RGB", (10, 10), "gray")

    with pytest.raises(ValueError, match="Gamma must be greater than zero"):
        preprocess_image(image, gamma=gamma)


def test_converter_accepts_preprocessing_options():
    image = Image.new("RGB", (20, 10), (80, 80, 80))

    result = convert_to_ascii(
        image,
        width=20,
        gamma=1.3,
        normalize_contrast=True,
    )

    assert isinstance(result, str)
    assert result
