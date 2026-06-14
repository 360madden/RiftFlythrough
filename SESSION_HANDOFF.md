# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest completed implementation commit:** `b7fee5d ci: retain browser smoke visual artifacts`
**Current implementation slice:** Browser-smoke visual artifact retention — complete

## Current State
- Latest implementation commit is `b7fee5d` on `master` and has been pushed to `origin/master`.
- GitHub Actions CI run `27499299603` is green across Python, JavaScript, HTML, and browser-smoke jobs.
- Phase 32 — Feature expansion backlog is in progress. Latest completed slice: browser-smoke now retains a JSON report plus viewport screenshot on successful strict texture fixture runs.
- Browser-smoke CI still covers both the strict generated-texture fixture path with live texture-quality UI exercise and the fast `textureQuality=off` startup path.

## Work Completed In This Slice
1. Added optional success artifact capture to `check_browser_smoke.py`.
   - New `--save-artifacts` flag writes `browser-smoke-report.json` and `browser-smoke.png` even when the smoke test passes.
   - Failure artifact behavior remains intact and still captures full-page screenshots.
   - Success artifact capture uses a viewport screenshot to keep the artifact small and focused on the visible viewer state.
   - Artifact directory/report/screenshot write failures are reported when `--save-artifacts` is explicitly requested.
2. Hardened CI browser-smoke artifact retention.
   - The strict texture fixture smoke now runs with `--save-artifacts`.
   - The upload-artifact step now runs with `always()`, uploads `artifacts/browser-smoke`, ignores missing files, and keeps artifacts for 7 days.
3. Added focused parser coverage.
   - `tests/test_check_browser_smoke.py` now verifies the new `--save-artifacts` CLI flag.
4. Updated docs/current knowledge.
   - README and `knowledge.md` now document the stricter smoke command and success artifact behavior.

## Validation Run
Use CMD/Python where practical.

```cmd
git diff --check
python -m ruff format check_browser_smoke.py tests/test_check_browser_smoke.py
python -m ruff check check_browser_smoke.py tests/test_check_browser_smoke.py
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
pytest tests/ -q
python check_js.py
python check_html.py
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts --artifacts-dir artifacts/browser-smoke
python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke
python check.py --browser
pre-commit run --all-files
```

Results from local validation:
- `git diff --check`: PASS.
- `python -m ruff format check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS, files already formatted on final run.
- `python -m ruff check check_browser_smoke.py tests/test_check_browser_smoke.py`: PASS.
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py`: PASS.
- `pytest tests/ -q`: PASS, `49 passed`.
- `python check_js.py`: PASS, all `31/31` JS modules passed syntax/import/regression checks.
- `python check_html.py`: PASS.
- `python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts --artifacts-dir artifacts/browser-smoke`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`, live texture-quality sidebar coverage, and success artifacts written.
- Local success artifacts verified under `artifacts/browser-smoke`: `browser-smoke-report.json` and `browser-smoke.png`.
- Visual artifact inspection: the retained screenshot rendered the viewer with sidebar controls, minimap, legend, and world geometry visible.
- `python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke`: PASS with `textures=off`, no generated texture requests, `groups=350`, and `faces=30,864`.
- `python check.py --browser`: PASS, all `7/7` checks passed; browser smoke passed with timing telemetry.
- `pre-commit run --all-files`: PASS.
- GitHub Actions CI run `27499299603`: PASS across `python`, `javascript`, `html`, and `browser-smoke`; browser-smoke includes upload of retained success artifacts.

## Important Notes
- Context7 Playwright Python docs were consulted before using `page.screenshot(path=..., full_page=...)` for success artifact capture.
- Context7 `actions/upload-artifact` docs were consulted before switching the artifact upload step to always run with `if-no-files-found: ignore` and `retention-days: 7`.
- `artifacts/` remains ignored by git; local smoke screenshots/reports are runtime outputs only.
- The strict texture fixture smoke is now the best command for CI-grade behavior plus visual evidence: `python check_browser_smoke.py --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts`.
- Current `merged.obj` still loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.
- Generated/runtime assets remain untouched.

## Next Best Actions
1. Review the uploaded CI `browser-smoke-artifacts` screenshot after future visible UI/rendering changes.
2. Perform a human visual pass comparing Off/Low/Medium/High texture modes with real texture assets available.
3. Keep browser-smoke CI green while continuing Phase 32 feature expansion.
4. Add material-map support only after confirming roughness/spec/gloss semantics for the source assets.
5. Capture curated README screenshots/GIFs once visual modes are stable.
6. Collect more CI browser-smoke timing baselines before adding performance thresholds.
7. Add a small architecture note for module load order, settings application order, pointer-lock overlay behavior, and smoke-test startup probes.
8. Consider targeted JS regression coverage for `applyTextureQuality()` if `world.js` can be safely unit-isolated.
9. Retire or refresh stale top-level `HANDOFF.md` if `SESSION_HANDOFF.md` is now authoritative.
10. Split oversized UI/world modules only when a concrete bug, feature seam, or testability need justifies it.
