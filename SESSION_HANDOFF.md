# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `e53ec64 test: add strict texture smoke fixture`
**Current implementation slice:** Sidebar module extraction and smoke coverage

## Current State
- `origin/master` is current through `e53ec64`; this working tree contains a focused sidebar-module extraction/smoke slice and this handoff update.
- Current roadmap in `knowledge.md`: Phase 29 is complete; next phase is **30 — Feature expansion backlog**.
- Prior CI is green on `e53ec64` (`27496066240`).

## Work Completed In This Slice
1. Moved the large classic inline sidebar script out of `flythrough.html` into `js/sidebar.js`.
   - `flythrough.html` now loads `js/sidebar.js` as a module after `js/main.js`.
   - Sidebar dynamic imports now resolve relative to the `js/` directory instead of depending on an inline document script context.
   - The module keeps the existing sidebar collapse, section persistence, toggles, action buttons, and `window.updateSidebarDot` bridge.
2. Hardened sidebar behavior while preserving the existing UI contract.
   - Missing sidebar elements are handled as no-ops instead of aborting all sidebar setup.
   - Wireframe application now checks material availability and `wireframe` support before assigning.
   - Keyboard/sidebar dot sync now persists `1` for enabled and `0` for disabled, matching the click-toggle storage convention.
3. Extended Playwright browser smoke coverage for safe sidebar controls.
   - Browser smoke now hides the pointer-lock start overlay only inside the smoke context, then clicks safe sidebar toggles for labels, grid, and performance overlay.
   - Smoke asserts dot state, persisted sidebar values, grid setting persistence, perf panel visibility, and `window.updateSidebarDot` exposure.
   - Sidebar click timeouts are reported as sidebar smoke failures instead of misleading readiness failures.
   - Existing strict generated-texture fixture smoke remains supported.
4. Updated docs/current truth.
   - `README.md` and `knowledge.md` now mention sidebar-control browser smoke coverage.
   - Roadmap advanced to Phase 30 pending.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
python check.py --browser
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture
pre-commit run --all-files
```

Results from local validation:
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py`: PASS.
- `python check.py --browser`: PASS, all `7/7` checks passed.
- `python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture`: PASS with `groups=350`, `faces=30,864`, `optional_texture_404s=0`.
- `pre-commit run --all-files`: PASS.
- Pytest: `45 passed`.
- Targeted coverage: `92.04%`, above the `70%` gate.
- OBJ validation: valid, `350` groups, `23,421` vertices, `30,864` faces.
- JS syntax/import/regression validation: `30/30` modules plus `texture_roles.test.mjs` passed.
- HTML validation: passed.
- In-app browser verification loaded `flythrough.html?sidebar-module=1`, fetched `js/sidebar.js`, and rendered stats `groups=350`, `faces=30,864`; direct sidebar clicks remain covered by Playwright smoke because the in-app browser evaluation surface is read-only and cannot hide the pointer-lock start overlay.

## Important Notes
- Three.js is pinned to `0.170.0` via importmap.
- Context7 Playwright Python docs were consulted before changing smoke click/evaluate behavior.
- The start overlay intentionally remains visible in normal browser sessions until pointer lock succeeds; browser smoke hides it only inside the test page so safe sidebar controls can be clicked deterministically.
- `check_browser_smoke.py` now exercises sidebar controls by default, so CI browser-smoke covers this extraction.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Run the full validation block, commit, push, and verify GitHub Actions for this sidebar-module slice.
2. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
3. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
4. Add CI concurrency/cancel-in-progress if workflow noise becomes a problem.
5. Expand browser smoke to cover one overlay action, such as settings/help open and close, without triggering downloads.
6. Add performance thresholds to smoke output once baseline timing is stable.
7. Confirm roughness/spec/gloss map semantics before adding more material map support.
8. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
9. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
