# RiftFlythrough Compact Handoff

**Date:** 2026-07-19  
**Repo:** `C:\RIFT MODDING\RiftFlythrough`  
**Branch:** `master`  
**HEAD (at handoff write):** `5ab62e8` — free-cursor UI mode, delivery zones/textures, interaction fixes  
**Roadmap:** **`ROADMAP.md` is authoritative for milestones and priorities.**

## Current state

- Code/UI slice pushed: pointer-lock vs menus (`js/ui_mode.js`), delivery JSON (`js/riftflythrough-delivery.json`, `texture_loader.js`, transform tag-only + zones), large bugfix pass.
- **Full `python check.py` FAILS** solely on `validate_obj` for `merged.obj`.
- **Browser smoke PASSES** (e.g. groups=165, faces=78,329, optional_texture_404s=0).
- **Quick check / pytest / JS / HTML / pre-commit PASS.**

### Asset metrics (2026-07-19)

| Metric | Value |
|--------|--------|
| Groups | 227 (165 faced, 62 point-only) |
| Faces / verts / normals | 78,329 / 72,100 / 14,008 |
| `validate_obj` issues | ~59,368 (face normal index out of range) |
| Texture face coverage | ~30.2% |
| Delivery | 152 assets, 402 texture URLs, 4 non-identity transforms (not applied; baked mesh) |
| Beauty audit | keep 77 / hide-by-default 112 |

## Active milestone

**M1 — Geometry integrity (P0.1)**  
See `ROADMAP.md` § M1.

**Next concrete actions:**

1. Root-cause normal OOB: source OBJs vs `merge_objs.offset_face_indices` vs write order.
2. Fix merge and/or re-export; rebuild `merged.obj`.
3. `validate_obj` green → full `check.py` green.
4. Add regression tests for vn offset / OOB faces.
5. Update metrics in ROADMAP + this handoff.

## Recently completed (not full fidelity)

- Free-cursor UI mode; Esc frees cursor without start-overlay hijack.
- Delivery zone tags + source-zone filter; transforms tag-only on baked OBJ.
- Delivery texture overlay ready-flag; role classifier hardened for zone prefixes.
- Search, selection (center raycast + Standard materials), weather/audio, fog lerp, composer DPR, XSS escapes, face index 0 rejection, etc.

## Validation commands

```cmd
python check.py
python check.py --quick
python validate_obj.py --obj merged.obj --stats
pytest tests/ -q
python check_js.py
python check_browser_smoke.py --timeout 90 --hide-start-overlay --save-artifacts --artifacts-dir artifacts/browser-smoke/default
pre-commit run --all-files
```

## Important notes

- `artifacts/` ignored — do not commit.
- Do not double-apply delivery transforms on world-baked `merged.obj`.
- Prefer Assets export + merge fixes over more viewer chrome until M1–M3 land.
- Untracked local noise: `server.log`, `server_fresh.log`.

## Next best actions (ranked)

1. **M1:** Fix normal indices / rebuild `merged.obj` / green validate.  
2. **M2:** Hash coverage metric + recovery for unhashed groups.  
3. **M3:** Placement / world span metric for trusted geometry.  
4. **M4:** Texture coverage ≥ 50% + material role tests.  
5. **M5:** Await tagging/textures before camera frame + zone UI finalize.  
6. Settings SSOT / zone label master toggle (P2).  
7. Keep swarm agents on M1 diagnosis until validate is green.

## Agent instructions

1. Read `ROADMAP.md` then this file.  
2. Plan → execute → validate → update this handoff.  
3. Conventional commits; push when milestone slice is green.  
