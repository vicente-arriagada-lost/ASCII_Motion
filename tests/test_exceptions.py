import pytest

from ascii_motion import (
    AnimationLoadError,
    AsciiMotionError,
    ImageLoadError,
)


@pytest.mark.parametrize(
    "error_type",
    [ImageLoadError, AnimationLoadError],
)
def test_load_errors_inherit_from_base_exception(error_type):
    error = error_type("Test error")

    assert isinstance(error, AsciiMotionError)
    assert str(error) == "Test error"


def test_base_exception_can_be_caught():
    with pytest.raises(AsciiMotionError, match="Image failed"):
        raise ImageLoadError("Image failed")


def test_load_errors_remain_independent_types():
    assert not issubclass(ImageLoadError, AnimationLoadError)
    assert not issubclass(AnimationLoadError, ImageLoadError)
