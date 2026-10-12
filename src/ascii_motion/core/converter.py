from PIL import Image, ImageOps

from ascii_motion.core.preprocessing import preprocess_image
from ascii_motion.core.resizer import resize_image
from ascii_motion.models.settings import ConversionSettings

CHARSETS = {
    "standard": "@%#*+=-:. ",
    "blocks": "█▓▒░ ",
    "dense": "MWNXK0:. ",
    "simple": "#:. ",
}

DEFAULT_CHARSET = CHARSETS["standard"]


def convert_to_ascii(
    image: Image.Image,
    width: int = 80,
    charset: str = "standard",
    contrast: float = 1.0,
    brightness: float = 1.0,
    invert: bool = False,
    character_aspect_ratio: float = 0.5,
    gamma: float = 1.0,
    normalize_contrast: bool = False,
    *,
    settings: ConversionSettings | None = None,
) -> str:
    """Convert an image into ASCII art."""
    if settings is None:
        settings = ConversionSettings(
            width=width,
            charset=charset,
            contrast=contrast,
            brightness=brightness,
            invert=invert,
            character_aspect_ratio=character_aspect_ratio,
            gamma=gamma,
            normalize_contrast=normalize_contrast,
        )

    selected_charset = CHARSETS.get(settings.charset, settings.charset)

    grayscale = preprocess_image(
        image,
        gamma=settings.gamma,
        normalize_contrast=settings.normalize_contrast,
    )

    resized = resize_image(
        grayscale,
        width=settings.width,
        character_aspect_ratio=settings.character_aspect_ratio,
        height=settings.height,
    )
    height = resized.height

    adjusted = resized.point(
        lambda value: max(
            0,
            min(255, round((value - 128) * settings.contrast + 128)),
        )
    )

    adjusted = adjusted.point(
        lambda value: max(
            0,
            min(255, round(value * settings.brightness)),
        )
    )

    if settings.invert:
        adjusted = ImageOps.invert(adjusted)

    values = list(adjusted.get_flattened_data())
    max_index = len(selected_charset) - 1

    rows = []

    for y in range(height):
        start = y * settings.width
        end = start + settings.width

        row = "".join(
            selected_charset[round(value * max_index / 255)]
            for value in values[start:end]
        )
        rows.append(row)

    return "\n".join(rows)



def convert_to_ascii_with_colors(
    image: Image.Image,
    *,
    settings: ConversionSettings | None = None,
) -> tuple[str, str]:
    """Return ASCII art and a compact RGB color map (six hex digits per glyph)."""
    if settings is None:
        settings = ConversionSettings()

    ascii_art = convert_to_ascii(image, settings=settings)
    target_height = len(ascii_art.split("\n"))
    color_image = resize_image(
        image.convert("RGB"),
        width=settings.width,
        character_aspect_ratio=settings.character_aspect_ratio,
        height=target_height,
    )
    color_map = "".join(
        f"{red:02x}{green:02x}{blue:02x}"
        for red, green, blue in color_image.get_flattened_data()
    )
    return ascii_art, color_map
