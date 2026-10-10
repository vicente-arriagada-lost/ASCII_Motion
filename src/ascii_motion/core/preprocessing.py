from PIL import Image, ImageOps


def preprocess_image(
    image: Image.Image,
    gamma: float = 1.0,
    normalize_contrast: bool = False,
) -> Image.Image:
    """Convert an image to grayscale and adjust its tonal range.

    Gamma values greater than 1 brighten darker areas.
    Gamma values between 0 and 1 darken the image.
    """
    if gamma <= 0:
        raise ValueError("Gamma must be greater than zero")

    grayscale = ImageOps.grayscale(image)

    if normalize_contrast:
        grayscale = ImageOps.autocontrast(grayscale)

    if gamma != 1.0:
        lookup_table = [
            round(255 * ((value / 255) ** (1.0 / gamma))) for value in range(256)
        ]
        grayscale = grayscale.point(lookup_table)

    return grayscale
