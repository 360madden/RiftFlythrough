"""Regression checks for the GitHub Actions workflow contract."""

from __future__ import annotations

from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
CI_WORKFLOW = PROJECT_DIR / ".github" / "workflows" / "ci.yml"


def workflow_text() -> str:
    return CI_WORKFLOW.read_text(encoding="utf-8")


def test_browser_smoke_ci_keeps_artifacts_for_each_probe() -> None:
    text = workflow_text()

    assert text.count("--save-artifacts") == 3
    assert "--artifacts-dir artifacts/browser-smoke/default" in text
    assert "--artifacts-dir artifacts/browser-smoke/texture-off" in text
    assert "--artifacts-dir artifacts/browser-smoke/startup-settings" in text


def test_browser_smoke_ci_uploads_timing_summary_artifact() -> None:
    text = workflow_text()

    summary_step = text[text.index("- name: Summarize browser smoke timings") :]
    summary_step = summary_step.split("\n\n", maxsplit=1)[0]
    assert "if: ${{ always() }}" in summary_step
    assert "python summarize_timings.py --artifacts-dir artifacts/browser-smoke" in summary_step
    assert "--output artifacts/browser-smoke/timing-baseline.md" in summary_step
    assert "--allow-empty" in summary_step

    upload_step = text[text.index("- name: Upload browser smoke artifacts") :]
    upload_step = upload_step.split("\n", maxsplit=8)
    assert "if: ${{ always() }}" in "\n".join(upload_step)
    assert "uses: actions/upload-artifact@v7" in "\n".join(upload_step)
    assert "name: browser-smoke-artifacts" in "\n".join(upload_step)
    assert "path: artifacts/browser-smoke" in "\n".join(upload_step)
