import pytest

from ascii_motion.models.frame import Frame


def test_frame_accepts_valid_data():
    frame = Frame(content="@@@\n###", duration_ms=100)

    assert frame.content == "@@@\n###"
    assert frame.duration_ms == 100


def test_frame_accepts_zero_duration():
    frame = Frame(content="ASCII", duration_ms=0)

    assert frame.duration_ms == 0


def test_frame_rejects_empty_content():
    with pytest.raises(ValueError, match="Frame content cannot be empty"):
        Frame(content="", duration_ms=100)


def test_frame_accepts_whitespace_content():
    frame = Frame(content="   \n  ", duration_ms=100)

    assert frame.content == "   \n  "


def test_frame_rejects_non_string_content():
    with pytest.raises(TypeError, match="Frame content must be a string"):
        Frame(content=123, duration_ms=100)


@pytest.mark.parametrize("duration", [-1, -100])
def test_frame_rejects_negative_duration(duration):
    with pytest.raises(ValueError, match="Frame duration cannot be negative"):
        Frame(content="ASCII", duration_ms=duration)


@pytest.mark.parametrize("duration", [1.5, "100", True])
def test_frame_rejects_non_integer_duration(duration):
    with pytest.raises(TypeError, match="Frame duration must be an integer"):
        Frame(content="ASCII", duration_ms=duration)
