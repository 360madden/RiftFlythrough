#!/usr/bin/env python3
"""
Validate a merged OBJ file for the RIFT flythrough viewer.

Checks:
  - All face indices reference valid vertices / normals / texcoords
  - All point-cloud indices reference valid vertices
  - No orphaned or out-of-bounds references
  - Group counts and basic statistics
  - Per-group breakdown (--stats)
  - Diff between two versions (--diff old.obj new.obj)

Usage:
    python validate_obj.py [--obj merged.obj] [--verbose] [--stats]
    python validate_obj.py --diff old.obj new.obj

Exit code 0 = valid, 1 = validation errors found, 2 = file read error.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ValidationIssue:
    line_no: int
    line_type: str
    message: str


@dataclass
class GroupStats:
    name: str
    vertex_count: int = 0
    face_count: int = 0
    point_count: int = 0
    is_ptonly: bool = False


@dataclass
class ValidationResult:
    file_path: str
    vertex_count: int = 0
    normal_count: int = 0
    texcoord_count: int = 0
    face_count: int = 0
    point_count: int = 0
    group_count: int = 0
    groups: list[GroupStats] = field(default_factory=list)
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return len(self.issues) > 0

    @property
    def is_valid(self) -> bool:
        return not self.has_errors


def parse_index(idx_str: str, max_val: int, relative: bool = False) -> int | None:
    """Parse a single index, handling negative (relative) values.

    Returns None on parse failure.
    """
    if not idx_str:
        return None
    try:
        val = int(idx_str)
    except ValueError:
        return None
    # Wavefront OBJ indices are 1-based; 0 is always invalid
    if val == 0:
        return None
    if val < 0:
        if not relative:
            return None
        return max_val + val + 1
    return val


def validate_face_line(
    line: str,
    line_no: int,
    vertex_count: int,
    normal_count: int,
    texcoord_count: int,
) -> list[ValidationIssue]:
    """Validate a face line (f v1/vt1/vn1 v2/vt2/vn2 ...)."""
    issues: list[ValidationIssue] = []
    parts = line.split()[1:]
    if not parts:
        issues.append(ValidationIssue(line_no, "face", "Face has no vertices"))
        return issues

    for i, group in enumerate(parts):
        indices = group.split("/")
        vi_str = indices[0] if len(indices) > 0 else ""

        if not vi_str:
            issues.append(ValidationIssue(line_no, "face", f"Missing vertex index at position {i + 1}"))
            continue

        vi = parse_index(vi_str, vertex_count, relative=True)
        if vi is None:
            issues.append(ValidationIssue(line_no, "face", f"Invalid vertex index '{vi_str}' at position {i + 1}"))
        elif vi < 0 or vi > vertex_count:
            issues.append(
                ValidationIssue(
                    line_no, "face", f"Vertex index {vi} out of range [1..{vertex_count}] at position {i + 1}"
                )
            )

        if len(indices) > 1 and indices[1]:
            vt = parse_index(indices[1], texcoord_count, relative=True)
            if vt is None:
                issues.append(
                    ValidationIssue(line_no, "face", f"Invalid texcoord index '{indices[1]}' at position {i + 1}")
                )
            elif texcoord_count == 0:
                issues.append(
                    ValidationIssue(line_no, "face", f"Texcoord index {vt} referenced but no texcoords defined")
                )
            elif vt < 0 or vt > texcoord_count:
                issues.append(
                    ValidationIssue(
                        line_no, "face", f"Texcoord index {vt} out of range [1..{texcoord_count}] at position {i + 1}"
                    )
                )

        if len(indices) > 2 and indices[2]:
            vn = parse_index(indices[2], normal_count, relative=True)
            if vn is None:
                issues.append(
                    ValidationIssue(line_no, "face", f"Invalid normal index '{indices[2]}' at position {i + 1}")
                )
            elif normal_count == 0:
                issues.append(ValidationIssue(line_no, "face", f"Normal index {vn} referenced but no normals defined"))
            elif vn < 0 or vn > normal_count:
                issues.append(
                    ValidationIssue(
                        line_no, "face", f"Normal index {vn} out of range [1..{normal_count}] at position {i + 1}"
                    )
                )

    return issues


def validate_point_line(
    line: str,
    line_no: int,
    vertex_count: int,
) -> list[ValidationIssue]:
    """Validate a point-cloud line (p v1 v2 v3 ...)."""
    issues: list[ValidationIssue] = []
    parts = line.split()[1:]
    if not parts:
        issues.append(ValidationIssue(line_no, "point", "Point directive has no vertex indices"))
        return issues

    for i, vi_str in enumerate(parts):
        if not vi_str:
            issues.append(ValidationIssue(line_no, "point", f"Empty vertex index at position {i + 1}"))
            continue
        try:
            vi = int(vi_str)
        except ValueError:
            issues.append(ValidationIssue(line_no, "point", f"Invalid vertex index '{vi_str}' at position {i + 1}"))
            continue
        if vi <= 0 or vi > vertex_count:
            issues.append(
                ValidationIssue(
                    line_no, "point", f"Vertex index {vi} out of range [1..{vertex_count}] at position {i + 1}"
                )
            )

    return issues


def validate_obj(file_path: str | Path, collect_stats: bool = False) -> ValidationResult:
    """Validate an OBJ file and return detailed results.

    If *collect_stats* is True, also collect per-group vertex/face/point counts.
    """
    result = ValidationResult(file_path=str(file_path))

    # First pass: count elements and optionally collect per-group stats
    current_group: GroupStats | None = None
    try:
        with open(file_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                stripped = line.rstrip("\n")
                if not stripped or stripped.startswith("#"):
                    continue
                if stripped.startswith("v "):
                    result.vertex_count += 1
                    if collect_stats and current_group:
                        current_group.vertex_count += 1
                elif stripped.startswith("vn "):
                    result.normal_count += 1
                elif stripped.startswith("vt "):
                    result.texcoord_count += 1
                elif stripped.startswith("f "):
                    result.face_count += 1
                    if collect_stats and current_group:
                        current_group.face_count += 1
                elif stripped.startswith("p "):
                    result.point_count += 1
                    if collect_stats and current_group:
                        current_group.point_count += 1
                        # p directives list all vertices for point-only groups
                        parts = stripped.split()[1:]
                        if collect_stats and current_group:
                            current_group.vertex_count = len(parts)
                elif stripped.startswith("o "):
                    result.group_count += 1
                    if collect_stats:
                        name = stripped[2:].strip()
                        current_group = GroupStats(name=name, is_ptonly=name.startswith("ptonly_"))
                        result.groups.append(current_group)
    except OSError as e:
        result.issues.append(ValidationIssue(0, "file", f"Cannot read file: {e}"))
        return result

    # Second pass: validate face/point lines + optionally collect per-group unique vertices
    line_no = 0
    current_group_idx = -1
    group_vertex_sets: list[set[int]] = []
    try:
        with open(file_path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line_no += 1
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                if stripped.startswith("v ") or stripped.startswith("vn ") or stripped.startswith("vt "):
                    continue
                if stripped.startswith("o "):
                    if collect_stats:
                        current_group_idx += 1
                        group_vertex_sets.append(set())
                    continue
                if stripped.startswith("f "):
                    issues = validate_face_line(
                        stripped,
                        line_no,
                        result.vertex_count,
                        result.normal_count,
                        result.texcoord_count,
                    )
                    result.issues.extend(issues)
                    # Collect unique vertex references for this face
                    if collect_stats and current_group_idx >= 0:
                        parts = stripped.split()[1:]
                        for group in parts:
                            idx_str = group.split("/")[0]
                            if idx_str:
                                vi = parse_index(idx_str, result.vertex_count, relative=True)
                                if vi is not None and vi > 0:
                                    group_vertex_sets[current_group_idx].add(vi)
                elif stripped.startswith("p "):
                    issues = validate_point_line(stripped, line_no, result.vertex_count)
                    result.issues.extend(issues)
                    # p directives list ALL vertices for ptonly groups — already counted in first pass
    except OSError as e:
        result.issues.append(ValidationIssue(line_no, "file", f"Error reading file: {e}"))

    # Apply collected unique vertex counts to faced groups
    if collect_stats:
        for i, g in enumerate(result.groups):
            if not g.is_ptonly and i < len(group_vertex_sets):
                g.vertex_count = len(group_vertex_sets[i])

    return result


def print_result(result: ValidationResult, verbose: bool = False, show_stats: bool = False) -> None:
    """Print validation results to stdout."""
    print(f"Validating: {result.file_path}")
    print(f"  Vertices:  {result.vertex_count:,}")
    print(f"  Normals:   {result.normal_count:,}")
    print(f"  TexCoords: {result.texcoord_count:,}")
    print(f"  Faces:     {result.face_count:,}")
    print(f"  Points:    {result.point_count:,}")
    print(f"  Groups:    {result.group_count:,}")
    try:
        file_size = os.path.getsize(result.file_path)
        print(f"  Total size: {file_size:,} bytes")
    except OSError:
        print("  Total size: (unavailable)")
    print()

    if show_stats and result.groups:
        print("Per-group breakdown:")
        faced_count = sum(1 for g in result.groups if not g.is_ptonly)
        ptonly_count = sum(1 for g in result.groups if g.is_ptonly)
        print(f"  Faced groups: {faced_count}   Point-only groups: {ptonly_count}")
        print()
        print(f"  {'Group':<62} {'Verts':>7} {'Faces':>7} {'Pts':>7}")
        print(f"  {'-' * 62} {'-' * 7} {'-' * 7} {'-' * 7}")
        for g in result.groups:
            label = g.name[:60]
            print(f"  {label:<62} {g.vertex_count:>7,} {g.face_count:>7,} {g.point_count:>7,}")
        print()

    if result.is_valid:
        print("[OK] VALID -- no issues found.")
    else:
        error_count = result.issues if verbose else result.issues[:50]
        print(f"[FAIL] INVALID -- {len(result.issues)} issue(s) found:")
        print()
        for issue in error_count:
            print(f"  Line {issue.line_no:>6} [{issue.line_type:>5}] {issue.message}")
        if not verbose and len(result.issues) > 50:
            print(f"  ... and {len(result.issues) - 50} more (use --verbose for all)")


def compare_objs(path_a: str, path_b: str) -> int:
    """Compare two merged OBJ files and print a diff report.

    Returns 0 if identical, 1 if differences found, 2 on read error.
    """
    if not os.path.isfile(path_a):
        print(f"ERROR: File not found: {path_a}", file=sys.stderr)
        return 2
    if not os.path.isfile(path_b):
        print(f"ERROR: File not found: {path_b}", file=sys.stderr)
        return 2

    result_a = validate_obj(path_a, collect_stats=True)
    result_b = validate_obj(path_b, collect_stats=True)

    if result_a.has_errors:
        print(f"WARNING: {path_a} has {len(result_a.issues)} validation issue(s)")
    if result_b.has_errors:
        print(f"WARNING: {path_b} has {len(result_b.issues)} validation issue(s)")

    print(f"Diff: {path_a} -> {path_b}")
    print()

    diffs = 0

    def diff_field(label, val_a, val_b):
        nonlocal diffs
        delta = val_b - val_a
        sign = "+" if delta >= 0 else ""
        marker = "  (no change)" if delta == 0 else "  ** CHANGED **"
        print(f"  {label:<20} {val_a:>10,} -> {val_b:>10,}  ({sign}{delta:,}){marker}")
        if delta != 0:
            diffs += 1

    diff_field("Vertices", result_a.vertex_count, result_b.vertex_count)
    diff_field("Normals", result_a.normal_count, result_b.normal_count)
    diff_field("TexCoords", result_a.texcoord_count, result_b.texcoord_count)
    diff_field("Faces", result_a.face_count, result_b.face_count)
    diff_field("Points", result_a.point_count, result_b.point_count)
    diff_field("Groups", result_a.group_count, result_b.group_count)

    # Per-group diff
    groups_a = {g.name: g for g in result_a.groups}
    groups_b = {g.name: g for g in result_b.groups}
    all_names = sorted(set(groups_a) | set(groups_b))

    added = [n for n in all_names if n not in groups_a]
    removed = [n for n in all_names if n not in groups_b]
    changed: list[tuple[str, GroupStats, GroupStats]] = []

    for name in all_names:
        ga = groups_a.get(name)
        gb = groups_b.get(name)
        if ga and gb and (ga.vertex_count != gb.vertex_count or ga.face_count != gb.face_count):
            changed.append((name, ga, gb))

    if added or removed or changed:
        print()
        if added:
            print(f"  Groups added: {len(added)}")
            for n in added[:10]:
                g = groups_b[n]
                print(f"    + {n:<58} v={g.vertex_count:,} f={g.face_count:,}")
            if len(added) > 10:
                print(f"    ... and {len(added) - 10} more")
        if removed:
            print(f"  Groups removed: {len(removed)}")
            for n in removed[:10]:
                g = groups_a[n]
                print(f"    - {n:<58} v={g.vertex_count:,} f={g.face_count:,}")
            if len(removed) > 10:
                print(f"    ... and {len(removed) - 10} more")
        if changed:
            print(f"  Groups changed: {len(changed)}")
            for name, ga, gb in changed[:10]:
                vd = gb.vertex_count - ga.vertex_count
                fd = gb.face_count - ga.face_count
                vs = f"{'+' if vd >= 0 else ''}{vd:,}"
                fs = f"{'+' if fd >= 0 else ''}{fd:,}"
                print(f"    ~ {name:<58} v:{vs} f:{fs}")
            if len(changed) > 10:
                print(f"    ... and {len(changed) - 10} more")
        diffs += len(added) + len(removed) + len(changed)

    print()
    if diffs == 0:
        print("[OK] Files are identical.")
        return 0
    else:
        print(f"[DIFF] {diffs} difference(s) found.")
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a merged OBJ file for the RIFT flythrough viewer.")
    parser.add_argument(
        "--obj",
        default="merged.obj",
        help="Path to the OBJ file to validate (default: merged.obj)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show all validation issues (default: capped at 50)",
    )
    parser.add_argument(
        "--stats",
        action="store_true",
        help="Show per-group vertex/face/point counts",
    )
    parser.add_argument(
        "--diff",
        nargs=2,
        metavar=("OLD", "NEW"),
        help="Compare two merged.obj files and print a diff report",
    )
    args = parser.parse_args()

    if args.diff:
        return compare_objs(args.diff[0], args.diff[1])

    file_path = args.obj
    if not os.path.isfile(file_path):
        print(f"ERROR: File not found: {file_path}", file=sys.stderr)
        return 2

    result = validate_obj(file_path, collect_stats=args.stats)
    print_result(result, verbose=args.verbose, show_stats=args.stats)

    return 1 if not result.is_valid else 0


if __name__ == "__main__":
    sys.exit(main())
