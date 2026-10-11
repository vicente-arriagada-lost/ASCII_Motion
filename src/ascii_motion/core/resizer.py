from PIL import Image


def resize_image(
    image: Image.Image,
    width: int = 80,
    character_aspect_ratio: float = 0.5,
    height: int | None = None,
) -> Image.Image:
    """Resize an image with automatic or explicitly requested height."""
    if not isinstance(width, int) or isinstance(width, bool) or width < 1:
        raise ValueError("Width must be greater than zero")

    if character_aspect_ratio <= 0:
        raise ValueError("Character aspect ratio must be greater than zero")

    if height is not None and (
        not isinstance(height, int) or isinstance(height, bool) or height < 1
    ):
        raise ValueError("Height must be greater than zero")

    if image.width < 1 or image.height < 1:
        raise ValueError("Image dimensions must be greater than zero")

    target_height = (
        height
        if height is not None
        else max(
            1,
            round(width * image.height / image.width * character_aspect_ratio),
        )
    )

    return image.resize(
        (width, target_height),
        Image.Resampling.LANCZOS,
    )
