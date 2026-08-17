from __future__ import annotations

import argparse
import multiprocessing
import os

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Run the bundled Socium local API.")
    result.add_argument("--host", default=os.getenv("SOCIUM_API_HOST", "127.0.0.1"))
    result.add_argument("--port", default=int(os.getenv("SOCIUM_API_PORT", "8000")), type=int)
    return result


def main() -> None:
    args = parser().parse_args()
    if args.host not in LOOPBACK_HOSTS:
        parser().error("The native Socium API may only bind to a loopback host.")
    if not 1 <= args.port <= 65535:
        parser().error("Port must be between 1 and 65535.")

    os.environ["SOCIUM_API_HOST"] = args.host
    os.environ["SOCIUM_API_PORT"] = str(args.port)

    import uvicorn

    from app.main import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
