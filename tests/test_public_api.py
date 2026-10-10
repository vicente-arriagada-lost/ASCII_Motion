from ascii_motion import (
    ConversionSettings,
    Frame,
    convert_gif_file,
    convert_image_file,
)
from ascii_motion.core.service import (
    convert_gif_file as service_convert_gif_file,
)
from ascii_motion.core.service import (
    convert_image_file as service_convert_image_file,
)
from ascii_motion.models.frame import Frame as ModelFrame
from ascii_motion.models.settings import ConversionSettings as ModelSettings


def test_public_api_exports_expected_objects():
    assert ConversionSettings is ModelSettings
    assert Frame is ModelFrame
    assert convert_image_file is service_convert_image_file
    assert convert_gif_file is service_convert_gif_file


def test_public_api_declares_supported_exports():
    import ascii_motion

    assert set(ascii_motion.__all__) == {
        "AnimationLoadError",
        "AsciiMotionError",
        "ConversionSettings",
        "Frame",
        "ImageLoadError",
        "convert_image_file",
        "convert_gif_file",
    }
