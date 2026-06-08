#!/usr/bin/env python3
"""Validate JavaScript module syntax via Node.js --check."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
JS_DIR = PROJECT_DIR / "js"


def is_valid_js_module(path: Path) -> bool:
    """Run node --check on a JS file. Returns True if syntax is valid."""
    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_DIR),
    )
    return result.returncode == 0


def validate_js_modules() -> tuple[int, int, list[str]]:
    """Validate all JS modules in js/. Returns (passed, total, failures)."""
    js_files = sorted(JS_DIR.glob("*.js"))
    if not js_files:
        print("  No JS files found in js/ directory")
        return 0, 0, []

    passed = 0
    failures: list[str] = []

    for f in js_files:
        if is_valid_js_module(f):
            print(f"  OK  {f.name}")
            passed += 1
        else:
            result = subprocess.run(
                ["node", "--check", str(f)],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_DIR),
            )
            err = result.stderr.strip()
            print(f"  ERR {f.name}")
            if err:
                for line in err.split("\n"):
                    print(f"      {line}")
            failures.append(f.name)

    return passed, len(js_files), failures


def main() -> int:
    passed, total, failures = validate_js_modules()
    print()
    if not total:
        print("[OK] No JS modules to check.")
        return 0
    if not failures:
        print(f"[OK] All {passed}/{total} JS modules passed syntax check.")
        return 0
    print(f"[FAIL] {passed}/{total} JS modules passed — failures: {', '.join(failures)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
