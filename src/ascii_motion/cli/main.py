import argparse
import sys
from pathlib import Path

from ascii_motion.core.converter import CHARSETS
from ascii_motion.core.service import convert_gif_file, convert_image_file
from ascii_motion.exceptions import AnimationLoadError, ImageLoadError
from ascii_motion.models.settings import ConversionSettings
from ascii_motion.renderers.text_renderer import (
    load_animation_file,
    render_animation,
    render_to_terminal,
    save_animation,
    save_to_file,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ascii-motion",
        description="Convert images and GIF animations into ASCII art.",
    )

    parser.add_argument("image", nargs="?", help="Image or GIF to convert")
    parser.add_argument("--width", type=int, default=80)
    parser.add_argument(
        "--charset",
        default="standard",
        help="Named or custom character set",
    )
    parser.add_argument("--contrast", type=float, default=1.0)
    parser.add_argument("--brightness", type=float, default=1.0)
    parser.add_argument("--character-aspect-ratio", type=float, default=0.5)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--normalize-contrast", action="store_true")
    parser.add_argument("--invert", action="store_true")
    parser.add_argument("--output", help="Save image conversion to a .txt file")
    parser.add_argument(
        "--play",
        action="store_true",
        help="Play a GIF in the terminal",
    )
    parser.add_argument(
        "--export-animation",
        help="Export a GIF as an ASCII animation .txt file",
    )
    parser.add_argument(
        "--play-file",
        help="Play a previously exported ASCII animation .txt file",
    )
    parser.add_argument(
        "--loops",
        type=int,
        default=1,
        help="Playback repetitions; 0 means repeat indefinitely",
    )
    parser.add_argument(
        "--list-charsets",
        action="store_true",
        help="List built-in character sets",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        if args.list_charsets:
            for name, charset in CHARSETS.items():
                print(f"{name}: {charset}")
            return 0

        if args.play_file and (
            args.image or args.output or args.play or args.export_animation
        ):
            parser.error("--play-file cannot be combined with image conversion options")

        if args.play and args.export_animation:
            parser.error("--play and --export-animation cannot be used together")

        if args.play_file and args.export_animation:
            parser.error("--play-file and --export-animation cannot be used together")

        if args.loops < 0:
            parser.error("--loops cannot be negative")

        if args.output and (args.play or args.export_animation or args.play_file):
            parser.error("--output cannot be combined with animation modes")

        if not args.play_file and not args.image:
            parser.error("Provide an image or GIF, or use --play-file")

        settings = ConversionSettings(
            width=args.width,
            charset=args.charset,
            contrast=args.contrast,
            brightness=args.brightness,
            invert=args.invert,
            character_aspect_ratio=args.character_aspect_ratio,
            gamma=args.gamma,
            normalize_contrast=args.normalize_contrast,
        )

        if args.play_file:
            frames = load_animation_file(args.play_file)
            render_animation(frames, loops=args.loops)
            return 0

        input_path = Path(args.image)

        if args.play or args.export_animation:
            frames = convert_gif_file(input_path, settings=settings)

            if args.export_animation:
                output_path = save_animation(frames, args.export_animation)
                print(f"ASCII animation saved to: {output_path}")
            else:
                render_animation(frames, loops=args.loops)

            return 0

        ascii_art = convert_image_file(input_path, settings=settings)

        if args.output:
            output_path = save_to_file(ascii_art, args.output)
            print(f"ASCII art saved to: {output_path}")
        else:
            render_to_terminal(ascii_art)

        return 0

    except (AnimationLoadError, ImageLoadError, OSError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nOperation cancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
