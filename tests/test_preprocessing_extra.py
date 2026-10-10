import pytest
from PIL import Image

from ascii_motion.core.preprocessing import preprocess_image


def test_preprocessing_returns_grayscale_image():
    image = Image.new("RGB", (8, 8), (255, 0, 0))

    result = preprocess_image(image)

    assert result.mode == "L"
    assert result.size == image.size


def test_gamma_one_preserves_grayscale_values():
    image = Image.new("L", (3, 1))
    image.putdata([0, 128, 255])

    result = preprocess_image(image, gamma=1.0)

    assert list(result.get_flattened_data()) == [0, 128, 255]


def test_gamma_greater_than_one_brightens_midtones():
    image = Image.new("L", (1, 1), 64)

    result = preprocess_image(image, gamma=2.0)

    assert result.getpixel((0, 0)) > 64


def test_gamma_between_zero_and_one_darkens_midtones():
    image = Image.new("L", (1, 1), 64)

    result = preprocess_image(image, gamma=0.5)

    assert result.getpixel((0, 0)) < 64


@pytest.mark.parametrize("gamma", [0, -1, -0.5])
def test_preprocessing_rejects_nonpositive_gamma(gamma):
    image = Image.new("RGB", (2, 2), "white")

    with pytest.raises(ValueError, match="Gamma"):
        preprocess_image(image, gamma=gamma)


def test_normalize_contrast_stretches_tonal_range():
    image = Image.new("L", (3, 1))
    image.putdata([100, 150, 200])

    result = preprocess_image(image, normalize_contrast=True)
    values = list(result.get_flattened_data())

    assert values[0] == 0
    assert values[-1] == 254
    assert 126 <= values[1] <= 128


def test_preprocessing_does_not_modify_original_image():
    image = Image.new("RGB", (2, 2), (120, 80, 40))
    original_pixels = list(image.get_flattened_data())

    preprocess_image(image, gamma=1.5, normalize_contrast=True)

    assert image.mode == "RGB"
    assert list(image.get_flattened_data()) == original_pixels
