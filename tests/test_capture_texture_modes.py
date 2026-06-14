"""Focused tests for texture mode visual capture helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from capture_texture_modes import PROJECT_DIR, capture_paths, display_path, parse_modes, texture_settings


def test_parse_modes_preserves_order_and_removes_duplicates() -> None:
    assert parse_modes(" high,off, high,medium ") == ["high", "off", "medium"]


def test_parse_modes_rejects_invalid_modes() -> None:
    with pytest.raises(ValueError, match="Unsupported texture mode"):
        parse_modes("high,ultra")


def test_parse_modes_requires_at_least_one_mode() -> None:
    with pytest.raises(ValueError, match="At least one"):
        parse_modes(", ,")


def test_capture_paths_are_deterministic() -> None:
    paths = capture_paths(Path("artifacts/texture-modes"), "low")

    assert paths.full.as_posix() == "artifacts/texture-modes/texture-low-full.png"
    assert paths.canvas.as_posix() == "artifacts/texture-modes/texture-low-canvas.png"


def test_texture_settings_sets_texture_quality_only() -> None:
    assert texture_settings("medium") == {"textureQuality": "medium"}


def test_display_path_prefers_workspace_relative_paths() -> None:
    assert display_path(PROJECT_DIR / "artifacts" / "example.png") == str(Path("artifacts") / "example.png")
