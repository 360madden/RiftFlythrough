# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest completed implementation commit:** `636a47b test: add browser smoke timing telemetry`
**Current implementation slice:** Browser-smoke timing telemetry — complete

## Current State
- `origin/master` is current through `636a47b`; CI run `27497987875` is green across Python, JavaScript, HTML, and browser-smoke jobs.
- Failure evidence from the preceding failed runs: `27497129795` timed out on a hard-coded `Page.wait_for_function` 3000 ms wait; `27497445676` showed every visible sidebar `locator.click()` timing out under CI; `27497585769` showed `locator.wait_for(state="visible")` timing out despite resolving the Settings header as visible.
- The failed browser-smoke artifacts had no console/page/resource errors and showed the viewer loaded with `350` groups / `30,864` faces; the fixed failure was isolated to CI Playwright locator input/waiting under the continuous render loop, not app load, OBJ load, or texture fixture behavior.
- Current roadmap in `knowledge.md`: Phase 31 is complete; next phase is **32 — Feature expansion backlog**.

## Work Completed In This Slice
1. Added browser-smoke phase timing telemetry.
   - Successful runs now print `timings=(browserSetup=..., goto=..., ready=..., settle=..., state=..., textureFixture=..., sidebar=..., total=...)`.
   - Failure artifacts now include a `timingsMs` object when smoke state is available, making future CI slowness evidence-based before setting thresholds.
   - Added unit coverage for stable timing-summary formatting.
2. Updated README/knowledge/current truth to document timing telemetry and preserve the CI locator/input starvation gotcha.

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
- `python -m ruff format check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS, 2 files left unchanged.
- `python -m ruff check check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS.
- `python -m py_compile check_browser_smoke.py`: PASS.
- `pytest tests/test_check_browser_smoke.py -q`: PASS, `6 passed`.
- `python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --artifacts-dir artifacts/browser-smoke`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`, and timing telemetry printed.
- `git diff --check`: PASS.
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py`: PASS.
- `python check.py --browser`: PASS, all `7/7` checks passed; pytest reported `46 passed`, browser smoke printed timing telemetry.
- `pre-commit run --all-files`: PASS.
- Exact CI browser-smoke command with `--artifacts-dir artifacts/browser-smoke`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`.
- Exact strict texture fixture rerun: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`, and timing telemetry printed.
- GitHub Actions CI run `27497987875`: PASS across `python`, `javascript`, `html`, and `browser-smoke`.

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
5. Use the new smoke timing telemetry to collect more CI baselines before setting performance thresholds.
6. Confirm roughness/spec/gloss map semantics before adding more material map support.
7. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
8. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
9. Add a short architecture note for module load order and pointer-lock overlay behavior.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
