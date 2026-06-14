#!/usr/bin/env python3
"""
RIFT World Flythrough — development server with live reload.

Watches the project directory for file changes and auto-refreshes
the browser via a small injected WebSocket client.

Usage:
    python dev.py [--port 8000]

Dependencies: None (stdlib only — http.server + websockets via threading).
"""

from __future__ import annotations

import argparse
import contextlib
import http.server
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
ENTRYPOINT = "flythrough.html"
DEFAULT_PORT = 8000
BIND_ADDR = "127.0.0.1"

# Files to watch for changes (relative to PROJECT_DIR)
WATCH_PATTERNS = [
    "flythrough.html",
    "merged.obj",
    "js/",
    "run.py",
    "dev.py",
    "merge_objs.py",
    "validate_obj.py",
]

# ── Live-reload injection script ──
LIVE_RELOAD_SCRIPT = """
<script>
(function() {
  var ws = new WebSocket('ws://{host}:{port}/__live_reload');
  ws.onmessage = function(msg) {{
    if (msg.data === 'reload') location.reload();
  }};
  ws.onclose = function() {{
    // Reconnect after 1s
    setTimeout(function() {{ location.reload(); }}, 1000);
  }};
})();
</script>
"""


class DevHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP handler that injects live-reload script into flythrough.html."""

    def do_GET(self):  # noqa: N802 - required by SimpleHTTPRequestHandler
        if self.path in ("/", "/flythrough.html"):
            self._serve_live_reload()
        else:
            super().do_GET()

    def _serve_live_reload(self):
        html_path = PROJECT_DIR / ENTRYPOINT
        if not html_path.exists():
            self.send_error(404, "flythrough.html not found")
            return
        content = html_path.read_text(encoding="utf-8")
        # Inject live-reload script before </body>
        reload_tag = LIVE_RELOAD_SCRIPT.format(host=BIND_ADDR, port=self.server.reload_port)
        content = content.replace("</body>", reload_tag + "\n</body>")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(content.encode("utf-8"))

    def log_message(self, format, *args):
        # Quieter logging
        sys.stderr.write(f"  {args[0]}\n")


class LiveReloadServer:
    """WebSocket-like server for notifying connected browsers of file changes."""

    def __init__(self, port: int):
        self.port = port
        self._clients: list[socket.socket] = []
        self._lock = threading.Lock()

    def start(self) -> None:
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((BIND_ADDR, self.port))
        self._sock.listen(8)
        self._sock.settimeout(1.0)
        threading.Thread(target=self._accept_loop, daemon=True).start()

    def _accept_loop(self) -> None:
        while True:
            try:
                conn, _ = self._sock.accept()
                threading.Thread(target=self._handle_client, args=(conn,), daemon=True).start()
            except socket.timeout:
                continue
            except OSError:
                break

    def _handle_client(self, conn: socket.socket) -> None:
        try:
            # Read the WebSocket upgrade request (simple handshake)
            request = conn.recv(4096).decode("utf-8", errors="replace")
            if "Upgrade: websocket" not in request:
                conn.close()
                return

            # Extract key
            key = ""
            for line in request.split("\r\n"):
                if line.lower().startswith("sec-websocket-key:"):
                    key = line.split(":", 1)[1].strip()
                    break

            import base64
            import hashlib

            magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept = base64.b64encode(hashlib.sha1((key + magic).encode()).digest()).decode()

            response = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n"
                "\r\n"
            )
            conn.sendall(response.encode())

            with self._lock:
                self._clients.append(conn)

            # Keep-alive: read (ignore) pings
            while True:
                data = conn.recv(1024)
                if not data:
                    break
        except (OSError, ConnectionError):
            pass
        finally:
            with self._lock:
                if conn in self._clients:
                    self._clients.remove(conn)
            with contextlib.suppress(OSError):
                conn.close()

    def notify_all(self) -> None:
        """Send reload command to all connected clients."""
        with self._lock:
            dead = []
            for client in self._clients:
                try:
                    # WebSocket text frame: FIN + opcode=1 + masked=0
                    payload = b"reload"
                    frame = bytearray()
                    frame.append(0x81)  # FIN + text opcode
                    frame.append(len(payload))
                    frame.extend(payload)
                    client.sendall(frame)
                except OSError:
                    dead.append(client)
            for d in dead:
                self._clients.remove(d)


class FileWatcher:
    """Polls file mtimes and calls callback on changes."""

    def __init__(self):
        self._mtimes: dict[str, float] = {}
        self._scan()

    def _scan(self) -> None:
        """Record mtimes for all watched files."""
        for pattern in WATCH_PATTERNS:
            p = PROJECT_DIR / pattern
            if p.is_dir():
                for f in p.rglob("*"):
                    if f.is_file():
                        self._mtimes[str(f)] = f.stat().st_mtime
            elif p.is_file():
                self._mtimes[str(p)] = p.stat().st_mtime

    def check(self) -> bool:
        """Return True if any watched file changed since last check."""
        changed = False
        for pattern in WATCH_PATTERNS:
            p = PROJECT_DIR / pattern
            if p.is_dir():
                for f in p.rglob("*"):
                    if f.is_file():
                        try:
                            key = str(f)
                            mtime = f.stat().st_mtime
                            if key not in self._mtimes or mtime != self._mtimes[key]:
                                self._mtimes[key] = mtime
                                changed = True
                        except OSError:
                            pass
            elif p.is_file():
                try:
                    key = str(p)
                    mtime = p.stat().st_mtime
                    if key in self._mtimes and mtime != self._mtimes[key]:
                        self._mtimes[key] = mtime
                        changed = True
                except OSError:
                    pass
        return changed


def find_free_port(start: int = DEFAULT_PORT) -> int:
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((BIND_ADDR, port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port found between {start}-{start + 99}")


def main() -> int:
    parser = argparse.ArgumentParser(description="RIFT Flythrough dev server with live reload.")
    parser.add_argument("--port", type=int, default=None, help="Port to serve on (default: 8000)")
    args = parser.parse_args()

    os.chdir(PROJECT_DIR)

    if not (PROJECT_DIR / ENTRYPOINT).exists():
        print(f"ERROR: {ENTRYPOINT} not found in {PROJECT_DIR}", file=sys.stderr)
        return 1

    http_port = args.port or find_free_port(DEFAULT_PORT)
    reload_port = http_port + 1

    # Start live-reload server on adjacent port
    reload_server = LiveReloadServer(reload_port)
    reload_server.start()

    # Start HTTP server
    handler = DevHTTPHandler
    httpd = http.server.ThreadingHTTPServer((BIND_ADDR, http_port), handler)
    httpd.reload_port = reload_port  # type: ignore[attr-defined]

    url = f"http://{BIND_ADDR}:{http_port}/{ENTRYPOINT}"
    print("Dev server with live reload")
    print(f"  URL:     {url}")
    print("  Watching: flythrough.html, merged.obj, js/", *WATCH_PATTERNS)
    print("  Press Ctrl+C to stop\n")

    webbrowser.open(url)

    watcher = FileWatcher()
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    try:
        while True:
            time.sleep(1)
            if watcher.check():
                print("  [change detected] reloading browser...")
                reload_server.notify_all()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.shutdown()
        return 0


if __name__ == "__main__":
    sys.exit(main())
