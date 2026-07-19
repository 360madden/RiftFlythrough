// RIFT Zone Filter Panel — per-zone visibility checkboxes
import { getZoneLabels } from './zones.js';
import { getZoneOverlays } from './zone-overlays.js';
import { state as appState } from './state.js';
import { releasePointerForUi, setUiSurface, UI_SURFACE } from './ui_mode.js';

let panelEl = null;
let checkboxes = {};
let zoneMap = {}; // name -> {sprite, overlay}

const FILTER_KEY = 'rift-zone-filter';

function saveFilterState() {
  var state = {};
  for (var name in checkboxes) { state[name] = checkboxes[name].checked; }
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(state)); } catch(e) {}
}

function loadFilterState() {
  try { var raw = localStorage.getItem(FILTER_KEY); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

export function initZoneFilter() {
  if (panelEl) return;
  buildPanel();
  buildZoneList();
}

function buildPanel() {
  // Create toggle button
  const btn = document.createElement('div');
  btn.id = 'zone-filter-btn';
  btn.textContent = '☰ Zones';
  btn.title = 'Toggle zone filter panel (F key)';
  // Place below minimap (200px + chrome) so it does not cover click-to-teleport
  btn.style.cssText = 'position:fixed;top:230px;right:12px;z-index:25;color:#aaa;font:12px monospace;background:rgba(10,12,18,0.85);padding:5px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;user-select:none;transition:color 0.2s';
  btn.addEventListener('mouseenter', function() { this.style.color = '#fff'; });
  btn.addEventListener('mouseleave', function() { this.style.color = '#aaa'; });
  btn.addEventListener('click', togglePanel);
  document.body.appendChild(btn);

  // Create panel
  panelEl = document.createElement('div');
  panelEl.id = 'zone-filter-panel';
  panelEl.style.cssText = 'position:fixed;top:266px;right:12px;z-index:25;display:none;color:#ccc;font:11px \"Segoe UI\",Arial,sans-serif;background:rgba(10,12,18,0.88);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);max-height:calc(70vh - 80px);overflow-y:auto;min-width:200px;backdrop-filter:blur(4px);box-shadow:0 4px 16px rgba(0,0,0,0.5)';
  document.body.appendChild(panelEl);

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between';
  hdr.innerHTML = '<span>Zone Filters</span><span style="cursor:pointer;color:#888" id="zone-filter-close">✕</span>';
  hdr.querySelector('#zone-filter-close')?.addEventListener('click', function() {
    panelEl.style.display = 'none';
    setUiSurface(UI_SURFACE.zoneFilter, false);
  });
  panelEl.appendChild(hdr);

  // World-location zone list container
  const list = document.createElement('div');
  list.id = 'zone-filter-list';
  panelEl.appendChild(list);

  // Divider + "Source Zones" subheader (asset category filter — wired
  // to RiftZoneRegistry in zone-filter.js's buildSourceZoneList())
  const div = document.createElement('div');
  div.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;font-weight:600;color:#7fc8ff;text-transform:uppercase;letter-spacing:0.5px;display:flex;justify-content:space-between;align-items:center';
  div.innerHTML = '<span>Source Zones</span><span id="zone-source-count" style="color:#888;font-weight:400;font-size:10px"></span>';
  panelEl.appendChild(div);

  // Source zone list container
  const sourceList = document.createElement('div');
  sourceList.id = 'zone-source-filter-list';
  panelEl.appendChild(sourceList);

  // Action buttons (Show/Hide All covers BOTH world locations AND source zones)
  const actions = document.createElement('div');
  actions.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:6px';
  actions.innerHTML = '<button id="zf-show-all" style="flex:1;background:rgba(255,255,255,0.06);color:#aaa;border:1px solid rgba(255,255,255,0.1);border-radius:3px;padding:3px 8px;cursor:pointer;font:10px monospace">Show All</button><button id="zf-hide-all" style="flex:1;background:rgba(255,255,255,0.06);color:#aaa;border:1px solid rgba(255,255,255,0.1);border-radius:3px;padding:3px 8px;cursor:pointer;font:10px monospace">Hide All</button>';
  panelEl.appendChild(actions);

  actions.querySelector('#zf-show-all')?.addEventListener('click', function() { setAllVisible(true); });
  actions.querySelector('#zf-hide-all')?.addEventListener('click', function() { setAllVisible(false); });

  // Button hover effects
  for (const b of actions.querySelectorAll('button')) {
    b.addEventListener('mouseenter', function() { this.style.color = '#fff'; this.style.background = 'rgba(255,255,255,0.12)'; });
    b.addEventListener('mouseleave', function() { this.style.color = '#aaa'; this.style.background = 'rgba(255,255,255,0.06)'; });
  }
}

function buildZoneList() {
  const sprites = getZoneLabels();
  const overlays = getZoneOverlays();
  const list = document.getElementById('zone-filter-list');
  if (!list || !sprites.length) {
    buildZoneList._retries = (buildZoneList._retries || 0) + 1;
    if (buildZoneList._retries < 10) { setTimeout(buildZoneList, 200); }
    else { console.warn("Zone filter: labels not loaded after 10 retries"); }
    return;
  }

  // Build name->sprite and name->overlay maps
  zoneMap = {};
  for (const s of sprites) {
    zoneMap[s.userData.zoneName] = { sprite: s, overlay: null };
  }
  for (const ov of overlays) {
    const name = ov.userData.zoneName;
    if (zoneMap[name]) zoneMap[name].overlay = ov;
  }

  const names = Object.keys(zoneMap).sort();
  const defaultVisible = appState.showZoneLabels !== false;
  for (const name of names) {
    const z = zoneMap[name];
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:3px;cursor:pointer;transition:background 0.15s';
    row.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.04)'; });
    row.addEventListener('mouseleave', function() { this.style.background = ''; });

    // Colored dot
    const dot = document.createElement('span');
    const color = z.sprite.userData.zoneType === 'city' ? '#ffd700' : z.sprite.userData.zoneType === 'area' ? '#7fc8ff' : '#4a9eff';
    dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0';
    row.appendChild(dot);

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = defaultVisible;
    cb.style.cssText = 'accent-color:#4f4;width:14px;height:14px;margin:0;cursor:pointer';
    cb.addEventListener('change', function() {
      setZoneVisible(name, cb.checked);
      saveFilterState();
    });
    row.appendChild(cb);
    checkboxes[name] = cb;

    // Label
    const lbl = document.createElement('span');
    lbl.textContent = name;
    lbl.style.cssText = 'font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    row.appendChild(lbl);

    list.appendChild(row);
  }
  // Apply saved filter state
  var saved = loadFilterState();
  if (saved) {
    for (var name in saved) {
      if (checkboxes[name]) { checkboxes[name].checked = saved[name]; setZoneVisible(name, saved[name]); }
    }
  } else {
    for (const name of names) {
      setZoneVisible(name, defaultVisible);
    }
  }

  // Build the per-asset source-zone list (separate schema slice from
  // riftflythrough-delivery.json; see transform_loader.js RiftZoneRegistry).
  buildSourceZoneList();
}

// ── World-location zones (sprite labels from zone_locations.json) ─────

function setZoneVisible(name, visible) {
  const z = zoneMap[name];
  if (z && z.sprite) z.sprite.visible = visible;
  if (z && z.overlay) z.overlay.visible = visible;
}

function setAllWorldZonesVisible(visible) {
  appState.showZoneLabels = Boolean(visible);
  for (const name of Object.keys(checkboxes)) {
    checkboxes[name].checked = visible;
    setZoneVisible(name, visible);
  }
}

// ── Source zones (per-asset zone_tuple from riftflythrough-delivery.json) ─

/** @type {Object<string, HTMLInputElement>} source zone tuple → checkbox */
let sourceCheckboxes = {};
const SOURCE_FILTER_KEY = 'rift-source-zone-filter';

function loadSourceFilterState() {
  try { var raw = localStorage.getItem(SOURCE_FILTER_KEY); return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
}

function saveSourceFilterState() {
  // Do not wipe persisted preferences before the source-zone UI is built
  if (!sourceCheckboxes || Object.keys(sourceCheckboxes).length === 0) return;
  var hidden = [];
  for (var tuple in sourceCheckboxes) {
    if (!sourceCheckboxes[tuple].checked) hidden.push(tuple);
  }
  try { localStorage.setItem(SOURCE_FILTER_KEY, JSON.stringify(hidden)); } catch(e) {}
}

/**
 * Toggle visibility of all worldGroups whose userData.sourceZone === tuple.
 * World groups without a userData.sourceZone (no delivery match) are
 * unaffected, so the filter is opt-in for matched assets only.
 */
function setSourceZoneVisible(tuple, visible) {
  // Use the canonical state.worldGroups (imported as appState) rather
  // than the window.worldGroups global — the global is a mirror that
  // world.js sets alongside state.worldGroups, but the canonical source
  // is the imported state.
  const groups = appState.worldGroups;
  if (!Array.isArray(groups)) return;
  for (const group of groups) {
    if (group.userData && group.userData.sourceZone === tuple) {
      if (!visible) {
        group.visible = false;
      } else {
        // Do not un-hide Beauty-suppressed extraction artifacts
        group.visible = !group.userData.visualSuppressionReason;
      }
    }
  }
}

function setAllSourceZonesVisible(visible) {
  for (const tuple of Object.keys(sourceCheckboxes)) {
    sourceCheckboxes[tuple].checked = visible;
    setSourceZoneVisible(tuple, visible);
  }
  saveSourceFilterState();
}

/**
 * Build the per-source-zone checkbox list. Reads from
 * `window.RiftZoneRegistry` (populated by transform_loader.js) and the
 * `userData.sourceZone` field set by RiftTransformLoader.applyManifests.
 *
 * Retries up to 10× if the zone registry is not yet loaded (delivery cache
 * fetches asynchronously on init).
 */
function buildSourceZoneList() {
  const list = document.getElementById('zone-source-filter-list');
  const counter = document.getElementById('zone-source-count');
  if (!list) return;
  const reg = window.RiftZoneRegistry;
  if (!reg || !reg.isReady || !reg.isReady()) {
    buildSourceZoneList._retries = (buildSourceZoneList._retries || 0) + 1;
    if (buildSourceZoneList._retries < 20) { setTimeout(buildSourceZoneList, 250); }
    else { if (counter) counter.textContent = "(registry not loaded)"; }
    return;
  }

  const tuples = reg.getAllZones();
  const stats = reg.getZoneStats();
  // Count distinct zone_tuples actually present in the loaded worldGroups.
  // Also count unmatched groups (delivery entry exists but no zone_tuple)
  // so they can be filterable too.
  const presentTuples = new Set();
  let unmatchedCount = 0;
  for (const g of (window.worldGroups || [])) {
    if (!g.userData) continue;
    if (g.userData.sourceZone === 'unmatched') unmatchedCount++;
    else if (g.userData.sourceZone) presentTuples.add(g.userData.sourceZone);
  }
  // Build entries sorted by asset count desc, then tuple name asc
  const entries = tuples
    .filter((t) => presentTuples.has(t))
    .map((t) => ({ tuple: t, count: (stats.byZone[t] || 0) }))
    .sort((a, b) => (b.count - a.count) || a.tuple.localeCompare(b.tuple));
  // Append a synthetic 'unmatched' entry if any unmatched groups exist
  if (unmatchedCount > 0) {
    entries.push({ tuple: 'unmatched', count: unmatchedCount, synthetic: true });
  }
  if (entries.length === 0) {
    // Registry can be ready while applyManifests is still tagging world groups.
    // Retry until tagging finishes, then show empty state.
    const taggingDone =
      window.RiftTransformLoader?.isApplied?.() ||
      window.RiftZoneRegistry?.isWorldTagged?.();
    buildSourceZoneList._tagRetries = (buildSourceZoneList._tagRetries || 0) + 1;
    if (!taggingDone && buildSourceZoneList._tagRetries < 40) {
      if (counter) counter.textContent = "(tagging assets…)";
      setTimeout(buildSourceZoneList, 250);
      return;
    }
    if (counter) counter.textContent = "(no tagged assets)";
    return;
  }
  buildSourceZoneList._tagRetries = 0;
  if (counter) counter.textContent = `(${entries.length} categories, ${stats.matched} tagged)`;

  // Load saved state (array of hidden tuples; default visible)
  const saved = loadSourceFilterState() || [];

  for (const { tuple, count, synthetic } of entries) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:3px;cursor:pointer;transition:background 0.15s';
    row.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.04)'; });
    row.addEventListener('mouseleave', function() { this.style.background = ''; });

    // Expansion chip + zone name (e.g. "ep1 · world_objects.housing")
    // For the synthetic 'unmatched' entry, render a neutral gray chip.
    const parts = tuple.split('.');
    const exp = parts[0] || '';
    const rest = parts.slice(1).join('.') || tuple;
    const expColors = { vanilla: '#4a9eff', ep1: '#7fc8ff', ep2: '#ffb84a', ep3: '#ff7faa' };
    const expColor = synthetic ? '#666' : (expColors[exp] || '#888');
    const chip = document.createElement('span');
    chip.textContent = synthetic ? '—' : exp;
    chip.title = synthetic ? 'No source zone resolved (unmatched in delivery)' : tuple;
    chip.style.cssText = `display:inline-block;font-size:9px;font-weight:700;padding:1px 4px;border-radius:2px;background:${expColor}22;color:${expColor};border:1px solid ${expColor}44;min-width:32px;text-align:center;flex-shrink:0`;
    row.appendChild(chip);

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !saved.includes(tuple);
    cb.style.cssText = 'accent-color:#4f4;width:14px;height:14px;margin:0;cursor:pointer';
    cb.addEventListener('change', function() {
      setSourceZoneVisible(tuple, cb.checked);
      saveSourceFilterState();
    });
    row.appendChild(cb);
    sourceCheckboxes[tuple] = cb;

    // Label (category.name) + count
    const lbl = document.createElement('span');
    lbl.textContent = rest;
    lbl.title = tuple;
    lbl.style.cssText = 'font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
    row.appendChild(lbl);

    const cnt = document.createElement('span');
    cnt.textContent = String(count);
    cnt.title = `${count} assets in ${tuple}`;
    cnt.style.cssText = 'font-size:10px;color:#888;flex-shrink:0;font-variant-numeric:tabular-nums';
    row.appendChild(cnt);

    list.appendChild(row);

    // Apply default state (or saved hidden state) to worldGroups
    setSourceZoneVisible(tuple, cb.checked);
  }
}

// ── Combined Show All / Hide All (covers BOTH world locations and source zones) ─

function setAllVisible(visible) {
  setAllWorldZonesVisible(visible);
  setAllSourceZonesVisible(visible);
  saveFilterState();
}

// Called by Z key (or sidebar "Zone Labels" toggle) to show/hide ALL
// zone-related UI: world-location sprites + ground overlays AND the
// per-asset source-zone filter. Delegates to setAllVisible so the Z key
// matches the panel's Show All / Hide All buttons.
export function toggleAllZones(visible) {
  setAllVisible(Boolean(visible));
}

/** Programmatic source-zone toggle (for tests / external callers). */
export function toggleSourceZone(tuple, visible) {
  if (sourceCheckboxes[tuple]) {
    sourceCheckboxes[tuple].checked = Boolean(visible);
  }
  setSourceZoneVisible(tuple, visible);
  saveSourceFilterState();
}

/** Read-only snapshot of current source-zone visibility. */
export function getSourceZoneFilterState() {
  const state = {};
  for (const tuple of Object.keys(sourceCheckboxes)) {
    state[tuple] = sourceCheckboxes[tuple].checked;
  }
  return state;
}

function togglePanel() {
  if (!panelEl) return;
  const opening = panelEl.style.display !== 'block';
  panelEl.style.display = opening ? 'block' : 'none';
  setUiSurface(UI_SURFACE.zoneFilter, opening);
  if (opening) releasePointerForUi();
}

document.addEventListener('keydown', function(e) {
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable) return;
    togglePanel();
  }
});
