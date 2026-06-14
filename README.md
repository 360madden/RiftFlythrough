# RIFT World Flythrough

Offline 3D flythrough viewer for the RIFT MMORPG game world, built from extracted OBJ geometry. Fly through the world like Glider for Ultima Online.

## Quickstart

**One click:** `python run.py` → server starts + browser opens.

**Dev mode (live reload):** `python dev.py` → auto-refreshes on file changes.

**Or manually:**
```bash
python -m http.server 8000
# Open http://localhost:8000/flythrough.html
```

Click the page to lock the mouse, then fly.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move forward/left/back/right |
| Mouse | Look around |
| Space / Ctrl | Fly up / down |
| Shift | Sprint (3x speed) |
| Scroll | Adjust move speed |
| **M** | Toggle minimap |
| **L** | Cycle day/night lighting (4 modes) |
| **H** | Teleport home (overview) |
| **P** | Save screenshot (PNG) |
| **Tab** | Settings panel |
| **F1** | Help overlay |
| **F** | Toggle FPS counter |
| **I** | Toggle OBJ statistics |
| **Click minimap** | Teleport to that location |
| **Click mesh** | Select mesh group (wireframe highlight) |
| Esc | Deselect mesh / release mouse |

## Features

- **350 world groups**: 270 colored mesh families + 80 point clouds
- **23,421 vertices, 30,864 faces** spanning ~3,200 units
- **Minimap** with compass directions, distance ticks, click-to-teleport
- **Day/night cycle** (Day, Sunset, Night, Dawn)
- **Animated water plane** at Y=0 with wave displacement
- **Semi-transparent ground plane** for height reference
- **Coordinate HUD** with real-time position and speed
- **Point clouds** for position-only meshes (rendered as colored dots)
- **Screenshot capture** (press P)
- **Click-to-select** meshes with wireframe highlight
- **Texture quality setting** to choose color-only rendering or cap anisotropic filtering for performance; loaded texture maps update live

## Project Structure

```
RiftFlythrough/
├── flythrough.html        # Shell: HTML + CSS, imports js/main.js
├── js/
│   ├── main.js            # Entry point, animate loop, FPS, crash recovery
│   ├── state.js           # Shared mutable state object
│   ├── scene.js           # THREE.Scene, camera, renderer, resize
│   ├── lighting.js        # LIGHT_MODES, ambient/directional/hemi lights
│   ├── world.js           # OBJ loader, axes, grid, water/ground planes
│   ├── controls.js        # WASD/mouse input, pointer lock, movement
│   ├── ui.js              # Overlay toggles, settings panel, key actions
│   ├── minimap.js         # 2D canvas minimap, click-to-teleport
│   ├── selection.js       # Raycaster selection, highlight/deselect
│   ├── settings.js        # localStorage persistence + applySettings
│   ├── texture_quality.js # Pure texture quality/anisotropy setting helpers
│   ├── texture_roles.js   # Pure texture color/normal role classifier
│   └── utils.js           # Golden-angle HSL color generator
├── merge_objs.py          # OBJ merge tool
├── validate_obj.py        # OBJ integrity validator
├── run.py                 # One-click launcher (cross-platform)
├── dev.py                 # Dev server with live reload (WebSocket)
├── check.py               # Unified health check (ruff + pytest coverage + JS/HTML + OBJ)
├── check_browser_smoke.py # Playwright runtime smoke test for flythrough.html
├── changelog.py           # Changelog generator from git history
├── release.py             # Release pipeline (check → changelog → tag → push)
├── tests/
│   ├── test_merge_objs.py # 17 pytest unit tests
│   └── test_validate_obj.py # 11 pytest unit tests
├── pyproject.toml         # Python project config (pytest, ruff, hatchling)
├── biome.json             # Biome linter/formatter config (JS/HTML)
├── .pre-commit-config.yaml # Pre-commit hooks (ruff, biome, pytest)
└── .github/workflows/ci.yml # CI pipeline (lint, test, validate)
```

## Dev Tooling

| Command | Purpose |
|---------|---------|
| `python -m pip install -e ".[dev]"` | Install local dev/test tooling |
| `python -m playwright install chromium` | Install Chromium for browser smoke tests |
| `python run.py [--port 8000]` | Start static server + open browser |
| `python dev.py [--port 8000]` | Dev server with live reload (watches js/, merged.obj) |
| `python validate_obj.py [--obj merged.obj] [-v]` | Validate OBJ integrity |
| `python merge_objs.py --objs-dir <path> --faced-only --include-pos-only` | Merge OBJ exports |
| `python check.py` | Unified health check (ruff + pytest coverage + JS/HTML + OBJ) |
| `python check.py --browser` | Unified health check plus Playwright browser smoke test |
| `python check_browser_smoke.py` | Runtime smoke test for module load, OBJ load, world stats, sidebar controls/overlays, crash overlay, optional persisted settings probes, and timing telemetry |
| `python check_browser_smoke.py --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts` | Strict generated-texture URL smoke with a temporary ignored PNG fixture, live texture-quality UI coverage, and retained screenshot/report artifacts |
| `python check_browser_smoke.py --settings-json '{"textureQuality":"off"}' --expect-texture-status off --forbid-generated-texture-requests --skip-sidebar-smoke` | Fast startup smoke proving texture-off mode skips generated texture requests |
| `python check_js.py` | JS syntax/import checks plus JS regression tests |
| `ruff check .` / `ruff format .` | Lint / format Python code |
| `pytest tests/` | Run unit tests |
| `pre-commit run --all-files` | Run all pre-commit hooks manually |

## Contributing

Read [AGENTS.md](AGENTS.md) before changing code or assets. Keep changes focused, run `python check.py` for code changes, run `python check.py --browser` for viewer/runtime changes, and include screenshots or GIFs in pull requests that alter the viewer UI.

## Updating the world

When new OBJs are exported from the [RIFT Assets](https://github.com/360madden/rift-assets) project:

```bash
python merge_objs.py --objs-dir ../Assets/Exports --faced-only --include-pos-only
python validate_obj.py
```

This merges all OBJs into `merged.obj` and validates integrity. The viewer auto-loads it.

## Tech

- Three.js 0.170 (CDN importmap, no build step)
- ES modules (31 JS files under `js/`)
- Custom GLSL water shader
- OBJLoader for geometry
- Python 3 tooling (launcher, dev server, merger, validator, tests, CI with branch-level concurrency)
- Playwright browser smoke coverage for runtime module/load, sidebar-control, and overlay regressions
- Biome for JS/HTML linting, ruff for Python linting
- Zero npm/bundler dependencies
