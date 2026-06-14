"""Focused tests for fixed-camera Beauty visual baseline helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from capture_visual_baselines import (
    BEAUTY_SETTINGS,
    PROJECT_DIR,
    VISUAL_BASELINE_PRESETS,
    beauty_settings,
    camera_pose_for_preset,
    capture_paths,
    display_path,
    normalized_bounds,
    parse_presets,
)


def test_parse_presets_preserves_order_and_removes_duplicates() -> None:
    assert parse_presets(" south-detail,overview,south-detail ") == ["south-detail", "overview"]


def test_parse_presets_rejects_invalid_presets() -> None:
    with pytest.raises(ValueError, match="Unsupported visual baseline preset"):
        parse_presets("overview,orbit")


def test_parse_presets_requires_at_least_one_preset() -> None:
    with pytest.raises(ValueError, match="At least one"):
        parse_presets(", ,")


def test_capture_paths_are_deterministic() -> None:
    paths = capture_paths(Path("artifacts/visual-baselines"), "overview")

    assert paths.full.as_posix() == "artifacts/visual-baselines/visual-overview-full.png"
    assert paths.canvas.as_posix() == "artifacts/visual-baselines/visual-overview-canvas.png"


def test_beauty_settings_are_clean_and_copy_safe() -> None:
    settings = beauty_settings()
    settings["gridVisible"] = True

    assert BEAUTY_SETTINGS["gridVisible"] is False
    assert beauty_settings()["visualProfile"] == "beauty"
    assert beauty_settings()["showLegend"] is False
    assert beauty_settings()["showZoneLabels"] is False
    assert beauty_settings()["pointCloudsVisible"] is False
    assert beauty_settings()["particlesVisible"] is False
    assert beauty_settings()["weatherEnabled"] is False
    assert beauty_settings()["textureQuality"] == "high"


def test_normalized_bounds_repairs_bad_inputs() -> None:
    assert normalized_bounds({"minX": 2, "maxX": 1, "minZ": "bad", "maxZ": None}) == {
        "minX": -500.0,
        "maxX": 500.0,
        "minY": -500.0,
        "maxY": 500.0,
        "minZ": -500.0,
        "maxZ": 500.0,
    }


@pytest.mark.parametrize("preset", VISUAL_BASELINE_PRESETS)
def test_camera_pose_for_preset_is_deterministic_and_world_relative(preset: str) -> None:
    pose = camera_pose_for_preset(
        preset,
        {"minX": -1000, "maxX": 3000, "minY": -100, "maxY": 500, "minZ": -2000, "maxZ": 1000},
        -20,
    )

    assert pose["preset"] == preset
    assert len(pose["position"]) == 3
    assert len(pose["target"]) == 3
    assert pose["span"] == 4000
    assert pose["target"] == [1000.0, 200.0, -500.0]


def test_camera_pose_rejects_unknown_preset() -> None:
    with pytest.raises(ValueError, match="Unsupported visual baseline preset"):
        camera_pose_for_preset("bad", None, None)


def test_display_path_prefers_workspace_relative_paths() -> None:
    assert display_path(PROJECT_DIR / "artifacts" / "visual-baselines" / "example.png") == str(
        Path("artifacts") / "visual-baselines" / "example.png"
    )
