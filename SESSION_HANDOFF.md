# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Current slice:** Visual asset audit - local validation complete, commit+CI pending at handoff write time

## Current State
- Latest completed/pushed commit before this slice: `894f83b test: capture fixed camera visual baselines`.
- GitHub Actions CI run `27509321647` is green across `python`, `javascript`, `html`, and `browser-smoke` for `894f83b`.
- Fixed-camera Beauty baseline artifacts now prove the viewer is cleaner than the original debug-heavy screenshot, but still visually abstract and not recognizably RIFT-like.
- The current evidence points to asset/geometry/texture-source fidelity as the main blocker:
  - `merged.obj`: `350` groups, `270` faced groups, `80` point-only groups, `30,864` faces.
  - Visual asset audit: only `49` groups have texture-map coverage, covering `11.8%` of faced geometry by face count.
  - Audit buckets: `317` high-risk groups, `150` hide-by-default candidates, `182` source-review candidates.
  - Dominant issues are generic/unmapped object names, point-only exports, degenerate geometry, placeholder/untextured groups, and limited texture linkage.

## Work Completed In This Slice
1. Added `audit_visual_assets.py`.
   - Parses `merged.obj` without rewriting runtime assets.
   - Extracts OBJ object groups, face counts, point-only groups, referenced vertices, local bounds, NIF hashes, texture-map coverage, texture roles, likely visual categories, fidelity risk, and conservative Beauty-mode recommendations.
   - Writes ignored JSON/Markdown reports under `artifacts/visual-audit/`.
   - Produces practical triage tables for top face-count groups, top local-span groups, high-risk groups, Beauty hide-by-default candidates, and source-review candidates.
2. Added `tests/test_audit_visual_assets.py`.
   - Covers hash extraction, relative OBJ index parsing, texture-map parsing, texture-role classification, group parsing, risk/category classification, report writing, and missing OBJ handling.
3. Hardened local health checks.
   - `check.py` now runs the visual asset audit in non-quick mode after `validate_obj.py`.
   - `--quick` explicitly skips OBJ/audit/HTML validations.
4. Hardened CI.
   - `.github/workflows/ci.yml` now runs the visual asset audit in the `python` job.
   - CI uploads `artifacts/visual-audit` as `visual-asset-audit-artifacts` with 7-day retention.
   - `tests/test_ci_workflow.py` covers the new CI command and artifact upload contract.
5. Updated repo-facing docs.
   - `README.md`, `HANDOFF.md`, and `knowledge.md` document the new audit helper, command, CI artifact, and health-check coverage.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m py_compile audit_visual_assets.py tests/test_audit_visual_assets.py check.py
python -m ruff format audit_visual_assets.py tests/test_audit_visual_assets.py check.py tests/test_ci_workflow.py
python -m ruff check audit_visual_assets.py tests/test_audit_visual_assets.py check.py tests/test_ci_workflow.py
pytest tests/test_audit_visual_assets.py tests/test_ci_workflow.py -q
python audit_visual_assets.py --obj merged.obj --texture-map js/texture_map.js --output-dir artifacts/visual-audit --top 25
```

Local results so far:
- `python -m py_compile audit_visual_assets.py tests/test_audit_visual_assets.py check.py`: PASS.
- Focused Ruff format/check: PASS after formatting one new file.
- Focused pytest: PASS, `11 passed`.
- `python audit_visual_assets.py --obj merged.obj --texture-map js/texture_map.js --output-dir artifacts/visual-audit --top 25`: PASS.
- Audit report output:
  - JSON: `artifacts/visual-audit/visual-asset-audit.json`
  - Markdown: `artifacts/visual-audit/visual-asset-audit.md`
  - `groups=350`, `faces=30,864`, `texture_face_coverage=11.8%`.

## Important Notes
- `artifacts/visual-audit/` is ignored and should remain untracked.
- `merged.obj`, `textures/converted/`, `objs/`, and other generated/runtime assets were not modified.
- The audit is intentionally conservative and observational. It suggests Beauty-mode triage but does not change rendering behavior yet.
- Current findings explain the user's visual critique: the app is now technically healthier, but most visible geometry still lacks enough semantic/texture/source fidelity to read as a real RIFT environment.

## Next Best Actions
1. Use `artifacts/visual-audit/visual-asset-audit.md` to sample top `hide-by-default` groups visually before implementing any filter.
2. Add a runtime Beauty filter that hides only proven point-only and degenerate groups first, then compare fixed-camera baselines.
3. Investigate why many high-face groups have generic names such as `decode-nif-geometry/decode-nif-geometry-mesh6` with no extractable hash.
4. Recover or propagate source NIF hashes for generic group names so texture-map coverage can rise above `11.8%`.
5. Add source/export checks for degenerate faced geometry before hiding it permanently.
6. Split `sky-vfx-ui` assets away from world geometry and render them with purpose-built sky/VFX handling.
7. Add material-role handling for foliage alpha, water, placeholder-only maps, and structure materials.
8. Generate a before/after visual-baseline montage from fixed-camera PNGs for faster review.
9. Keep CI artifact retention for both visual-baseline and visual-audit reports on every rendering slice.
10. Continue small validated rendering slices; do not broad-rewrite materials until audit-guided filtering is proven by screenshots.
