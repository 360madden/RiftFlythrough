"""Tests for validate_obj.py — OBJ validator with stats and diff."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from validate_obj import compare_objs, validate_obj

# ── Fixtures ──


def _write_obj(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── validate_obj tests ──


def test_validate_valid_obj(tmp_path: Path) -> None:
    """A well-formed OBJ validates cleanly."""
    p = tmp_path / "valid.obj"
    _write_obj(
        p,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 0.0 1.0 0.0",
            "o group1",
            "f 1 2 3",
        ],
    )
    result = validate_obj(str(p))
    assert result.is_valid
    assert result.vertex_count == 3
    assert result.face_count == 1
    assert result.group_count == 1


def test_validate_missing_file() -> None:
    """Non-existent file returns an issue."""
    result = validate_obj("/nonexistent/file_12345.obj")
    assert not result.is_valid
    assert any("Cannot read file" in i.message for i in result.issues)


def test_validate_out_of_range_face(tmp_path: Path) -> None:
    """Face referencing non-existent vertex should be flagged."""
    p = tmp_path / "bad.obj"
    _write_obj(
        p,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "f 1 2 99",
        ],
    )
    result = validate_obj(str(p))
    assert not result.is_valid
    assert any("out of range" in i.message for i in result.issues)


def test_validate_position_only_group(tmp_path: Path) -> None:
    """Point-cloud directive validates cleanly."""
    p = tmp_path / "pts.obj"
    _write_obj(
        p,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 2.0 0.0 0.0",
            "o ptonly_test",
            "p 1 2 3",
        ],
    )
    result = validate_obj(str(p))
    assert result.is_valid
    assert result.vertex_count == 3
    assert result.point_count == 1
    assert result.face_count == 0


# ── Stats mode tests ──


def test_stats_mode_groups(tmp_path: Path) -> None:
    """--stats collects per-group vertex/face/point counts."""
    p = tmp_path / "stats.obj"
    _write_obj(
        p,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 0.0 1.0 0.0",
            "v 5.0 0.0 0.0",
            "v 6.0 0.0 0.0",
            "o group_a",
            "f 1 2 3",
            "o ptonly_cloud",
            "p 4 5",
        ],
    )
    result = validate_obj(str(p), collect_stats=True)
    assert result.is_valid
    assert len(result.groups) == 2

    g1 = result.groups[0]
    assert g1.name == "group_a"
    assert g1.vertex_count == 3
    assert g1.face_count == 1
    assert g1.point_count == 0
    assert not g1.is_ptonly

    g2 = result.groups[1]
    assert g2.name == "ptonly_cloud"
    assert g2.is_ptonly
    assert g2.face_count == 0
    assert g2.point_count == 1
    assert g2.vertex_count == 2


# ── Diff mode tests ──


def test_diff_identical_files(tmp_path: Path) -> None:
    """Two identical files produce no differences."""
    content = [
        "v 0.0 0.0 0.0",
        "v 1.0 0.0 0.0",
        "o g1",
        "f 1 2 1",
    ]
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(a, content)
    _write_obj(b, content)
    assert compare_objs(str(a), str(b)) == 0


def test_diff_different_vertex_count(tmp_path: Path) -> None:
    """Files with different vertex counts flagged."""
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(a, ["v 0.0 0.0 0.0", "v 1.0 0.0 0.0", "o g1", "f 1 2 1"])
    _write_obj(b, ["v 0.0 0.0 0.0", "v 1.0 0.0 0.0", "v 2.0 0.0 0.0", "o g1", "f 1 2 3"])
    assert compare_objs(str(a), str(b)) == 1


def test_diff_added_group(tmp_path: Path) -> None:
    """New group in second file should be reported."""
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(a, ["v 0.0 0.0 0.0", "o g1", "f 1 1 1"])
    _write_obj(
        b,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "o g1",
            "f 1 1 1",
            "o g2_new",
            "f 2 2 2",
        ],
    )
    assert compare_objs(str(a), str(b)) == 1


def test_diff_missing_file(tmp_path: Path) -> None:
    """Diff with non-existent file returns exit code 2."""
    a = tmp_path / "a.obj"
    _write_obj(a, ["v 0.0 0.0 0.0", "o g1", "f 1 1 1"])
    assert compare_objs(str(a), str(tmp_path / "nope.obj")) == 2


# ── CLI integration tests ──


def test_cli_stats_flag(tmp_path: Path) -> None:
    """Running --stats via CLI produces group breakdown output."""
    p = tmp_path / "stats.obj"
    _write_obj(
        p,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "o group_a",
            "f 1 2 1",
        ],
    )
    result = subprocess.run(
        [sys.executable, "validate_obj.py", "--obj", str(p), "--stats"],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parent.parent),
    )
    assert result.returncode == 0
    assert "group_a" in result.stdout
    assert "Per-group breakdown" in result.stdout


def test_cli_diff_flag(tmp_path: Path) -> None:
    """Running --diff via CLI produces diff output."""
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(a, ["v 0.0 0.0 0.0", "o g1", "f 1 1 1"])
    _write_obj(b, ["v 0.0 0.0 0.0", "o g1", "f 1 1 1"])
    result = subprocess.run(
        [sys.executable, "validate_obj.py", "--diff", str(a), str(b)],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parent.parent),
    )
    assert result.returncode == 0
    assert "[OK] Files are identical" in result.stdout
