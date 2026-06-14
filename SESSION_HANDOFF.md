# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `98eb8e3 ci: cancel superseded workflow runs`
**Current implementation slice:** Browser-smoke CI stabilization

## Current State
- `origin/master` is current through `98eb8e3`; CI run `27497129795` failed only in `browser-smoke`.
- Failure evidence: GitHub Actions `browser-smoke` timed out in sidebar controls on a hard-coded `Page.wait_for_function` 3000 ms wait; Python, JavaScript, and HTML jobs passed.
- Artifact `browser-smoke-report.json` had no console/page/resource errors and showed the viewer loaded with `350` groups / `30,864` faces; failure was isolated to sidebar smoke timing/diagnostics.
- Current roadmap in `knowledge.md`: Phase 31 is complete; next phase is **32 — Feature expansion backlog**.

## Work Completed In This Slice
1. Hardened `check_browser_smoke.py` sidebar waits.
   - Replaced repeated 3000 ms sidebar waits with a named `SIDEBAR_ACTION_TIMEOUT_MS = 10000`.
   - Added phase-specific `wait_for_sidebar_state(...)` failures so future CI artifacts identify the exact overlay/close/action wait that failed.
   - Added `CATALOG_CLOSED_SCRIPT` and now waits for catalog close after Escape instead of relying only on a fixed settle delay.
   - Added `SETTINGS_SECTION_READY_SCRIPT` so Settings & Help action rows are present, visible, and within the viewport after the sidebar section transition before clicking help/settings actions.
   - `click_unique(...)` now reports labeled click failures instead of letting actionability timeouts collapse into a generic sidebar timeout.
2. Documentation/current truth updated in this handoff.

## Validation Run
Use CMD/Python where practical.

```cmd
git diff --check
python -m ruff format check_browser_smoke.py
python -m ruff check check_browser_smoke.py
python -m py_compile check_browser_smoke.py
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
python check.py --browser
pre-commit run --all-files
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --artifacts-dir artifacts/browser-smoke
```

Results from local validation:
- `python -m ruff format check_browser_smoke.py`: PASS, 1 file left unchanged.
- `python -m ruff check check_browser_smoke.py`: PASS.
- `python -m py_compile check_browser_smoke.py`: PASS.
- `python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`.
- `git diff --check`: PASS.
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py`: PASS.
- `python check.py --browser`: PASS, all `7/7` checks passed.
- `pre-commit run --all-files`: PASS.
- Exact CI browser-smoke command with `--artifacts-dir artifacts/browser-smoke`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`.

## Important Notes
- Context7 Playwright Python docs were consulted before changing `page.wait_for_function` timeout handling.
- The failed CI run proves the app itself loaded successfully; the root risk is sidebar smoke flakiness/low observability, not OBJ loading or texture fixture behavior.
- The workflow-level concurrency added in `98eb8e3` remains intact.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Run the full validation block, commit, push, and verify GitHub Actions for this browser-smoke stabilization slice.
2. If CI still fails, inspect the new phase-specific sidebar failure in the uploaded artifact before changing app code.
3. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
4. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
5. Add smoke timing telemetry and only later set performance thresholds from observed baselines.
6. Confirm roughness/spec/gloss map semantics before adding more material map support.
7. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
8. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
9. Add a short architecture note for module load order and pointer-lock overlay behavior.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
