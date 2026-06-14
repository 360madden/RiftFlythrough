"""Tests for visual asset audit helpers."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from audit_visual_assets import (
    build_audit_report,
    build_markdown_report,
    extract_nif_hash,
    parse_obj_groups,
    parse_obj_vertex_index,
    parse_texture_map,
    texture_role,
    write_report,
)


def write_text(path: Path, lines: list[str]) -> None:
    """Write UTF-8 test content."""
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_extract_nif_hash_handles_common_group_shapes() -> None:
    assert extract_nif_hash("decode-nif-geometry-abcdef1234567890.json/foo") == "abcdef1234567890"
    assert extract_nif_hash("ptonly_ABCDEF1234567890") == "abcdef1234567890"
    assert extract_nif_hash("decode-nif-geometry/decode-nif-geometry-mesh6") == ""


def test_parse_obj_vertex_index_normalizes_relative_indices() -> None:
    assert parse_obj_vertex_index("3", 10) == 3
    assert parse_obj_vertex_index("-1", 10) == 10
    assert parse_obj_vertex_index("0", 10) is None
    assert parse_obj_vertex_index("bad", 10) is None


def test_texture_map_parser_and_roles(tmp_path: Path) -> None:
    texture_map = tmp_path / "texture_map.js"
    write_text(
        texture_map,
        [
            "const TEXTURE_MAP = [",
            '  { pattern: "aaaaaaaaaaaaaaaa", url: "textures/converted/tree_c.png" },',
            '  { pattern: "aaaaaaaaaaaaaaaa", url: "textures/converted/tree_n.png" },',
            '  { pattern: "bbbbbbbbbbbbbbbb", url: "textures/converted/sky_gradient.png" },',
            "];",
        ],
    )

    parsed = parse_texture_map(texture_map)

    assert parsed["aaaaaaaaaaaaaaaa"] == [
        "textures/converted/tree_c.png",
        "textures/converted/tree_n.png",
    ]
    assert parsed["bbbbbbbbbbbbbbbb"] == ["textures/converted/sky_gradient.png"]
    assert texture_role("textures/converted/tree_c.png") == "color"
    assert texture_role("textures/converted/tree_n.png") == "normal"
    assert texture_role("textures/converted/diffuse_blank.png") == "placeholder"
    assert texture_role("textures/converted/portal_glow.png") == "vfx"


def test_parse_obj_groups_collects_faces_points_and_bounds_inputs(tmp_path: Path) -> None:
    obj = tmp_path / "sample.obj"
    write_text(
        obj,
        [
            "v 0 0 0",
            "v 1 0 0",
            "v 0 1 0",
            "v 5 5 5",
            "o decode-nif-geometry-aaaaaaaaaaaaaaaa.json/mesh",
            "f 1 2 3",
            "o ptonly_bbbbbbbbbbbbbbbb",
            "p 4",
        ],
    )

    vertices, groups = parse_obj_groups(obj)

    assert len(vertices) == 4
    assert [group.name for group in groups] == [
        "decode-nif-geometry-aaaaaaaaaaaaaaaa.json/mesh",
        "ptonly_bbbbbbbbbbbbbbbb",
    ]
    assert groups[0].face_count == 1
    assert groups[0].vertex_refs == {1, 2, 3}
    assert groups[1].is_point_only
    assert groups[1].vertex_refs == {4}


def test_build_audit_report_classifies_visual_risks(tmp_path: Path) -> None:
    obj = tmp_path / "sample.obj"
    texture_map = tmp_path / "texture_map.js"
    write_text(
        obj,
        [
            "v 0 0 0",
            "v 10 0 0",
            "v 0 10 0",
            "v 0 0 10",
            "v 1 1 1",
            "o decode-nif-geometry-aaaaaaaaaaaaaaaa.json/mesh",
            "f 1 2 3",
            "o decode-nif-geometry-bbbbbbbbbbbbbbbb.json/mesh",
            "f 1 3 4",
            "o ptonly_cccccccccccccccc",
            "p 5",
        ],
    )
    write_text(
        texture_map,
        [
            "const TEXTURE_MAP = [",
            '  { pattern: "aaaaaaaaaaaaaaaa", url: "textures/converted/forest_grass_c.png" },',
            '  { pattern: "bbbbbbbbbbbbbbbb", url: "textures/converted/sky_gradient.png" },',
            "];",
        ],
    )

    report = build_audit_report(obj, texture_map)
    records = {record["nifHash"]: record for record in report["groups"]}

    assert report["totals"]["groups"] == 3
    assert report["totals"]["faces"] == 2
    assert report["totals"]["groupsWithTextures"] == 2
    assert records["aaaaaaaaaaaaaaaa"]["category"] == "foliage"
    assert records["aaaaaaaaaaaaaaaa"]["beautyRecommendation"] == "material-review"
    assert records["bbbbbbbbbbbbbbbb"]["category"] == "sky-vfx-ui"
    assert records["bbbbbbbbbbbbbbbb"]["beautyRecommendation"] == "hide-by-default"
    assert records["cccccccccccccccc"]["category"] == "point-cloud"
    assert records["cccccccccccccccc"]["fidelityRisk"] == "high"


def test_write_report_outputs_json_and_markdown(tmp_path: Path) -> None:
    report = {
        "obj": "sample.obj",
        "textureMap": "texture_map.js",
        "totals": {
            "groups": 1,
            "facedGroups": 1,
            "pointOnlyGroups": 0,
            "faces": 1,
            "groupsWithTextures": 1,
            "textureFaceCoverage": 1.0,
        },
        "categories": {"structure-prop": 1},
        "fidelityRisks": {"low": 1},
        "beautyRecommendations": {"keep": 1},
        "groups": [
            {
                "name": "group",
                "faces": 1,
                "vertices": 3,
                "bounds": {"maxExtent": 1.0},
                "category": "structure-prop",
                "fidelityRisk": "low",
                "beautyRecommendation": "keep",
                "textures": {"count": 1},
            }
        ],
    }

    json_path, markdown_path = write_report(report, tmp_path, 5)

    assert json.loads(json_path.read_text(encoding="utf-8"))["totals"]["groups"] == 1
    assert "Top 5 Groups By Face Count" in markdown_path.read_text(encoding="utf-8")
    assert "Observational report only" in build_markdown_report(report, 5)


def test_build_audit_report_missing_obj_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        build_audit_report(tmp_path / "missing.obj", tmp_path / "texture_map.js")
