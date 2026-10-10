"""Punto de entrada del backend para la aplicación de escritorio."""

import argparse

import uvicorn

from ascii_motion.api.main import app


def main() -> None:
    parser = argparse.ArgumentParser(description="Backend de ASCII Motion")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Puerto local donde escuchar la API",
    )
    args = parser.parse_args()

    if not 1 <= args.port <= 65535:
        parser.error("El puerto debe estar entre 1 y 65535.")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
