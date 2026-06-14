"""Focused tests for browser smoke texture-response classification."""

from __future__ import annotations

import binascii
import json
import struct

import pytest

from check_browser_smoke import (
    SETTINGS_STORAGE_KEY,
    TEXTURE_FIXTURE_BYTES,
    SmokeEvents,
    build_parser,
    evaluate_startup_settings_failures,
    format_timing_summary,
    is_optional_texture_url,
    parse_settings_json,
    parse_texture_map_fixture_paths,
    record_response,
    settings_storage_state,
    stat_int,
)


class FakeRequest:
    resource_type = "image"


class FakeResponse:
    def __init__(self, status: int, url: str) -> None:
        self.status = status
        self.url = url
        self.request = FakeRequest()


def test_texture_fixture_png_has_valid_chunk_crc() -> None:
    data = TEXTURE_FIXTURE_BYTES
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    offset = 8
    chunk_types: list[bytes] = []
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        expected_crc = struct.unpack(">I", data[offset + 8 + length : offset + 12 + length])[0]
        actual_crc = binascii.crc32(chunk_type + chunk_data) & 0xFFFFFFFF
        assert actual_crc == expected_crc
        chunk_types.append(chunk_type)
        offset += 12 + length
    assert chunk_types == [b"IHDR", b"IDAT", b"IEND"]


def test_is_optional_texture_url_only_matches_generated_image_paths() -> None:
    assert is_optional_texture_url("http://127.0.0.1:8000/textures/converted/foo.png")
    assert is_optional_texture_url("http://127.0.0.1:8000/textures/converted/foo.webp?cache=1")
    assert not is_optional_texture_url("http://127.0.0.1:8000/textures/source/foo.png")
    assert not is_optional_texture_url("http://127.0.0.1:8000/js/world.js")
    assert not is_optional_texture_url("http://127.0.0.1:8000/textures/converted/foo.txt")


def test_record_response_treats_generated_texture_404_as_optional_by_default() -> None:
    events = SmokeEvents()

    record_response(
        FakeResponse(404, "http://127.0.0.1:8000/textures/converted/missing.png"),
        events,
        strict_textures=False,
    )

    assert len(events.optional_texture_failures) == 1
    assert events.critical_resource_failures == []


def test_record_response_treats_generated_texture_404_as_critical_when_strict() -> None:
    events = SmokeEvents()

    record_response(
        FakeResponse(404, "http://127.0.0.1:8000/textures/converted/missing.png"),
        events,
        strict_textures=True,
    )

    assert events.optional_texture_failures == []
    assert len(events.critical_resource_failures) == 1


def test_record_response_treats_non_texture_404_as_critical() -> None:
    events = SmokeEvents()

    record_response(FakeResponse(404, "http://127.0.0.1:8000/js/missing.js"), events)

    assert events.optional_texture_failures == []
    assert len(events.critical_resource_failures) == 1


def test_stat_int_accepts_comma_formatted_stats() -> None:
    assert stat_int("30,864") == 30864
    assert stat_int("—") is None
    assert stat_int("") is None


def test_format_timing_summary_uses_stable_key_order_and_skips_bad_values() -> None:
    timings = {
        "total": 2500,
        "ready": 100.4,
        "unknown": 1,
        "goto": 42,
        "state": "missing",
    }

    assert format_timing_summary(timings) == "goto=42ms, ready=100ms, total=2500ms"


def test_parse_settings_json_requires_json_object() -> None:
    assert parse_settings_json(None) is None
    assert parse_settings_json('{"textureQuality": "off"}') == {"textureQuality": "off"}

    with pytest.raises(ValueError, match="valid JSON"):
        parse_settings_json("{")

    with pytest.raises(TypeError, match="JSON object"):
        parse_settings_json('["textureQuality", "off"]')


def test_settings_storage_state_preloads_viewer_local_storage() -> None:
    state = settings_storage_state("http://127.0.0.1:8000", {"textureQuality": "off"})

    assert state["cookies"] == []
    assert state["origins"][0]["origin"] == "http://127.0.0.1:8000"
    local_storage = state["origins"][0]["localStorage"]
    assert local_storage[0]["name"] == SETTINGS_STORAGE_KEY
    assert json.loads(local_storage[0]["value"]) == {"textureQuality": "off"}


def test_evaluate_startup_settings_failures_accepts_matching_visibility_state() -> None:
    failures = evaluate_startup_settings_failures(
        {
            "stateGridVisible": False,
            "stateGroundVisible": False,
            "stateWaterVisible": False,
            "stateWireframeMode": True,
            "stateShowZoneLabels": False,
            "statePointCloudsVisible": False,
            "stateHideDegenerateGroups": True,
            "stateHideUnlinkedGroups": True,
            "stateHidePlaceholderTextureGroups": True,
            "stateHideLowConfidenceGroups": True,
            "stateLodEnabled": False,
            "stateShowMinimap": False,
            "minimapVisible": False,
            "minimapLabelVisible": False,
            "fpsVisible": True,
            "worldVisibility": {
                "axisCount": 3,
                "gridHelperCount": 1,
                "gridVisible": False,
                "groundVisible": False,
                "waterVisible": False,
                "pointCloudsVisible": False,
                "visiblePointCloudGroupCount": 0,
                "hideDegenerateGroups": True,
                "visibleDegenerateGroupCount": 0,
                "hideUnlinkedGroups": True,
                "visibleUnlinkedGroupCount": 0,
                "hidePlaceholderTextureGroups": True,
                "visiblePlaceholderTextureGroupCount": 0,
                "hideLowConfidenceGroups": True,
                "visibleLowConfidenceGroupCount": 0,
                "worldMeshCount": 4,
                "allWorldMaterialsWireframe": True,
            },
        },
        {
            "gridVisible": False,
            "groundVisible": False,
            "waterVisible": False,
            "wireframeMode": True,
            "showZoneLabels": False,
            "pointCloudsVisible": False,
            "hideDegenerateGroups": True,
            "hideUnlinkedGroups": True,
            "hidePlaceholderTextureGroups": True,
            "hideLowConfidenceGroups": True,
            "lodEnabled": False,
            "minimapVisible": False,
            "fpsVisible": True,
        },
    )

    assert failures == []


def test_evaluate_startup_settings_failures_reports_mismatches_and_invalid_values() -> None:
    failures = evaluate_startup_settings_failures(
        {
            "stateGridVisible": True,
            "worldVisibility": {
                "axisCount": 3,
                "gridHelperCount": 1,
                "gridVisible": True,
            },
        },
        {
            "gridVisible": False,
            "fpsVisible": "yes",
        },
    )

    assert "Expected startup state.gridVisible=False, got True" in failures
    assert "Expected startup world grid visibility=False, got True" in failures
    assert "Startup setting 'fpsVisible' must be a boolean for --expect-startup-settings" in failures


def test_parser_supports_success_artifact_capture() -> None:
    args = build_parser().parse_args(["--save-artifacts"])

    assert args.save_artifacts is True


def test_parser_supports_startup_settings_expectation() -> None:
    args = build_parser().parse_args(["--expect-startup-settings"])

    assert args.expect_startup_settings is True


def test_parser_supports_hiding_start_overlay() -> None:
    args = build_parser().parse_args(["--hide-start-overlay"])

    assert args.hide_start_overlay is True


def test_parse_texture_map_fixture_paths_keeps_safe_generated_textures() -> None:
    paths = parse_texture_map_fixture_paths(
        """
        const TEXTURE_MAP = [
          { pattern: "hash", url: "textures/converted/a_c.png" },
          { pattern: "hash", url: "/textures/converted/b_n.webp?cache=1" },
          { pattern: "hash", url: "textures/source/not-generated.png" },
          { pattern: "hash", url: "textures/converted/../bad.png" },
          { pattern: "hash", url: "js/world.js" },
          { pattern: "hash", url: "textures/converted/a_c.png" },
        ];
        """,
    )

    assert [path.as_posix() for path in paths] == [
        "textures/converted/a_c.png",
        "textures/converted/b_n.webp",
    ]
