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
import re
import sys
import threading
import time
from dataclasses import dataclass, field
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_TIMEOUT_SECONDS = 45.0
SIDEBAR_ACTION_TIMEOUT_MS = 10000
SIDEBAR_SETTLE_MS = 150
SETTINGS_STORAGE_KEY = "rift-flythrough-settings"
TIMING_KEYS = ("browserSetup", "goto", "ready", "textures", "settle", "state", "textureFixture", "sidebar", "total")
TEXTURE_FIXTURE_PATH = Path("textures") / "converted" / "browser-smoke-fixture.png"
TEXTURE_FIXTURE_URL = "/" + TEXTURE_FIXTURE_PATH.as_posix()
TEXTURE_MAP_PATH = PROJECT_DIR / "js" / "texture_map.js"
TEXTURE_MAP_URL_RE = re.compile(r'url:\s*"([^"]+)"')
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

TEXTURE_STATUS_READY_SCRIPT = """
() => {
  const text = document.querySelector("#stat-textures")?.textContent?.trim() || "";
  return Boolean(text && text !== "—");
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
    catalogActive: Boolean(document.querySelector("#catalog-overlay")?.classList.contains("active")),
    catalogRows: document.querySelectorAll("#catalog-list .cat-row").length,
    catalogCountText: document.querySelector("#catalog-count")?.textContent?.trim() || "",
    helpActive: Boolean(document.querySelector("#help-overlay")?.classList.contains("active")),
    settingsActive: Boolean(document.querySelector("#settings-overlay")?.classList.contains("active")),
    settingsSectionOpen: Boolean(
      document.querySelector('#sidebar .sb-section[data-section="settings"]')?.classList.contains("open")
    ),
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

CATALOG_OPEN_SCRIPT = """
() => Boolean(document.querySelector("#catalog-overlay")?.classList.contains("active"))
"""

CATALOG_CLOSED_SCRIPT = """
() => !Boolean(document.querySelector("#catalog-overlay")?.classList.contains("active"))
"""

CATALOG_STATE_SCRIPT = """
() => ({
  active: Boolean(document.querySelector("#catalog-overlay")?.classList.contains("active")),
  rows: document.querySelectorAll("#catalog-list .cat-row").length,
  countText: document.querySelector("#catalog-count")?.textContent?.trim() || "",
  searchFocused: document.activeElement?.id === "catalog-search",
})
"""

SETTINGS_SECTION_OPEN_SCRIPT = """
() => Boolean(document.querySelector('#sidebar .sb-section[data-section="settings"]')?.classList.contains("open"))
"""

SETTINGS_SECTION_READY_SCRIPT = """
() => {
  const section = document.querySelector('#sidebar .sb-section[data-section="settings"]');
  const settings = document.querySelector("#sb-settings");
  const help = document.querySelector("#sb-help");
  const isActionReady = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return Boolean(
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none"
    );
  };
  return Boolean(section?.classList.contains("open") && isActionReady(settings) && isActionReady(help));
}
"""

HELP_OPEN_SCRIPT = """
() => Boolean(document.querySelector("#help-overlay")?.classList.contains("active"))
"""

HELP_CLOSED_SCRIPT = """
() => !Boolean(document.querySelector("#help-overlay")?.classList.contains("active"))
"""

SETTINGS_OPEN_SCRIPT = """
() => Boolean(document.querySelector("#settings-overlay")?.classList.contains("active"))
"""

SETTINGS_CLOSED_SCRIPT = """
() => !Boolean(document.querySelector("#settings-overlay")?.classList.contains("active"))
"""

HELP_STATE_SCRIPT = """
() => ({
  active: Boolean(document.querySelector("#help-overlay")?.classList.contains("active")),
  rows: document.querySelectorAll("#help-overlay table tr").length,
})
"""

SETTINGS_STATE_SCRIPT = """
() => ({
  active: Boolean(document.querySelector("#settings-overlay")?.classList.contains("active")),
  controls: document.querySelectorAll("#settings-overlay input, #settings-overlay select").length,
  heading: document.querySelector("#settings-overlay h2")?.textContent?.trim() || "",
  textureQuality: document.querySelector("#set-texture-quality")?.value || "",
})
"""

TEXTURE_QUALITY_OFF_SCRIPT = """
() => {
  const textureQuality = document.querySelector("#set-texture-quality");
  const statTextures = () => document.querySelector("#stat-textures")?.textContent?.trim() || "";
  if (!textureQuality) {
    return { ok: false, reason: "Texture quality control is missing", statTextures: statTextures() };
  }
  textureQuality.value = "off";
  textureQuality.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    ok: true,
    textureQuality: textureQuality.value,
    statTextures: statTextures(),
    toast: document.querySelector("#toast")?.textContent?.trim() || "",
  };
}
"""

TRIGGER_CLICK_SCRIPT = """
({ selector }) => {
  const matches = Array.from(document.querySelectorAll(selector));
  if (matches.length !== 1) {
    return { ok: false, reason: `expected one match, found ${matches.length}` };
  }

  const element = matches[0];
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const visible = Boolean(
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.pointerEvents !== "none" &&
    Number.parseFloat(style.opacity || "1") !== 0
  );
  if (!visible) {
    return {
      ok: false,
      reason: `element is not visible or interactive (display=${style.display}, visibility=${style.visibility})`,
    };
  }

  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return { ok: true };
}
"""


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
    fixture_paths = {TEXTURE_FIXTURE_PATH}
    if enabled:
        with contextlib.suppress(OSError):
            fixture_paths.update(parse_texture_map_fixture_paths(TEXTURE_MAP_PATH.read_text(encoding="utf-8")))

    created_files: list[Path] = []
    overwritten_files: dict[Path, bytes] = {}
    if enabled:
        for relative_path in sorted(fixture_paths, key=lambda path: path.as_posix()):
            fixture_path = PROJECT_DIR / relative_path
            if relative_path == TEXTURE_FIXTURE_PATH and fixture_path.exists():
                overwritten_files[fixture_path] = fixture_path.read_bytes()
            elif fixture_path.exists():
                continue
            else:
                created_files.append(fixture_path)
            fixture_path.parent.mkdir(parents=True, exist_ok=True)
            fixture_path.write_bytes(TEXTURE_FIXTURE_BYTES)

    try:
        yield TEXTURE_FIXTURE_URL if enabled else ""
    finally:
        if enabled:
            for fixture_path, previous_bytes in overwritten_files.items():
                fixture_path.write_bytes(previous_bytes)
            for fixture_path in reversed(created_files):
                with contextlib.suppress(FileNotFoundError):
                    fixture_path.unlink()
            for directory in [PROJECT_DIR / "textures" / "converted", PROJECT_DIR / "textures"]:
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


def parse_texture_map_fixture_paths(texture_map_source: str) -> list[Path]:
    """Return safe generated texture paths referenced by a texture map source."""
    paths: set[Path] = set()
    for url in TEXTURE_MAP_URL_RE.findall(texture_map_source):
        texture_path = PurePosixPath(unquote(urlparse(url).path))
        if texture_path.is_absolute():
            texture_path = PurePosixPath(*texture_path.parts[1:])
        if (
            len(texture_path.parts) < 3
            or texture_path.parts[0] != "textures"
            or texture_path.parts[1] != "converted"
            or any(part in {"", ".", ".."} for part in texture_path.parts)
            or texture_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}
        ):
            continue
        paths.add(Path(*texture_path.parts))
    return sorted(paths, key=lambda path: path.as_posix())


def parse_settings_json(value: str | None) -> dict[str, Any] | None:
    """Parse a smoke-test settings override JSON object."""
    if value is None:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"--settings-json must be valid JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise TypeError("--settings-json must decode to a JSON object")
    return parsed


def settings_storage_state(origin: str, settings: dict[str, Any]) -> dict[str, Any]:
    """Return Playwright storage_state that preloads viewer settings in localStorage."""
    return {
        "cookies": [],
        "origins": [
            {
                "origin": origin,
                "localStorage": [
                    {
                        "name": SETTINGS_STORAGE_KEY,
                        "value": json.dumps(settings, sort_keys=True),
                    },
                ],
            },
        ],
    }


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


def record_generated_texture_request(request: Any, generated_texture_requests: list[str]) -> None:
    """Track generated texture requests for startup modes that should not load textures."""
    url = str(_playwright_attr(request, "url", ""))
    if is_optional_texture_url(url):
        generated_texture_requests.append(url)


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


def elapsed_ms(started_at: float) -> int:
    """Return elapsed monotonic milliseconds since *started_at*."""
    return round((time.perf_counter() - started_at) * 1000)


def attach_timings(state: dict[str, Any], timings: dict[str, int], started_at: float) -> None:
    """Attach a stable timing snapshot to smoke state."""
    timings["total"] = elapsed_ms(started_at)
    state["timingsMs"] = {key: timings[key] for key in TIMING_KEYS if key in timings}


def format_timing_summary(timings: dict[str, Any]) -> str:
    """Format smoke timing telemetry for concise console output."""
    parts: list[str] = []
    for key in TIMING_KEYS:
        value = timings.get(key)
        if isinstance(value, (int, float)):
            parts.append(f"{key}={round(value)}ms")
    return ", ".join(parts)


async def write_artifacts(
    page: Any,
    events: SmokeEvents,
    state: dict[str, Any],
    artifacts_dir: Path,
    screenshot_full_page: bool = True,
) -> list[str]:
    """Write a screenshot and JSON report, returning artifact-write failures."""
    artifact_errors: list[str] = []
    try:
        artifacts_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return [f"Could not create browser smoke artifacts directory: {exc}"]
    report = {
        "state": state,
        "console_errors": events.console_errors,
        "page_errors": events.page_errors,
        "critical_resource_failures": events.critical_resource_failures,
        "optional_texture_failures": events.optional_texture_failures[:50],
        "optional_texture_failure_count": len(events.optional_texture_failures),
    }
    try:
        (artifacts_dir / "browser-smoke-report.json").write_text(
            json.dumps(report, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    except OSError as exc:
        artifact_errors.append(f"Could not write browser smoke report: {exc}")
    try:
        await page.screenshot(path=str(artifacts_dir / "browser-smoke.png"), full_page=screenshot_full_page)
    except Exception as exc:
        artifact_errors.append(f"Could not write browser smoke screenshot: {exc}")
    return artifact_errors


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


async def click_unique(page: Any, selector: str, label: str, failures: list[str]) -> bool:
    """Trigger a click event for *selector* only when it resolves to one visible element."""
    try:
        result = await page.evaluate(TRIGGER_CLICK_SCRIPT, {"selector": selector})
    except Exception as exc:
        failures.append(f"Could not trigger {label} ({selector}): {exc}")
        return False

    if not result.get("ok"):
        reason = result.get("reason") or "unknown trigger failure"
        failures.append(f"Could not trigger {label} ({selector}): {reason}")
        return False

    return True


async def wait_for_sidebar_state(page: Any, script: str, label: str, failures: list[str]) -> bool:
    """Wait for a sidebar smoke state and keep phase-specific failure details."""
    try:
        await page.wait_for_function(script, timeout=SIDEBAR_ACTION_TIMEOUT_MS)
    except Exception as exc:
        failures.append(f"Timed out waiting for {label}: {exc}")
        return False

    return True


async def ensure_settings_section_open(page: Any, failures: list[str]) -> bool:
    """Open the collapsed Settings & Help sidebar section when needed."""
    if await page.evaluate(SETTINGS_SECTION_OPEN_SCRIPT):
        return True

    if not await click_unique(
        page,
        '#sidebar .sb-section[data-section="settings"] .sb-header',
        "settings section header",
        failures,
    ):
        return False

    return await wait_for_sidebar_state(page, SETTINGS_SECTION_READY_SCRIPT, "settings section actions", failures)


async def exercise_sidebar_controls(page: Any, exercise_texture_quality_live: bool = False) -> dict[str, Any]:
    """Click safe sidebar controls and return their post-click state."""
    failures: list[str] = []
    clicked: list[str] = []
    catalog_open_state: dict[str, Any] = {}
    help_open_state: dict[str, Any] = {}
    settings_open_state: dict[str, Any] = {}
    texture_quality_live_state: dict[str, Any] = {}

    overlay_hidden = await page.evaluate(HIDE_START_OVERLAY_SCRIPT)
    if not overlay_hidden:
        failures.append("Start overlay was not found before sidebar smoke")

    for selector, label in SIDEBAR_SMOKE_CLICKS:
        if await click_unique(page, selector, label, failures):
            clicked.append(label)
            await page.wait_for_timeout(SIDEBAR_SETTLE_MS)

    if await click_unique(page, "#sb-catalog", "catalog action", failures):
        clicked.append("catalog action")
        await wait_for_sidebar_state(page, CATALOG_OPEN_SCRIPT, "catalog overlay to open", failures)
        catalog_open_state = await page.evaluate(CATALOG_STATE_SCRIPT)
        await page.keyboard.press("Escape")
        await wait_for_sidebar_state(page, CATALOG_CLOSED_SCRIPT, "catalog overlay to close", failures)
        await page.wait_for_timeout(SIDEBAR_SETTLE_MS)

    if await ensure_settings_section_open(page, failures):
        clicked.append("settings section")

        if await click_unique(page, "#sb-help", "help action", failures):
            clicked.append("help action")
            await wait_for_sidebar_state(page, HELP_OPEN_SCRIPT, "help overlay to open", failures)
            help_open_state = await page.evaluate(HELP_STATE_SCRIPT)
            await page.keyboard.press("Escape")
            await wait_for_sidebar_state(page, HELP_CLOSED_SCRIPT, "help overlay to close", failures)

        if await click_unique(page, "#sb-settings", "settings action", failures):
            clicked.append("settings action")
            await wait_for_sidebar_state(page, SETTINGS_OPEN_SCRIPT, "settings overlay to open", failures)
            settings_open_state = await page.evaluate(SETTINGS_STATE_SCRIPT)
            if exercise_texture_quality_live:
                texture_quality_live_state = await page.evaluate(TEXTURE_QUALITY_OFF_SCRIPT)
                await page.wait_for_timeout(SIDEBAR_SETTLE_MS)
            await page.keyboard.press("Escape")
            await wait_for_sidebar_state(page, SETTINGS_CLOSED_SCRIPT, "settings overlay to close", failures)

    sidebar_state = await page.evaluate(SIDEBAR_STATE_SCRIPT)
    sidebar_state["clicked"] = clicked
    sidebar_state["catalogOpenState"] = catalog_open_state
    sidebar_state["helpOpenState"] = help_open_state
    sidebar_state["settingsOpenState"] = settings_open_state
    sidebar_state["textureQualityLiveState"] = texture_quality_live_state
    sidebar_state["failures"] = failures

    expected_values = {
        "updateSidebarDotExposed": True,
        "labelsOff": True,
        "gridOff": True,
        "perfOn": True,
        "perfPanelVisible": True,
        "catalogActive": False,
        "helpActive": False,
        "settingsActive": False,
        "settingsSectionOpen": True,
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

    if not catalog_open_state.get("active"):
        sidebar_state["failures"].append("Sidebar smoke expected catalog overlay to open")
    if catalog_open_state.get("rows", 0) < 1:
        sidebar_state["failures"].append(
            f"Sidebar smoke expected catalog rows, got {catalog_open_state.get('rows')!r}",
        )
    if not catalog_open_state.get("countText"):
        sidebar_state["failures"].append("Sidebar smoke expected catalog count text to populate")
    if not catalog_open_state.get("searchFocused"):
        sidebar_state["failures"].append("Sidebar smoke expected catalog search to receive focus")

    if not help_open_state.get("active"):
        sidebar_state["failures"].append("Sidebar smoke expected help overlay to open")
    if help_open_state.get("rows", 0) < 1:
        sidebar_state["failures"].append(f"Sidebar smoke expected help rows, got {help_open_state.get('rows')!r}")

    if not settings_open_state.get("active"):
        sidebar_state["failures"].append("Sidebar smoke expected settings overlay to open")
    if settings_open_state.get("heading") != "Settings":
        sidebar_state["failures"].append(
            f"Sidebar smoke expected settings heading, got {settings_open_state.get('heading')!r}",
        )
    if settings_open_state.get("controls", 0) < 1:
        sidebar_state["failures"].append(
            f"Sidebar smoke expected settings controls, got {settings_open_state.get('controls')!r}",
        )
    if settings_open_state.get("textureQuality") != "high":
        sidebar_state["failures"].append(
            f"Sidebar smoke expected texture quality high, got {settings_open_state.get('textureQuality')!r}",
        )
    if exercise_texture_quality_live:
        if not texture_quality_live_state.get("ok"):
            sidebar_state["failures"].append(
                "Sidebar smoke expected texture quality live exercise to run: "
                f"{texture_quality_live_state.get('reason')!r}",
            )
        if texture_quality_live_state.get("textureQuality") != "off":
            sidebar_state["failures"].append(
                "Sidebar smoke expected live texture quality value off, got "
                f"{texture_quality_live_state.get('textureQuality')!r}",
            )
        if texture_quality_live_state.get("statTextures") != "off":
            sidebar_state["failures"].append(
                "Sidebar smoke expected live texture quality to set stat-textures off, got "
                f"{texture_quality_live_state.get('statTextures')!r}",
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

    try:
        settings_override = parse_settings_json(args.settings_json)
    except (TypeError, ValueError) as exc:
        print(f"[ERR] {exc}")
        return 2
    if args.texture_fixture and args.forbid_generated_texture_requests:
        print("[ERR] --texture-fixture cannot be combined with --forbid-generated-texture-requests")
        return 2

    events = SmokeEvents()
    state: dict[str, Any] = {}
    failures: list[str] = []
    timings: dict[str, int] = {}
    generated_texture_requests: list[str] = []
    smoke_started_at = time.perf_counter()
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
        origin = f"http://{host}:{port}"
        print(f"[browser-smoke] {url}")

        browser = None
        page = None
        try:
            async with async_playwright() as playwright:
                step_started_at = time.perf_counter()
                browser = await playwright.chromium.launch(headless=not args.headed)
                context_options = {"viewport": {"width": 1280, "height": 720}}
                if settings_override is not None:
                    context_options["storage_state"] = settings_storage_state(origin, settings_override)
                context = await browser.new_context(**context_options)
                page = await context.new_page()
                page.on("console", lambda msg: record_console(msg, events))
                page.on("pageerror", lambda err: events.page_errors.append(str(err)))
                page.on("response", lambda response: record_response(response, events, args.strict_textures))
                if args.forbid_generated_texture_requests:
                    page.on(
                        "request",
                        lambda request: record_generated_texture_request(request, generated_texture_requests),
                    )
                timings["browserSetup"] = elapsed_ms(step_started_at)

                step_started_at = time.perf_counter()
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                timings["goto"] = elapsed_ms(step_started_at)

                step_started_at = time.perf_counter()
                await page.wait_for_function(READY_SCRIPT, timeout=timeout_ms)
                timings["ready"] = elapsed_ms(step_started_at)

                if args.strict_textures and args.texture_fixture:
                    step_started_at = time.perf_counter()
                    await page.wait_for_function(TEXTURE_STATUS_READY_SCRIPT, timeout=timeout_ms)
                    timings["textures"] = elapsed_ms(step_started_at)

                step_started_at = time.perf_counter()
                await page.wait_for_timeout(int(args.settle_seconds * 1000))
                timings["settle"] = elapsed_ms(step_started_at)

                step_started_at = time.perf_counter()
                state = await page.evaluate(STATE_SCRIPT)
                timings["state"] = elapsed_ms(step_started_at)
                state["minGroups"] = args.min_groups
                state["minFaces"] = args.min_faces
                if settings_override is not None:
                    state["settingsOverride"] = settings_override
                if texture_fixture_url:
                    step_started_at = time.perf_counter()
                    state["textureFixture"] = await fetch_texture_fixture(page, texture_fixture_url)
                    timings["textureFixture"] = elapsed_ms(step_started_at)
                if generated_texture_requests:
                    state["generatedTextureRequests"] = generated_texture_requests

                if args.skip_sidebar_smoke:
                    state["sidebarSmoke"] = {"skipped": True, "failures": []}
                else:
                    step_started_at = time.perf_counter()
                    try:
                        state["sidebarSmoke"] = await exercise_sidebar_controls(
                            page, args.exercise_texture_quality_live
                        )
                    except PlaywrightTimeoutError as exc:
                        state["sidebarSmoke"] = {"failures": [f"Timed out exercising sidebar controls: {exc}"]}
                    finally:
                        timings["sidebar"] = elapsed_ms(step_started_at)

                attach_timings(state, timings, smoke_started_at)
                failures.extend(evaluate_state_failures(state))
                if args.expect_texture_status is not None and state.get("statTextures") != args.expect_texture_status:
                    failures.append(
                        f"Expected texture status {args.expect_texture_status!r}, got {state.get('statTextures')!r}",
                    )
                if generated_texture_requests:
                    sample = ", ".join(generated_texture_requests[:5])
                    suffix = "" if len(generated_texture_requests) <= 5 else " ..."
                    failures.append(
                        "Generated texture requests were made despite "
                        f"--forbid-generated-texture-requests: {sample}{suffix}",
                    )
                if texture_fixture_url and not state["textureFixture"]["ok"]:
                    failures.append(
                        f"Texture fixture fetch failed: HTTP {state['textureFixture']['status']} {texture_fixture_url}",
                    )
                failures.extend([f"Console error: {item}" for item in events.console_errors])
                failures.extend([f"Page error: {item}" for item in events.page_errors])
                failures.extend([f"Resource failure: {item}" for item in events.critical_resource_failures])

                if failures or args.save_artifacts:
                    artifact_errors = await write_artifacts(
                        page,
                        events,
                        state,
                        args.artifacts_dir,
                        screenshot_full_page=bool(failures),
                    )
                    if args.save_artifacts:
                        failures.extend(artifact_errors)

                await context.close()
        except PlaywrightTimeoutError as exc:
            failures.append(f"Timed out waiting for viewer readiness: {exc}")
            if page:
                attach_timings(state, timings, smoke_started_at)
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

    detail = (
        f"groups={state.get('statGroups')}, faces={state.get('statFaces')}, "
        f"optional_texture_404s={len(events.optional_texture_failures)}"
    )
    timing_summary = format_timing_summary(state.get("timingsMs", {}))
    if timing_summary:
        detail = f"{detail}, timings=({timing_summary})"
    if args.expect_texture_status is not None:
        detail = f"{detail}, textures={state.get('statTextures')}"
    if args.skip_sidebar_smoke:
        detail = f"{detail}, sidebar=skipped"
    if args.save_artifacts:
        detail = f"{detail}, artifacts={args.artifacts_dir}"
    print(f"[OK] Browser smoke passed ({detail})")
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
        help="Directory for browser smoke screenshots and JSON reports.",
    )
    parser.add_argument(
        "--save-artifacts",
        action="store_true",
        help="Write the browser smoke JSON report and viewport screenshot even when the smoke test passes.",
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
    parser.add_argument(
        "--settings-json",
        help=(
            "Preload the rift-flythrough-settings localStorage entry with this JSON object before flythrough.html runs."
        ),
    )
    parser.add_argument(
        "--expect-texture-status",
        help="Fail unless the final Texture maps stat text exactly matches this value.",
    )
    parser.add_argument(
        "--forbid-generated-texture-requests",
        action="store_true",
        help="Fail if the page requests generated textures under textures/converted/.",
    )
    parser.add_argument(
        "--skip-sidebar-smoke",
        action="store_true",
        help="Skip sidebar interaction checks for fast startup-mode probes.",
    )
    parser.add_argument(
        "--exercise-texture-quality-live",
        action="store_true",
        help="During sidebar smoke, change the Settings texture quality control to Off and verify it applies live.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return asyncio.run(run_smoke(args))


if __name__ == "__main__":
    sys.exit(main())
