# RiftFlythrough Session Handoff

## Session Summary

**14 releases shipped** across v1.15.0–v1.29.0. The project grew from 8 JS modules to 13, added 3 CI scripts, and accumulated ~40 new features/hooks/validators.

---

## Release History (v1.15–v1.29)

| Version | Feature |
|---------|---------|
| v1.15.0 | Orbit camera ground clamp — won't sink below terrain |
| v1.16.0 | Fog density + water opacity sliders in settings |
| v1.17.0 | Tour pause/resume (Space) and speed control (+/-) |
| v1.18.0 | Tour speed HUD indicator on +/- press |
| v1.19.0 | Ground plane opacity slider in settings |
| v1.20.0 | Tour pause indicator overlay ("PAUSED") |
| v1.21.0 | Grid/axes visibility toggle (R key) |
| v1.22.0 | Toast notifications for 9 key actions |
| v1.23.0 | Bookmark export/import as JSON file |
| v1.24.0 | OBJ load status indicator (✓/✗) |
| v1.25.0 | Bookmark import now appends instead of replaces |
| v1.26.0 | Clear-all bookmarks with double-click confirmation |
| v1.27.0 | Shift+click legend entry to teleport to group |
| v1.28.0 | Legend shift+click hint ("Click=toggle • Shift+click=teleport") |
| v1.29.0 | Extract shared flyToGroup() utility — dedupe teleport logic |

---

## Architecture

### JS Modules (`js/`) — 13 files

```
js/
├── main.js          # Entry point, animate loop, crash recovery, FPS counter
├── state.js         # Shared mutable state (exported plain object)
├── scene.js         # THREE.Scene, PerspectiveCamera, WebGLRenderer, resize
├── lighting.js      # LIGHT_MODES (Day/Sunset/Night/Dawn), transitions, fog density
├── world.js         # OBJLoader, axes, grid, ground plane, water plane, legend
├── controls.js      # WASD/mouse input, pointer lock, orbit mode
├── minimap.js       # 2D canvas minimap with compass, ticks, click-to-teleport
├── selection.js     # Raycaster mesh selection, wireframe highlight, deselect
├── settings.js      # localStorage-backed settings with defaults and apply
├── ui.js            # All keyboard handlers, overlays, search, bookmarks, gallery, toasts
├── teleport.js      # NEW — shared flyToGroup() utility (camera + highlight + HUD)
├── tour.js          # NEW — auto-fly tour with bookmark/spiral waypoints
├── utils.js         # Golden-angle HSL color generator
```

### Import Dependencies

```
main.js → controls, lighting, minimap, scene, settings, state, world, ui, tour
world.js → scene, state, utils, selection, teleport
ui.js → lighting, scene, selection, settings, state, world, teleport
tour.js → scene, state
lighting.js → scene, state
controls.js → scene, state
teleport.js → scene, state, selection
selection.js → scene, state
settings.js → lighting, state
minimap.js → minimap... → state
```

### Python Tooling

| File | Purpose |
|------|---------|
| `run.py` | Cross-platform launcher (HTTP server + browser) |
| `dev.py` | Dev server with WebSocket live reload |
| `release.py` | Automated release: health check → changelog → commit → tag → push |
| `check.py` | Unified health check (ruff + pytest + JS + HTML + OBJ) |
| `check_js.py` | JS syntax validation via `node --check` (13 modules) |
| `check_html.py` | HTML structure validation (DOCTYPE, tags, balance) |
| `merge_objs.py` | OBJ merge tool |
| `validate_obj.py` | OBJ integrity validator |
| `changelog.py` | Changelog generator |
| `pyproject.toml` | Ruff (E, F, W, I, N, B, C4, SIM, RUF, UP, TRY, C90), pytest-cov ≥70% |

---

## Key Controls Reference

| Key | Action |
|-----|--------|
| WASD / Space / Ctrl | Move / fly up / fly down |
| Mouse | Look around |
| Scroll | Adjust speed |
| Shift | Sprint (3x) |
| M | Toggle minimap |
| L | Cycle day/night |
| 1 2 3 4 | Day / Sunset / Night / Dawn |
| H | Teleport home |
| P | Screenshot (saves + gallery) |
| F | Toggle FPS |
| F1 | Help overlay |
| Tab | Settings panel |
| I | OBJ statistics |
| V | Screenshot gallery |
| G | Toggle wireframe |
| O | Toggle orbit camera |
| R | Toggle grid/axes |
| T | Auto-fly tour |
| Space (tour) | Pause/resume tour |
| +/- (tour) | Adjust tour speed |
| B | Save bookmark |
| [ ] | Cycle bookmarks |
| / | Search groups |
| Shift+click legend | Teleport to group |
| Click legend | Toggle group visibility |
| Click mesh | Select group (wireframe) |
| Esc | Deselect / close overlays |

---

## Settings Panel (8 sliders + 2 checkboxes)

- Mouse sensitivity (0.5–10)
- Default speed (5–500)
- Minimap size (100–400px)
- Show minimap on start
- Show FPS on start
- Render scale (25%–100%)
- Fog density (0.25x–2.0x)
- Water opacity (0%–100%)
- Ground opacity (0%–100%)

---

## CI Pipeline (`.github/workflows/ci.yml`)

3 parallel jobs:
- **python**: ruff check + format + pytest-cov ≥70% + OBJ validate
- **javascript**: `node --check` on all 13 JS modules
- **html**: `check_html.py` structure validation

---

## Gotchas

- **No build step**: ES modules via CDN importmap; must be served over HTTP
- **Three.js 0.170**: Importmap pinned; breaking changes require migration
- **13 JS modules**: Added teleport.js, tour.js since v1.14.0
- **Settings persist** in localStorage; bookmarks persist separately
- **All overlays** use z-index stacking: toast=9, tooltip=8, minimap=5, overlays=15-17, loading=20, crash=30, load-status=21
- **Tour starts async**: dynamic import of tour.js; "Tour started" toast fires after load
- **Clear bookmarks** requires double-click within 2.5s for safety
- **Orbit camera** respects worldGroundY clamp — won't go below terrain
