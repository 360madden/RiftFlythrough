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
- **29 JS modules** under `js/`:

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
| `texture_quality.js` | Pure texture quality/anisotropy setting helpers |
| `texture_roles.js` | Pure texture color/normal role classification helpers |
| `zones.js` | Zone label sprites |
| `zone-overlays.js` | Zone overlay meshes |
| `zone-filter.js` | Zone visibility filter UI |
| `zone-hover.js` | Zone hover cards |
| `zone-calibrate.js` | Zone marker calibration helpers |

### Module Dependency Graph
```
main.js  →  controls.js  →  state.js, scene.js, lighting.js, teleport.js
         →  ui.js        →  state.js, scene.js, lighting.js, selection.js, settings.js, texture_quality.js
         →  minimap.js   →  controls.js (for euler)
         →  world.js     →  scene.js, utils.js, lod.js, texture_roles.js, texture_quality.js
         →  scene.js     →  state.js
         →  lighting.js  →  scene.js, world.js (updateWaterEnvMap)
         →  audio.js, catalog.js, coords.js, particles.js, perf.js
         →  speedrun.js, tour.js, weather.js, zones.js, zone-overlays.js
```

### Data Flow
1. OBJ files from [RIFT Assets](https://github.com/360madden/rift-assets) → `merge_objs.py` → `merged.obj` (350 groups, ~3.4 MB)
2. `world.js` fetches `merged.obj` via OBJLoader, applies per-group HSL colors, optionally applies linked color/normal textures with texture-quality-controlled anisotropic filtering, renders with `MeshStandardMaterial` (PBR) and custom water shader (Gerstner waves, Fresnel, foam, env reflections)
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
| Install dev tooling | `python -m pip install -e ".[dev]"` then `python -m playwright install chromium` |
| Health check | `python check.py` |
| Browser smoke check | `python check.py --browser` or `python check_browser_smoke.py` (prints timing telemetry) |
| Strict texture fixture smoke | `python check_browser_smoke.py --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts` |
| Persisted settings startup smoke | `python check_browser_smoke.py --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke` |
| Quick check | `python check.py --quick` (skip OBJ validation) |
| Merge OBJs | `python merge_objs.py --objs-dir ../Assets/Exports --faced-only --include-pos-only` |
| Validate OBJ | `python validate_obj.py [--obj merged.obj] [--stats] [-v]` |
| Diff OBJs | `python validate_obj.py --diff old.obj new.obj` |
| Run tests | `pytest tests/` |
| Lint Python | `ruff check .` / `ruff format .` |
| Lint JS/HTML | `python check_js.py` / `python check_html.py` |
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
- **Modular JS:** 29 files under `js/`, each with a single responsibility. `main.js` is the entry point.
- **Shared state:** `state.js` exports a plain object; all modules import and mutate it directly.
- **Three.js 0.170:** CDN importmap, `OBJLoader`, `MeshStandardMaterial` (PBR), `PointsMaterial`, `ShaderMaterial` (water).
- **Post-processing:** `EffectComposer` with `RenderPass` + `UnrealBloomPass`. Screenshot capture goes through composer.
- **Lighting:** 8 presets (Day/Sunset/Night/Dawn/Storm/GoldenHour/Moonlight/Overcast). Procedural skybox via `PMREMGenerator.fromScene()`.
- **Water:** Custom GLSL shader with 4-layer Gerstner waves, Fresnel, foam, env map reflections.
- **Controls:** WASD + mouse look, pointer lock API, raycasting for mesh selection.
- **Settings:** Persisted via `localStorage`; applied centrally by `applySettings()` in `settings.js`.
- **Texture quality:** `textureQuality` defaults to `high` for max anisotropy; `off` skips linked texture loading on world startup and keeps generated/runtime texture assets untouched. Settings changes apply live to already-loaded maps by updating material maps and anisotropy; switching away from `off` after starting with texture loading disabled still requires reload to load maps.
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
- **CI concurrency:** `.github/workflows/ci.yml` cancels superseded runs by `github.workflow` + `github.ref`, so only the newest CI run for a branch should continue.
- **Inline shaders:** Water plane uses inline GLSL strings in `world.js`; no external shader files.
- **merged.obj is large:** ~38MB binary equivalent, can take a moment to load.
- **OBJLoader hierarchy:** Current `merged.obj` loads as 350 direct renderables (270 Mesh + 80 Points), not Group wrappers; `world.js` normalizes direct renderables into logical groups before coloring, selection, legend, stats, and LOD.
- **Browser smoke:** `check_browser_smoke.py` fails on page errors, critical resource errors, crash overlay, zero world stats, broken safe sidebar controls, and catalog/help/settings overlay open-close regressions; generated `textures/converted/` 404s are optional unless `--strict-textures` is used. Use `--texture-fixture` with strict mode to create and fetch a temporary ignored PNG under `textures/converted/` without tracking generated assets. Use `--settings-json` with `--expect-texture-status`, `--forbid-generated-texture-requests`, and optional `--skip-sidebar-smoke` for fast persisted-settings startup probes. Successful runs print phase timing telemetry; `--save-artifacts` writes a JSON report plus viewport screenshot on success, while failed run artifacts include `timingsMs`. Sidebar smoke triggers safe controls with in-page visible-element checks plus `MouseEvent("click")` dispatch because CI can starve Playwright locator mouse input/waits while the Three.js render loop is active.
- **Texture quality setting:** Settings panel offers Off/Low/Medium/High. High preserves previous max-anisotropy behavior; Low/Medium cap `Texture.anisotropy`; Off detaches already-loaded color/normal maps live, and takes effect on startup by skipping texture loads and reporting `stat-textures=off`.
- **Pointer lock required:** Mouse controls only work after clicking the overlay to lock the pointer.
- **Module init order matters:** `ui.js` registers event listeners at module level; must be imported before user interaction.
- **Settings init flow:** `main.js` → `loadSettings()` → `applySettings(settings)` → state populated → all modules read from state.
- **Screenshot goes through composer:** Must call `composer.render()` before `renderer.domElement.toDataURL()`.

## Roadmap (Condensed)

| Section | Phases | Status |
|---------|--------|--------|
| A. Foundation | 1–8 | ✅ Done |
| B. Data Pipeline | 9–16 | Pending |
| C. Rendering Quality | 17–24 | ✅ Done |
| D. Feature Expansion | 25–32 | Partial (25-31 done; 32 pending) |
| E. UX & Polish | 33–40 | Pending |
| F. Advanced Integration | 41–46 | Pending |
| G. Production Release | 47–50 | Pending |

**Current phase:** 32 — Feature expansion backlog (IN PROGRESS)
**Latest completed slice:** 32 — Texture quality/performance setting
**Completed:** 23 of 50 phases
