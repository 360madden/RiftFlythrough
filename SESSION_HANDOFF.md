# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Current slice:** Beauty trust filters + valid texture fixture - committed/pushed, CI green

## Current State
- Latest completed/pushed commits for this slice: `8d0a6ad feat: filter low fidelity beauty geometry` and `ccdb203 test: validate texture fixture png`.
- GitHub Actions CI run `27510854538` is green across `python`, `javascript`, `html`, and `browser-smoke` for `ccdb203`. Previous baseline run `27509711391` is also green for `97a6adc`.
- The user's screenshot critique is correct: the viewer foundation is improving, but the current asset set is not yet a recognizable RIFT environment.
- Current asset truth remains the main blocker:
  - `merged.obj`: `350` groups, `270` faced groups, `80` point-only groups, `30,864` faces.
  - Visual audit: only `49` groups have texture-map coverage, covering `11.8%` of faced geometry by face count.
  - Audit buckets: `317` high-risk groups, `150` hide-by-default candidates, `182` source-review candidates.
  - Strict Beauty filtering now leaves only `18` visible groups and suppresses `332` groups (`80` point clouds, `70` degenerate, `173` unlinked, `9` placeholder-texture). That is useful evidence, but it also proves the source/export pipeline is the real fidelity blocker.

## Work Completed In This Slice
1. Added `js/visual_group_filter.js` and `tests/visual_group_filter.test.mjs`.
   - Pure suppression helpers for degenerate extents, unlinked groups, placeholder texture URLs, compact low-confidence groups, and ordered suppression reasons.
2. Wired Beauty-mode artifact/trust suppression into runtime loading.
   - `world.js` marks each group with source hash, texture-map count, color texture URL, visual face count, local extents, and suppression categories.
   - Beauty hides point-only, degenerate, unlinked, placeholder-texture, and compact low-confidence groups by default.
   - Explore/Debug keep the previous unfiltered geometry behavior for investigation.
   - `getWorldVisibilityState()` now exposes suppression stats plus visible/unfiltered group diagnostics for smoke tests.
3. Improved material fidelity for mapped assets.
   - Meshes with linked texture maps use neutral white base material color so texture maps are not multiplied by arbitrary group colors.
4. Reframed the default camera and visual-baseline cameras around currently visible geometry.
   - Prevents strict Beauty mode from opening/capturing a nearly empty far-field view after artifact suppression.
5. Hardened browser/visual validation coverage.
   - `check_browser_smoke.py` validates the new startup settings and zero-visible suppressed group counts.
   - `capture_visual_baselines.py` records visible group count and uses a compact span floor for trusted-only visible bounds.
   - CI Beauty-profile smoke settings include the new suppression flags.
6. Updated repo-facing docs.
   - `README.md`, `HANDOFF.md`, and `knowledge.md` document the new visual filter helper, smoke settings, and Beauty profile behavior.
7. Replaced the strict texture fixture PNG with a valid visible checker fixture.
   - Added a PNG chunk CRC regression test so future fixture edits fail locally if embedded bytes are invalid.

## Validation Run So Far
Use CMD/Python where practical.

```cmd
python check_js.py
python -m py_compile check_browser_smoke.py capture_visual_baselines.py tests/test_check_browser_smoke.py tests/test_capture_visual_baselines.py
pytest tests/test_check_browser_smoke.py tests/test_capture_visual_baselines.py tests/test_ci_workflow.py -q
python -m ruff format check_browser_smoke.py capture_visual_baselines.py tests/test_check_browser_smoke.py tests/test_capture_visual_baselines.py
python -m ruff check check_browser_smoke.py capture_visual_baselines.py tests/test_check_browser_smoke.py tests/test_capture_visual_baselines.py
python check_browser_smoke.py --timeout 60 --settings-json "{...Beauty strict suppression...}" --expect-startup-settings --skip-sidebar-smoke --hide-start-overlay --save-artifacts --artifacts-dir artifacts/browser-smoke/beauty-final
python capture_visual_baselines.py --timeout 60 --texture-fixture --strict-textures --output-dir artifacts/visual-baselines-final
```

Local results so far:
- `python check_js.py`: PASS, `33/33` JS modules/tests.
- Focused py_compile: PASS.
- Focused pytest: PASS, `30 passed` before adding compact-pose test; focused capture tests PASS, `13 passed` after adding it.
- Focused Ruff format/check: PASS.
- Beauty strict browser smoke: PASS, `groups=350`, `faces=30,864`, `textures=29/29 / 16x`, suppression stats validated.
- Beauty strict fixed-camera capture: PASS; artifacts under `artifacts/visual-baselines-final`; latest report shows `18/350` visible groups and `332` suppressed groups.
- `python check.py --browser`: PASS, all `8/8` checks.
- `pre-commit run --all-files`: PASS.
- `python summarize_timings.py --artifacts-dir artifacts --output artifacts/timing-baseline.md`: PASS.
- `gh run watch 27510854538 --exit-status`: PASS; latest pushed CI green.
- CI artifact download/readback: PASS; `visual-baselines-report.json` has no failures and reports `18/350` visible groups with `332` suppressed.
- In-app Browser plugin verification was attempted against `http://127.0.0.1:8765/flythrough.html`; DOM/load state was readable, but plugin screenshot capture timed out, so Playwright/browser-smoke artifacts remain the visual proof for this slice.

## Important Notes
- This is not a true visual-fidelity fix yet. It makes the app more honest by hiding known-bad extraction artifacts and proving how little source-trusted content remains.
- The strict Beauty result is a small/dark trusted object cluster, not a RIFT zone. That is expected from current evidence: most environment-like geometry is unmapped, unlinked, degenerate, placeholder-only, or point-only.
- `artifacts/` is ignored and should remain untracked.
- `merged.obj`, `textures/converted/`, `objs/`, and other generated/runtime assets were not modified.
- Next fidelity work should prioritize source/export recovery over viewer polish.

## Next Best Actions
1. Recover or propagate source NIF hashes for generic groups such as `decode-nif-geometry/decode-nif-geometry-mesh6`; this is the highest-leverage texture/identity blocker.
2. Rebuild `merged.obj` from a source export that preserves world transforms/placements; current trusted groups collapse into a tiny cluster.
3. Add an audit metric for transform collapse / visible trusted world span so this blocker is quantified in CI artifacts.
4. Sample the top unlinked high-face groups against source assets to decide whether they are real terrain, duplicate props, or extraction artifacts.
5. Split terrain/zone mesh handling from prop handling; RIFT-like environments need terrain/material semantics, not just generic OBJ groups.
6. Improve texture-map coverage beyond `11.8%` by linking recovered hashes to converted texture assets.
7. Add material-role handling for foliage alpha, water surfaces, emissive/VFX, and placeholder-only maps after source identity improves.
8. Generate a before/after montage from visual-baseline artifacts to make human review faster.
9. Keep strict Beauty filter diagnostics in CI but consider adding a separate Explore baseline so regressions in raw source coverage are visible too.
10. Continue small validated slices; do not broad-rewrite renderer/materials until source identity and placement are repaired.
