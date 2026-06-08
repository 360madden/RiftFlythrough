# RiftFlythrough Session Handoff

## Session Summary

**20 releases shipped** across v1.15.0–v1.35.0. The project has 13 JS modules, 9 Python scripts, 3 CI jobs, and ~50 total features/toggles/validators.

---

## Release History (v1.15–v1.35)

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
| v1.30.0 | Shortcut hints added to main overlay (G wireframe, R grid, O orbit, T tour, V gallery, B bookmark, [ ] cycle, / search, legend teleport) |
| v1.31.0 | Home (H) teleport toast notification |
| v1.32.0 | Bookmark inline rename — double-click name to edit |
| v1.33.0 | Ground plane toggle (U key) with toast |
| v1.34.0 | U key hints added to main + help overlays |
| v1.35.0 | Water plane toggle (Y key) with toast + overlay hints |

---

## Architecture

### JS Modules (`js/`) — 13 files

```
js/
├── main.js          # Entry point, animate loop, crash recovery, FPS counter
├── state.js         # Shared mutable state (exported plain object)
├── scene.js         # THREE.Scene, PerspectiveCamera, WebGLRenderer, resize
├── lighting.js      # LIGHT_MODES (Day/Sunset/Night/Dawn), transitions, fog density
├── world.js         # OBJLoader, axes, grid, ground plane, water plane, legend, toggles
├── controls.js      # WASD/mouse input, pointer lock, orbit mode
├── minimap.js       # 2D canvas minimap with compass, ticks, click-to-teleport
├── selection.js     # Raycaster mesh selection, wireframe highlight, deselect
├── settings.js      # localStorage-backed settings with defaults and apply
├── ui.js            # All keyboard handlers, overlays, search, bookmarks, gallery, toasts
├── teleport.js      # Shared flyToGroup() utility (camera + highlight + HUD)
├── tour.js          # Auto-fly tour with bookmark/spiral waypoints
├── utils.js         # Golden-angle HSL color generator
```

### Import Dependencies

```
main.js → controls, lighting, minimap, scene, settings, state, world, ui, tour
world.js → scene, state, utils, teleport
ui.js → lighting, scene, selection, settings, state, world, teleport
tour.js → scene, state
lighting.js → scene, state
controls.js → scene, state, ui (showToast)
teleport.js → scene, state, selection
selection.js → scene, state
settings.js → lighting, state
minimap.js → state
```

### State fields (js/state.js)

29 fields total. Key visibility toggles: `wireframeMode`, `gridVisible`, `groundVisible`, `waterVisible`. Tour fields: `tourActive`, `tourPaused`, `tourSpeed`, `tourWaypoints`, `tourIdx`, `tourT`. Bookmark fields: `bookmarks`, `bookmarkIdx`. Settings-backed: `moveSpeed`, `mouseSensitivity`, `minimapSize`, `fogDensity`, `waterOpacity`, `groundOpacity`, `renderScale`, `lightMode`.

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
| L | Cycle day/night (4 modes) |
| 1 2 3 4 | Day / Sunset / Night / Dawn |
| H | Teleport home (toast: "Teleported home") |
| P | Screenshot (saves + gallery, toast) |
| F | Toggle FPS counter |
| F1 | Help overlay |
| Tab | Settings panel |
| I | OBJ statistics panel |
| V | Screenshot gallery |
| G | Toggle wireframe (toast) |
| O | Toggle orbit camera (toast) |
| R | Toggle grid + axes visibility (toast) |
| U | Toggle ground plane visibility (toast) |
| Y | Toggle water plane visibility (toast) |
| T | Auto-fly tour (toast: started/stopped) |
| Space (tour) | Pause/resume tour (toast) |
| +/- (tour) | Adjust tour speed (0.25x–4.0x, HUD indicator) |
| B | Save bookmark at current position (toast) |
| [ ] | Cycle bookmarks (prev/next) |
| / | Search groups by name |
| Shift+click legend | Teleport to group (fly, highlight, show name) |
| Click legend | Toggle group visibility |
| Dbl-click bookmark | Rename bookmark inline (Enter=save, Esc=cancel) |
| Click mesh | Select group (wireframe highlight + HUD name) |
| Esc | Deselect mesh / close overlays / release mouse |

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
- **controls.js imports showToast from ui.js** — be mindful of circular deps (no cycle currently)
- **Settings persist** in localStorage; bookmarks persist separately under their own key
- **All overlays** use z-index stacking: toast=9, tooltip=8, minimap=5, overlays=15-17, loading=20, crash=30, load-status=21
- **Tour starts async**: dynamic import of tour.js; "Tour started" toast fires after load
- **Clear bookmarks** requires double-click within 2.5s for safety
- **Orbit camera** respects worldGroundY clamp — won't go below terrain
- **Visibility toggles** (grid, ground, water, wireframe) are runtime-only — not persisted across reloads
- **Bookmark rename** uses 250ms single/double-click disambiguation; single click still teleports
- **Toggle pattern**: G/R/U/Y each follow identical state bool → setter → key handler → toast → overlay hint
