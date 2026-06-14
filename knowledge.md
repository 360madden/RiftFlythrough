# Project Knowledge

## Purpose
Offline 3D flythrough viewer for the RIFT MMORPG game world. Built from extracted OBJ geometry rendered with Three.js. Fly through the world like Glider for Ultima Online.

## Quickstart
- **Run:** `python run.py` or double-click `run.bat` (starts Python HTTP server on port 8000, opens browser)
- **Dev mode:** `python dev.py` → live reload on file changes
- **Manual:** `python -m http.server 8000` → open `http://localhost:8000/flythrough.html`
- **No setup needed** — no package.json, no build step, no npm install

## Architecture

### Shell + Modules
- **`flythrough.html`** — HTML + CSS + importmap, imports `js/main.js`
- **28 JS modules** under `js/`:

| Module | Responsibility |
|--------|---------------|
| `main.js` | Entry point, animate loop, FPS counter, crash recovery, tooltip raycast |
| `state.js` | Shared mutable state object (live bindings via reference) |
| `scene.js` | THREE.Scene, camera, renderer, EffectComposer, bloom, DOF |
| `lighting.js` | 8 lighting presets, procedural skybox/PMREM, shadow presets, day/night cycle, fog |
| `lod.js` | Distance-based world group LOD proxies and stats |
| `world.js` | OBJLoader, per-group PBR materials, axes/grid, water/ground planes, env map |
| `controls.js` | WASD/mouse input, pointer lock, movement, camera bob, screen shake |
| `ui.js` | Overlay toggles, settings panel, key actions, screenshot gallery |
| `minimap.js` | 2D canvas minimap, click-to-teleport |
| `selection.js` | Raycaster selection, wireframe highlight/deselect |
| `settings.js` | localStorage persistence + `applySettings()` |
| `utils.js` | Golden-angle HSL color generator |
| `teleport.js` | Teleport history stack (undo/redo with Ctrl+Z/Y) |
| `catalog.js` | Group catalog overlay (K key) — browse, filter, fly-to |
| `tour.js` | Auto-fly tour mode (bookmarks or spiral path) |
| `audio.js` | Ambient wind audio (Web Audio API) |
| `weather.js` | Weather effects (rain, snow particles) |
| `particles.js` | Dust particle system |
| `perf.js` | Performance HUD (FPS graph, draw calls, triangles, memory) |
| `coords.js` | Coordinate overlay with nearby group names |
| `speedrun.js` | Timed circuit race mode with leaderboard |
| `transform_loader.js` | Optional transform data loader for asset placement metadata |
| `texture_map.js` | Texture mapping utilities |
| `zones.js` | Zone label sprites |
| `zone-overlays.js` | Zone overlay meshes |
| `zone-filter.js` | Zone visibility filter UI |
| `zone-hover.js` | Zone hover cards |
| `zone-calibrate.js` | Zone marker calibration helpers |

### Module Dependency Graph
```
main.js  →  controls.js  →  state.js, scene.js, lighting.js, teleport.js
         →  ui.js        →  state.js, scene.js, lighting.js, selection.js, settings.js
         →  minimap.js   →  controls.js (for euler)
         →  world.js     →  scene.js, utils.js, lod.js, lighting.js (env map update)
         →  scene.js     →  state.js
         →  lighting.js  →  scene.js, world.js (updateWaterEnvMap)
         →  audio.js, catalog.js, coords.js, particles.js, perf.js
         →  speedrun.js, tour.js, weather.js, zones.js, zone-overlays.js
```

### Data Flow
1. OBJ files from [RIFT Assets](https://github.com/360madden/rift-assets) → `merge_objs.py` → `merged.obj` (350 groups, ~3.4 MB)
2. `world.js` fetches `merged.obj` via OBJLoader, applies per-group HSL colors, renders with `MeshStandardMaterial` (PBR) and custom water shader (Gerstner waves, Fresnel, foam, env reflections)
3. `main.js` orchestrates the animate loop: lighting transitions → movement → minimap → water → particles → weather → audio → perf → composer.render()

### World Data
- **`merged.obj`** — 350 world groups (270 colored mesh families + 80 point clouds, `ptonly_` prefix)
- **23,421 vertices, 30,864 faces**
- HSL golden-angle cycling (`GOLDEN_ANGLE = 0.618033988749895`) for group coloring

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

## Pipeline Architecture

```
RIFT Live Game (C:\Program Files (x86)\Glyph\Games\RIFT\Live)
    ↓ (read-only)
Assets Repo (C:\RIFT MODDING\Assets)
    scripts/batch_*.py → .NET CLI → Exports/ (350 OBJ files)
    ↓ ../Assets/Exports/
RiftFlythrough (this repo)
    merge_objs.py → merged.obj → flythrough.html (Three.js viewer)
```

## Conventions
- **Modular JS:** 28 files under `js/`, each with a single responsibility. `main.js` is the entry point.
- **Shared state:** `state.js` exports a plain object; all modules import and mutate it directly.
- **Three.js 0.170:** CDN importmap, `OBJLoader`, `MeshStandardMaterial` (PBR), `PointsMaterial`, `ShaderMaterial` (water).
- **Post-processing:** `EffectComposer` with `RenderPass` + `UnrealBloomPass`. Screenshot capture goes through composer.
- **Lighting:** 8 presets (Day/Sunset/Night/Dawn/Storm/GoldenHour/Moonlight/Overcast). Procedural skybox via `PMREMGenerator.fromScene()`.
- **Water:** Custom GLSL shader with 4-layer Gerstner waves, Fresnel, foam, env map reflections.
- **Controls:** WASD + mouse look, pointer lock API, raycasting for mesh selection.
- **Settings:** Persisted via `localStorage`; applied centrally by `applySettings()` in `settings.js`.
- **Linting:** Ruff for Python (pyproject.toml), Biome for JS/HTML (biome.json), pre-commit hooks.
- **No npm/bundler:** No package.json, no webpack/vite. CDN importmap for Three.js.

## Environment Constraints
- **Python** is already installed — do not reinstall, upgrade, or modify the system Python installation.
- **C# / .NET 9 / .NET 10** are already installed — do not reinstall, upgrade, or modify.
- **Third-party applications** must not be damaged, uninstalled, or altered.
- Only use what is already available on the system. Ask the user before installing anything.

## Gotchas
- **Must be served over HTTP:** ES modules via importmap won't work from `file://`.
- **Three.js 0.170 pinned:** Breaking changes in newer versions may require migration.
- **Inline shaders:** Water plane uses inline GLSL strings in `world.js`; no external shader files.
- **merged.obj is large:** ~38MB binary equivalent, can take a moment to load.
- **Pointer lock required:** Mouse controls only work after clicking the overlay to lock the pointer.
- **Module init order matters:** `ui.js` registers event listeners at module level; must be imported before user interaction.
- **Settings init flow:** `main.js` → `loadSettings()` → `applySettings(settings)` → state populated → all modules read from state.
- **Screenshot goes through composer:** Must call `composer.render()` before `renderer.domElement.toDataURL()`.

## Roadmap (Condensed)

| Section | Phases | Status |
|---------|--------|--------|
| A. Foundation | 1–8 | ✅ Done |
| B. Data Pipeline | 9–16 | Pending |
| C. Rendering Quality | 17–24 | Partial (17-23 done; 24 pending) |
| D. Feature Expansion | 25–32 | Partial (25 done; 26-32 pending) |
| E. UX & Polish | 33–40 | Pending |
| F. Advanced Integration | 41–46 | Pending |
| G. Production Release | 47–50 | Pending |

**Current phase:** 24 — Remaining rendering quality pass (PENDING)
**Latest completed:** 21 — Level-of-Detail System
**Completed:** 16 of 50 phases
