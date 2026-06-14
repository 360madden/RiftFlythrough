#!/usr/bin/env python3
"""Build TEXTURE_MAP for RiftFlythrough viewer by cross-referencing:
  1. NIF texture links (ModelIdPrefix -> texture filename)
  2. OBJ group names (containing NIF hashes)
  3. Available PNG textures in textures/converted/

Outputs a JavaScript TEXTURE_MAP configuration for world.js.
"""

import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = SCRIPT_DIR.parent / "Assets" / "Exports"
TEXTURES_DIR = SCRIPT_DIR / "textures" / "converted"
MERGED_OBJ = SCRIPT_DIR / "merged.obj"


def parse_texture_links(jsonl_path):
    """Parse nif-texture-links.jsonl into {ModelIdPrefix -> set of texture filenames}.

    Skips entries with a BOM prefix.
    """
    model_to_textures = defaultdict(set)
    texture_to_models = defaultdict(set)

    with open(jsonl_path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            model_id = entry.get("ModelIdPrefix")
            candidate = entry.get("Candidate")
            if model_id and candidate:
                candidate_lower = candidate.lower().removesuffix(".dds")
                model_to_textures[model_id].add(candidate_lower)
                texture_to_models[candidate_lower].add(model_id)

    return model_to_textures, texture_to_models


def parse_obj_groups(obj_path):
    """Extract group names and their NIF hash prefixes from merged.obj.

    Group names look like:
      o decode-nif-geometry-0603cce7cee15eb8
      o decode-nif-geometry/0603cce7cee15eb8.json/decode-nif-geometr[...]
      o ptonly_decode-nif-geometry-0603cce7cee15eb8

    Returns list of (group_name, nif_hash_or_None, is_ptonly)
    """
    groups = []
    hash_pattern = re.compile(r"([0-9a-f]{12,16})", re.IGNORECASE)
    last_ptonly = False

    with open(obj_path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.startswith("o "):
                # Track ptonly blocks
                if "ptonly_" in line:
                    last_ptonly = True
                continue

            name = line[2:].strip()
            is_ptonly = name.startswith("ptonly_") or last_ptonly
            last_ptonly = False

            # Extract NIF hash from group name
            match = hash_pattern.search(name)
            nif_hash = match.group(1) if match else None

            groups.append((name, nif_hash, is_ptonly))

    return groups


def find_available_textures(textures_dir):
    """Find all available PNG textures and map them by base name.

    Returns {base_name_without_extension: relative_path_from_textures_dir}
    """
    available = {}
    if not textures_dir.is_dir():
        return available

    for root, _dirs, files in os.walk(textures_dir):
        for f in files:
            if not f.lower().endswith(".png"):
                continue
            full_path = Path(root) / f
            rel_path = full_path.relative_to(textures_dir)
            base = f.removesuffix(".png").lower()
            available[base] = str(rel_path).replace("\\", "/")

    return available


def build_texture_map(model_to_textures, texture_to_models, groups, available_pngs):
    """Cross-reference and build TEXTURE_MAP entries.

    For each OBJ group with a NIF hash:
      1. Look up texture candidates from texture links
      2. Check if any candidate PNG exists in available_pngs
      3. If yes, create a TEXTURE_MAP entry

    Returns list of {pattern, url} entries for world.js.
    """
    matched_hashes = set()
    hash_to_texture = {}  # nif_hash -> texture_url

    for _name, nif_hash, is_ptonly in groups:
        if not nif_hash or is_ptonly:
            continue

        # Look up texture candidates for this NIF hash
        candidates = model_to_textures.get(nif_hash, set())
        if not candidates:
            continue

        # Check which candidates have available PNGs
        for candidate in candidates:
            if candidate in available_pngs:
                url = f"textures/converted/{available_pngs[candidate]}"
                hash_to_texture[nif_hash] = url
                matched_hashes.add(nif_hash)
                break  # Use first matching texture per group

    # Build TEXTURE_MAP entries: one per unique texture URL, with hash patterns
    url_to_hashes = defaultdict(list)
    for nif_hash, url in hash_to_texture.items():
        url_to_hashes[url].append(nif_hash)

    entries = []
    for url, hashes in sorted(url_to_hashes.items()):
        for h in sorted(hashes):
            entries.append({"pattern": h, "url": url})

    return entries, matched_hashes, hash_to_texture


def generate_report(entries, groups, matched_hashes, hash_to_texture, available_pngs, model_to_textures):
    """Print a human-readable report of the texture mapping results."""
    faced_groups = [g for g in groups if not g[2] and g[1]]
    total_faced = len(faced_groups)
    matched_count = sum(1 for g in faced_groups if g[1] in matched_hashes)

    print(f"OBJ groups (faced): {total_faced}")
    print(f"Groups with texture matches: {matched_count}")
    print(f"Groups without textures: {total_faced - matched_count}")
    print(f"Unique textures mapped: {len(hash_to_texture)}")
    print(f"Available PNGs total: {len(available_pngs)}")
    print()

    if entries:
        print(f"Generated {len(entries)} TEXTURE_MAP entries:")
        for entry in entries[:15]:
            print(f"  {{ pattern: '{entry['pattern']}', url: 'textures/converted/{entry['url'].split('/', 2)[-1]}' }}")
        if len(entries) > 15:
            print(f"  ... and {len(entries) - 15} more")
    else:
        print("NO TEXTURE MATCHES FOUND.")
        print()
        print("Sample texture candidates from links (top 15 by frequency):")
        # Count candidates
        from collections import Counter

        candidate_counts = Counter()
        for g in faced_groups:
            if g[1] in model_to_textures:
                for c in model_to_textures[g[1]]:
                    candidate_counts[c] += 1

        for candidate, count in candidate_counts.most_common(15):
            has_png = "AVAILABLE" if candidate in available_pngs else "missing"
            print(f"  {candidate:50s} ({count:4d} groups) [{has_png}]")

    print()
    print("Available named textures (non-hash):")
    named = {k: v for k, v in sorted(available_pngs.items()) if "000000_" not in k and "000001_" not in k}
    for name, path in list(named.items())[:10]:
        print(f"  {name:50s} -> {path}")
    if len(named) > 10:
        print(f"  ... and {len(named) - 10} more")


def generate_js_map(entries, output_path):
    """Write the TEXTURE_MAP as a JavaScript module fragment."""
    if not entries:
        print("\nNo entries to write.")
        return

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("// Auto-generated by build_texture_map.py — NIF hash to PNG texture mapping.\n")
        f.write(f"// {len(entries)} entries mapping OBJ group NIF hashes to converted PNG textures.\n")
        f.write("const TEXTURE_MAP = [\n")
        for entry in entries:
            f.write(f'  {{ pattern: "{entry["pattern"]}", url: "{entry["url"]}" }},\n')
        f.write("];\n")

    print(f"\nTEXTURE_MAP written to {output_path}")


def main():
    print("=== Cross-Referencing NIF Textures -> OBJ Groups -> PNGs ===\n")

    # 1. Parse texture links
    jsonl_path = ASSETS_DIR / "nif-texture-links.jsonl"
    if not jsonl_path.exists():
        print(f"Error: texture links not found at {jsonl_path}")
        sys.exit(1)

    print(f"Parsing texture links from {jsonl_path}...")
    model_to_textures, texture_to_models = parse_texture_links(jsonl_path)
    print(f"  {len(model_to_textures)} NIF models mapped to textures")
    print(f"  {len(texture_to_models)} unique texture filenames")
    print()

    # 2. Parse OBJ groups
    print(f"Parsing OBJ groups from {MERGED_OBJ}...")
    groups = parse_obj_groups(MERGED_OBJ)
    faced = [g for g in groups if not g[2]]
    ptonly = [g for g in groups if g[2]]
    print(f"  {len(groups)} total groups ({len(faced)} faced, {len(ptonly)} ptonly)")
    print()

    # 3. Find available PNGs
    print(f"Scanning available PNGs in {TEXTURES_DIR}...")
    available_pngs = find_available_textures(TEXTURES_DIR)
    print(f"  {len(available_pngs)} PNG textures available")
    print()

    # 4. Build mapping
    entries, matched_hashes, hash_to_texture = build_texture_map(
        model_to_textures, texture_to_models, groups, available_pngs
    )

    # 5. Report
    generate_report(entries, groups, matched_hashes, hash_to_texture, available_pngs, model_to_textures)

    # 6. Write JS output
    generate_js_map(entries, SCRIPT_DIR / "js" / "texture_map.js")


if __name__ == "__main__":
    main()
