#!/usr/bin/env python3
"""Capture fixed-camera Beauty-profile visual baseline artifacts.

The utility starts the offline viewer over HTTP, boots the clean Beauty visual
profile, moves the camera to deterministic world-relative viewpoints, and
writes ignored screenshots plus a JSON report. These artifacts make visual
fidelity changes comparable across commits without hand-driving the viewer.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from capture_texture_modes import (
    CANVAS_RECT_SCRIPT,
    HIDE_VISUAL_CHROME_SCRIPT,
    VISUAL_CHROME_SELECTORS,
    display_path,
    screenshot_metadata,
)
from check_browser_smoke import (
    DEFAULT_TIMEOUT_SECONDS,
    HIDE_START_OVERLAY_SCRIPT,
    PROJECT_DIR,
    READY_SCRIPT,
    SETTINGS_STORAGE_KEY,
    STATE_SCRIPT,
    TEXTURE_STATUS_READY_SCRIPT,
    SmokeEvents,
    elapsed_ms,
    evaluate_state_failures,
    record_console,
    record_response,
    serve_directory,
    settings_storage_state,
    temporary_texture_fixture,
)

VISUAL_BASELINE_PRESETS = ("overview", "north-low", "east-oblique", "south-detail")
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "artifacts" / "visual-baselines"
BEAUTY_SETTINGS = {
    "visualProfile": "beauty",
    "gridVisible": False,
    "groundVisible": False,
    "waterVisible": False,
    "wireframeMode": False,
    "showLegend": False,
    "showZoneLabels": False,
    "pointCloudsVisible": False,
    "particlesVisible": False,
    "weatherEnabled": False,
    "lodEnabled": False,
    "textureQuality": "high",
    "minimapVisible": False,
    "fpsVisible": False,
}
VIEWER_RUNTIME_STATE_SCRIPT = """
async () => {
  const moduleUrl = (path) => new URL(path, window.location.href).href;
  const { state } = await import(moduleUrl("js/state.js"));
  const THREE = await import("three");
  const box = new THREE.Box3();
  for (const group of state.worldGroups || []) {
    if (group.visible !== false) box.expandByObject(group);
  }
  const worldBox = box.isEmpty()
    ? null
    : {
        minX: box.min.x,
        maxX: box.max.x,
        minY: box.min.y,
        maxY: box.max.y,
        minZ: box.min.z,
        maxZ: box.max.z,
      };
  return {
    worldBounds: state.worldBounds,
    worldBox,
    worldGroundY: state.worldGroundY,
    worldGroupCount: Array.isArray(state.worldGroups) ? state.worldGroups.length : 0,
    visualProfile: state.visualProfile,
    pointCloudsVisible: state.pointCloudsVisible,
    showZoneLabels: state.showZoneLabels,
    lodEnabled: state.lodEnabled,
  };
}
"""
APPLY_CAMERA_POSE_SCRIPT = """
async (pose) => {
  const moduleUrl = (path) => new URL(path, window.location.href).href;
  const { camera, composer } = await import(moduleUrl("js/scene.js"));
  camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  if (composer && typeof composer.render === "function") composer.render();
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: pose.target,
  };
}
"""


@dataclass(frozen=True)
class CapturePaths:
    """Artifact paths for one visual baseline preset."""

    full: Path
    canvas: Path


def parse_presets(value: str) -> list[str]:
    """Parse a comma-separated preset list, preserving order and removing duplicates."""
    presets: list[str] = []
    invalid_presets: list[str] = []
    for raw_preset in value.split(","):
        preset = raw_preset.strip().lower()
        if not preset:
            continue
        if preset not in VISUAL_BASELINE_PRESETS:
            invalid_presets.append(preset)
            continue
        if preset not in presets:
            presets.append(preset)

    if invalid_presets:
        valid = ", ".join(VISUAL_BASELINE_PRESETS)
        invalid = ", ".join(invalid_presets)
        raise ValueError(f"Unsupported visual baseline preset(s): {invalid}. Valid presets: {valid}")
    if not presets:
        raise ValueError("At least one visual baseline preset must be specified")
    return presets


def capture_paths(output_dir: Path, preset: str) -> CapturePaths:
    """Return deterministic artifact paths for *preset*."""
    return CapturePaths(
        full=output_dir / f"visual-{preset}-full.png",
        canvas=output_dir / f"visual-{preset}-canvas.png",
    )


def beauty_settings() -> dict[str, Any]:
    """Return persisted viewer settings for clean visual baselines."""
    return dict(BEAUTY_SETTINGS)


def _as_float(value: Any, fallback: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return fallback
    return float(value)


def normalized_bounds(bounds: dict[str, Any] | None) -> dict[str, float]:
    """Return sane numeric world bounds for camera-preset math."""
    source = bounds if isinstance(bounds, dict) else {}
    min_x = _as_float(source.get("minX"), -500.0)
    max_x = _as_float(source.get("maxX"), 500.0)
    min_y = _as_float(source.get("minY"), -500.0)
    max_y = _as_float(source.get("maxY"), 500.0)
    min_z = _as_float(source.get("minZ"), -500.0)
    max_z = _as_float(source.get("maxZ"), 500.0)
    if max_x <= min_x:
        min_x, max_x = -500.0, 500.0
    if max_y <= min_y:
        min_y, max_y = -500.0, 500.0
    if max_z <= min_z:
        min_z, max_z = -500.0, 500.0
    return {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y, "minZ": min_z, "maxZ": max_z}


def camera_pose_for_preset(
    preset: str,
    bounds: dict[str, Any] | None,
    ground_y: float | int | None,
) -> dict[str, Any]:
    """Return a deterministic world-relative camera pose for *preset*."""
    world = normalized_bounds(bounds)
    center_x = (world["minX"] + world["maxX"]) * 0.5
    center_y = (world["minY"] + world["maxY"]) * 0.5
    center_z = (world["minZ"] + world["maxZ"]) * 0.5
    width = world["maxX"] - world["minX"]
    height = world["maxY"] - world["minY"]
    depth = world["maxZ"] - world["minZ"]
    span = max(width, height, depth, 1000.0)
    ground = _as_float(ground_y, world["minY"])
    target_y = max(center_y, ground + height * 0.35)
    target = [center_x, target_y, center_z]

    if preset == "overview":
        position = [center_x, target_y + span * 0.48, center_z + span * 0.85]
    elif preset == "north-low":
        position = [center_x - span * 0.42, target_y + span * 0.14, center_z - span * 0.76]
    elif preset == "east-oblique":
        position = [center_x + span * 0.78, target_y + span * 0.24, center_z + span * 0.26]
    elif preset == "south-detail":
        position = [center_x + span * 0.28, target_y + span * 0.08, center_z + span * 0.46]
    else:
        raise ValueError(f"Unsupported visual baseline preset: {preset}")

    return {
        "preset": preset,
        "position": [round(value, 3) for value in position],
        "target": [round(value, 3) for value in target],
        "bounds": {key: round(value, 3) for key, value in world.items()},
        "span": round(span, 3),
    }


async def capture_preset(page: Any, preset: str, output_dir: Path, runtime_state: dict[str, Any]) -> dict[str, Any]:
    """Move to one preset camera pose, capture screenshots, and return report data."""
    preset_started_at = time.perf_counter()
    paths = capture_paths(output_dir, preset)
    pose = camera_pose_for_preset(
        preset,
        runtime_state.get("worldBounds"),
        runtime_state.get("worldGroundY"),
    )
    applied_pose = await page.evaluate(APPLY_CAMERA_POSE_SCRIPT, pose)
    await page.wait_for_timeout(250)
    canvas_rect = await page.evaluate(CANVAS_RECT_SCRIPT)
    failures: list[str] = []
    if not canvas_rect:
        failures.append(f"Could not find a visible renderer canvas for preset {preset}")

    paths.full.parent.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(paths.full), full_page=False)
    if canvas_rect:
        clip = {
            "x": canvas_rect["x"],
            "y": canvas_rect["y"],
            "width": canvas_rect["width"],
            "height": canvas_rect["height"],
        }
        await page.screenshot(path=str(paths.canvas), clip=clip)

    artifacts: dict[str, Any] = {}
    if paths.full.exists():
        artifacts["full"] = screenshot_metadata(paths.full)
    if paths.canvas.exists():
        artifacts["canvas"] = screenshot_metadata(paths.canvas)

    return {
        "preset": preset,
        "cameraPose": pose,
        "appliedCameraPose": applied_pose,
        "canvasRect": canvas_rect,
        "artifacts": artifacts,
        "timingsMs": {"total": elapsed_ms(preset_started_at)},
        "failures": failures,
    }


async def capture_visual_baselines(playwright: Any, url: str, origin: str, args: argparse.Namespace) -> dict[str, Any]:
    """Capture all configured presets in one Beauty-profile browser context."""
    from playwright.async_api import Error as PlaywrightError
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError

    capture_started_at = time.perf_counter()
    events = SmokeEvents()
    timings: dict[str, int] = {}
    failures: list[str] = []
    state: dict[str, Any] = {}
    results: list[dict[str, Any]] = []
    timeout_ms = int(args.timeout * 1000)

    browser = await playwright.chromium.launch(headless=not args.headed)
    try:
        step_started_at = time.perf_counter()
        context = await browser.new_context(
            storage_state=settings_storage_state(origin, beauty_settings()),
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
            await page.wait_for_function(TEXTURE_STATUS_READY_SCRIPT, timeout=timeout_ms)
            timings["textures"] = elapsed_ms(step_started_at)

            await page.evaluate(HIDE_START_OVERLAY_SCRIPT)
            hidden_chrome = await page.evaluate(HIDE_VISUAL_CHROME_SCRIPT, VISUAL_CHROME_SELECTORS)

            step_started_at = time.perf_counter()
            await page.wait_for_timeout(int(args.settle_seconds * 1000))
            timings["settle"] = elapsed_ms(step_started_at)

            state = await page.evaluate(STATE_SCRIPT)
            runtime_state = await page.evaluate(VIEWER_RUNTIME_STATE_SCRIPT)
            pose_bounds = runtime_state.get("worldBox") or runtime_state.get("worldBounds")
            state.update(
                {
                    "settingsStorageKey": SETTINGS_STORAGE_KEY,
                    "settingsOverride": beauty_settings(),
                    "sidebarSmoke": {"skipped": True, "failures": []},
                    "hiddenVisualChrome": hidden_chrome,
                    "runtimeState": runtime_state,
                }
            )
            failures.extend(evaluate_state_failures(state))
            failures.extend([f"Console error: {item}" for item in events.console_errors])
            failures.extend([f"Page error: {item}" for item in events.page_errors])
            failures.extend([f"Resource failure: {item}" for item in events.critical_resource_failures])

            for preset in args.presets:
                print(f"[visual-baselines] capturing {preset}")
                result = await capture_preset(
                    page, preset, args.output_dir, {**runtime_state, "worldBounds": pose_bounds}
                )
                failures.extend(result["failures"])
                results.append(result)
        except (PlaywrightError, PlaywrightTimeoutError) as exc:
            failures.append(f"Playwright visual baseline capture failed: {exc}")
        finally:
            await context.close()
    finally:
        await browser.close()

    timings["total"] = elapsed_ms(capture_started_at)
    return {
        "state": state,
        "results": results,
        "timingsMs": timings,
        "consoleErrors": events.console_errors,
        "pageErrors": events.page_errors,
        "criticalResourceFailures": events.critical_resource_failures,
        "optionalTextureFailureCount": len(events.optional_texture_failures),
        "optionalTextureFailures": events.optional_texture_failures[:50],
        "failures": failures,
    }


async def run_capture(args: argparse.Namespace) -> int:
    """Capture configured Beauty-profile baselines and write the report."""
    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError:
        print("[ERR] Playwright is not installed. Install it with:")
        print("      python -m pip install playwright")
        print("      python -m playwright install chromium")
        return 2

    try:
        args.presets = parse_presets(args.presets)
    except ValueError as exc:
        print(f"[ERR] {exc}")
        return 2

    args.output_dir = (
        PROJECT_DIR / args.output_dir if not args.output_dir.is_absolute() else args.output_dir
    ).resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    with temporary_texture_fixture(args.texture_fixture), serve_directory(PROJECT_DIR, args.host, args.port) as server:
        host, port = server.server_address
        url = f"http://{host}:{port}/flythrough.html"
        origin = f"http://{host}:{port}"
        print(f"[visual-baselines] {url}")
        async with async_playwright() as playwright:
            report = await capture_visual_baselines(playwright, url, origin, args)

    report.update(
        {
            "presets": args.presets,
            "visualProfile": "beauty",
            "textureFixture": bool(args.texture_fixture),
            "strictTextures": bool(args.strict_textures),
            "viewport": {"width": args.viewport_width, "height": args.viewport_height},
        }
    )
    report_path = args.output_dir / "visual-baselines-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")

    failures = report["failures"]
    if failures:
        print("[FAIL] Visual baseline capture completed with failures:")
        for failure in failures:
            print(f"  - {failure}")
        print(f"  Artifacts: {display_path(args.output_dir)}")
        return 1

    captured = len(report["results"])
    print(
        "[OK] Visual baseline capture complete "
        f"(presets={captured}, profile=beauty, artifacts={display_path(args.output_dir)})"
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""
    parser = argparse.ArgumentParser(description="Capture fixed-camera Beauty-profile visual baselines.")
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
        help="Directory for ignored fixed-camera screenshots and JSON report.",
    )
    parser.add_argument(
        "--presets",
        default=",".join(VISUAL_BASELINE_PRESETS),
        help="Comma-separated visual baseline presets to capture.",
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
