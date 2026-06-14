# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `ace2f8c fix: restore world grouping and add browser smoke`
**Current implementation slice:** CI action-version follow-up after runtime smoke hardening

## Current State
- Local validation is green after this slice.
- `origin/master` is current through `ace2f8c`; this working tree contains a small follow-up workflow action-version update and this handoff update.
- Current roadmap in `knowledge.md`: Phase 26 is complete as a runtime validation/group-normalization slice; next phase is **27 — Feature expansion backlog**.
- Playwright browser smoke now works locally and verifies `flythrough.html` reaches real world stats: `350` groups and `30,864` faces.

## Work Completed In This Slice
1. Fixed runtime world grouping for current `merged.obj`.
   - Browser inspection showed Three.js `OBJLoader` loads the tracked OBJ as `350` direct renderables (`270` Mesh + `80` Points), not Group wrappers.
   - `js/world.js` now normalizes direct Mesh/Points children into logical `THREE.Group` wrappers before coloring, stats, legend, selection, minimap centroids, and LOD setup.
   - Browser smoke now catches zero-group/zero-face regressions.
2. Added browser/runtime smoke validation.
   - Added `check_browser_smoke.py` using Playwright Chromium.
   - Fails on page errors, fatal console errors, critical HTTP resource failures, active crash overlay, missing renderer canvas, or low world stats.
   - Treats generated `textures/converted/` 404s as optional unless `--strict-textures` is passed.
   - Added `python check.py --browser` to run the smoke test with the unified health check.
3. Hardened CI and local validation.
   - Added a `browser-smoke` GitHub Actions job with failure artifacts.
   - Fixed the existing coverage gate: CI now targets tested OBJ utility modules instead of counting every root script as uncovered.
   - Added focused tests; test count is now `40`, targeted coverage is `92%`.
   - `python check.py` now runs the same targeted coverage gate locally.
4. Fixed dev install packaging.
   - `python -m pip install -e ".[dev]"` was failing because Hatchling could not infer wheel contents for this flat-script project.
   - Added explicit Hatchling `only-include` wheel paths for `run.py` and runtime viewer assets.
5. Updated docs/current-truth.
   - Updated `README.md`, `knowledge.md`, `.gitignore`, `pyproject.toml`, and CI workflow notes for browser smoke/dev setup.
6. Updated GitHub Actions major versions after the first pushed CI pass emitted Node.js 20 action deprecation warnings.
   - Verified official action tags before updating.
   - Updated checkout/setup-python/setup-node to `v6` and upload-artifact to `v7`.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m pip install -e ".[dev]"
python -m playwright install chromium
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
python check.py --browser
pre-commit run --all-files
```

Additional HTTP HEAD smoke was run against an in-process static server:

```text
OK flythrough.html HTTP 200 bytes=54463
OK js/world.js HTTP 200 bytes=26802
OK js/texture_map.js HTTP 200 bytes=63373
OK js/main.js HTTP 200 bytes=11409
OK merged.obj HTTP 200 bytes=3412593
```

Results:
- `python check.py --browser`: PASS, all `7/7` checks passed.
- Pytest: `40 passed`.
- Targeted coverage: `92.04%`, above the `70%` gate.
- OBJ validation: valid, `350` groups, `23,421` vertices, `30,864` faces.
- JS syntax/import validation: `28/28` modules passed.
- HTML validation: passed.
- Browser smoke: passed with `groups=350`, `faces=30,864`.
- `pre-commit run --all-files`: passed.
- GitHub Actions for `ace2f8c`: passed all jobs; only Node.js 20 action deprecation annotations were emitted before the follow-up version update.

## Important Notes
- Three.js is pinned to `0.170.0` via importmap.
- Context7 docs were consulted for Playwright Python, GitHub Actions artifact/failure syntax, Three.js OBJ loading/traversal examples, and Hatchling file selection.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; do not reintroduce assumptions that top-level children are `Group` objects.
- Generated `textures/`, `objs/`, test PNGs, backups, `artifacts/`, and `nul` are ignored. Only `merged.obj` is tracked among large runtime assets.
- Playwright is now the reliable local/browser automation path for runtime smoke. The in-app Browser plugin may still be unavailable independently.

## Next Best Actions
1. Commit and push this coherent runtime/CI hardening slice, then monitor GitHub Actions.
2. Add focused unit coverage for texture role classification in `world.js` or extract that classifier into a testable module.
3. Add a small tracked texture fixture path or smoke-test mode for strict texture loading without requiring generated assets.
4. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
5. Move the large inline sidebar script from `flythrough.html` into `js/ui.js` or a dedicated sidebar module.
6. Add README screenshots/GIFs for LOD, texture rendering, and browser smoke validation expectations.
7. Add CI concurrency/cancel-in-progress if workflow noise becomes a problem.
8. Consider roughness/spec/gloss map support only after confirming source material semantics.
9. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
10. Update or retire stale top-level `HANDOFF.md` if it is still part of the workflow.
