#!/usr/bin/env python3
"""Run a headless browser smoke test for flythrough.html.

The smoke test starts a local static server, opens the viewer in Chromium via
Playwright, waits for the OBJ world to finish loading, and fails on fatal page
errors, critical resource failures, or the app crash overlay.

Generated texture files are intentionally not tracked in this repository, so
404s under textures/converted/ are reported as optional misses instead of fatal
failures. Script/module/OBJ failures still fail the run.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import contextlib
import functools
import json
import sys
import threading
from dataclasses import dataclass, field
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_TIMEOUT_SECONDS = 45.0
TEXTURE_FIXTURE_PATH = Path("textures") / "converted" / "browser-smoke-fixture.png"
TEXTURE_FIXTURE_URL = "/" + TEXTURE_FIXTURE_PATH.as_posix()
TEXTURE_FIXTURE_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
)

READY_SCRIPT = """
() => {
  const loading = document.querySelector("#loading");
  const crash = document.querySelector("#crash-overlay");
  const status = document.querySelector("#load-status");
  return Boolean(
    (loading && loading.classList.contains("hidden")) ||
    (crash && crash.classList.contains("active")) ||
    (status && status.classList.contains("err"))
  );
}
"""

STATE_SCRIPT = """
() => {
  const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
  const loading = document.querySelector("#loading");
  const crash = document.querySelector("#crash-overlay");
  const rendererCanvas = Array.from(document.body.children).some((el) => {
    return el.tagName === "CANVAS" && el.width > 0 && el.height > 0;
  });
  return {
    loadingHidden: Boolean(loading?.classList.contains("hidden")),
    crashActive: Boolean(crash?.classList.contains("active")),
    crashDetails: text("#crash-details") || text("#crash-overlay .crash-msg"),
    loadStatus: text("#load-status"),
    rendererCanvas,
    canvasCount: document.querySelectorAll("canvas").length,
    statGroups: text("#stat-groups"),
    statFaces: text("#stat-faces"),
    statTextures: text("#stat-textures"),
  };
}
"""

SIDEBAR_STATE_SCRIPT = """
() => {
  const dotHasClass = (id, className) => {
    return Boolean(document.querySelector(`#${id} .sb-dot`)?.classList.contains(className));
  };
  const storageValue = (key) => {
    try {
      return localStorage.getItem(`rift-sb-${key}`);
    } catch (error) {
      return null;
    }
  };
  const savedSettings = (() => {
    try {
      return JSON.parse(localStorage.getItem("rift-flythrough-settings") || "{}");
    } catch (error) {
      return {};
    }
  })();

  return {
    updateSidebarDotExposed: typeof window.updateSidebarDot === "function",
    labelsOff: dotHasClass("sb-toggle-labels", "off"),
    gridOff: dotHasClass("sb-toggle-grid", "off"),
    perfOn: dotHasClass("sb-toggle-perf", "on"),
    perfPanelVisible: document.querySelector("#perf-panel")?.style.display === "block",
    storedLabels: storageValue("labels"),
    storedGrid: storageValue("grid"),
    storedPerf: storageValue("perf"),
    settingGridVisible: savedSettings.gridVisible ?? null,
  };
}
"""

HIDE_START_OVERLAY_SCRIPT = """
() => {
  const overlay = document.querySelector("#overlay");
  if (!overlay) return false;
  overlay.classList.add("hidden");
  return true;
}
"""

SIDEBAR_SMOKE_CLICKS = (
    ("#sb-toggle-labels", "labels toggle"),
    ("#sb-toggle-grid", "grid toggle"),
    ("#sb-toggle-perf", "performance overlay toggle"),
)


@dataclass
class SmokeEvents:
    """Captured browser events grouped by severity."""

    console_errors: list[str] = field(default_factory=list)
    page_errors: list[str] = field(default_factory=list)
    critical_resource_failures: list[str] = field(default_factory=list)
    optional_texture_failures: list[str] = field(default_factory=list)


class QuietHandler(SimpleHTTPRequestHandler):
    """Simple static file handler without per-request stdout noise."""

    def log_message(self, _format: str, *_args: Any) -> None:
        return


@contextlib.contextmanager
def serve_directory(root: Path, host: str, port: int):
    """Serve *root* over HTTP and yield the running server."""
    handler = functools.partial(QuietHandler, directory=str(root))
    server = ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@contextlib.contextmanager
def temporary_texture_fixture(enabled: bool):
    """Create an ignored generated-texture fixture for strict smoke checks."""
    fixture_path = PROJECT_DIR / TEXTURE_FIXTURE_PATH
    existed = fixture_path.exists()
    previous_bytes = fixture_path.read_bytes() if existed else None

    if enabled:
        fixture_path.parent.mkdir(parents=True, exist_ok=True)
        fixture_path.write_bytes(TEXTURE_FIXTURE_BYTES)

    try:
        yield TEXTURE_FIXTURE_URL if enabled else ""
    finally:
        if enabled:
            if existed and previous_bytes is not None:
                fixture_path.write_bytes(previous_bytes)
            else:
                with contextlib.suppress(FileNotFoundError):
                    fixture_path.unlink()
                for directory in [fixture_path.parent, fixture_path.parent.parent]:
                    with contextlib.suppress(OSError):
                        directory.rmdir()


def _playwright_attr(obj: Any, name: str, default: Any = "") -> Any:
    """Return a Playwright attribute that may be a property or method."""
    value = getattr(obj, name, default)
    if callable(value):
        return value()
    return value


def is_optional_texture_url(url: str) -> bool:
    """Return True for generated texture URLs that may be absent in CI."""
    path = unquote(urlparse(url).path).replace("\\", "/").lower()
    return path.startswith("/textures/converted/") and path.endswith((".png", ".jpg", ".jpeg", ".webp"))


def _resource_type(response: Any) -> str:
    request = _playwright_attr(response, "request", None)
    if not request:
        return "unknown"
    return str(_playwright_attr(request, "resource_type", "unknown"))


def _response_summary(response: Any) -> str:
    status = _playwright_attr(response, "status", "unknown")
    url = _playwright_attr(response, "url", "")
    return f"{status} {_resource_type(response)} {url}"


def _console_location_url(message: Any) -> str:
    location = _playwright_attr(message, "location", {}) or {}
    if isinstance(location, dict):
        return str(location.get("url", ""))
    return ""


def record_console(message: Any, events: SmokeEvents) -> None:
    """Capture fatal console errors while ignoring generic resource noise."""
    message_type = str(_playwright_attr(message, "type", ""))
    if message_type != "error":
        return

    text = str(_playwright_attr(message, "text", ""))
    location_url = _console_location_url(message)
    if is_optional_texture_url(location_url):
        events.optional_texture_failures.append(f"console {location_url}: {text}")
        return

    # Chromium emits generic console errors for HTTP 404 resources. The response
    # handler below classifies the actual resource URL, so avoid double-failing
    # optional generated textures whose console text may not include their URL.
    if text.startswith("Failed to load resource:"):
        return

    events.console_errors.append(f"{location_url}: {text}".strip(": "))


def record_response(response: Any, events: SmokeEvents, strict_textures: bool = False) -> None:
    """Capture HTTP error responses, allowing optional generated textures."""
    status = int(_playwright_attr(response, "status", 0) or 0)
    if status < 400:
        return

    url = str(_playwright_attr(response, "url", ""))
    summary = _response_summary(response)
    if not strict_textures and is_optional_texture_url(url):
        events.optional_texture_failures.append(summary)
        return

    events.critical_resource_failures.append(summary)


def evaluate_state_failures(state: dict[str, Any]) -> list[str]:
    """Return app-state failures after the smoke wait has completed."""
    failures: list[str] = []
    if state.get("crashActive"):
        details = state.get("crashDetails") or "Crash overlay is active"
        failures.append(f"App crash overlay is active: {details}")
    if not state.get("loadingHidden"):
        failures.append("World loading overlay did not hide")
    if state.get("loadStatus") == "✗":
        failures.append("OBJ load status reported failure")
    if not state.get("rendererCanvas"):
        failures.append("Renderer canvas was not created")
    groups = stat_int(state.get("statGroups"))
    faces = stat_int(state.get("statFaces"))
    if groups is None:
        failures.append("World group statistics did not populate")
    elif groups < state.get("minGroups", 1):
        failures.append(f"World group count is too low: {groups}")
    if faces is None:
        failures.append("World face statistics did not populate")
    elif faces < state.get("minFaces", 1):
        failures.append(f"World face count is too low: {faces}")

    sidebar_smoke = state.get("sidebarSmoke")
    if not isinstance(sidebar_smoke, dict):
        failures.append("Sidebar smoke state did not populate")
    else:
        failures.extend(str(failure) for failure in sidebar_smoke.get("failures", []))

    return failures


def stat_int(value: Any) -> int | None:
    """Parse a comma-formatted positive integer stat from the viewer."""
    text = str(value or "").replace(",", "").strip()
    if not text or text == "—":
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


async def write_artifacts(page: Any, events: SmokeEvents, state: dict[str, Any], artifacts_dir: Path) -> None:
    """Write a screenshot and JSON report for failed smoke runs."""
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "state": state,
        "console_errors": events.console_errors,
        "page_errors": events.page_errors,
        "critical_resource_failures": events.critical_resource_failures,
        "optional_texture_failures": events.optional_texture_failures[:50],
        "optional_texture_failure_count": len(events.optional_texture_failures),
    }
    (artifacts_dir / "browser-smoke-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    with contextlib.suppress(Exception):
        await page.screenshot(path=str(artifacts_dir / "browser-smoke.png"), full_page=True)


async def fetch_texture_fixture(page: Any, fixture_url: str) -> dict[str, Any]:
    """Fetch the generated texture fixture from the browser context."""
    return await page.evaluate(
        """
        async (fixtureUrl) => {
          const response = await fetch(fixtureUrl, { cache: "no-store" });
          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get("content-type") || "",
          };
        }
        """,
        fixture_url,
    )


async def exercise_sidebar_controls(page: Any) -> dict[str, Any]:
    """Click safe sidebar controls and return their post-click state."""
    failures: list[str] = []
    clicked: list[str] = []

    overlay_hidden = await page.evaluate(HIDE_START_OVERLAY_SCRIPT)
    if not overlay_hidden:
        failures.append("Start overlay was not found before sidebar smoke")

    for selector, label in SIDEBAR_SMOKE_CLICKS:
        locator = page.locator(selector)
        count = await locator.count()
        if count != 1:
            failures.append(f"Expected one {label} ({selector}), found {count}")
            continue

        await locator.click()
        clicked.append(label)
        await page.wait_for_timeout(150)

    sidebar_state = await page.evaluate(SIDEBAR_STATE_SCRIPT)
    sidebar_state["clicked"] = clicked
    sidebar_state["failures"] = failures

    expected_values = {
        "updateSidebarDotExposed": True,
        "labelsOff": True,
        "gridOff": True,
        "perfOn": True,
        "perfPanelVisible": True,
        "storedLabels": "0",
        "storedGrid": "0",
        "storedPerf": "1",
        "settingGridVisible": False,
    }
    for key, expected in expected_values.items():
        if sidebar_state.get(key) != expected:
            sidebar_state["failures"].append(
                f"Sidebar smoke expected {key}={expected!r}, got {sidebar_state.get(key)!r}",
            )

    return sidebar_state


async def run_smoke(args: argparse.Namespace) -> int:
    """Run the browser smoke test and return a process exit code."""
    try:
        from playwright.async_api import Error as PlaywrightError
        from playwright.async_api import TimeoutError as PlaywrightTimeoutError
        from playwright.async_api import async_playwright
    except ModuleNotFoundError:
        print("[ERR] Playwright is not installed. Install it with:")
        print("      python -m pip install playwright")
        print("      python -m playwright install chromium")
        return 2

    events = SmokeEvents()
    state: dict[str, Any] = {}
    failures: list[str] = []
    timeout_ms = int(args.timeout * 1000)

    with (
        temporary_texture_fixture(args.texture_fixture) as texture_fixture_url,
        serve_directory(
            PROJECT_DIR,
            args.host,
            args.port,
        ) as server,
    ):
        host, port = server.server_address
        url = f"http://{host}:{port}/flythrough.html"
        print(f"[browser-smoke] {url}")

        browser = None
        page = None
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=not args.headed)
                context = await browser.new_context(viewport={"width": 1280, "height": 720})
                page = await context.new_page()
                page.on("console", lambda msg: record_console(msg, events))
                page.on("pageerror", lambda err: events.page_errors.append(str(err)))
                page.on("response", lambda response: record_response(response, events, args.strict_textures))

                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                await page.wait_for_function(READY_SCRIPT, timeout=timeout_ms)
                await page.wait_for_timeout(int(args.settle_seconds * 1000))
                state = await page.evaluate(STATE_SCRIPT)
                state["minGroups"] = args.min_groups
                state["minFaces"] = args.min_faces
                if texture_fixture_url:
                    state["textureFixture"] = await fetch_texture_fixture(page, texture_fixture_url)
                try:
                    state["sidebarSmoke"] = await exercise_sidebar_controls(page)
                except PlaywrightTimeoutError as exc:
                    state["sidebarSmoke"] = {"failures": [f"Timed out exercising sidebar controls: {exc}"]}

                failures.extend(evaluate_state_failures(state))
                if texture_fixture_url and not state["textureFixture"]["ok"]:
                    failures.append(
                        f"Texture fixture fetch failed: HTTP {state['textureFixture']['status']} {texture_fixture_url}",
                    )
                failures.extend([f"Console error: {item}" for item in events.console_errors])
                failures.extend([f"Page error: {item}" for item in events.page_errors])
                failures.extend([f"Resource failure: {item}" for item in events.critical_resource_failures])

                if failures:
                    await write_artifacts(page, events, state, args.artifacts_dir)

                await context.close()
        except PlaywrightTimeoutError as exc:
            failures.append(f"Timed out waiting for viewer readiness: {exc}")
            if page:
                await write_artifacts(page, events, state, args.artifacts_dir)
        except PlaywrightError as exc:
            failures.append(f"Playwright failed: {exc}")
        finally:
            if browser:
                await browser.close()

    if failures:
        print("[FAIL] Browser smoke test failed:")
        for failure in failures:
            print(f"  - {failure}")
        print(f"  Artifacts: {args.artifacts_dir}")
        return 1

    print(
        "[OK] Browser smoke passed "
        f"(groups={state.get('statGroups')}, faces={state.get('statFaces')}, "
        f"optional_texture_404s={len(events.optional_texture_failures)})",
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run a browser smoke test for flythrough.html.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for the temporary HTTP server.")
    parser.add_argument(
        "--port", type=int, default=0, help="Port for the temporary HTTP server; 0 chooses a free port."
    )
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Load timeout in seconds.")
    parser.add_argument("--settle-seconds", type=float, default=1.0, help="Extra wait after the app reports ready.")
    parser.add_argument("--min-groups", type=int, default=1, help="Minimum expected world group count.")
    parser.add_argument("--min-faces", type=int, default=1, help="Minimum expected world face count.")
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=PROJECT_DIR / "artifacts" / "browser-smoke",
        help="Directory for failure screenshots and JSON reports.",
    )
    parser.add_argument("--headed", action="store_true", help="Run Chromium headed instead of headless.")
    parser.add_argument(
        "--strict-textures",
        action="store_true",
        help="Fail on generated texture 404s instead of treating them as optional CI misses.",
    )
    parser.add_argument(
        "--texture-fixture",
        action="store_true",
        help=(
            "Generate and fetch an ignored textures/converted PNG fixture so strict texture checks "
            "can run without tracked generated assets."
        ),
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return asyncio.run(run_smoke(args))


if __name__ == "__main__":
    sys.exit(main())
