# RiftFlythrough — Handoff

**Repo:** `github.com/360madden/RiftFlythrough`  
**Tags:** v1.1.0, v1.2.0, v1.3.0 · **Next:** v1.4.0 (unreleased, smooth speed ramp on `master`)  
**State:** Clean working tree, all checks pass, CI green

## What it is
Offline 3D flythrough viewer for the RIFT MMORPG world. Renders `merged.obj` (~38MB, 350 groups, ~23K verts) with Three.js. Fly with WASD + mouse look.

## Quickstart
```
python run.py           # Start server + open browser
python dev.py           # Dev mode with live reload
python check.py --quick # Health check (ruff + format + pytest)
python release.py X.Y.Z # Cut a release (check → changelog → tag → push)
```

## Architecture (11 ES modules under `js/`)
```
main.js       — animate loop, FPS, crash recovery, tooltip, frustum stats
state.js      — shared mutable state object (no imports)
scene.js      — THREE.Scene, camera, renderer, resize handler
lighting.js   — 4 day/night presets + smooth lerp transitions
world.js      — OBJ loader, water/ground planes, legend, group visibility
controls.js   — WASD/mouse, pointer lock, smooth speed ramp
ui.js         — Settings panel, help, stats, screenshots, wireframe toggle
minimap.js    — 2D canvas minimap with compass, ticks, click-to-teleport
selection.js  — Raycaster mesh selection with wireframe highlight
settings.js   — localStorage persistence + centralized applySettings()
utils.js      — HSL golden-angle color generator
```

## Key features (by version)
- **v1.1.0:** Modular refactor from single HTML file, settings panel (Tab), FPS (F), stats (I), help (F1), crash recovery, Biome/ruff/pre-commit, 28 pytest tests, CI
- **v1.2.0:** Smooth lighting transitions (L), wireframe mode (G), legend click-to-toggle, frustum culling stats, group label tooltips
- **v1.3.0:** Frustum stats bugfix, tooltip throttle (3-frame), minimap centroid cache, hover cursor
- **v1.4.0 (unreleased):** Smooth camera speed ramp with acceleration/deceleration

## Controls reference
| Key | Action |
|-----|--------|
| WASD | Move |
| Space/Ctrl | Up/Down |
| Shift | Sprint (3x) |
| Mouse | Look |
| Scroll | Speed |
| Tab | Settings |
| F1 | Help |
| F | FPS toggle |
| G | Wireframe toggle |
| I | Stats panel |
| L | Cycle lighting |
| M | Minimap toggle |
| H | Teleport home |
| P | Screenshot |
| Esc | Deselect / close overlay |
| Click mesh | Select (wireframe highlight) |
| Click minimap | Teleport |

## Dev tooling
```
biome.json              — JS/HTML linting
.pre-commit-config.yaml — ruff, ruff-format, biome-check, pytest
.github/workflows/ci.yml — GitHub Actions CI
pyproject.toml          — pytest, ruff, hatchling config
```

## Gotchas
- Must be served over HTTP (ES module importmap won't work from `file://`)
- Biome pre-commit hook uses `language: system` + `npx --yes` for Windows compat
- `release.py` uses `--no-verify` on git commit (pre-commit needs bash, unavailable on Windows)
- `knowledge.md` has full architecture docs

## Next up
- Cut v1.4.0 release: `python release.py 1.4.0`
- Group name search bar → highlight/teleport to meshes
- Orbit camera mode (click to orbit around point)
