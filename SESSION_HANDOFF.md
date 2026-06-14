# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Current slice:** Fixed-camera Beauty visual baselines - local validation complete, commit+CI pending at handoff write time

## Current State
- Latest completed commits before this slice: `0012eef docs: update beauty profile handoff`, `fff4363 feat: add beauty visual profile`.
- GitHub Actions CI run `27508740027` is green across `python`, `javascript`, `html`, and `browser-smoke` for the Beauty-profile baseline work.
- The user screenshot assessment remains correct: even after debug-helper cleanup, the app is still not visually recognizable as the actual RIFT runtime. The current gap is asset/material/geometry/scene fidelity rather than basic viewer health.
- This slice adds repeatable fixed-camera Beauty-profile visual baseline capture so future visual changes can be compared by artifact instead of subjective one-off screenshots.
- Generated visual baseline artifacts are ignored under `artifacts/visual-baselines/`; they are validation/review evidence, not tracked runtime assets.

## Work Completed In This Slice
1. Added `capture_visual_baselines.py`.
   - Starts the viewer over HTTP in a fresh Playwright context.
   - Preloads the clean Beauty visual profile with map/debug helpers, particles, weather, point clouds, LOD proxies, minimap, and FPS disabled.
   - Waits for viewer readiness and texture status, hides the start overlay and visual chrome, then captures deterministic camera presets.
   - Computes a live Three.js scene bounding box from visible world groups so camera targets use the actual 3D scene center instead of ground-only heuristics.
   - Captures both viewport and renderer-canvas PNGs for `overview`, `north-low`, `east-oblique`, and `south-detail`.
   - Writes `visual-baselines-report.json` with camera poses, artifact paths, hashes, timings, viewport, viewer state, and failure details.
2. Added `tests/test_capture_visual_baselines.py`.
   - Covers preset parsing, invalid/empty preset rejection, deterministic artifact paths, copy-safe Beauty settings, bad-bound repair, deterministic camera-pose math, unknown-preset rejection, and workspace-relative paths.
3. Extended `summarize_timings.py`.
   - Now discovers and summarizes `visual-baselines-report.json` alongside browser-smoke and texture-mode reports.
   - Added regression coverage in `tests/test_summarize_timings.py`.
4. Hardened CI artifact capture.
   - `.github/workflows/ci.yml` now runs `capture_visual_baselines.py --timeout 60 --texture-fixture --strict-textures --output-dir artifacts/browser-smoke/visual-baselines` during the browser-smoke job.
   - The existing artifact upload path retains fixed-camera visual-baseline PNGs/reports with the other browser-smoke artifacts.
   - Added CI workflow regression coverage in `tests/test_ci_workflow.py`.
5. Updated `README.md`, `HANDOFF.md`, and `knowledge.md` with the fixed-camera baseline command and timing-summary support.
6. Generated and inspected local artifacts.
   - Command: `python capture_visual_baselines.py --timeout 60 --texture-fixture --strict-textures --output-dir artifacts/visual-baselines`.
   - Result: PASS, 4 presets captured, zero console/page/resource failures.
   - Visual inspection confirms the camera framing is now useful/repeatable and free of debug helper clutter, but the scene still looks abstract/un-RIFT-like. This evidence supports the next milestone: geometry/material/asset classification and filtering.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py capture_texture_modes.py capture_visual_baselines.py summarize_timings.py
python -m ruff check capture_visual_baselines.py summarize_timings.py tests/test_capture_visual_baselines.py tests/test_summarize_timings.py tests/test_ci_workflow.py
pytest tests/test_capture_visual_baselines.py tests/test_summarize_timings.py tests/test_ci_workflow.py -q
python capture_visual_baselines.py --timeout 60 --texture-fixture --strict-textures --output-dir artifacts/visual-baselines
python summarize_timings.py --artifacts-dir artifacts/visual-baselines --allow-empty
python summarize_timings.py --artifacts-dir artifacts/visual-baselines --json --allow-empty | python -m json.tool > $null
python check_js.py
python check_html.py
pytest tests/ -q
python validate_obj.py --obj merged.obj
python check.py --browser
pre-commit run --all-files
```

Local results:
- `python -m py_compile ... capture_visual_baselines.py summarize_timings.py`: PASS.
- Focused Ruff check: PASS.
- Focused pytest: PASS, `22 passed`.
- First runtime capture exposed weak ground-based camera targeting; fixed by using a live Three.js bounding box before final validation.
- Final `python capture_visual_baselines.py --timeout 60 --texture-fixture --strict-textures --output-dir artifacts/visual-baselines`: PASS, 4 presets captured.
- `python summarize_timings.py --artifacts-dir artifacts/visual-baselines --allow-empty`: PASS; visual-baseline records detected.
- `python summarize_timings.py --artifacts-dir artifacts/visual-baselines --json --allow-empty | python -m json.tool > $null`: PASS.
- `python check_js.py`: PASS, all `32/32` JS modules/regression tests passed.
- `python check_html.py`: PASS.
- `pytest tests/ -q`: PASS, `82 passed`.
- `python validate_obj.py --obj merged.obj`: PASS, `30,864` faces, `350` groups.
- `python check.py --browser`: PASS after formatting fix, all `7/7` checks passed.
- `pre-commit run --all-files`: PASS.

## Important Notes
- Context7 Playwright Python docs were consulted before adding the Playwright-based fixed-camera capture helper.
- `merged.obj`, `textures/converted/`, `objs/`, and other runtime/generated assets were not modified.
- Fixed-camera artifacts intentionally prove the current quality gap as much as they protect against regressions: the app is cleaner than the original screenshot but still not RIFT-like.
- Camera presets are world-relative and deterministic, but not hand-curated against actual RIFT reference shots yet.

## Next Best Actions
1. Audit `merged.obj` source semantics: classify terrain, buildings, water, props, foliage, collision/debug, and point-only exports.
2. Add a report that ranks groups by size, face count, material/texture coverage, and likely visual category to guide Beauty filtering.
3. Filter or de-emphasize likely collision/helper/debug geometry in Beauty mode based on evidence rather than broad heuristics.
4. Create a small reference set of real RIFT screenshots for the same zone/mood and compare against the fixed-camera baselines.
5. Improve terrain readability with material/biome-aware fallback colors after group/texture semantics are known.
6. Add material-role mapping beyond color/normal only after confirming source texture naming semantics.
7. Add optional sky/fog/lighting presets grounded in RIFT references and capture the same fixed cameras before/after.
8. Consider a visual-baseline montage generator so reviewers can compare all fixed cameras in one image.
9. Keep the CI visual-baseline artifacts green and retained for every future rendering slice.
10. Continue small validated visual-fidelity slices; do not broad-rewrite shaders/materials until asset classification evidence exists.
