from PIL import Image

from ascii_motion.core.service import (
    convert_gif_file,
    convert_image_file,
)
from ascii_motion.models.settings import ConversionSettings


def test_service_converts_image_file(tmp_path):
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (20, 10), "black").save(image_path)

    result = convert_image_file(image_path)

    assert isinstance(result, str)
    assert result
    assert all(len(line) == 80 for line in result.splitlines())


def test_service_uses_custom_settings(tmp_path):
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (20, 10), "black").save(image_path)

    settings = ConversionSettings(width=30, charset="simple")
    result = convert_image_file(image_path, settings=settings)

    assert all(len(line) == 30 for line in result.splitlines())
    assert set("".join(result.splitlines())) <= set("#:. ")


def test_service_converts_gif_file(tmp_path):
    gif_path = tmp_path / "sample.gif"

    first = Image.new("RGB", (16, 8), "black")
    second = Image.new("RGB", (16, 8), "white")
    first.save(
        gif_path,
        save_all=True,
        append_images=[second],
        duration=[100, 200],
        loop=0,
    )

    frames = convert_gif_file(gif_path)

    assert len(frames) == 2
    assert frames[0].duration_ms == 100
    assert frames[1].duration_ms == 200
    assert all(frame.content for frame in frames)


def test_service_passes_frame_limit_to_gif_loader(tmp_path):
    gif_path = tmp_path / "sample.gif"

    first = Image.new("RGB", (8, 8), "black")
    second = Image.new("RGB", (8, 8), "white")
    first.save(
        gif_path,
        save_all=True,
        append_images=[second],
        duration=100,
    )

    import pytest

    from ascii_motion.exceptions import AnimationLoadError

    with pytest.raises(AnimationLoadError, match="limit is 1"):
        convert_gif_file(gif_path, max_frames=1)
