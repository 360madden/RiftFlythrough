# RiftFlythrough — Handoff

**Repo:** `github.com/360madden/RiftFlythrough`
**Local path:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`

> **Current-truth note:** `SESSION_HANDOFF.md` is the authoritative continuation artifact for active development status, latest completed slice, validation evidence, CI run IDs, and ranked next actions. This file is a stable orientation pointer and quick project overview so older v1.x handoff notes do not mislead future agents.

## Current workflow
1. Start by reading `SESSION_HANDOFF.md`.
2. Verify live repo evidence with:
   ```cmd
   git fetch --prune origin
   git status --short --branch
   git log --oneline -10
   ```
3. Treat repository evidence as authoritative over stale notes.
4. Before claiming completion, run validation matched to the changed surface. Prefer:
   ```cmd
   python -m py_compile check.py check_js.py check_html.py validate_obj.py merge_objs.py check_browser_smoke.py
   python check.py
   pytest tests/ -q
   python check_js.py
   python check_html.py
   python validate_obj.py --obj merged.obj
   pre-commit run --all-files
   ```
5. For viewer/browser behavior, also run relevant Playwright smoke coverage, especially:
   ```cmd
   python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts --artifacts-dir artifacts/browser-smoke
   python check_browser_smoke.py --timeout 60 --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke
   ```

## What it is
RiftFlythrough is an offline Three.js flythrough viewer for RIFT MMORPG world geometry backed by Python tooling. It serves `flythrough.html` over HTTP, imports ES modules from `js/`, loads `merged.obj`, and exposes navigation, settings, minimap, lighting, LOD, weather/water, texture-quality controls, and browser-smoke validated UI overlays.

## Key files
- `flythrough.html` — browser entry point and UI markup.
- `js/` — ES modules for viewer behavior (`main.js`, `world.js`, `ui.js`, `settings.js`, `controls.js`, etc.).
- `check.py` — unified local health check.
- `check_browser_smoke.py` — Playwright runtime smoke test with timing telemetry, startup settings probes, mapped strict texture fixture coverage, live texture-quality exercise, and optional retained screenshots/reports.
- `validate_obj.py` — OBJ geometry validation.
- `merge_objs.py` — OBJ merge tooling.
- `tests/` — pytest coverage for Python tooling and smoke helpers.
- `.github/workflows/ci.yml` — Python, JavaScript, HTML, and browser-smoke CI.
- `knowledge.md` — durable architecture notes, commands, and gotchas.
- `SESSION_HANDOFF.md` — active current-truth development handoff.

## Quickstart
```cmd
python run.py           # Start static server and open the viewer
python dev.py           # Start live-reload dev server
python check.py         # Full local health check
python check.py --browser # Health check plus browser smoke
```

## Current gotchas
- Serve over HTTP; ES modules/import maps are not intended for `file://`.
- `merged.obj` currently loads as direct Mesh/Points children; keep `world.js` logical group normalization intact.
- `merged.obj` is the only tracked large runtime asset among generated-style assets; avoid touching `textures/converted/`, `objs/`, and other runtime outputs unless the task is asset-related.
- Browser smoke treats generated `textures/converted/` misses as optional unless `--strict-textures` is used with temporary ignored fixtures for mapped generated texture URLs.
- `textureQuality=off` skips startup texture loads; switching away from startup-off requires reload because maps were never fetched. Already-loaded maps update live.
- `artifacts/` is ignored; browser-smoke success/failure screenshots and reports are runtime artifacts, not source files.

## Next step source
Use the ranked `Next Best Actions` in `SESSION_HANDOFF.md` after checking current git state and latest CI. Do not continue from historical version bullets in this file.
