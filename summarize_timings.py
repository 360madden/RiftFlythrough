#!/usr/bin/env python3
"""Summarize browser-smoke, texture-mode, and visual-baseline timing reports.

The browser and capture helpers intentionally write ignored JSON artifacts.
This script turns those local reports into a compact timing baseline without
introducing pass/fail thresholds.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_ARTIFACTS_DIR = PROJECT_DIR / "artifacts"
TIMING_KEYS = (
    "browserSetup",
    "goto",
    "ready",
    "textures",
    "settle",
    "state",
    "textureFixture",
    "sidebar",
    "total",
)
CORE_TABLE_KEYS = ("total", "ready", "textures", "sidebar")


@dataclass(frozen=True)
class TimingRecord:
    """One timing sample extracted from a JSON artifact."""

    kind: str
    label: str
    source: str
    timings_ms: dict[str, int]
    stat_groups: str = ""
    stat_faces: str = ""
    stat_textures: str = ""


def display_path(path: Path) -> str:
    """Return a workspace-relative path when possible."""
    try:
        return str(path.resolve().relative_to(PROJECT_DIR))
    except ValueError:
        return str(path)


def load_json(path: Path) -> dict[str, Any]:
    """Load a JSON object from *path* with a clear error on bad input."""
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Could not read {display_path(path)}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Could not parse {display_path(path)} as JSON: {exc.msg}") from exc
    if not isinstance(parsed, dict):
        raise TypeError(f"Expected {display_path(path)} to contain a JSON object")
    return parsed


def normalize_timings(value: Any) -> dict[str, int]:
    """Return stable integer timing values from a report timing object."""
    if not isinstance(value, dict):
        return {}
    timings: dict[str, int] = {}
    for key in TIMING_KEYS:
        raw = value.get(key)
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            continue
        timings[key] = round(raw)
    return timings


def browser_smoke_records(path: Path, report: dict[str, Any]) -> list[TimingRecord]:
    """Extract timing records from a browser-smoke report."""
    state = report.get("state")
    if not isinstance(state, dict):
        return []
    timings = normalize_timings(state.get("timingsMs"))
    if not timings:
        return []
    label = path.parent.name or path.stem
    return [
        TimingRecord(
            kind="browser-smoke",
            label=label,
            source=display_path(path),
            timings_ms=timings,
            stat_groups=str(state.get("statGroups") or ""),
            stat_faces=str(state.get("statFaces") or ""),
            stat_textures=str(state.get("statTextures") or ""),
        )
    ]


def texture_mode_records(path: Path, report: dict[str, Any]) -> list[TimingRecord]:
    """Extract timing records from a texture-mode capture report."""
    results = report.get("results")
    if not isinstance(results, list):
        return []

    records: list[TimingRecord] = []
    for index, result in enumerate(results, start=1):
        if not isinstance(result, dict):
            continue
        timings = normalize_timings(result.get("timingsMs"))
        if not timings:
            continue
        state = result.get("state")
        if not isinstance(state, dict):
            state = {}
        mode = str(result.get("mode") or state.get("mode") or f"mode-{index}")
        records.append(
            TimingRecord(
                kind="texture-mode",
                label=f"texture-{mode}",
                source=display_path(path),
                timings_ms=timings,
                stat_groups=str(state.get("statGroups") or ""),
                stat_faces=str(state.get("statFaces") or ""),
                stat_textures=str(state.get("statTextures") or ""),
            )
        )
    return records


def visual_baseline_records(path: Path, report: dict[str, Any]) -> list[TimingRecord]:
    """Extract timing records from a visual-baseline capture report."""
    results = report.get("results")
    if not isinstance(results, list):
        return []

    records: list[TimingRecord] = []
    state = report.get("state")
    if not isinstance(state, dict):
        state = {}
    for index, result in enumerate(results, start=1):
        if not isinstance(result, dict):
            continue
        timings = normalize_timings(result.get("timingsMs"))
        if not timings:
            continue
        preset = str(result.get("preset") or f"preset-{index}")
        records.append(
            TimingRecord(
                kind="visual-baseline",
                label=f"visual-{preset}",
                source=display_path(path),
                timings_ms=timings,
                stat_groups=str(state.get("statGroups") or ""),
                stat_faces=str(state.get("statFaces") or ""),
                stat_textures=str(state.get("statTextures") or ""),
            )
        )
    return records


def find_report_paths(root: Path) -> list[Path]:
    """Find supported timing reports under *root*."""
    if root.is_file():
        return [root]
    if not root.exists():
        return []

    names = {"browser-smoke-report.json", "texture-modes-report.json", "visual-baselines-report.json"}
    return sorted(path for path in root.rglob("*.json") if path.name in names)


def collect_timing_records(paths: list[Path]) -> list[TimingRecord]:
    """Collect timing records from supported report paths."""
    records: list[TimingRecord] = []
    for path in paths:
        report = load_json(path)
        if path.name == "browser-smoke-report.json":
            records.extend(browser_smoke_records(path, report))
        elif path.name == "texture-modes-report.json":
            records.extend(texture_mode_records(path, report))
        elif path.name == "visual-baselines-report.json":
            records.extend(visual_baseline_records(path, report))
    return records


def median_int(values: list[int]) -> int:
    """Return rounded median for a non-empty integer list."""
    return round(statistics.median(values))


def grouped_summary(records: list[TimingRecord]) -> list[dict[str, Any]]:
    """Return aggregate rows grouped by record kind and label."""
    groups: dict[tuple[str, str], list[TimingRecord]] = {}
    for record in records:
        groups.setdefault((record.kind, record.label), []).append(record)

    rows: list[dict[str, Any]] = []
    for (kind, label), group_records in sorted(groups.items()):
        totals = [record.timings_ms["total"] for record in group_records if "total" in record.timings_ms]
        row: dict[str, Any] = {
            "kind": kind,
            "label": label,
            "samples": len(group_records),
        }
        if totals:
            row.update(
                {
                    "total_min_ms": min(totals),
                    "total_median_ms": median_int(totals),
                    "total_max_ms": max(totals),
                }
            )
        rows.append(row)
    return rows


def records_as_dicts(records: list[TimingRecord]) -> list[dict[str, Any]]:
    """Serialize records to JSON-friendly dictionaries."""
    return [
        {
            "kind": record.kind,
            "label": record.label,
            "source": record.source,
            "timingsMs": record.timings_ms,
            "statGroups": record.stat_groups,
            "statFaces": record.stat_faces,
            "statTextures": record.stat_textures,
        }
        for record in records
    ]


def format_ms(value: Any) -> str:
    """Format a millisecond value for markdown tables."""
    return str(value) if isinstance(value, int) else "-"


def markdown_table(headers: tuple[str, ...], rows: list[tuple[Any, ...]]) -> list[str]:
    """Return a simple markdown table."""
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return lines


def format_markdown(records: list[TimingRecord]) -> str:
    """Return a compact markdown timing baseline report."""
    lines = [
        "# RiftFlythrough Timing Baseline",
        "",
        "Generated from ignored local JSON artifacts. This is observational data only; no thresholds are enforced.",
        "",
        f"- Samples: `{len(records)}`",
    ]
    if not records:
        lines.append("- No timing records found.")
        return "\n".join(lines) + "\n"

    lines.extend(
        [
            "",
            "## Samples",
            "",
            *markdown_table(
                ("kind", "label", "total", "ready", "textures", "sidebar", "texture stat", "source"),
                [
                    (
                        record.kind,
                        record.label,
                        format_ms(record.timings_ms.get("total")),
                        format_ms(record.timings_ms.get("ready")),
                        format_ms(record.timings_ms.get("textures")),
                        format_ms(record.timings_ms.get("sidebar")),
                        record.stat_textures or "-",
                        record.source,
                    )
                    for record in records
                ],
            ),
            "",
            "## Aggregates",
            "",
            *markdown_table(
                ("kind", "label", "samples", "total min", "total median", "total max"),
                [
                    (
                        row["kind"],
                        row["label"],
                        row["samples"],
                        format_ms(row.get("total_min_ms")),
                        format_ms(row.get("total_median_ms")),
                        format_ms(row.get("total_max_ms")),
                    )
                    for row in grouped_summary(records)
                ],
            ),
        ]
    )
    return "\n".join(lines) + "\n"


def build_output(records: list[TimingRecord], as_json: bool) -> str:
    """Build report output in markdown or JSON format."""
    if as_json:
        return (
            json.dumps(
                {
                    "records": records_as_dicts(records),
                    "summary": grouped_summary(records),
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
    return format_markdown(records)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Summarize browser-smoke and visual capture timing reports.")
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        default=DEFAULT_ARTIFACTS_DIR,
        help="Directory or JSON report path to scan. Defaults to artifacts/.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of markdown.")
    parser.add_argument("--output", type=Path, help="Optional output file. Parent directories are created.")
    parser.add_argument(
        "--allow-empty",
        action="store_true",
        help="Exit successfully even when no supported timing reports are found.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    paths = find_report_paths(args.artifacts_dir)
    records = collect_timing_records(paths)

    if not records and not args.allow_empty:
        print(f"[ERR] No timing records found under {display_path(args.artifacts_dir)}", file=sys.stderr)
        return 1

    output = build_output(records, args.json)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
        print(f"[OK] Wrote timing baseline: {display_path(args.output)}")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
