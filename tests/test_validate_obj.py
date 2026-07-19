"""Tests for validate_obj.py — OBJ validator with stats and diff."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from validate_obj import (
    compare_objs,
    parse_index,
    print_result,
    validate_face_line,
    validate_obj,
    validate_point_line,
)
from validate_obj import (
    main as validate_main,
)

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


def test_parse_index_variants() -> None:
    """Index parser handles OBJ absolute, relative, zero, and invalid values."""
    assert parse_index("3", 10) == 3
    assert parse_index("-1", 10, relative=True) == 10
    assert parse_index("-1", 10, relative=False) is None
    assert parse_index("0", 10) is None  # OBJ is 1-based; 0 is invalid
    assert parse_index("", 10) is None
    assert parse_index("abc", 10) is None


def test_validate_face_line_reports_malformed_indices() -> None:
    """Face validation reports missing, invalid, and unavailable indices."""
    issues = validate_face_line("f /1/1 abc 2/7/3 4/1/9", 12, 3, 0, 0)
    messages = [issue.message for issue in issues]

    assert any("Missing vertex index" in message for message in messages)
    assert any("Invalid vertex index 'abc'" in message for message in messages)
    assert any("Texcoord index" in message and "no texcoords" in message for message in messages)
    assert any("Normal index" in message and "no normals" in message for message in messages)
    assert any("Vertex index 4 out of range" in message for message in messages)


def test_validate_face_line_accepts_relative_texcoords_and_normals() -> None:
    """Relative OBJ face indices validate when corresponding buffers exist."""
    issues = validate_face_line("f -1/-1/-1 -2/-2/-1 -3/-3/-1", 3, 3, 3, 3)
    assert issues == []


def test_validate_empty_face_line() -> None:
    """An empty face directive is invalid."""
    issues = validate_face_line("f", 5, 3, 0, 0)
    assert len(issues) == 1
    assert "Face has no vertices" in issues[0].message


def test_validate_point_line_reports_bad_indices() -> None:
    """Point directive validation reports empty, invalid, and out-of-range data."""
    assert "Point directive has no vertex indices" in validate_point_line("p", 1, 3)[0].message

    issues = validate_point_line("p x 0 4 2", 2, 3)
    messages = [issue.message for issue in issues]
    assert any("Invalid vertex index 'x'" in message for message in messages)
    assert any("Vertex index 0 out of range" in message for message in messages)
    assert any("Vertex index 4 out of range" in message for message in messages)


def test_validate_face_line_rejects_zero_vertex_index() -> None:
    """Face vertex index 0 is invalid (OBJ is 1-based)."""
    issues = validate_face_line("f 0 1 2", 1, 2, 0, 0)
    messages = [issue.message for issue in issues]
    assert any("Invalid vertex index '0'" in message for message in messages)


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


def test_diff_removed_and_changed_group(tmp_path: Path) -> None:
    """Diff reports removed and changed groups."""
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(
        a,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 2.0 0.0 0.0",
            "o kept",
            "f 1 2 1",
            "o removed",
            "f 3 3 3",
        ],
    )
    _write_obj(
        b,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 2.0 0.0 0.0",
            "o kept",
            "f 1 2 3",
        ],
    )
    assert compare_objs(str(a), str(b)) == 1


def test_print_result_verbose_and_stats(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """Printer covers stats and verbose issue output paths."""
    p = tmp_path / "bad.obj"
    _write_obj(p, ["v 0 0 0", "o group", "f 1 2 3"])
    result = validate_obj(str(p), collect_stats=True)

    print_result(result, verbose=True, show_stats=True)

    output = capsys.readouterr().out
    assert "Per-group breakdown" in output
    assert "[FAIL] INVALID" in output
    assert "out of range" in output


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


def test_validate_main_missing_file(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI main returns read-error code for a missing OBJ path."""
    monkeypatch.setattr(sys, "argv", ["validate_obj.py", "--obj", "missing_12345.obj"])
    assert validate_main() == 2


def test_validate_main_invalid_file_returns_one(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI main returns 1 for validation errors."""
    p = tmp_path / "bad.obj"
    _write_obj(p, ["v 0 0 0", "f 1 2 3"])

    monkeypatch.setattr(sys, "argv", ["validate_obj.py", "--obj", str(p), "--verbose"])

    assert validate_main() == 1


def test_validate_main_diff_mode(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI main dispatches to diff mode."""
    a = tmp_path / "a.obj"
    b = tmp_path / "b.obj"
    _write_obj(a, ["v 0 0 0", "o g", "f 1 1 1"])
    _write_obj(b, ["v 0 0 0", "o g", "f 1 1 1"])

    monkeypatch.setattr(sys, "argv", ["validate_obj.py", "--diff", str(a), str(b)])

    assert validate_main() == 0
