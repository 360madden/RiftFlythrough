"""Focused tests for browser smoke texture-response classification."""

from __future__ import annotations

from check_browser_smoke import SmokeEvents, format_timing_summary, is_optional_texture_url, record_response, stat_int


class FakeRequest:
    resource_type = "image"


class FakeResponse:
    def __init__(self, status: int, url: str) -> None:
        self.status = status
        self.url = url
        self.request = FakeRequest()


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
