#!/usr/bin/env python3
"""
RIFT World Flythrough — one-click launcher.

Starts a local HTTP server and opens the viewer in the default browser.
Works on Windows, macOS, and Linux without any dependencies beyond Python 3.

Usage:
    python run.py [--port 8000]
"""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
ENTRYPOINT = "flythrough.html"
DEFAULT_PORT = 8000
BIND_ADDR = "127.0.0.1"


def find_free_port(start: int = DEFAULT_PORT) -> int:
    """Find an available TCP port starting from *start*."""
    port = start
    for _ in range(100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((BIND_ADDR, port))
                return port
            except OSError:
                port += 1
    raise RuntimeError("No free port found between 8000-8099")


def open_browser(url: str) -> None:
    """Open *url* in the default browser after a short delay."""

    def _open() -> None:
        webbrowser.open(url)

    threading.Timer(0.5, _open).start()


def main() -> int:
    parser = argparse.ArgumentParser(description="RIFT Flythrough static server launcher.")
    parser.add_argument("--port", type=int, default=None, help="Port to serve on (default: auto-find from 8000)")
    args = parser.parse_args()

    os.chdir(PROJECT_DIR)

    if not (PROJECT_DIR / ENTRYPOINT).exists():
        print(f"ERROR: {ENTRYPOINT} not found in {PROJECT_DIR}", file=sys.stderr)
        return 1

    port = args.port if args.port else find_free_port(DEFAULT_PORT)
    url = f"http://{BIND_ADDR}:{port}/{ENTRYPOINT}"

    print("Starting RIFT World Flythrough...")
    print(f"  Server: {url}")
    print("  Press Ctrl+C to stop")
    print()

    open_browser(url)

    handler = http.server.SimpleHTTPRequestHandler
    server = http.server.ThreadingHTTPServer((BIND_ADDR, port), handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.shutdown()
        return 0


def entrypoint() -> None:
    """Entry point for console script (handles SystemExit)."""
    sys.exit(main())


if __name__ == "__main__":
    entrypoint()
