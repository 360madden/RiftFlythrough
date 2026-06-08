# Changelog

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
