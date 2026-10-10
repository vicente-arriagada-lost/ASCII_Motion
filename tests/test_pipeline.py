from PIL import Image

from ascii_motion.core.converter import convert_to_ascii
from ascii_motion.core.image_loader import load_image
from ascii_motion.renderers.text_renderer import save_to_file


def test_image_to_ascii_file_pipeline(tmp_path):
    source_path = tmp_path / "source.png"
    output_path = tmp_path / "result.txt"

    # Create a test image with a black half and a white half.
    image = Image.new("RGB", (40, 20), "black")

    for x in range(20, 40):
        for y in range(20):
            image.putpixel((x, y), (255, 255, 255))

    image.save(source_path)

    loaded_image = load_image(source_path)
    ascii_art = convert_to_ascii(loaded_image, width=20)
    saved_path = save_to_file(ascii_art, output_path)

    result = saved_path.read_text(encoding="utf-8")

    assert result
    assert len(result.splitlines()) == 5
    assert all(len(line) == 20 for line in result.splitlines())
