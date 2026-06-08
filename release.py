#!/usr/bin/env python3
"""
Release pipeline — automates the full release workflow.

Steps:
  1. Run check.py (ruff + pytest + validate_obj)
  2. Generate changelog entry from git history since last tag
  3. Prepend changelog to CHANGELOG.md (or create if missing)
  4. Create git tag
  5. Optionally push tag + commits to origin

Usage:
    python release.py 1.3.0                 # full release
    python release.py 1.3.0 --dry-run       # preview without committing
    python release.py 1.3.0 --skip-push     # don't push to remote
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
CHANGELOG_PATH = PROJECT_DIR / "CHANGELOG.md"


def run(cmd: list[str], label: str, check: bool = True) -> int:
    """Run a command. If *check*, exit on failure."""
    print(f"[{label}] ", end="", flush=True)
    result = subprocess.run(cmd, cwd=str(PROJECT_DIR))
    if check and result.returncode != 0:
        print(f"FAILED (exit {result.returncode})")
        sys.exit(result.returncode)
    if result.returncode == 0:
        print("OK")
    return result.returncode


def get_latest_tag() -> str | None:
    """Return the most recent git tag, or None."""
    result = subprocess.run(
        ["git", "describe", "--tags", "--abbrev=0"],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_DIR),
    )
    if result.returncode == 0:
        return result.stdout.strip()
    return None


def generate_changelog(version: str, since_tag: str | None) -> str:
    """Generate changelog Markdown section."""
    cmd = [sys.executable, "changelog.py", "--version", version]
    if since_tag:
        cmd.extend(["--since", since_tag])
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_DIR))
    if result.returncode != 0:
        print(f"changelog.py failed: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def update_changelog(entry: str) -> None:
    """Prepend *entry* to CHANGELOG.md, creating if missing."""
    if CHANGELOG_PATH.exists():
        existing = CHANGELOG_PATH.read_text(encoding="utf-8")
        # Skip the header line and prepend after it
        lines = existing.split("\n")
        if lines and lines[0].startswith("# "):
            header = lines[0]
            rest = "\n".join(lines[1:]).lstrip("\n")
            new_content = f"{header}\n\n{entry}\n\n{rest}"
        else:
            new_content = f"# Changelog\n\n{entry}\n\n{existing}"
    else:
        new_content = f"# Changelog\n\n{entry}\n"

    CHANGELOG_PATH.write_text(new_content.strip() + "\n", encoding="utf-8")
    print(f"  Updated {CHANGELOG_PATH}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Release pipeline for RIFT Flythrough.")
    parser.add_argument("version", help="Version tag (e.g., 1.3.0)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without committing")
    parser.add_argument("--skip-push", action="store_true", help="Don't push to remote")
    args = parser.parse_args()

    version = args.version
    tag = f"v{version}"

    print(f"Release: {tag}")
    print()

    # Guard: check for dirty working tree (ignore CHANGELOG.md since we'll update it)
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_DIR),
    )
    if result.returncode == 0:
        dirty = [line for line in result.stdout.strip().split("\n") if line and "CHANGELOG.md" not in line]
        if dirty:
            print("ERROR: Working tree is dirty — commit or stash changes first.", file=sys.stderr)
            for line in dirty[:10]:
                print(f"  {line}", file=sys.stderr)
            if len(dirty) > 10:
                print(f"  ... and {len(dirty) - 10} more", file=sys.stderr)
            return 1

    # Step 1: Health check
    print("── Step 1: Health check ──")
    run([sys.executable, "check.py", "--quick"], "check.py   ")

    # Step 2: Changelog
    print("\n── Step 2: Changelog ──")
    since_tag = get_latest_tag()
    if since_tag:
        print(f"  Since: {since_tag}")
    else:
        print("  No previous tag found — including all commits")
    entry = generate_changelog(version, since_tag)
    print(f"  Generated {len(entry.split(chr(10)))} lines")

    # Guard: don't release if there are no commits
    if "(0 commits)" in entry:
        print("ERROR: No commits since last tag — nothing to release.", file=sys.stderr)
        return 1

    print()

    if args.dry_run:
        print("── DRY RUN — changelog preview ──")
        print(entry)
        print("\n── DRY RUN — would tag as", tag, "──")
        return 0

    # Step 3: Update CHANGELOG.md
    print("── Step 3: Update CHANGELOG.md ──")
    update_changelog(entry)
    run(["git", "add", "CHANGELOG.md"], "git add    ")

    # Step 4: Commit changelog
    commit_msg = f"chore: update changelog for {tag}"
    run(["git", "commit", "-m", commit_msg], "git commit ")

    # Step 5: Tag
    print(f"\n── Step 4: Tag {tag} ──")
    tag_msg = f"Release {tag} — {datetime.now().strftime('%Y-%m-%d')}"
    run(["git", "tag", "-a", tag, "-m", tag_msg], "git tag    ")

    # Step 6: Push
    if not args.skip_push:
        print("\n── Step 5: Push ──")
        run(["git", "push", "origin", "HEAD"], "git push   ")
        run(["git", "push", "origin", tag], "push tag   ")

    print(f"\n[OK] Released {tag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
