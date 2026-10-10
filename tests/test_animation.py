import pytest
from PIL import Image

from ascii_motion.core.animation import load_animation
from ascii_motion.exceptions import AnimationLoadError
from ascii_motion.models.frame import Frame


def create_test_gif(path):
    first = Image.new("RGB", (20, 10), "black")
    second = Image.new("RGB", (20, 10), "white")

    first.save(
        path,
        format="GIF",
        save_all=True,
        append_images=[second],
        duration=[100, 250],
        loop=0,
    )


def test_load_animation_returns_all_frames(tmp_path):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    frames = load_animation(path, width=20)

    assert len(frames) == 2
    assert all(isinstance(frame, Frame) for frame in frames)
    assert frames[0].content != frames[1].content


def test_load_animation_preserves_frame_durations(tmp_path):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    frames = load_animation(path, width=20)

    assert [frame.duration_ms for frame in frames] == [100, 250]


def test_load_animation_rejects_missing_file(tmp_path):
    with pytest.raises(AnimationLoadError, match="File not found"):
        load_animation(tmp_path / "missing.gif")


def test_load_animation_rejects_non_gif(tmp_path):
    path = tmp_path / "image.png"
    Image.new("RGB", (20, 10), "white").save(path)

    with pytest.raises(
        AnimationLoadError,
        match="Unsupported animation format",
    ):
        load_animation(path)


def test_load_animation_enforces_frame_limit(tmp_path):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    with pytest.raises(AnimationLoadError, match="limit is 1"):
        load_animation(path, max_frames=1)


@pytest.mark.parametrize("max_frames", [0, -1, 1.5, True])
def test_load_animation_rejects_invalid_frame_limit(
    tmp_path,
    max_frames,
):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    with pytest.raises(ValueError, match="positive integer"):
        load_animation(path, max_frames=max_frames)


def test_load_animation_rejects_oversized_frame(tmp_path):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    with pytest.raises(AnimationLoadError, match="pixel limit"):
        load_animation(path, max_pixels=100)


def test_load_animation_rejects_invalid_pixel_limit(tmp_path):
    path = tmp_path / "animated.gif"
    create_test_gif(path)

    with pytest.raises(ValueError, match="positive integer"):
        load_animation(path, max_pixels=True)
