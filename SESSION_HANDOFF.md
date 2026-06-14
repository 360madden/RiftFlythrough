# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `f550aca ci: update github actions versions`
**Current implementation slice:** Texture role classifier extraction and JS regression coverage

## Current State
- `origin/master` is current through `f550aca`; this working tree contains a focused texture-classifier testability slice and this handoff update.
- Current roadmap in `knowledge.md`: Phase 27 is complete; next phase is **28 — Feature expansion backlog**.
- Prior CI is green on `f550aca` after browser smoke and GitHub Actions version updates.

## Work Completed In This Slice
1. Extracted texture role classification from `js/world.js` into `js/texture_roles.js`.
   - Pure helpers now cover texture filename normalization, color-map preference, normal-map detection, utility-map filtering, and color/normal set selection.
   - `world.js` imports only `chooseTextureSet`, preserving existing runtime behavior while removing private untestable classifier code.
   - Added defensive handling for empty or non-array URL lists: returns `{ color: null, normal: null }`.
2. Added JS regression coverage for texture role classification.
   - Added `tests/texture_roles.test.mjs` using Node's built-in `assert` module.
   - Covers diffuse/albedo/_c/-d color maps, normal/_n/normalgl maps, spec/gloss/rough/metal/environment utility maps, fallback color selection, utility-only texture sets, and empty/null inputs.
3. Strengthened JS validation wiring.
   - `check_js.py` now runs JS syntax checks, local import/export integrity checks, and `*.test.mjs` regression tests.
   - GitHub Actions `javascript` job now runs `python check_js.py` under Python + Node instead of only `node --check js/*.js`.
4. Updated docs/current truth.
   - JS module count is now `29`.
   - `README.md` and `knowledge.md` document `texture_roles.js` and the stronger `python check_js.py` behavior.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
python check.py --browser
pre-commit run --all-files
```

Results from local validation:
- `python check_js.py`: PASS, `29/29` JS modules plus `texture_roles.test.mjs` regression test passed.
- `python check.py --browser`: PASS, all `7/7` checks passed.
- Pytest: `40 passed`.
- Targeted coverage: `92.04%`, above the `70%` gate.
- OBJ validation: valid, `350` groups, `23,421` vertices, `30,864` faces.
- HTML validation: passed.
- Browser smoke: passed with `groups=350`, `faces=30,864`.
- `pre-commit run --all-files`: passed.

## Important Notes
- Three.js is pinned to `0.170.0` via importmap.
- This slice did not change Three.js APIs or generated/runtime assets.
- `texture_roles.js` is intentionally pure and dependency-free so Node regression tests can execute it without CDN/importmap or browser setup.
- `check_js.py` now depends on Node for both syntax checks and `*.test.mjs` execution; CI sets up Node 22 for that job.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Commit and push this texture-classifier hardening slice, then verify GitHub Actions.
2. Add a small tracked texture fixture path or smoke-test fixture mode for `--strict-textures`.
3. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
4. Move the large inline sidebar script from `flythrough.html` into `js/ui.js` or a dedicated sidebar module.
5. Add README screenshots/GIFs for LOD, texture rendering, and browser smoke validation expectations.
6. Add CI concurrency/cancel-in-progress if workflow noise becomes a problem.
7. Add browser smoke assertions for key UI panels opening without console errors.
8. Add performance thresholds to smoke output once baseline timing is stable.
9. Confirm roughness/spec/gloss map semantics before adding more material map support.
10. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
