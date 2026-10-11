"""Regression tests for ASCII Motion animated GIF export and metadata."""
import asyncio
import json
from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image

from ascii_motion.api.main import (
    export_ascii_gif,
    read_gif_project_metadata,
)


PROJECT = {
    "format": "ASCII Motion Project",
    "version": 1,
    "sourceImage": {
        "name": "demo.gif",
        "type": "image/gif",
        "dataUrl": "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    },
    "settings": {
        "width": 12,
        "height": 3,
        "charset": "standard",
        "customCharset": "@%#*+=-:. ",
        "gamma": 1,
        "contrast": 1,
        "brightness": 1,
        "asciiColor": "#79F2A5",
        "backgroundColor": "#10151D",
    },
    "output": {
        "ascii": "( o.o )",
        "currentFrameIndex": 0,
        "frames": [
            {"content": " /\\_/\\\\\n( o.o )\n > ^ <", "duration_ms": 100},
            {"content": " /\\_/\\\\\n( -.- )\n > ^ <", "duration_ms": 150},
        ],
    },
}


def run(coroutine):
    """Run an endpoint coroutine without requiring TestClient/httpx2."""
    return asyncio.run(coroutine)


def export_gif(project=PROJECT):
    response = run(
        export_ascii_gif(
            project_json=json.dumps(project),
            foreground="#79F2A5",
            background="#10151D",
            font_size=12,
        )
    )
    return response.body


def test_export_creates_animated_gif_with_durations():
    content = export_gif()

    assert content[:6] in (b"GIF87a", b"GIF89a")

    with Image.open(BytesIO(content)) as image:
        assert image.format == "GIF"
        assert image.n_frames == 2

        durations = []
        for index in range(image.n_frames):
            image.seek(index)
            durations.append(image.info.get("duration"))

    assert durations == [100, 150]


def test_exported_gif_restores_exact_project_metadata():
    content = export_gif()
    upload = UploadFile(file=BytesIO(content), filename="demo.gif")

    result = run(read_gif_project_metadata(upload))

    assert result["project"] == PROJECT


def test_regular_gif_without_metadata_returns_no_project():
    buffer = BytesIO()
    first = Image.new("RGB", (4, 4), "red")
    second = Image.new("RGB", (4, 4), "blue")
    first.save(
        buffer,
        format="GIF",
        save_all=True,
        append_images=[second],
        duration=[100, 150],
        loop=0,
    )

    upload = UploadFile(file=BytesIO(buffer.getvalue()), filename="normal.gif")
    result = run(read_gif_project_metadata(upload))

    assert result == {"project": None}


def test_export_rejects_invalid_project_json():
    with pytest.raises(HTTPException) as error:
        run(
            export_ascii_gif(
                project_json="{not valid JSON",
                foreground="#79F2A5",
                background="#10151D",
                font_size=12,
            )
        )

    assert error.value.status_code == 422


def test_export_rejects_invalid_foreground_color():
    with pytest.raises(HTTPException) as error:
        run(
            export_ascii_gif(
                project_json=json.dumps(PROJECT),
                foreground="not-a-color",
                background="#10151D",
                font_size=12,
            )
        )

    assert error.value.status_code == 422
