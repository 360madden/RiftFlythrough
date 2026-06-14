# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `28ff390 refactor: extract sidebar module`
**Current implementation slice:** Catalog overlay browser smoke coverage

## Current State
- `origin/master` is current through `28ff390`; this working tree contains a focused browser-smoke catalog overlay coverage slice and this handoff update.
- Current roadmap in `knowledge.md`: Phase 30 is complete; next phase is **31 — Feature expansion backlog**.
- Prior CI is green on `28ff390` (`27496465722`).

## Work Completed In This Slice
1. Expanded `check_browser_smoke.py` sidebar coverage to include the catalog action path.
   - Smoke now clicks the visible `#sb-catalog` sidebar action after the safe toggle checks.
   - It waits for `#catalog-overlay` to become active, captures catalog open state, then presses `Escape` to close it.
   - It asserts the overlay opened, rows populated, count text populated, search received focus while open, and the overlay closed after Escape.
2. Reduced duplicate Playwright click handling in the smoke script.
   - Added a small `click_unique()` helper so smoke clicks fail clearly when a selector resolves to zero or multiple elements.
3. Updated docs/current truth.
   - `README.md` and `knowledge.md` now mention catalog-overlay browser smoke coverage.
   - Roadmap advanced to Phase 31 pending.

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

## Important Notes
- Three.js is pinned to `0.170.0` via importmap.
- Context7 Playwright Python docs were consulted before changing smoke click/evaluate/keyboard behavior.
- The catalog focus assertion is captured before pressing Escape; after Escape the overlay is intentionally closed and focus is not treated as stable.
- Browser smoke still hides the pointer-lock start overlay only inside the test page so safe sidebar controls can be clicked deterministically.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Run the full validation block, commit, push, and verify GitHub Actions for this catalog-overlay smoke slice.
2. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
3. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
4. Add CI concurrency/cancel-in-progress if workflow noise becomes a problem.
5. Add browser smoke coverage for settings/help overlay open-close once selector visibility is made deterministic.
6. Add performance thresholds to smoke output once baseline timing is stable.
7. Confirm roughness/spec/gloss map semantics before adding more material map support.
8. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
9. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
