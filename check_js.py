#!/usr/bin/env python3
"""Validate JavaScript module syntax and local import integrity."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
JS_DIR = PROJECT_DIR / "js"

STATIC_FROM_RE = re.compile(
    r"import\s+(?P<clause>[^;]*?)\s+from\s+[\"'](?P<spec>\.{1,2}/[^\"']+)[\"']\s*;",
)
STATIC_BARE_RE = re.compile(r"import\s+[\"'](?P<spec>\.{1,2}/[^\"']+)[\"']\s*;")
DYNAMIC_IMPORT_RE = re.compile(r"import\(\s*[\"'](?P<spec>\.{1,2}/[^\"']+)[\"']\s*\)")
EXPORT_RE = re.compile(
    r"export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)",
)
EXPORT_LIST_RE = re.compile(r"export\s+\{(?P<names>[\s\S]*?)\}\s*;")


def is_valid_js_module(path: Path) -> bool:
    """Run node --check on a JS file. Returns True if syntax is valid."""
    result = subprocess.run(
        ["node", "--check", str(path)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_DIR),
    )
    return result.returncode == 0


def resolve_relative_import(source: Path, specifier: str) -> Path:
    """Resolve a relative import specifier from a source module."""
    target = (source.parent / specifier).resolve()
    if target.suffix:
        return target
    return target.with_suffix(".js")


def exported_names(path: Path) -> set[str]:
    """Return simple named exports from a JavaScript module."""
    text = path.read_text(encoding="utf-8")
    names = {match.group("name") for match in EXPORT_RE.finditer(text)}

    for match in EXPORT_LIST_RE.finditer(text):
        for item in match.group("names").split(","):
            part = item.strip()
            if not part:
                continue
            if " as " in part:
                names.add(part.rsplit(" as ", 1)[1].strip())
            else:
                names.add(part)

    return names


def imported_names(clause: str) -> list[str]:
    """Extract named imports from an import clause."""
    match = re.search(r"\{(?P<names>[\s\S]*?)\}", clause)
    if not match:
        return []

    names = []
    for item in match.group("names").split(","):
        part = item.strip()
        if not part:
            continue
        if " as " in part:
            part = part.split(" as ", 1)[0].strip()
        names.append(part)
    return names


def validate_local_imports(js_files: list[Path]) -> list[str]:
    """Validate relative import targets and simple named exports."""
    failures: list[str] = []
    export_cache: dict[Path, set[str]] = {}

    for source in js_files:
        text = source.read_text(encoding="utf-8")

        for match in STATIC_FROM_RE.finditer(text):
            target = resolve_relative_import(source, match.group("spec"))
            if not target.exists():
                failures.append(f"{source.name}: missing import target {match.group('spec')}")
                continue

            names = imported_names(match.group("clause"))
            if names:
                export_cache.setdefault(target, exported_names(target))
                for name in names:
                    if name not in export_cache[target]:
                        failures.append(
                            f"{source.name}: {match.group('spec')} does not export {name}",
                        )

        for match in STATIC_BARE_RE.finditer(text):
            target = resolve_relative_import(source, match.group("spec"))
            if not target.exists():
                failures.append(f"{source.name}: missing import target {match.group('spec')}")

        for match in DYNAMIC_IMPORT_RE.finditer(text):
            target = resolve_relative_import(source, match.group("spec"))
            if not target.exists():
                failures.append(f"{source.name}: missing dynamic import target {match.group('spec')}")

    return failures


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

    import_failures = validate_local_imports(js_files)
    for failure in import_failures:
        print(f"  ERR {failure}")

    return passed, len(js_files), [*failures, *import_failures]


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
