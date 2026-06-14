"""Focused tests for timing baseline summaries."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from summarize_timings import (
    build_output,
    collect_timing_records,
    find_report_paths,
    format_markdown,
    grouped_summary,
)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_collect_timing_records_reads_browser_and_texture_reports(tmp_path: Path) -> None:
    browser_report = tmp_path / "browser" / "browser-smoke-report.json"
    texture_report = tmp_path / "texture" / "texture-modes-report.json"
    write_json(
        browser_report,
        {
            "state": {
                "statGroups": "350",
                "statFaces": "30,864",
                "statTextures": "29/29 / 16x",
                "timingsMs": {
                    "browserSetup": 10.2,
                    "ready": 100,
                    "sidebar": 250,
                    "total": 1000,
                    "ignored": 1,
                },
            },
        },
    )
    write_json(
        texture_report,
        {
            "results": [
                {
                    "mode": "off",
                    "state": {"statTextures": "off"},
                    "timingsMs": {"ready": 75, "textures": 25, "total": 500},
                },
                {
                    "mode": "high",
                    "state": {"statTextures": "29/29 / 16x"},
                    "timingsMs": {"ready": 125, "textures": 90, "total": 700},
                },
            ],
        },
    )

    records = collect_timing_records([browser_report, texture_report])

    assert [record.label for record in records] == ["browser", "texture-off", "texture-high"]
    assert records[0].timings_ms == {"browserSetup": 10, "ready": 100, "sidebar": 250, "total": 1000}
    assert records[1].stat_textures == "off"


def test_find_report_paths_discovers_supported_reports_only(tmp_path: Path) -> None:
    browser_report = tmp_path / "a" / "browser-smoke-report.json"
    texture_report = tmp_path / "b" / "texture-modes-report.json"
    ignored_report = tmp_path / "c" / "other.json"
    write_json(browser_report, {"state": {"timingsMs": {"total": 1}}})
    write_json(texture_report, {"results": []})
    write_json(ignored_report, {"state": {"timingsMs": {"total": 1}}})

    assert find_report_paths(tmp_path) == [browser_report, texture_report]
    assert find_report_paths(browser_report) == [browser_report]


def test_grouped_summary_aggregates_by_kind_and_label(tmp_path: Path) -> None:
    first = tmp_path / "one" / "browser-smoke-report.json"
    second = tmp_path / "two" / "browser-smoke-report.json"
    write_json(first, {"state": {"timingsMs": {"total": 100}}})
    write_json(second, {"state": {"timingsMs": {"total": 200}}})
    records = collect_timing_records([first, second])

    summary = grouped_summary(records)

    assert summary == [
        {
            "kind": "browser-smoke",
            "label": "one",
            "samples": 1,
            "total_min_ms": 100,
            "total_median_ms": 100,
            "total_max_ms": 100,
        },
        {
            "kind": "browser-smoke",
            "label": "two",
            "samples": 1,
            "total_min_ms": 200,
            "total_median_ms": 200,
            "total_max_ms": 200,
        },
    ]


def test_format_markdown_contains_observational_warning_and_tables(tmp_path: Path) -> None:
    report = tmp_path / "browser-smoke-report.json"
    write_json(report, {"state": {"statTextures": "off", "timingsMs": {"ready": 50, "total": 150}}})
    records = collect_timing_records([report])

    markdown = format_markdown(records)

    assert "observational data only" in markdown
    assert "| browser-smoke |" in markdown
    assert "off" in markdown


def test_build_output_json_is_machine_readable(tmp_path: Path) -> None:
    report = tmp_path / "browser-smoke-report.json"
    write_json(report, {"state": {"timingsMs": {"total": 150}}})
    records = collect_timing_records([report])

    payload = json.loads(build_output(records, as_json=True))

    assert payload["records"][0]["timingsMs"]["total"] == 150
    assert payload["summary"][0]["total_median_ms"] == 150


def test_format_markdown_handles_empty_records() -> None:
    markdown = format_markdown([])

    assert "No timing records found" in markdown


def test_collect_timing_records_rejects_non_object_json(tmp_path: Path) -> None:
    report = tmp_path / "browser-smoke-report.json"
    write_json(report, [])

    with pytest.raises(TypeError, match="JSON object"):
        collect_timing_records([report])
