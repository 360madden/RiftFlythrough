"""Tests for merge_objs.py — the RIFT OBJ merger."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

from merge_objs import main as merge_main
from merge_objs import merge_objs, offset_face_indices, parse_obj

# ── Fixtures ──


def _write_obj(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture
def tmp_dir() -> Path:
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


# ── parse_obj tests ──


def test_parse_obj_basic(tmp_dir: Path) -> None:
    """Parsing a simple OBJ with vertices and faces."""
    path = tmp_dir / "basic.obj"
    _write_obj(
        path,
        [
            "v 1.0 2.0 3.0",
            "v 4.0 5.0 6.0",
            "vn 0.0 0.0 1.0",
            "f 1//1 2//1 1//1",
        ],
    )
    v, vn, vt, f = parse_obj(str(path))
    assert len(v) == 2
    assert len(vn) == 1
    assert len(vt) == 0
    assert len(f) == 1
    assert v[0] == "v 1.0 2.0 3.0"


def test_parse_obj_empty_file(tmp_dir: Path) -> None:
    """Empty file returns all empty lists."""
    path = tmp_dir / "empty.obj"
    _write_obj(path, [])
    v, vn, vt, f = parse_obj(str(path))
    assert v == []
    assert vn == []
    assert vt == []
    assert f == []


def test_parse_obj_only_vertices(tmp_dir: Path) -> None:
    """File with only vertices (position-only mesh)."""
    path = tmp_dir / "posonly.obj"
    _write_obj(
        path,
        [
            "v 1.0 0.0 0.0",
            "v 2.0 0.0 0.0",
            "v 3.0 0.0 0.0",
        ],
    )
    v, _vn, _vt, f = parse_obj(str(path))
    assert len(v) == 3
    assert f == []


def test_parse_obj_with_texcoords(tmp_dir: Path) -> None:
    """File with all element types."""
    path = tmp_dir / "with_tex.obj"
    _write_obj(
        path,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 1.0 1.0 0.0",
            "vt 0.0 0.0",
            "vt 1.0 0.0",
            "vt 1.0 1.0",
            "vn 0.0 0.0 1.0",
            "f 1/1/1 2/2/1 3/3/1",
        ],
    )
    _v, _vn, vt, _f = parse_obj(str(path))
    assert len(_v) == 3
    assert len(vt) == 3
    assert len(_vn) == 1
    assert len(_f) == 1


def test_parse_obj_skip_junk_lines(tmp_dir: Path) -> None:
    """Non-standard lines are ignored."""
    path = tmp_dir / "junk.obj"
    _write_obj(
        path,
        [
            "# comment",
            "s 1",
            "g group1",
            "usemtl mat1",
            "v 0.0 0.0 0.0",
            "f 1 2 3",
        ],
    )
    v, _vn, _vt, _f = parse_obj(str(path))
    assert len(v) == 1


# ── offset_face_indices tests ──


def test_offset_basic() -> None:
    """Offset face with vertex-only indices."""
    result = offset_face_indices("f 1 2 3", 10, 0, 0, 3, 0, 0)
    assert result == "f 11 12 13"


def test_offset_with_texcoords_and_normals() -> None:
    """Offset face with v/vt/vn format."""
    result = offset_face_indices("f 1/1/1 2/2/1", 5, 3, 0, 2, 2, 1)
    assert result == "f 6/4/1 7/5/1"


def test_offset_mixed_format() -> None:
    """Face with v//vn (no texcoords)."""
    result = offset_face_indices("f 1//1 2//2", 0, 0, 5, 2, 0, 2)
    assert result == "f 1//6 2//7"


def test_offset_negative_indices() -> None:
    """Negative indices wrap to end of source buffer."""
    # -1 means the last vertex, which is source vertex 3
    result = offset_face_indices("f -1 -2 -3", 10, 0, 0, 3, 0, 0)
    assert result == "f 13 12 11"


def test_offset_negative_texcoord() -> None:
    """Negative texcoord index wraps."""
    result = offset_face_indices("f 1/-1/1", 0, 10, 0, 1, 2, 1)
    # last texcoord is 2, -1 → 2+1+(-1) if counting from end
    # Actually: vt = src_vt_count + (-1) + 1 = 2 + (-1) + 1 = 2, then + vt_offset(10) = 12
    assert result == "f 1/12/1"


# ── merge_objs tests ──


def test_merge_single_file(tmp_dir: Path) -> None:
    """Merge one OBJ into output."""
    path = tmp_dir / "mesh.obj"
    _write_obj(
        path,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 0.0 1.0 0.0",
            "f 1 2 3",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    result = merge_objs([str(path)], out_path)
    assert result["merged_count"] == 1
    assert result["skipped"] == 0
    assert result["total_vertices"] == 3
    assert result["total_faces"] == 1
    assert os.path.isfile(out_path)


def test_merge_multiple_files(tmp_dir: Path) -> None:
    """Merge two OBJs with correct index offsets."""
    path1 = tmp_dir / "a.obj"
    _write_obj(
        path1,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 0.0 1.0 0.0",
            "f 1 2 3",
        ],
    )
    path2 = tmp_dir / "b.obj"
    _write_obj(
        path2,
        [
            "v 5.0 0.0 0.0",
            "v 6.0 0.0 0.0",
            "v 5.0 1.0 0.0",
            "f 1 2 3",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    result = merge_objs([str(path1), str(path2)], out_path)
    assert result["merged_count"] == 2
    assert result["total_vertices"] == 6
    assert result["total_faces"] == 2

    # Read output and verify second face indices are offset (1+3, 2+3, 3+3)
    content = Path(out_path).read_text()
    assert "f 4 5 6" in content


def test_merge_position_only(tmp_dir: Path) -> None:
    """Mesh with no faces emits a 'p' point-cloud directive."""
    path = tmp_dir / "ptonly.obj"
    _write_obj(
        path,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "v 2.0 0.0 0.0",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    result = merge_objs([str(path)], out_path)
    assert result["merged_count"] == 1
    assert result["total_faces"] == 0
    content = Path(out_path).read_text()
    assert "ptonly_" in content
    assert "p " in content


def test_merge_skips_empty_files(tmp_dir: Path) -> None:
    """Files with no vertices are skipped."""
    empty_path = tmp_dir / "empty.obj"
    _write_obj(empty_path, [])
    valid_path = tmp_dir / "valid.obj"
    _write_obj(
        valid_path,
        [
            "v 0.0 0.0 0.0",
            "f 1 1 1",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    result = merge_objs([str(empty_path), str(valid_path)], out_path)
    assert result["merged_count"] == 1
    assert result["skipped"] == 1


def test_merge_output_contains_group_markers(tmp_dir: Path) -> None:
    """Output includes 'o <group>' lines for each mesh."""
    path = tmp_dir / "mesh.obj"
    _write_obj(
        path,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "f 1 2 1",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    merge_objs([str(path)], out_path)
    content = Path(out_path).read_text()
    assert "o " in content


def test_merge_preserves_normals(tmp_dir: Path) -> None:
    """Normals are included in output with correct offset."""
    path = tmp_dir / "mesh.obj"
    _write_obj(
        path,
        [
            "v 0.0 0.0 0.0",
            "v 1.0 0.0 0.0",
            "vn 0.0 0.0 1.0",
            "f 1//1 2//1 1//1",
        ],
    )
    out_path = str(tmp_dir / "out.obj")
    result = merge_objs([str(path)], out_path)
    assert result["total_normals"] == 1
    content = Path(out_path).read_text()
    assert "vn 0.0 0.0 1.0" in content


def test_merge_large_output_directory() -> None:
    """Nested output directory is created automatically."""
    with tempfile.TemporaryDirectory() as d:
        out_path = os.path.join(d, "sub", "deep", "merged.obj")
        src_path = os.path.join(d, "src.obj")
        _write_obj(
            Path(src_path),
            [
                "v 0.0 0.0 0.0",
                "f 1 1 1",
            ],
        )
        result = merge_objs([src_path], out_path)
        assert result["merged_count"] == 1
        assert os.path.isfile(out_path)


def test_merge_main_missing_directory(monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI main fails cleanly when the OBJ directory is missing."""
    monkeypatch.setattr(sys, "argv", ["merge_objs.py", "--objs-dir", "definitely_missing_exports"])
    assert merge_main() == 1


def test_merge_main_filters_limits_and_writes_output(tmp_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """CLI main applies filters, max-meshes, and writes the requested output."""
    exports = tmp_dir / "exports"
    zone = exports / "zone"
    zone.mkdir(parents=True)
    _write_obj(zone / "a.obj", ["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3"])
    _write_obj(zone / "b.obj", ["v 0 0 0", "v 1 0 0", "v 0 1 0", "f 1 2 3"])
    _write_obj(zone / "point_only.obj", ["v 0 0 0", "v 1 0 0", "v 2 0 0"])
    out = tmp_dir / "merged.obj"

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "merge_objs.py",
            "--objs-dir",
            str(exports),
            "--out",
            str(out),
            "--faced-only",
            "--min-verts",
            "2",
            "--max-meshes",
            "1",
        ],
    )

    assert merge_main() == 0
    content = out.read_text(encoding="utf-8")
    assert "# 1 meshes" in content
    assert "point_only" not in content
