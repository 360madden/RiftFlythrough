"""Regression checks for the GitHub Actions workflow contract."""

from __future__ import annotations

from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
CI_WORKFLOW = PROJECT_DIR / ".github" / "workflows" / "ci.yml"


def workflow_text() -> str:
    return CI_WORKFLOW.read_text(encoding="utf-8")


def test_browser_smoke_ci_keeps_artifacts_for_each_probe() -> None:
    text = workflow_text()

    assert text.count("--save-artifacts") == 4
    assert "--artifacts-dir artifacts/browser-smoke/default" in text
    assert "--artifacts-dir artifacts/browser-smoke/texture-off" in text
    assert "--artifacts-dir artifacts/browser-smoke/beauty-profile" in text
    assert "--output-dir artifacts/browser-smoke/visual-baselines" in text
    assert "--artifacts-dir artifacts/browser-smoke/startup-settings" in text


def test_browser_smoke_ci_captures_fixed_camera_visual_baselines() -> None:
    text = workflow_text()

    visual_step = text[text.index("- name: Capture Beauty visual baselines") :]
    visual_step = visual_step.split("\n\n", maxsplit=1)[0]
    assert "python capture_visual_baselines.py --timeout 60" in visual_step
    assert "--texture-fixture" in visual_step
    assert "--strict-textures" in visual_step
    assert "--output-dir artifacts/browser-smoke/visual-baselines" in visual_step


def test_python_ci_runs_and_uploads_visual_asset_audit() -> None:
    text = workflow_text()

    audit_step = text[text.index("- name: Visual asset audit") :]
    audit_step = audit_step.split("\n\n", maxsplit=1)[0]
    assert "python audit_visual_assets.py --obj merged.obj" in audit_step
    assert "--texture-map js/texture_map.js" in audit_step
    assert "--output-dir artifacts/visual-audit" in audit_step

    upload_step = text[text.index("- name: Upload visual asset audit") :]
    upload_step = upload_step.split("\n\n", maxsplit=1)[0]
    assert "if: ${{ always() }}" in upload_step
    assert "uses: actions/upload-artifact@v7" in upload_step
    assert "name: visual-asset-audit-artifacts" in upload_step
    assert "path: artifacts/visual-audit" in upload_step


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
