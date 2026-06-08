# Project knowledge

This file gives Freebuff context about your project: goals, commands, conventions, and gotchas.

## Quickstart
- **Run:** `python run.py` or double-click `run.bat` (starts Python HTTP server on port 8000, opens browser)
- **Dev mode:** `python dev.py` → live reload on file changes
- **Manual:** `python -m http.server 8000` → open `http://localhost:8000/flythrough.html`
- **No setup needed** — no package.json, no build step, no npm install

## Purpose
Offline 3D flythrough viewer for the RIFT MMORPG game world. Built from extracted OBJ geometry rendered with Three.js. Fly through the world like Glider for Ultima Online.

## Architecture
- **Shell:** `flythrough.html` — HTML + CSS + importmap, imports `js/main.js`
- **11 JS modules** under `js/`: main, state, scene, lighting, world, controls, ui, minimap, selection, settings, utils
- **World data:** `merged.obj` — 350 world groups (270 colored mesh families + 80 point clouds)
- **OBJ merger:** `merge_objs.py` — merges OBJ exports from the [RIFT Assets](https://github.com/360madden/rift-assets) project into `merged.obj`
- **Launcher:** `run.py` — cross-platform, auto-finds free port, opens browser
- **Dev server:** `dev.py` — live reload via injected WebSocket client, watches `js/`, `flythrough.html`, `merged.obj`
- **Tech:** Three.js 0.170 via CDN importmap, no build step, Python 3 for tooling

### Module graph
```
main.js  →  controls.js  →  state.js, scene.js, lighting.js
         →  ui.js        →  state.js, scene.js, lighting.js, selection.js, settings.js
         →  minimap.js   →  controls.js (for euler)
         →  world.js     →  scene.js, utils.js
         →  scene.js     →  state.js
```

### Data flow
1. OBJ files exported from RIFT Assets project → `merge_objs.py` merges them → `merged.obj`
2. `world.js` fetches `merged.obj` via Three.js OBJLoader, applies per-group HSL colors, renders with Phong materials and custom water shader
3. `main.js` orchestrates the animate loop: movement → minimap draw → water animation → render

## Commands

| Action | Command |
|--------|---------|
| Start viewer | `python run.py [--port 8000]` |
| Dev server | `python dev.py [--port 8000]` |
| Health check | `python check.py` |
| Quick check | `python check.py --quick` (skip OBJ validation) |
| Merge OBJs | `python merge_objs.py --objs-dir ../Assets/Exports --faced-only --include-pos-only` |
| Validate OBJ | `python validate_obj.py [--obj merged.obj] [--stats] [-v]` |
| Diff OBJs | `python validate_obj.py --diff old.obj new.obj` |
| Run tests | `pytest tests/` (28 tests) |
| Lint Python | `ruff check .` / `ruff format .` |
| Lint JS/HTML | `npx @biomejs/biome check js/ flythrough.html` |
| Pre-commit | `pre-commit run --all-files` |
| Release | `python release.py 1.1.0 [--dry-run]` |
| Changelog | `python changelog.py [--since v1.0.0] [--version 1.1.0]` |

## Conventions
- **Modular JS:** 10 files under `js/`, each with a single responsibility. `main.js` is the entry point.
- **Shared state:** `state.js` exports a plain object; all modules import and mutate it directly (live bindings via reference).
- **Three.js patterns:** Importmap CDN loading, `OBJLoader`, `MeshPhongMaterial`, `PointsMaterial`, `ShaderMaterial` for water.
- **Color palette:** HSL golden-angle cycling (`GOLDEN_ANGLE = 0.618033988749895`) for group coloring.
- **OBJ groups:** `o <name>` directives in merged OBJ mark mesh groups; `ptonly_` prefix for position-only point clouds.
- **Controls:** WASD + mouse look, pointer lock API, raycasting for mesh selection.
- **Settings:** Persisted via `localStorage`; applied centrally by `applySettings()` in `settings.js`.
- **Linting:** Ruff for Python (pyproject.toml), Biome for JS/HTML (biome.json), pre-commit hooks enforce on every commit.
- **No npm/bundler:** No package.json, no webpack/vite. CDN importmap for Three.js.

## Gotchas
- **No build step:** The app uses ES modules via importmap; must be served over HTTP (won't work from `file://`).
- **Three.js 0.170:** Importmap pinned to this version; breaking changes in newer Three.js may require migration.
- **Shaders inline:** Water plane uses inline GLSL strings in `world.js`; no external shader files.
- **merged.obj is large:** ~38MB binary equivalent, can take a moment to load.
- **Pointer lock required:** Mouse controls only work after clicking the overlay to lock the pointer.
- **Module init order matters:** `ui.js` registers event listeners at module level; must be imported before user interaction.
- **Settings init flow:** `main.js` → `loadSettings()` → `applySettings(settings)` → state populated → all modules read from state.
