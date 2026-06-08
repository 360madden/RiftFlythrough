#!/usr/bin/env python3
"""
Generate a formatted changelog entry from git history.

Reads commits since the most recent tag (or all commits if no tags)
and produces a Markdown changelog section suitable for CHANGELOG.md.

Usage:
    python changelog.py                    # print to stdout
    python changelog.py --since v1.0.0     # start from specific tag
    python changelog.py --version 2.0.0    # include version header
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent

CATEGORIES = {
    "feat": "Added",
    "fix": "Fixed",
    "perf": "Improved",
    "refactor": "Changed",
    "chore": "Changed",
    "docs": "Changed",
    "test": "Changed",
}


def git_log(since: str | None = None) -> list[dict]:
    """Return list of commit dicts with hash, date, message, author."""
    cmd = [
        "git",
        "log",
        "--format=%H%n%ai%n%an%n%s%n---",
    ]
    if since:
        cmd.append(f"{since}..HEAD")
    # Without --since, default to current branch history (no --all)

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_DIR))
    if result.returncode != 0:
        print(f"git log failed: {result.stderr}", file=sys.stderr)
        return []

    commits = []
    for block in result.stdout.strip().split("\n---\n"):
        lines = block.strip().split("\n")
        if len(lines) >= 4:
            commits.append(
                {
                    "hash": lines[0][:8],
                    "date": lines[1][:10],
                    "author": lines[2],
                    "message": lines[3],
                }
            )
    return commits


def categorize(commits: list[dict]) -> dict[str, list[dict]]:
    """Group commits by conventional commit prefix."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for c in commits:
        match = re.match(r"^(\w+)(?:\(.*?\))?:\s*(.*)", c["message"])
        if match:
            prefix = match.group(1).lower()
            desc = match.group(2)
            category = CATEGORIES.get(prefix, "Changed")
        else:
            desc = c["message"]
            category = "Changed"
        c["desc"] = desc
        groups[category].append(c)
    return dict(groups)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a changelog from git history.")
    parser.add_argument("--since", help="Starting tag or commit (e.g., v1.0.0)")
    parser.add_argument("--version", help="Version header (e.g., 2.0.0)")
    args = parser.parse_args()

    commits = git_log(since=args.since)

    if not commits:
        print("No commits found.", file=sys.stderr)
        return 0

    groups = categorize(commits)

    now = datetime.now().strftime("%Y-%m-%d")
    if args.version:
        print(f"## [{args.version}] — {now}")
    else:
        print(f"## [Unreleased] — {now}")
    print()

    for category in ["Added", "Fixed", "Improved", "Changed"]:
        items = groups.get(category, [])
        if not items:
            continue
        print(f"### {category}")
        for c in items:
            print(f"- {c['desc']} ({c['hash']})")
        print()

    total = sum(len(v) for v in groups.values())
    print(f"_({total} commits)_")

    return 0


if __name__ == "__main__":
    sys.exit(main())
