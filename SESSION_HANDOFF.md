# RiftFlythrough — Session Handoff (June 2026)

**Repo:** `github.com/360madden/RiftFlythrough`  
**Tags:** v1.1.0 → v1.14.0  
**State:** Clean, CI green, all checks pass  
**Modules:** 12 JS files under `js/`, 28 pytest tests, 4 pre-commit hooks

## Architecture
```
main.js       — animate loop, FPS, crash recovery, tooltip, frustum stats
state.js      — shared mutable state (no imports, single source of truth)
scene.js      — THREE.Scene, camera, renderer, resize, render scale
lighting.js   — 4 presets (Day/Sunset/Night/Dawn) + smooth lerp transitions
world.js      — OBJ loader, water shader, ground plane, legend, group visibility
controls.js   — WASD free-fly + orbit camera, smooth speed ramp, pointer lock
ui.js         — Overlays, settings, help, stats, gallery, search, bookmarks, lighting
minimap.js    — 2D canvas with compass, distance ticks, group dots, bookmarks, teleport
selection.js  — Raycaster mesh selection with wireframe highlight
settings.js   — localStorage persistence + centralized applySettings()
tour.js       — Auto-fly tour (bookmarks or spiral path, smooth lerp)
utils.js      — HSL golden-angle color generator
```

## Release History

| Version | Feature |
|---------|---------|
| v1.1.0 | Modular architecture (11→12 JS files), settings, linting, CI |
| v1.2.0 | Smooth lighting, wireframe, legend toggle, group tooltips |
| v1.3.0 | Frustum bugfix, tooltip/minimap perf, hover cursor |
| v1.4.0 | Smooth camera speed ramp (accel/decel) |
| v1.5.0 | Direct lighting keys (1-4), DRY'd lighting logic |
| v1.6.0 | Group name search + teleport + highlight |
| v1.7.0 | Orbit camera mode (O) |
| v1.8.0 | Bookmark/waypoint system (B, [, ]) |
| v1.9.0 | Bookmark localStorage persistence |
| v1.10.0 | Auto-fly tour mode (T) |
| v1.11.0 | Screenshot gallery (V) |
| v1.12.0 | Click-outside-to-close overlays |
| v1.13.0 | Render scale slider (25%–100%) |
| v1.14.0 | Refactor ui.js keydown into 3 handler groups + docs |

## Key Commands
```
python run.py           # Start server + open browser
python dev.py           # Dev mode with live reload
python check.py --quick # Health check (ruff + format + pytest)
python release.py X.Y.Z # Cut a release
```

## Controls Quick Reference
| Key | Action |
|-----|--------|
| WASD/Space/Ctrl | Free-fly movement |
| Shift | Sprint (3x) |
| Mouse/Scroll | Look / speed |
| Tab | Settings |
| F1 | Help |
| F/G/I | FPS / wireframe / stats |
| L / 1 2 3 4 | Cycle lighting / presets |
| M | Minimap |
| H | Home teleport |
| P / V | Screenshot / gallery |
| O | Orbit camera |
| B / [ ] | Save / cycle bookmarks |
| T | Auto-fly tour |
| / | Group search |

## Gotchas
- Must be served over HTTP (ES module importmap)
- Biome hook uses `language: system` + `npx --yes` for Windows
- `release.py` uses `--no-verify` on git commit (pre-commit needs bash)

## Next Up
- Tour pause/resume + speed control
- Orbit ground clamp (prevent camera below terrain)
- Screenshot gallery full-size preview on thumbnail click
