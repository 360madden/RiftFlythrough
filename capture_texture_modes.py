#!/usr/bin/env python3
"""Capture visual comparison artifacts for texture quality modes.

The utility starts the offline viewer over HTTP, opens each texture quality mode
in a fresh browser context, and writes ignored screenshots plus a JSON report to
help reviewers compare Off/Low/Medium/High rendering without hand-driving the UI.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from check_browser_smoke import (
    DEFAULT_TIMEOUT_SECONDS,
    HIDE_START_OVERLAY_SCRIPT,
    PROJECT_DIR,
    READY_SCRIPT,
    SETTINGS_STORAGE_KEY,
    STATE_SCRIPT,
    SmokeEvents,
    elapsed_ms,
    evaluate_state_failures,
    record_console,
    record_response,
    serve_directory,
    settings_storage_state,
    temporary_texture_fixture,
)

TEXTURE_QUALITY_MODES = ("off", "low", "medium", "high")
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "artifacts" / "texture-modes"
VISUAL_CHROME_SELECTORS = (
    "#sidebar-toggle",
    "#sidebar",
    "#crosshair",
    "#info",
    "#minimap-container",
    "#minimap-label",
    "#legend",
    "#fps",
    "#tooltip",
    "#tour-speed-indicator",
    "#tour-pause-indicator",
    "#toast",
    "#speedrun-hud",
    "#sr-leaderboard",
    "#load-status",
    "#zone-filter-btn",
    "#zone-filter-panel",
    "#zone-hover",
)
CANVAS_RECT_SCRIPT = """
() => {
  const canvases = Array.from(document.querySelectorAll("canvas")).map((canvas) => {
    const rect = canvas.getBoundingClientRect();
    return {
      id: canvas.id || "",
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(0, rect.x))),
      height: Math.max(0, Math.min(rect.height, window.innerHeight - Math.max(0, rect.y))),
      area: Math.max(0, rect.width) * Math.max(0, rect.height),
      backingWidth: canvas.width,
      backingHeight: canvas.height,
    };
  });
  canvases.sort((a, b) => b.area - a.area);
  return canvases.find((canvas) => canvas.width > 0 && canvas.height > 0) || null;
}
"""
HIDE_VISUAL_CHROME_SCRIPT = """
(selectors) => {
  const hidden = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      element.style.setProperty("display", "none", "important");
      hidden.push(selector);
    }
  }
  return hidden;
}
"""
TEXTURE_MODE_READY_SCRIPT = """
(mode) => {
  const text = document.querySelector("#stat-textures")?.textContent?.trim() || "";
  if (mode === "off") return text === "off";
  return Boolean(text && text !== "—" && text !== "off");
}
"""


@dataclass(frozen=True)
class CapturePaths:
    """Artifact paths for one texture quality mode."""

    full: Path
    canvas: Path


def parse_modes(value: str) -> list[str]:
    """Parse a comma-separated mode list, preserving order and removing duplicates."""
    modes: list[str] = []
    invalid_modes: list[str] = []
    for raw_mode in value.split(","):
        mode = raw_mode.strip().lower()
        if not mode:
            continue
        if mode not in TEXTURE_QUALITY_MODES:
            invalid_modes.append(mode)
            continue
        if mode not in modes:
            modes.append(mode)

    if invalid_modes:
        valid = ", ".join(TEXTURE_QUALITY_MODES)
        invalid = ", ".join(invalid_modes)
        raise ValueError(f"Unsupported texture mode(s): {invalid}. Valid modes: {valid}")
    if not modes:
        raise ValueError("At least one texture mode must be specified")
    return modes


def capture_paths(output_dir: Path, mode: str) -> CapturePaths:
    """Return deterministic artifact paths for *mode*."""
    return CapturePaths(full=output_dir / f"texture-{mode}-full.png", canvas=output_dir / f"texture-{mode}-canvas.png")


def sha256_file(path: Path) -> str:
    """Return a SHA-256 digest for a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: Path) -> str:
    """Return a workspace-relative path when possible, otherwise an absolute path."""
    resolved_path = path.resolve()
    try:
        return str(resolved_path.relative_to(PROJECT_DIR))
    except ValueError:
        return str(resolved_path)


def screenshot_metadata(path: Path) -> dict[str, Any]:
    """Return stable metadata for a screenshot artifact."""
    return {
        "path": display_path(path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def texture_settings(mode: str) -> dict[str, str]:
    """Return persisted viewer settings for a texture quality mode."""
    return {"textureQuality": mode}


async def capture_mode(
    playwright: Any,
    url: str,
    origin: str,
    mode: str,
    args: argparse.Namespace,
) -> dict[str, Any]:
    """Capture one texture quality mode and return report data."""
    from playwright.async_api import Error as PlaywrightError
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError

    mode_started_at = time.perf_counter()
    timeout_ms = int(args.timeout * 1000)
    paths = capture_paths(args.output_dir, mode)
    events = SmokeEvents()
    timings: dict[str, int] = {}
    failures: list[str] = []
    state: dict[str, Any] = {"mode": mode}

    browser = await playwright.chromium.launch(headless=not args.headed)
    try:
        step_started_at = time.perf_counter()
        context = await browser.new_context(
            storage_state=settings_storage_state(origin, texture_settings(mode)),
            viewport={"width": args.viewport_width, "height": args.viewport_height},
        )
        page = await context.new_page()
        page.on("console", lambda message: record_console(message, events))
        page.on("pageerror", lambda error: events.page_errors.append(str(error)))
        page.on("response", lambda response: record_response(response, events, args.strict_textures))
        timings["browserSetup"] = elapsed_ms(step_started_at)

        try:
            step_started_at = time.perf_counter()
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            timings["goto"] = elapsed_ms(step_started_at)

            step_started_at = time.perf_counter()
            await page.wait_for_function(READY_SCRIPT, timeout=timeout_ms)
            timings["ready"] = elapsed_ms(step_started_at)

            step_started_at = time.perf_counter()
            await page.wait_for_function(TEXTURE_MODE_READY_SCRIPT, arg=mode, timeout=timeout_ms)
            timings["textures"] = elapsed_ms(step_started_at)

            step_started_at = time.perf_counter()
            await page.wait_for_timeout(int(args.settle_seconds * 1000))
            timings["settle"] = elapsed_ms(step_started_at)

            await page.evaluate(HIDE_START_OVERLAY_SCRIPT)
            canvas_rect = await page.evaluate(CANVAS_RECT_SCRIPT)
            state = await page.evaluate(STATE_SCRIPT)
            state.update(
                {
                    "mode": mode,
                    "settingsStorageKey": SETTINGS_STORAGE_KEY,
                    "settingsOverride": texture_settings(mode),
                    "sidebarSmoke": {"skipped": True, "failures": []},
                    "canvasRect": canvas_rect,
                }
            )

            failures.extend(evaluate_state_failures(state))
            texture_status = str(state.get("statTextures") or "")
            if mode == "off" and texture_status != "off":
                failures.append(f"Expected texture status 'off' for mode off, got {texture_status!r}")
            if mode != "off" and (not texture_status or texture_status in {"—", "off"}):
                failures.append(f"Expected populated texture status for mode {mode}, got {texture_status!r}")
            if not canvas_rect:
                failures.append("Could not find a visible renderer canvas for capture")

            failures.extend([f"Console error: {item}" for item in events.console_errors])
            failures.extend([f"Page error: {item}" for item in events.page_errors])
            failures.extend([f"Resource failure: {item}" for item in events.critical_resource_failures])

            paths.full.parent.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(paths.full), full_page=False)
            if canvas_rect:
                state["hiddenVisualChrome"] = await page.evaluate(HIDE_VISUAL_CHROME_SCRIPT, VISUAL_CHROME_SELECTORS)
                await page.wait_for_timeout(100)
                clip = {
                    "x": canvas_rect["x"],
                    "y": canvas_rect["y"],
                    "width": canvas_rect["width"],
                    "height": canvas_rect["height"],
                }
                await page.screenshot(path=str(paths.canvas), clip=clip)
        except (PlaywrightError, PlaywrightTimeoutError) as exc:
            failures.append(f"Playwright capture failed for mode {mode}: {exc}")
        finally:
            await context.close()
    finally:
        await browser.close()

    timings["total"] = elapsed_ms(mode_started_at)
    artifacts: dict[str, Any] = {}
    if paths.full.exists():
        artifacts["full"] = screenshot_metadata(paths.full)
    if paths.canvas.exists():
        artifacts["canvas"] = screenshot_metadata(paths.canvas)

    return {
        "mode": mode,
        "state": state,
        "timingsMs": timings,
        "artifacts": artifacts,
        "consoleErrors": events.console_errors,
        "pageErrors": events.page_errors,
        "criticalResourceFailures": events.critical_resource_failures,
        "optionalTextureFailureCount": len(events.optional_texture_failures),
        "optionalTextureFailures": events.optional_texture_failures[:50],
        "failures": failures,
    }


async def run_capture(args: argparse.Namespace) -> int:
    """Capture all requested modes and write the report."""
    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError:
        print("[ERR] Playwright is not installed. Install it with:")
        print("      python -m pip install playwright")
        print("      python -m playwright install chromium")
        return 2

    try:
        modes = parse_modes(args.modes)
    except ValueError as exc:
        print(f"[ERR] {exc}")
        return 2

    args.output_dir = (
        PROJECT_DIR / args.output_dir if not args.output_dir.is_absolute() else args.output_dir
    ).resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    capture_started_at = time.perf_counter()
    report: dict[str, Any] = {
        "modes": modes,
        "textureFixture": bool(args.texture_fixture),
        "strictTextures": bool(args.strict_textures),
        "viewport": {"width": args.viewport_width, "height": args.viewport_height},
        "results": [],
    }

    with temporary_texture_fixture(args.texture_fixture), serve_directory(PROJECT_DIR, args.host, args.port) as server:
        host, port = server.server_address
        url = f"http://{host}:{port}/flythrough.html"
        origin = f"http://{host}:{port}"
        print(f"[texture-modes] {url}")
        async with async_playwright() as playwright:
            for mode in modes:
                print(f"[texture-modes] capturing {mode}")
                report["results"].append(await capture_mode(playwright, url, origin, mode, args))

    report["timingsMs"] = {"total": elapsed_ms(capture_started_at)}
    report_path = args.output_dir / "texture-modes-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    failures = [failure for result in report["results"] for failure in result["failures"]]
    if failures:
        print("[FAIL] Texture mode capture completed with failures:")
        for failure in failures:
            print(f"  - {failure}")
        print(f"  Artifacts: {args.output_dir}")
        return 1

    canvas_digests = {
        result["mode"]: result["artifacts"].get("canvas", {}).get("sha256", "") for result in report["results"]
    }
    unique_canvas_digests = len({digest for digest in canvas_digests.values() if digest})
    print(
        "[OK] Texture mode capture complete "
        f"(modes={','.join(modes)}, unique_canvas_images={unique_canvas_digests}, artifacts={args.output_dir})"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""
    parser = argparse.ArgumentParser(description="Capture texture quality comparison screenshots for flythrough.html.")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for the temporary HTTP server.")
    parser.add_argument(
        "--port", type=int, default=0, help="Port for the temporary HTTP server; 0 chooses a free port."
    )
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="Load timeout in seconds.")
    parser.add_argument("--settle-seconds", type=float, default=1.0, help="Extra wait before screenshots.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for ignored texture-mode screenshots and JSON report.",
    )
    parser.add_argument(
        "--modes",
        default=",".join(TEXTURE_QUALITY_MODES),
        help="Comma-separated texture quality modes to capture: off,low,medium,high.",
    )
    parser.add_argument("--viewport-width", type=int, default=1280, help="Browser viewport width in CSS pixels.")
    parser.add_argument("--viewport-height", type=int, default=720, help="Browser viewport height in CSS pixels.")
    parser.add_argument("--headed", action="store_true", help="Run Chromium headed instead of headless.")
    parser.add_argument(
        "--texture-fixture",
        action="store_true",
        help="Create temporary ignored generated texture fixtures for mapped texture URLs before capture.",
    )
    parser.add_argument(
        "--strict-textures",
        action="store_true",
        help="Fail on generated texture 404s instead of treating them as optional misses.",
    )
    return parser


def main() -> int:
    """Run from the command line."""
    return asyncio.run(run_capture(build_parser().parse_args()))


if __name__ == "__main__":
    sys.exit(main())
