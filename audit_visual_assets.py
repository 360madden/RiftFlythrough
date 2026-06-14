#!/usr/bin/env python3
"""Audit merged OBJ groups for visual-fidelity triage.

This is an observational report generator, not a validator. It ranks OBJ groups
by geometry size, face count, texture-map coverage, likely visual category, and
rendering risk so Beauty-mode filtering/material work can be evidence-driven.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "artifacts" / "visual-audit"
NIF_HASH_RE = re.compile(r"(?i)(?<![0-9a-f])[0-9a-f]{16}(?![0-9a-f])")
TEXTURE_ENTRY_RE = re.compile(
    r"""\{\s*pattern:\s*["'](?P<pattern>[0-9a-fA-F]{16})["']\s*,\s*url:\s*["'](?P<url>[^"']+)["']\s*\}"""
)


@dataclass
class ObjGroupAudit:
    """Per-OBJ-object visual audit data."""

    index: int
    name: str
    line_no: int
    face_count: int = 0
    point_directive_count: int = 0
    vertex_refs: set[int] = field(default_factory=set)
    uses_texcoords: bool = False
    uses_normals: bool = False
    invalid_ref_count: int = 0

    @property
    def is_point_only(self) -> bool:
        return self.name.startswith("ptonly_") or (self.face_count == 0 and self.point_directive_count > 0)

    @property
    def vertex_count(self) -> int:
        return len(self.vertex_refs)


@dataclass(frozen=True)
class Bounds:
    """Axis-aligned bounds for one group."""

    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float

    @property
    def extent_x(self) -> float:
        return self.max_x - self.min_x

    @property
    def extent_y(self) -> float:
        return self.max_y - self.min_y

    @property
    def extent_z(self) -> float:
        return self.max_z - self.min_z

    @property
    def max_extent(self) -> float:
        return max(self.extent_x, self.extent_y, self.extent_z)

    @property
    def diagonal(self) -> float:
        return math.sqrt(self.extent_x**2 + self.extent_y**2 + self.extent_z**2)


def display_path(path: Path) -> str:
    """Return a compact repo-relative display path when possible."""
    try:
        return str(path.resolve().relative_to(PROJECT_DIR))
    except ValueError:
        return str(path)


def extract_nif_hash(name: str) -> str:
    """Extract a 16-character NIF hash from a group name."""
    match = NIF_HASH_RE.search(name or "")
    return match.group(0).lower() if match else ""


def parse_obj_vertex_index(index_text: str, vertex_count: int) -> int | None:
    """Parse one OBJ vertex index, normalizing negative relative indices."""
    if not index_text:
        return None
    try:
        value = int(index_text)
    except ValueError:
        return None
    if value == 0:
        return None
    if value < 0:
        value = vertex_count + value + 1
    return value if value > 0 else None


def texture_role(url: str) -> str:
    """Classify a texture URL into a broad material role."""
    stem = Path(url).stem.lower()
    if "diffuse_blank" in stem or "pure_white" in stem or stem.endswith("_blank"):
        return "placeholder"
    if "sky" in stem or "starmap" in stem:
        return "sky"
    if "vfx" in stem or "portal" in stem or "glow" in stem:
        return "vfx"
    if stem.endswith(("_n", "_normal", "_dn")) or "normal" in stem:
        return "normal"
    if stem.endswith(("_s", "_spec", "_specular")) or "spec" in stem or "gloss" in stem:
        return "specular"
    if stem.endswith(("_g", "_glow")) or "emiss" in stem:
        return "glow"
    if stem.endswith(("_c", "_d", "_diffuse", "_color")) or "diffuse" in stem or "color" in stem:
        return "color"
    return "other"


def parse_texture_map(path: Path) -> dict[str, list[str]]:
    """Read a generated texture-map JS file into hash -> texture URL entries."""
    if not path.exists():
        return {}

    text = path.read_text(encoding="utf-8", errors="replace")
    textures: dict[str, list[str]] = defaultdict(list)
    for match in TEXTURE_ENTRY_RE.finditer(text):
        textures[match.group("pattern").lower()].append(match.group("url"))
    return dict(sorted(textures.items()))


def parse_obj_groups(path: Path) -> tuple[list[tuple[float, float, float]], list[ObjGroupAudit]]:
    """Parse OBJ vertices and object groups without rewriting assets."""
    vertices: list[tuple[float, float, float]] = []
    groups: list[ObjGroupAudit] = []
    current_group: ObjGroupAudit | None = None

    def ensure_group(line_no: int) -> ObjGroupAudit:
        nonlocal current_group
        if current_group is None:
            current_group = ObjGroupAudit(index=len(groups), name="<ungrouped>", line_no=line_no)
            groups.append(current_group)
        return current_group

    with path.open(encoding="utf-8", errors="replace") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("v "):
                parts = line.split()
                if len(parts) < 4:
                    continue
                try:
                    vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
                except ValueError:
                    continue
            elif line.startswith("o "):
                name = line[2:].strip() or f"<object-{len(groups) + 1}>"
                current_group = ObjGroupAudit(index=len(groups), name=name, line_no=line_no)
                groups.append(current_group)
            elif line.startswith("f "):
                group = ensure_group(line_no)
                group.face_count += 1
                for face_part in line.split()[1:]:
                    fields = face_part.split("/")
                    vertex_index = parse_obj_vertex_index(fields[0], len(vertices))
                    if vertex_index is None:
                        group.invalid_ref_count += 1
                    else:
                        group.vertex_refs.add(vertex_index)
                    if len(fields) > 1 and fields[1]:
                        group.uses_texcoords = True
                    if len(fields) > 2 and fields[2]:
                        group.uses_normals = True
            elif line.startswith("p "):
                group = ensure_group(line_no)
                group.point_directive_count += 1
                for index_text in line.split()[1:]:
                    vertex_index = parse_obj_vertex_index(index_text, len(vertices))
                    if vertex_index is None:
                        group.invalid_ref_count += 1
                    else:
                        group.vertex_refs.add(vertex_index)

    return vertices, groups


def group_bounds(vertices: list[tuple[float, float, float]], group: ObjGroupAudit) -> Bounds | None:
    """Calculate bounds for all valid vertex references in *group*."""
    points = [vertices[index - 1] for index in group.vertex_refs if 1 <= index <= len(vertices)]
    if not points:
        return None
    xs, ys, zs = zip(*points, strict=True)
    return Bounds(min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def is_degenerate(bounds: Bounds | None, group: ObjGroupAudit) -> bool:
    """Return True when a faced group has too little geometric extent to render meaningfully."""
    if group.face_count <= 0 or bounds is None:
        return False
    non_zero_axes = sum(extent > 0.001 for extent in (bounds.extent_x, bounds.extent_y, bounds.extent_z))
    return bounds.max_extent <= 0.001 or non_zero_axes <= 1


def likely_category(group: ObjGroupAudit, textures: list[str], bounds: Bounds | None) -> str:
    """Infer a coarse visual category from group name, texture names, and geometry."""
    text = " ".join([group.name, *textures]).lower()
    if group.is_point_only:
        return "point-cloud"
    if group.face_count == 0:
        return "empty"
    if is_degenerate(bounds, group):
        return "degenerate"
    if any(token in text for token in ("sky", "starmap", "vfx", "ui_", "portal", "quest", "glow")):
        return "sky-vfx-ui"
    if any(token in text for token in ("water", "ocean", "river", "lake")):
        return "water"
    if any(token in text for token in ("grass", "plant", "flower", "tree", "foliage", "lifegrowth", "tuft")):
        return "foliage"
    if any(token in text for token in ("terrain", "ground", "dirt", "rock", "cliff")):
        return "terrain"
    if any(
        token in text
        for token in (
            "roof",
            "wall",
            "stone",
            "marble",
            "metal",
            "palace",
            "house",
            "tile",
            "trim",
            "brick",
            "floor",
            "ceiling",
            "forge",
            "carpet",
            "pillow",
            "wood",
        )
    ):
        return "structure-prop"
    if not extract_nif_hash(group.name):
        return "unmapped-name"
    if not textures:
        return "untextured"
    if all(texture_role(url) == "placeholder" for url in textures):
        return "placeholder-textured"
    return "unknown"


def fidelity_risk(category: str, textures: list[str]) -> str:
    """Assign a visual-fidelity risk bucket for triage priority."""
    if category in {"point-cloud", "empty", "degenerate", "sky-vfx-ui", "unmapped-name"}:
        return "high"
    if category in {"untextured", "placeholder-textured", "foliage", "water"}:
        return "medium"
    if not textures and category not in {"point-cloud", "empty"}:
        return "medium"
    return "low"


def beauty_recommendation(category: str, textures: list[str]) -> str:
    """Suggest a conservative Beauty-mode treatment for this group."""
    if category in {"point-cloud", "empty", "degenerate", "sky-vfx-ui"}:
        return "hide-by-default"
    if category in {"unmapped-name", "untextured", "placeholder-textured"} or not textures:
        return "review-source"
    if category in {"foliage", "water"}:
        return "material-review"
    return "keep"


def texture_summary(textures: list[str]) -> dict[str, Any]:
    """Return compact texture role counts and samples."""
    roles = Counter(texture_role(url) for url in textures)
    return {
        "count": len(textures),
        "roles": dict(sorted(roles.items())),
        "sample": textures[:5],
    }


def bounds_dict(bounds: Bounds | None) -> dict[str, float] | None:
    """Serialize bounds with stable rounded values."""
    if bounds is None:
        return None
    return {
        "minX": round(bounds.min_x, 3),
        "maxX": round(bounds.max_x, 3),
        "minY": round(bounds.min_y, 3),
        "maxY": round(bounds.max_y, 3),
        "minZ": round(bounds.min_z, 3),
        "maxZ": round(bounds.max_z, 3),
        "extentX": round(bounds.extent_x, 3),
        "extentY": round(bounds.extent_y, 3),
        "extentZ": round(bounds.extent_z, 3),
        "maxExtent": round(bounds.max_extent, 3),
        "diagonal": round(bounds.diagonal, 3),
    }


def group_record(
    group: ObjGroupAudit,
    vertices: list[tuple[float, float, float]],
    textures_by_hash: dict[str, list[str]],
) -> dict[str, Any]:
    """Build a serializable audit record for one group."""
    nif_hash = extract_nif_hash(group.name)
    textures = textures_by_hash.get(nif_hash, [])
    bounds = group_bounds(vertices, group)
    category = likely_category(group, textures, bounds)
    risk = fidelity_risk(category, textures)
    recommendation = beauty_recommendation(category, textures)
    bounds_data = bounds_dict(bounds)
    return {
        "index": group.index,
        "name": group.name,
        "lineNo": group.line_no,
        "nifHash": nif_hash,
        "category": category,
        "fidelityRisk": risk,
        "beautyRecommendation": recommendation,
        "faces": group.face_count,
        "pointDirectives": group.point_directive_count,
        "vertices": group.vertex_count,
        "isPointOnly": group.is_point_only,
        "usesTexcoords": group.uses_texcoords,
        "usesNormals": group.uses_normals,
        "invalidRefCount": group.invalid_ref_count,
        "bounds": bounds_data,
        "textures": texture_summary(textures),
    }


def build_audit_report(obj_path: Path, texture_map_path: Path) -> dict[str, Any]:
    """Build the complete visual asset audit report."""
    if not obj_path.exists():
        raise FileNotFoundError(f"OBJ file not found: {obj_path}")

    textures_by_hash = parse_texture_map(texture_map_path)
    vertices, groups = parse_obj_groups(obj_path)
    records = [group_record(group, vertices, textures_by_hash) for group in groups]
    faced_records = [record for record in records if record["faces"] > 0]
    textured_records = [record for record in records if record["textures"]["count"] > 0]

    totals = {
        "vertices": len(vertices),
        "groups": len(records),
        "facedGroups": len(faced_records),
        "pointOnlyGroups": sum(1 for record in records if record["isPointOnly"]),
        "faces": sum(record["faces"] for record in records),
        "pointDirectives": sum(record["pointDirectives"] for record in records),
        "groupsWithNifHash": sum(1 for record in records if record["nifHash"]),
        "groupsWithTextures": len(textured_records),
        "facesWithTextures": sum(record["faces"] for record in textured_records),
        "knownTextureAssets": len(textures_by_hash),
        "knownTextureEntries": sum(len(urls) for urls in textures_by_hash.values()),
    }
    totals["textureFaceCoverage"] = round(totals["facesWithTextures"] / totals["faces"], 4) if totals["faces"] else 0

    return {
        "schemaVersion": 1,
        "obj": display_path(obj_path),
        "textureMap": display_path(texture_map_path),
        "totals": totals,
        "categories": dict(sorted(Counter(record["category"] for record in records).items())),
        "fidelityRisks": dict(sorted(Counter(record["fidelityRisk"] for record in records).items())),
        "beautyRecommendations": dict(sorted(Counter(record["beautyRecommendation"] for record in records).items())),
        "groups": records,
    }


def top_records(records: list[dict[str, Any]], key: str, limit: int) -> list[dict[str, Any]]:
    """Return top records by a numeric field or nested bounds field."""
    if key.startswith("bounds."):
        bounds_key = key.split(".", maxsplit=1)[1]

        def value(record: dict[str, Any]) -> float:
            bounds = record.get("bounds")
            return float(bounds.get(bounds_key, 0.0)) if isinstance(bounds, dict) else 0.0

    else:

        def value(record: dict[str, Any]) -> float:
            raw_value = record.get(key, 0)
            return float(raw_value) if isinstance(raw_value, (int, float)) else 0.0

    return sorted(records, key=lambda record: (value(record), record.get("faces", 0)), reverse=True)[:limit]


def markdown_table(records: list[dict[str, Any]]) -> str:
    """Render a compact Markdown table for group records."""
    lines = [
        "| group | faces | verts | span | category | risk | recommendation | textures |",
        "| --- | ---: | ---: | ---: | --- | --- | --- | ---: |",
    ]
    for record in records:
        bounds = record.get("bounds") or {}
        span = bounds.get("maxExtent", "-") if isinstance(bounds, dict) else "-"
        name = str(record["name"]).replace("|", "\\|")
        if len(name) > 54:
            name = f"{name[:51]}..."
        lines.append(
            "| "
            f"{name} | {record['faces']:,} | {record['vertices']:,} | {span} | "
            f"{record['category']} | {record['fidelityRisk']} | {record['beautyRecommendation']} | "
            f"{record['textures']['count']} |"
        )
    return "\n".join(lines)


def build_markdown_report(report: dict[str, Any], top_limit: int) -> str:
    """Build a human-readable Markdown visual audit report."""
    groups = report["groups"]
    high_risk = [record for record in groups if record["fidelityRisk"] == "high"]
    hide_candidates = [record for record in groups if record["beautyRecommendation"] == "hide-by-default"]
    review_candidates = [record for record in groups if record["beautyRecommendation"] == "review-source"]

    lines = [
        "# RiftFlythrough Visual Asset Audit",
        "",
        "Observational report only; it does not rewrite runtime assets or enforce pass/fail thresholds.",
        "",
        "## Totals",
        "",
        f"- OBJ: `{report['obj']}`",
        f"- Texture map: `{report['textureMap']}`",
        f"- Groups: `{report['totals']['groups']}` "
        f"(`{report['totals']['facedGroups']}` faced, `{report['totals']['pointOnlyGroups']}` point-only)",
        f"- Faces: `{report['totals']['faces']:,}`",
        f"- Texture coverage: `{report['totals']['groupsWithTextures']}` groups, "
        f"`{report['totals']['textureFaceCoverage']:.1%}` of faced geometry by face count",
        "",
        "## Category Counts",
        "",
    ]
    for category, count in report["categories"].items():
        lines.append(f"- `{category}`: `{count}`")

    lines.extend(["", "## Risk Counts", ""])
    for risk, count in report["fidelityRisks"].items():
        lines.append(f"- `{risk}`: `{count}`")

    lines.extend(
        ["", f"## Top {top_limit} Groups By Face Count", "", markdown_table(top_records(groups, "faces", top_limit))]
    )
    lines.extend(
        [
            "",
            f"## Top {top_limit} Groups By Local Geometry Span",
            "",
            markdown_table(top_records(groups, "bounds.maxExtent", top_limit)),
        ]
    )
    lines.extend(["", f"## High-Risk Visual Candidates ({len(high_risk)})", ""])
    lines.append(markdown_table(top_records(high_risk, "faces", top_limit)) if high_risk else "_None._")
    lines.extend(["", f"## Beauty Hide-By-Default Candidates ({len(hide_candidates)})", ""])
    lines.append(markdown_table(top_records(hide_candidates, "faces", top_limit)) if hide_candidates else "_None._")
    lines.extend(["", f"## Source Review Candidates ({len(review_candidates)})", ""])
    lines.append(markdown_table(top_records(review_candidates, "faces", top_limit)) if review_candidates else "_None._")
    lines.extend(
        [
            "",
            "## Practical Interpretation",
            "",
            "- `hide-by-default` candidates are strong Beauty-mode filtering targets, but should still be sampled visually.",
            "- `review-source` candidates usually mean missing hashes, missing texture links, or placeholder-only maps.",
            "- `material-review` candidates likely need alpha/water/material-specific rendering rather than blanket hiding.",
        ]
    )
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any], output_dir: Path, top_limit: int) -> tuple[Path, Path]:
    """Write JSON and Markdown reports under *output_dir*."""
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "visual-asset-audit.json"
    markdown_path = output_dir / "visual-asset-audit.md"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    markdown_path.write_text(build_markdown_report(report, top_limit), encoding="utf-8")
    return json_path, markdown_path


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""
    parser = argparse.ArgumentParser(description="Audit OBJ groups for visual-fidelity triage.")
    parser.add_argument("--obj", type=Path, default=PROJECT_DIR / "merged.obj", help="OBJ file to audit.")
    parser.add_argument(
        "--texture-map",
        type=Path,
        default=PROJECT_DIR / "js" / "texture_map.js",
        help="Generated texture map JS file used for hash coverage analysis.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory for ignored JSON/Markdown audit reports.",
    )
    parser.add_argument("--top", type=int, default=20, help="Number of top records to include in Markdown tables.")
    return parser


def main() -> int:
    """Run the visual asset audit from the command line."""
    args = build_parser().parse_args()
    obj_path = args.obj if args.obj.is_absolute() else PROJECT_DIR / args.obj
    texture_map_path = args.texture_map if args.texture_map.is_absolute() else PROJECT_DIR / args.texture_map
    output_dir = args.output_dir if args.output_dir.is_absolute() else PROJECT_DIR / args.output_dir

    try:
        report = build_audit_report(obj_path.resolve(), texture_map_path.resolve())
        json_path, markdown_path = write_report(report, output_dir.resolve(), max(args.top, 1))
    except OSError as exc:
        print(f"[ERR] {exc}", file=sys.stderr)
        return 2

    totals = report["totals"]
    print(
        "[OK] Visual asset audit complete "
        f"(groups={totals['groups']}, faces={totals['faces']:,}, "
        f"texture_face_coverage={totals['textureFaceCoverage']:.1%})"
    )
    print(f"  JSON: {display_path(json_path)}")
    print(f"  Markdown: {display_path(markdown_path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
