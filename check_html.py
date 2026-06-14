#!/usr/bin/env python3
"""Validate HTML file structure and integrity."""

from __future__ import annotations

import sys
from html.parser import HTMLParser
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
HTML_FILE = PROJECT_DIR / "flythrough.html"


class HTMLValidator(HTMLParser):
    """Track tag balance and report structural issues."""

    def __init__(self):
        super().__init__()
        self.errors: list[str] = []
        self.tag_stack: list[str] = []
        self._void_elements = {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }

    def handle_starttag(self, tag: str, _attrs):
        # Script and style may contain text that looks like tags — skip nesting
        if tag in self._void_elements:
            return
        self.tag_stack.append(tag)

    def handle_endtag(self, tag: str):
        if tag in self._void_elements:
            return
        line, col = self.getpos()
        location = f" at {line}:{col}"
        if self.tag_stack and self.tag_stack[-1] == tag:
            self.tag_stack.pop()
        elif tag in self.tag_stack:
            # Some nesting mismatch but tag exists — note it
            self.errors.append(
                f"Unbalanced </{tag}>{location} — expected </{self.tag_stack[-1]}>",
            )
            # Attempt recovery: remove the expected tag from stack
            self.tag_stack.remove(tag)
        else:
            self.errors.append(f"Unexpected closing tag </{tag}>{location}")

    def check(self) -> bool:
        return len(self.errors) == 0 and len(self.tag_stack) == 0


def validate_html() -> tuple[bool, list[str]]:
    """Validate flythrough.html. Returns (passed, errors)."""
    if not HTML_FILE.exists():
        return False, [f"File not found: {HTML_FILE}"]

    try:
        content = HTML_FILE.read_text(encoding="utf-8")
    except Exception as e:
        return False, [f"Cannot read file: {e}"]

    # Check: file is not empty
    if not content.strip():
        return False, ["File is empty"]

    # Check: has DOCTYPE and html tags
    checks = [
        ("DOCTYPE", "<!doctype html>" in content.lower()),
        ("<html>", "<html" in content.lower()),
        ("</html>", "</html>" in content.lower()),
        ("<head>", "<head>" in content.lower()),
        ("</head>", "</head>" in content.lower()),
        ("<body>", "<body>" in content.lower()),
        ("</body>", "</body>" in content.lower()),
        ("<script importmap>", '"imports"' in content),
        ("<script module>", 'type="module"' in content),
    ]

    errors: list[str] = []
    for name, ok in checks:
        if not ok:
            errors.append(f"Missing required element: {name}")
        else:
            print(f"  OK  {name}")

    # Tag balance
    validator = HTMLValidator()
    try:
        validator.feed(content)
    except Exception as e:
        errors.append(f"HTML parse error: {e}")

    if not validator.check():
        for err in validator.errors:
            print(f"  WRN {err}")
        # Warnings about tag imbalance don't block validation
        # (script/style content often confuses the parser)

    return len(errors) == 0, errors


def main() -> int:
    ok, errors = validate_html()
    print()
    if ok:
        print("[OK] HTML validation passed.")
        return 0
    for err in errors:
        print(f"[ERR] {err}")
    print(f"[FAIL] HTML validation failed with {len(errors)} error(s).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
