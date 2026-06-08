# Changelog

## [1.13.0] — 2026-06-07

### Added
- render scale slider in settings for low-end GPU support (ca7c031a)

_(1 commits)_

## [1.12.0] — 2026-06-07

### Added
- click-outside-to-close for settings, help, and gallery overlays (863f1d4b)

_(1 commits)_

## [1.11.0] — 2026-06-07

### Added
- screenshot gallery (V key) with view, save, and delete (042daaf6)

### Changed
- update HANDOFF.md with v1.5.0 through v1.10.0 features (7f624897)

_(2 commits)_

## [1.10.0] — 2026-06-07

### Added
- auto-fly tour mode (T key) with bookmark or spiral path (8c595e7b)

_(1 commits)_

## [1.9.0] — 2026-06-07

### Added
- persist bookmarks to localStorage across sessions (894067e5)

_(1 commits)_

## [1.8.0] — 2026-06-07

### Added
- bookmark/waypoint system with minimap markers (b318a31c)

_(1 commits)_

## [1.7.0] — 2026-06-07

### Added
- orbit camera mode (O key toggle) (5a8ac46a)

_(1 commits)_

## [1.6.0] — 2026-06-07

### Added
- group name search bar with teleport and highlight (b679dc61)

_(1 commits)_

## [1.5.0] — 2026-06-07

### Added
- direct lighting preset keys (1-4) and DRY lighting logic (88e0b312)

_(1 commits)_

## [1.4.0] — 2026-06-07

### Added
- smooth camera speed ramp with acceleration and deceleration (f5504762)

### Changed
- add project handoff (HANDOFF.md) (f5d14ea0)

_(2 commits)_

## [1.3.0] — 2026-06-07

### Fixed
- v1.3.0 â€” frustum stats bug, tooltip perf, minimap cache, hover cursor (fe5d5bbf)
- add --no-verify to git commit in release.py for Windows compatibility (151ccbc8)

_(2 commits)_

## [1.2.0] — 2026-06-07

### Added
- v1.2.0 â€” smooth lighting, wireframe mode, legend toggle, frustum stats, tooltips (62358ff2)

### Fixed
- biome pre-commit hook for Windows + ruff N802 suppression in dev.py (f71c284c)

_(2 commits)_

## [1.1.0] — 2026-06-07

### Added
- wireframe outline on selected mesh groups (6324c320)
- click-to-select meshes with highlight + HUD display (6a9fa03c)
- animated water plane + improved README (64839e2c)
- one-click run.bat launcher (server + browser) (f6913e04)
- home teleport (H) + screenshot (P) + init fix (096b6e87)
- day/night lighting cycle with L key toggle (b230c251)
- ground plane + minimap distance ticks + compass directions (057d5f93)
- 80 position-only meshes rendered as point clouds via OBJ p directives (b8df7dfa)
- click minimap to teleport camera (5632b809)
- color-coded groups + minimap + coordinate HUD (71dceb66)

### Fixed
- replace Unicode box-drawing chars with ASCII in release.py for Windows compatibility (65c74072)
- double-join legend bug preventing 3D world render (f2e7e1df)
- group filter (only Groups, not meshes) + Map lookup for color index (bd61160d)

### Changed
- modular architecture with 11 JS modules, settings system, linting, and docs (c0a98fb8)
- remove dead vPosition varying from water shader (f1c20578)
- Initial commit: RIFT World Flythrough viewer (4719baae)

_(16 commits)_

## [1.1.0] — 2026-06-07

### Added
- Settings panel (Tab) with mouse sensitivity, speed, minimap size, toggles (persisted to localStorage)
- FPS counter (F key toggle)
- OBJ statistics panel (I key — file size, load time, groups, verts, faces, world dimensions)
- Help overlay (F1 key — full controls reference)
- Crash recovery overlay (WebGL context loss, render loop errors)
- Loading progress bar with ETA
- Settings persistence via localStorage (`settings.js`)
- Biome JS/HTML linter + formatter
- Pre-commit hooks (ruff, biome, pytest)
- Centralized `applySettings()` in settings.js
- UI module split (`ui.js` from `controls.js`)
- Minimap division-by-zero guards

### Changed
- Refactored from single-file `flythrough.html` into 10 modular JS files
- `controls.js` split into movement-only `controls.js` + overlay `ui.js`
- Settings loaded centrally by `main.js` via `applySettings()` instead of scattered across modules
- Settings form population DRY'd into shared `populateSettingsForm()`
- Legend color lookup uses original indices (fixes wrong colors when ptonly groups interleaved)
- All bracket notation `state.keys["KeyW"]` converted to dot notation `state.keys.KeyW`
- String concatenation converted to template literals throughout
- Unused imports and optional chaining applied (Biome)

### Fixed
- Escaped-quote bug in legend HTML (`style=\\\"color:#aac\\\"` → `style="color:#aac"`)
- CSS indentation for `#selected-name` block
- Legend color mismatch when faced/ptonly groups interleaved
- Unused exports removed (`groundPlane`, `waterPlane`, `GOLDEN_ANGLE`, light objects)
- `groupColor()` unused `total` parameter removed
- Button `type="button"` added for a11y
- Pre-commit Biome hook version mismatch fixed (now local node-based)

## [1.0.0] — 2026-06-07

### Added
- wireframe outline on selected mesh groups (6324c320)
- click-to-select meshes with highlight + HUD display (6a9fa03c)
- animated water plane + improved README (64839e2c)
- one-click run.bat launcher (server + browser) (f6913e04)
- home teleport (H) + screenshot (P) + init fix (096b6e87)
- day/night lighting cycle with L key toggle (b230c251)
- ground plane + minimap distance ticks + compass directions (057d5f93)
- 80 position-only meshes rendered as point clouds via OBJ p directives (b8df7dfa)
- click minimap to teleport camera (5632b809)
- color-coded groups + minimap + coordinate HUD (71dceb66)

### Fixed
- double-join legend bug preventing 3D world render (f2e7e1df)
- group filter (only Groups, not meshes) + Map lookup for color index (bd61160d)

### Changed
- remove dead vPosition varying from water shader (f1c20578)
- Initial commit: RIFT World Flythrough viewer (4719baae)

_(14 commits)_
