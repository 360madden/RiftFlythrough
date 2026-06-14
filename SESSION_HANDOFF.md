# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `9239ce9 test: harden sidebar smoke trigger path`
**Current implementation slice:** Browser-smoke CI stabilization — complete

## Current State
- `origin/master` is current through `9239ce9`; CI run `27497690778` is green across Python, JavaScript, HTML, and browser-smoke jobs.
- Failure evidence from the preceding failed runs: `27497129795` timed out on a hard-coded `Page.wait_for_function` 3000 ms wait; `27497445676` showed every visible sidebar `locator.click()` timing out under CI; `27497585769` showed `locator.wait_for(state="visible")` timing out despite resolving the Settings header as visible.
- The failed browser-smoke artifacts had no console/page/resource errors and showed the viewer loaded with `350` groups / `30,864` faces; the fixed failure was isolated to CI Playwright locator input/waiting under the continuous render loop, not app load, OBJ load, or texture fixture behavior.
- Current roadmap in `knowledge.md`: Phase 31 is complete; next phase is **32 — Feature expansion backlog**.

## Work Completed In This Slice
1. Hardened `check_browser_smoke.py` sidebar waits.
   - Replaced repeated 3000 ms sidebar waits with a named `SIDEBAR_ACTION_TIMEOUT_MS = 10000`.
   - Added phase-specific `wait_for_sidebar_state(...)` failures so future CI artifacts identify the exact overlay/close/action wait that failed.
   - Added `CATALOG_CLOSED_SCRIPT` and now waits for catalog close after Escape instead of relying only on a fixed settle delay.
   - Added `SETTINGS_SECTION_READY_SCRIPT` so Settings & Help action rows are present, visible, and within the viewport after the sidebar section transition before clicking help/settings actions.
   - `click_unique(...)` now reports labeled trigger failures instead of letting actionability timeouts collapse into a generic sidebar timeout.
   - Sidebar smoke now performs a single in-page selector-count/visibility check and dispatches `MouseEvent("click")` from `page.evaluate(...)`; this keeps event-listener coverage while avoiding CI-only Playwright locator input/wait starvation from the continuous Three.js render loop.
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
- GitHub Actions CI run `27497690778`: PASS across `python`, `javascript`, `html`, and `browser-smoke`.

## Important Notes
- Context7 Playwright Python docs were consulted before changing `page.wait_for_function` timeout handling and before evaluating Playwright click-dispatch alternatives.
- The failed CI runs prove the app itself loaded successfully; the root risk is CI-only Playwright locator/input starvation under render load, not OBJ loading or texture fixture behavior.
- The workflow-level concurrency added in `98eb8e3` remains intact.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Keep browser-smoke CI green while starting Phase 32 feature expansion work.
2. If CI still fails, inspect the new phase-specific sidebar failure in the uploaded artifact before changing app code; do not revert to raw `locator.click()`/`locator.wait_for()` for sidebar smoke without evidence the CI locator starvation is gone.
3. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
4. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
5. Add smoke timing telemetry and only later set performance thresholds from observed baselines.
6. Confirm roughness/spec/gloss map semantics before adding more material map support.
7. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
8. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
9. Add a short architecture note for module load order and pointer-lock overlay behavior.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
