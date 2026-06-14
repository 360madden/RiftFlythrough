# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest completed implementation commit:** `955cc59 ci: add texture-off browser smoke`
**Current implementation slice:** Persisted-settings browser-smoke startup probes — complete

## Current State
- Latest implementation commit is `955cc59`; the handoff may be on a later docs-only commit.
- GitHub Actions CI run `27498634396` is green across Python, JavaScript, HTML, and browser-smoke jobs.
- Phase 32 — Feature expansion backlog is in progress. Latest completed slice: reusable persisted-settings startup smoke coverage for `textureQuality=off`.
- Browser-smoke CI now runs both the full strict texture fixture smoke and a fast texture-off startup smoke.

## Work Completed In This Slice
1. Added reusable persisted-settings smoke support to `check_browser_smoke.py`.
   - New `--settings-json` option preloads the `rift-flythrough-settings` localStorage value through Playwright `storage_state` before `flythrough.html` runs.
   - New `--expect-texture-status` option asserts the final `Texture maps` stat text.
   - New `--forbid-generated-texture-requests` option fails if the page requests generated textures under `textures/converted/`.
   - New `--skip-sidebar-smoke` option supports fast startup-mode probes while the default smoke still exercises sidebar controls and overlays.
2. Added regression coverage in `tests/test_check_browser_smoke.py`.
   - Covers settings JSON parsing, invalid JSON/non-object errors, and Playwright storage-state construction.
3. Hardened GitHub Actions CI.
   - Browser-smoke job now runs the existing full smoke plus a fast startup smoke:
     `python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke`
   - This makes the previous ad-hoc `textureQuality=off` browser probe permanent CI coverage.
4. Updated README and `knowledge.md` with the new smoke command and browser-smoke gotcha notes.

## Validation Run
Use CMD/Python where practical.

```cmd
git diff --check
python -m ruff format check_browser_smoke.py tests/test_check_browser_smoke.py
python -m ruff check check_browser_smoke.py tests/test_check_browser_smoke.py
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
pytest tests/test_check_browser_smoke.py -q
pytest tests/ -q
python check_js.py
python check_html.py
python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke
python check.py --browser
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --artifacts-dir artifacts/browser-smoke
pre-commit run --all-files
```

Results from local validation:
- `git diff --check`: PASS.
- `python -m ruff format check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS after formatting `check_browser_smoke.py`; final rerun left files unchanged.
- `python -m ruff check check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS after changing the non-object settings JSON exception to `TypeError`.
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py`: PASS.
- `pytest tests/test_check_browser_smoke.py -q`: PASS, `8 passed`.
- `pytest tests/ -q`: PASS, `48 passed`.
- `python check_js.py`: PASS, all `31/31` JS modules passed syntax/import/regression checks.
- `python check_html.py`: PASS.
- `python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke`: PASS with `textures=off`, no generated texture requests, `groups=350`, and `faces=30,864`.
- `python check.py --browser`: PASS, all `7/7` checks passed; default browser smoke passed with timing telemetry.
- `python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --artifacts-dir artifacts/browser-smoke`: PASS with texture fixture and timing telemetry.
- `pre-commit run --all-files`: PASS.
- GitHub Actions CI run `27498634396`: PASS across `python`, `javascript`, `html`, and `browser-smoke`; browser-smoke job includes the new texture-off startup step.

## Important Notes
- Context7 Playwright Python docs were consulted before adding `storage_state` localStorage preloading and `page.on("request")` request tracking.
- The default browser smoke still exercises sidebar controls and settings/help/catalog overlays; `--skip-sidebar-smoke` is intended for focused startup probes only.
- `--texture-fixture` and `--forbid-generated-texture-requests` are intentionally incompatible because the fixture mode fetches a generated texture URL by design.
- `textureQuality=off` startup behavior is now protected in CI without touching generated/runtime texture assets.
- Browser-smoke CI locator/input starvation remains a known risk from prior runs; keep the in-page `MouseEvent("click")` sidebar smoke trigger path unless new evidence proves Playwright locator input is stable under render load.
- Current `merged.obj` still loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Keep browser-smoke CI green while continuing Phase 32 feature expansion.
2. Visually inspect LOD transitions and texture quality modes in a real browser session.
3. Consider making texture quality changes live for already-loaded textures if users expect no reload.
4. Collect more CI browser-smoke timing baselines before setting performance thresholds.
5. Confirm roughness/spec/gloss map semantics before adding more material-map support.
6. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
7. Add a short architecture note for module load order, settings application order, pointer-lock overlay behavior, and smoke-test startup probes.
8. Retire or refresh stale top-level `HANDOFF.md` if `SESSION_HANDOFF.md` is now authoritative.
9. Add more persisted-settings smoke probes only for settings that have startup-only behavior.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
