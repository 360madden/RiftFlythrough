# RiftFlythrough Roadmap

**Status:** Active  
**Last updated:** 2026-07-19  
**Branch:** `master`  
**Authoritative for:** prioritization of fidelity work, milestones, exit criteria  

> Agents and humans: treat this file as the durable plan. Update `SESSION_HANDOFF.md` after each completed milestone with evidence (commands, numbers, commit SHAs). Do not expand scope into new viewer features until P0 exit criteria are met.

---

## Problem statement

RiftFlythrough is a capable offline Three.js flythrough shell. The main product failure is **asset truth**, not missing UI:

1. Extracted geometry is incomplete, poorly identified, and sometimes invalid.
2. World placement is largely baked / collapsed — not a coherent RIFT map.
3. Texture linkage is partial and dual-sourced.
4. Viewer polish (profiles, weather, speedrun, etc.) outpaced source recovery.

**North star:** A recognizable slice of a RIFT environment (placement span + materials + honest Beauty mode), with green local/CI integrity checks on `merged.obj`.

---

## Priority stack (do in order)

| Priority | Theme | Goal |
|----------|--------|------|
| **P0** | Foundation / truth | Valid geometry, identity, placement |
| **P1** | Visible fidelity | Textures, materials, Beauty honesty, load order |
| **P2** | Correctness polish | Visibility policy, settings SSOT, zone UX |
| **P3** | Later | Feature polish, CSP, more baselines |

**Rule:** If work does not improve **hashes, placement, normals/geometry integrity, or textures**, it is secondary until P0/P1 exit criteria pass.

---

## Milestone plan

### M0 — Roadmap locked (docs)

**Status:** In progress → complete when this file is on `origin/master`.

| Deliverable | Done when |
|-------------|-----------|
| `ROADMAP.md` published | This file committed + pushed |
| `SESSION_HANDOFF.md` current | Matches HEAD + next milestone |
| `HANDOFF.md` pointer | Points agents to ROADMAP + SESSION_HANDOFF |

---

### M1 — Geometry integrity (P0.1)

**Status:** Next  
**Owner focus:** Python merge/export + `merged.obj` rebuild  

| Work item | Notes |
|-----------|--------|
| Diagnose normal index overflow | ~59k `validate_obj` failures: face `vn` > total normals (~14k) |
| Fix `merge_objs.py` and/or source export | Offset bugs, missing `vn` lines, or bad source OBJs |
| Rebuild `merged.obj` from Exports | Prefer faced geometry; keep group names with hashes |
| Gate: `python validate_obj.py --obj merged.obj` | **Zero hard errors** (or documented allowlist only) |
| Gate: `python check.py` | Full suite green including validate |
| Regression tests | Add merge/validate cases for vn offset and out-of-range |

**Exit criteria:**

- [ ] `validate_obj.py --obj merged.obj` exits 0  
- [ ] `python check.py` exits 0  
- [ ] Browser smoke still passes (`check_browser_smoke.py` or `check.py --browser`)  
- [ ] Document before/after normal counts in SESSION_HANDOFF  

**Out of scope for M1:** New viewer features, texture art, zone content.

---

### M2 — Source identity (P0.2)

**Status:** Blocked on M1 (can research in parallel)  

| Work item | Notes |
|-----------|--------|
| Ensure every consumer-ready mesh group name carries recoverable NIF hash | `extractNifHash` / group naming contract |
| Align delivery `asset_id` set with `merged.obj` groups | Coverage metric in audit or new script |
| Drop or quarantine unhashed junk | Prefer source fix over viewer heuristics |
| Metric: `% faced groups with nif hash` | Target: **≥ 95%** of non-ptonly faced groups |

**Exit criteria:**

- [ ] Audit/report: faced groups with hash ≥ 95%  
- [ ] Delivery entries map 1:1 to loadable groups where possible  
- [ ] Document unmatched list and reason codes  

---

### M3 — World placement (P0.3)

**Status:** Blocked on M2 research; implement after identity is stable  

| Work item | Notes |
|-----------|--------|
| Preserve world transforms from export | Or instance list separate from mesh library |
| Do **not** double-apply TRS on world-baked `merged.obj` | Current default: tag-only transforms is correct for baked mesh |
| Quantify world span of trusted geometry | CI metric: AABB diagonal / face-weighted span |
| Optional: unbaked mesh library + placement pass | Long-term architecture |

**Exit criteria:**

- [ ] Beauty/Explore open on a multi-hundred-unit (or better) trusted span, not a postage stamp  
- [ ] Metric recorded in visual audit or smoke report  
- [ ] Written decision: baked vs library+instance pipeline  

---

### M4 — Textures & materials (P1)

**Status:** After M1; partial code already exists  

| Work item | Notes |
|-----------|--------|
| Single resolution policy: delivery-first, TEXTURE_MAP fill | `texture_loader` + discovery already started |
| Rematerialize after overlay ready | White base color + re-mark visual metadata |
| Normal/color role classifier | Suffix-safe `isNormalTexture` (zone `n_ec` false positives fixed partially) |
| Coverage target | Texture face coverage **≥ 50%** as near-term goal; stretch 70%+ |

**Exit criteria:**

- [ ] `audit_visual_assets` coverage ≥ 50% faces  
- [ ] No systematic wrong-normal assignment on zone-prefixed names (tests)  
- [ ] Beauty visible meshes mostly textured or intentionally untextured terrain  

---

### M5 — Beauty honesty + load ordering (P1)

| Work item | Notes |
|-----------|--------|
| Suppression + large terrain recovery | Classifier + filter already present; keep metrics |
| Await delivery overlay + zone tagging before camera frame / zone UI finalize | Kill race empties |
| Shared visibility helper | Beauty suppress ∩ source zones ∩ catalog |

**Exit criteria:**

- [ ] Smoke/Beauty report: visible groups + span + suppression breakdown  
- [ ] Zone Source list not stuck empty after load  
- [ ] Catalog badges without mandatory 2.5s thrash once tagging done  

---

### M6 — Product correctness (P2)

| Work item | Notes |
|-----------|--------|
| Settings SSOT | Reduce dual `rift-sb-*` vs `rift-flythrough-settings` |
| Zone labels master vs per-zone prefs | Labels toggle must not wipe source-zone geometry filter |
| Docs/keybind alignment | F = zones, Z = weather, etc. |
| Remaining lighting/post edge cases | Fog/composer mostly fixed |

---

### M7 — Backlog (P3)

- Tour / speedrun / weather polish  
- CSP headers  
- Merge robustness (non-numeric faces, streaming relative indices)  
- Visual montage automation  
- Feature work that does not improve asset truth  

---

## Validation commands (canonical)

```cmd
python check.py
python check.py --quick
python check.py --browser
pytest tests/ -q
python check_js.py
python check_html.py
python validate_obj.py --obj merged.obj --stats
python audit_visual_assets.py --obj merged.obj --texture-map js/texture_map.js --output-dir artifacts/visual-audit
python check_browser_smoke.py --timeout 90 --hide-start-overlay --save-artifacts --artifacts-dir artifacts/browser-smoke/default
pre-commit run --all-files
```

---

## Metrics dashboard (update each milestone)

| Metric | Baseline (2026-07-19, post-5ab62e8) | Target |
|--------|-------------------------------------|--------|
| `validate_obj` issues | ~59,368 (normal OOB) | **0** |
| Groups / faced / ptonly | 227 / 165 / 62 | — |
| Faces / verts | 78,329 / 72,100 | — |
| Normals in OBJ | 14,008 | Consistent with face refs |
| Texture face coverage | ~30.2% | ≥ 50% then ≥ 70% |
| Delivery assets | 152 textured, 402 URLs | Linked to groups |
| Beauty keep / hide-default | 77 / 112 (audit) | Honest + recognizable span |
| Full `check.py` | FAIL (validate only) | PASS |
| Browser smoke | PASS | PASS |

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-19 | Prioritize asset pipeline over new viewer features | Fidelity blocked by data, not UI |
| 2026-07-19 | `applyTransforms` default **off** for baked `merged.obj` | Non-identity TRS double-offsets baked verts |
| 2026-07-19 | Delivery-first textures with TEXTURE_MAP fallback | Reduce dual-map drift |
| 2026-07-19 | Free-cursor UI mode for menus | Pointer lock made panels unusable |
| 2026-07-19 | M1 = normals/integrity before identity UI work | CI + lighting trust |

---

## Agent operating rules

1. **Read this roadmap + `SESSION_HANDOFF.md` before coding.**  
2. **Plan, then execute** — state the milestone and exit criteria.  
3. Prefer **small validated slices** with tests.  
4. Do not rewrite `merged.obj` casually; only when re-merge is the task.  
5. Do not expand P3 features until P0 exit criteria pass unless fixing a regression.  
6. After a milestone: update metrics table + SESSION_HANDOFF + conventional commit.  
7. Library questions: Context7 per AGENTS.md.

---

## Related files

| File | Role |
|------|------|
| `SESSION_HANDOFF.md` | Live status, last slice, next actions |
| `HANDOFF.md` | Orientation pointer |
| `knowledge.md` | Architecture & commands |
| `AGENTS.md` | Repo conventions |
| `merge_objs.py` / `validate_obj.py` | Geometry pipeline |
| `js/transform_loader.js` / `js/texture_loader.js` | Delivery integration |
| `js/ui_mode.js` | Fly vs menu interaction |
