# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Latest base commit:** `8588e2a test: cover settings sidebar actions`
**Current implementation slice:** CI concurrency hardening

## Current State
- `origin/master` is current through `8588e2a`; this working tree contains a focused GitHub Actions concurrency slice and this handoff update.
- Current roadmap in `knowledge.md`: Phase 31 is complete; next phase is **32 — Feature expansion backlog**.
- Prior CI is green on `8588e2a` (`27496914159`).

## Work Completed In This Slice
1. Added workflow-level CI concurrency to `.github/workflows/ci.yml`.
   - Uses the current GitHub Actions documented pattern:
     `group: ${{ github.workflow }}-${{ github.ref }}`
   - Sets `cancel-in-progress: true` so superseded CI runs on the same workflow/ref are canceled.
   - Scope includes the workflow name to avoid canceling unrelated workflows if more are added later.
2. Updated docs/current truth.
   - `README.md` notes CI branch-level concurrency.
   - `knowledge.md` documents the CI concurrency behavior in Gotchas.

## Validation Run
Use CMD/Python where practical.

```cmd
git diff --check
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
python check.py --browser
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture
pre-commit run --all-files
```

Results from local validation:
- `git diff --check`: PASS.
- Workflow text assertion for `concurrency`, `github.workflow`, `github.ref`, and `cancel-in-progress: true`: PASS.
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
- Context7 GitHub Actions docs were consulted before adding workflow-level concurrency.
- The concurrency group intentionally includes both `github.workflow` and `github.ref`.
- Browser-smoke CI can now take nearly 3 minutes because it covers sidebar toggles plus catalog/help/settings overlays.
- Current `merged.obj` loads as direct Mesh/Points children in OBJLoader; keep the logical group normalization in `world.js` intact.

## Next Best Actions
1. Run the full validation block, commit, push, and verify GitHub Actions for this CI concurrency slice.
2. Visually inspect LOD transitions and texture quality in a real browser session, not only headless smoke.
3. Add README screenshots/GIFs for LOD, texture rendering, sidebar controls, and browser smoke expectations.
4. Add smoke timing telemetry and only later set performance thresholds from observed baselines.
5. Confirm roughness/spec/gloss map semantics before adding more material map support.
6. Add a user-facing texture quality/performance setting for anisotropy and optional texture loading.
7. Retire or refresh stale top-level `HANDOFF.md` if it is no longer authoritative.
8. Add a short architecture note for module load order and pointer-lock overlay behavior.
9. Consider extracting shared smoke DOM-state helpers if further overlay smoke coverage is added.
10. Consider splitting remaining oversized UI modules only when a concrete bug or test seam justifies it.
