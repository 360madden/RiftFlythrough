# RiftFlythrough Compact Handoff

**Date:** 2026-06-14
**Repo:** `C:\RIFT MODDING\RiftFlythrough`
**Branch:** `master`
**Current slice:** Visual fidelity baseline / Beauty profile - complete and pushed (`fff4363`)

## Current State
- Latest completed implementation commit: `fff4363 feat: add beauty visual profile`.
- GitHub Actions CI run `27508658471` is green across `python`, `javascript`, `html`, and `browser-smoke` jobs; browser-smoke includes the new `beauty-profile` artifact probe.
- User screenshot assessment is correct: the prior default human-facing view read as a debug/collision/map viewer, not a recognizable RIFT environment. The main visible offenders were grid/axes, ground/water reference planes, zone labels/overlays, point-only marker clouds, LOD point proxies, particles/weather noise, and sidebar/default UI states that made debug aids look primary.
- This slice adds a defensive visual-profile system:
  - `beauty` is the default clean scene profile.
  - `explore` restores map/navigation aids.
  - `debug` restores geometry inspection affordances, including wireframe.
- Beauty mode hides grid/axes, ground/water reference planes, wireframe, legend, zone labels/overlays, point clouds, particles, weather, and LOD proxies by default while preserving texture quality at `high`.
- Legacy localStorage settings that only contain old visual defaults migrate to Beauty. Explicit non-default visual overrides remain respected.
- Browser smoke/CI now has a dedicated Beauty-profile startup probe and can hide the click-to-fly overlay for useful visual artifacts.
- The clean Beauty artifact is better than the original screenshot because debug lines and point-cloud/particle noise are removed, but the app still does **not** look like the actual RIFT runtime yet. The remaining gap is asset/material/scene-fidelity work, not just viewer chrome.

## Files Changed In This Slice
- Added `js/visual_profiles.js` and `tests/visual_profiles.test.mjs` for pure Beauty/Explore/Debug preset coverage.
- Updated `js/settings.js`, `js/state.js`, `js/main.js`, and `js/ui.js` to make Beauty the default, persist profiles, apply live profile changes, and migrate old debug-default settings defensively.
- Updated `js/world.js` and `js/lod.js` to expose/toggle point-only groups and prevent hidden point clouds from being re-shown by LOD transitions.
- Updated zone modules (`zones.js`, `zone-overlays.js`, `zone-filter.js`, `zone-hover.js`, `selection.js`) so zone labels/overlays are actually hidden and non-interactive when Beauty disables them.
- Updated `flythrough.html`, `js/sidebar.js`, and `js/controls.js` so default sidebar dots/settings align with clean visual defaults and persisted toggles do not trigger legacy remigration.
- Hardened `check_browser_smoke.py` with Beauty visibility assertions, `--hide-start-overlay`, point-cloud/LOD/zone startup diagnostics, and a resilient sidebar wait fallback.
- Updated CI (`.github/workflows/ci.yml`) to retain a fourth `beauty-profile` browser-smoke artifact.
- Updated `README.md`, `HANDOFF.md`, and `knowledge.md` with the visual-profile and Beauty smoke contracts.

## Validation Run
Use CMD/Python where practical.

```cmd
python -m py_compile check.py check_js.py check_html.py validate_obj.py check_browser_smoke.py
node tests/visual_profiles.test.mjs
python check_js.py
python check_html.py
pytest tests/ -q
python validate_obj.py --obj merged.obj
python check.py
python check.py --browser
python check_browser_smoke.py --timeout 60 --strict-textures --texture-fixture --exercise-texture-quality-live --save-artifacts --artifacts-dir artifacts/browser-smoke/default-local
python check_browser_smoke.py --timeout 60 --settings-json '{"visualProfile":"beauty","gridVisible":false,"groundVisible":false,"waterVisible":false,"wireframeMode":false,"showLegend":false,"showZoneLabels":false,"pointCloudsVisible":false,"lodEnabled":false}' --expect-startup-settings --skip-sidebar-smoke --hide-start-overlay --save-artifacts --artifacts-dir artifacts/browser-smoke/beauty-profile-local
pre-commit run --all-files
```

Local results:
- `python -m py_compile check.py check_js.py check_html.py validate_obj.py check_browser_smoke.py`: PASS.
- `node tests/visual_profiles.test.mjs`: PASS.
- `python check_js.py`: PASS, all `32/32` JS modules/regression tests passed.
- `python check_html.py`: PASS.
- `pytest tests/ -q`: PASS, `69 passed`.
- `python validate_obj.py --obj merged.obj`: PASS, `30,864` faces, `350` groups.
- `python check.py`: PASS, all `6/6` checks passed, coverage `92.04%`.
- `python check.py --browser`: PASS, all `7/7` checks passed.
- Default strict browser smoke with texture fixture and live texture-quality exercise: PASS.
- Beauty-profile browser smoke with hidden start overlay and saved artifacts: PASS; report confirms `gridVisible=false`, `groundVisible=false`, `waterVisible=false`, `wireframeMode=false`, `pointCloudsVisible=false`, `visiblePointCloudGroupCount=0`, `showZoneLabels=false`, and `lodEnabled=false`.
- In-app Browser was opened against `http://127.0.0.1:8765/flythrough.html`; the click-to-fly overlay could not be dismissed by pointer lock in that Browser surface, but the visible background confirmed the debug line clutter was gone. The Playwright smoke artifact provides the unobstructed visual evidence.
- `pre-commit run --all-files`: PASS.
- GitHub Actions CI run `27508658471`: PASS across `python`, `javascript`, `html`, and `browser-smoke`; uploaded `browser-smoke-artifacts` now includes `beauty-profile/`.

## Important Notes
- Context7 Three.js docs were consulted before changing object/helper visibility patterns.
- Generated artifacts under `artifacts/` remain ignored and were not committed.
- `merged.obj`, `textures/converted/`, `objs/`, and other runtime assets were not modified.
- This is a necessary visual-fidelity baseline, not final RIFT-like fidelity. The app still needs material/asset/terrain/landmark reconstruction to become recognizable to a human familiar with RIFT.

## Next Best Actions
1. Build a fixed-camera visual benchmark suite (Beauty screenshots from 3-5 curated coordinates) so visual changes are comparable instead of anecdotal.
2. Audit `merged.obj` source semantics: classify terrain, buildings, water, props, foliage, collision/debug, and point-only exports before adding more rendering effects.
3. Add material-role mapping beyond color/normal: roughness/specular/gloss/emissive/alpha only after confirming source texture naming semantics.
4. Improve terrain readability with biome-aware fallback colors when linked textures are missing or incomplete.
5. Add a scene-only screenshot helper for Beauty profile, similar to texture-mode canvas captures, with sidebar/minimap/HUD hidden.
6. Add a “reference/game target” visual checklist from real RIFT captures: terrain color, sky/fog, water, foliage density, landmark silhouettes, scale, and lighting.
7. Investigate whether some current geometry is collision/helper/debug export data and should be filtered from Beauty entirely rather than merely recolored.
8. Add optional skybox/fog presets grounded in RIFT zone mood, but keep them profile-gated until validated against references.
9. Use browser-smoke artifacts from CI to review every visual-profile change before merging future rendering work.
10. Keep pushing small validated visual slices; avoid broad shader/material rewrites until the asset-classification evidence is solid.
