# RiftFlythrough — Handoff

**Repo:** `github.com/360madden/RiftFlythrough`  
**Tags:** v1.1.0–v1.13.0 · **Latest:** v1.13.0  
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

## Architecture (12 ES modules under `js/`)
```
main.js       — animate loop, FPS, crash recovery, tooltip, frustum stats
state.js      — shared mutable state object (no imports)
scene.js      — THREE.Scene, camera, renderer, resize, render scale
lighting.js   — 4 day/night presets + smooth lerp transitions
world.js      — OBJ loader, water/ground planes, legend, group visibility
controls.js   — WASD/mouse, pointer lock, smooth speed ramp, orbit camera
ui.js         — Settings, help, stats, screenshots, gallery, search, bookmarks, lighting
minimap.js    — 2D canvas minimap with compass, ticks, click-to-teleport, bookmarks
selection.js  — Raycaster mesh selection with wireframe highlight
settings.js   — localStorage persistence + centralized applySettings()
tour.js       — Auto-fly tour mode (bookmark or spiral path)
utils.js      — HSL golden-angle color generator
```

## Controls reference
| Key | Action |
|-----|--------|
| WASD / Space / Ctrl | Move / up / down |
| Shift | Sprint (3x) |
| Mouse / Scroll | Look / adjust speed |
| Tab | Settings panel |
| F1 | Help overlay |
| F | FPS toggle |
| G | Wireframe toggle |
| I | Stats panel |
| L / 1 2 3 4 | Cycle lighting / Day Sunset Night Dawn |
| M | Minimap toggle |
| H | Teleport home |
| P | Screenshot (saves to gallery) |
| V | Screenshot gallery (view, save, delete) |
| O | Orbit camera mode |
| B / [ ] | Save bookmark / cycle bookmarks |
| T | Auto-fly tour mode |
| / | Group name search (teleport + highlight) |
| Esc | Deselect / close overlay |
| Click mesh | Select (wireframe highlight) |
| Click minimap | Teleport |
| Click outside overlay | Close overlay |

## Key features (by version)
- **v1.1.0:** Modular refactor, settings, FPS, stats, help, crash recovery, Biome/ruff/pre-commit, 28 tests, CI
- **v1.2.0:** Smooth lighting, wireframe, legend toggle, frustum stats, tooltips
- **v1.3.0:** Frustum bugfix, tooltip/minimap perf, hover cursor
- **v1.4.0:** Smooth camera speed ramp
- **v1.5.0:** Direct lighting keys (1-4), DRY'd lighting logic
- **v1.6.0:** Group name search + teleport
- **v1.7.0:** Orbit camera mode (O)
- **v1.8.0:** Bookmark/waypoint system (B, [, ])
- **v1.9.0:** Bookmark localStorage persistence
- **v1.10.0:** Auto-fly tour mode (T)
- **v1.11.0:** Screenshot gallery (V)
- **v1.12.0:** Click-outside-to-close overlays
- **v1.13.0:** Render scale slider (25%–100%) for low-end GPUs

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
