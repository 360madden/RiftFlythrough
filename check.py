#!/usr/bin/env python3
"""
Unified project health check — run this before pushing.

Runs: ruff lint → ruff format check → pytest → validate_obj

Usage:
    python check.py            # full check
    python check.py --quick    # skip OBJ validation (faster)
    python check.py --fix      # auto-fix lint before checking
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent


def run(cmd: list[str], label: str, cwd: str | Path | None = None) -> bool:
    """Run a command and return True if it passed (exit code 0)."""
    print(f"[{label}] ", end="", flush=True)
    result = subprocess.run(cmd, cwd=str(cwd) if cwd else None)
    passed = result.returncode == 0
    status = "PASS" if passed else "FAIL"
    print(f"{status}")
    return passed


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Unified project health check.")
    parser.add_argument("--quick", action="store_true", help="Skip OBJ validation")
    parser.add_argument("--fix", action="store_true", help="Auto-fix lint before checking")
    args = parser.parse_args()

    all_pass = True
    steps = 0
    passed_steps = 0

    if args.fix:
        steps += 1
        if run(
            [sys.executable, "-m", "ruff", "check", "--fix", "."],
            "ruff fix    ",
            PROJECT_DIR,
        ):
            passed_steps += 1
        else:
            all_pass = False

    steps += 1
    if run(
        [sys.executable, "-m", "ruff", "check", "."],
        "ruff check  ",
        PROJECT_DIR,
    ):
        passed_steps += 1
    else:
        all_pass = False

    steps += 1
    if run(
        [sys.executable, "-m", "ruff", "format", "--check", "."],
        "ruff format ",
        PROJECT_DIR,
    ):
        passed_steps += 1
    else:
        all_pass = False

    steps += 1
    if run(
        [sys.executable, "-m", "pytest", "tests/", "-q"],
        "pytest      ",
        PROJECT_DIR,
    ):
        passed_steps += 1
    else:
        all_pass = False

    if not args.quick:
        steps += 1
        if run(
            [sys.executable, "validate_obj.py", "--obj", "merged.obj"],
            "validate_obj",
            PROJECT_DIR,
        ):
            passed_steps += 1
        else:
            all_pass = False

    print()
    if all_pass:
        print(f"[OK] All {passed_steps}/{steps} checks passed.")
        return 0
    else:
        print(f"[FAIL] {passed_steps}/{steps} checks passed — see above for details.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
