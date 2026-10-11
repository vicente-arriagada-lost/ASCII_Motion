import pytest

from ascii_motion.models.settings import ConversionSettings


def test_default_settings():
    settings = ConversionSettings()

    assert settings.width == 80
    assert settings.charset == "standard"
    assert settings.gamma == 1.0
    assert settings.normalize_contrast is False


def test_custom_settings():
    settings = ConversionSettings(
        width=100,
        charset="blocks",
        gamma=1.3,
        normalize_contrast=True,
    )

    assert settings.width == 100
    assert settings.charset == "blocks"
    assert settings.gamma == 1.3
    assert settings.normalize_contrast is True


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"width": 0}, "Width must be greater than zero"),
        ({"charset": ""}, "Charset cannot be empty"),
        ({"contrast": -1}, "Contrast cannot be negative"),
        ({"brightness": -1}, "Brightness cannot be negative"),
        (
            {"character_aspect_ratio": 0},
            "Character aspect ratio must be greater than zero",
        ),
        ({"gamma": 0}, "Gamma must be greater than zero"),
    ],
)
def test_invalid_settings(kwargs, message):
    with pytest.raises(ValueError, match=message):
        ConversionSettings(**kwargs)


def test_settings_are_immutable():
    settings = ConversionSettings()

    with pytest.raises(AttributeError):
        settings.width = 120


def test_converter_uses_conversion_settings():
    from PIL import Image

    from ascii_motion.core.converter import convert_to_ascii

    image = Image.new("RGB", (40, 20), "white")
    settings = ConversionSettings(
        width=20,
        character_aspect_ratio=1.0,
        charset="blocks",
        gamma=1.2,
    )

    result = convert_to_ascii(image, settings=settings)

    lines = result.splitlines()
    assert len(lines) == 10
    assert all(len(line) == 20 for line in lines)


@pytest.mark.parametrize("width", [0, -1, 1.5, True])
def test_conversion_settings_rejects_invalid_width(width):
    with pytest.raises(ValueError, match="Width must be greater than zero"):
        ConversionSettings(width=width)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("contrast", True),
        ("contrast", "1.0"),
        ("contrast", float("nan")),
        ("contrast", float("inf")),
        ("brightness", False),
        ("brightness", "1.0"),
        ("brightness", float("nan")),
        ("character_aspect_ratio", True),
        ("character_aspect_ratio", "0.5"),
        ("character_aspect_ratio", float("inf")),
        ("gamma", False),
        ("gamma", "1.0"),
        ("gamma", float("nan")),
    ],
)
def test_numeric_settings_reject_invalid_types_and_non_finite_values(field, value):
    with pytest.raises(ValueError):
        ConversionSettings(**{field: value})


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("invert", 1, "Invert must be a boolean"),
        ("invert", "yes", "Invert must be a boolean"),
        (
            "normalize_contrast",
            1,
            "Normalize contrast must be a boolean",
        ),
        (
            "normalize_contrast",
            "yes",
            "Normalize contrast must be a boolean",
        ),
    ],
)
def test_boolean_settings_reject_non_boolean_values(field, value, message):
    with pytest.raises(ValueError, match=message):
        ConversionSettings(**{field: value})


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("contrast", 0),
        ("brightness", 0),
        ("character_aspect_ratio", 0.5),
        ("gamma", 1.0),
    ],
)
def test_numeric_settings_accept_valid_boundary_values(field, value):
    settings = ConversionSettings(**{field: value})

    assert getattr(settings, field) == value


def test_settings_accept_explicit_height():
    settings = ConversionSettings(width=80, height=25)

    assert settings.height == 25


def test_settings_default_height_is_automatic():
    settings = ConversionSettings()

    assert settings.height is None


@pytest.mark.parametrize("height", [0, -1, 1.5, True])
def test_settings_reject_invalid_height(height):
    with pytest.raises(ValueError, match="Height must be greater than zero"):
        ConversionSettings(height=height)
