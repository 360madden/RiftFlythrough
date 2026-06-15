// RIFT Zone Filter Panel — per-zone visibility checkboxes
import { getZoneLabels } from './zones.js';
import { getZoneOverlays } from './zone-overlays.js';
import { state as appState } from './state.js';

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
  btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:25;color:#aaa;font:12px monospace;background:rgba(10,12,18,0.85);padding:5px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;user-select:none;transition:color 0.2s';
  btn.addEventListener('mouseenter', function() { this.style.color = '#fff'; });
  btn.addEventListener('mouseleave', function() { this.style.color = '#aaa'; });
  btn.addEventListener('click', togglePanel);
  document.body.appendChild(btn);

  // Create panel
  panelEl = document.createElement('div');
  panelEl.id = 'zone-filter-panel';
  panelEl.style.cssText = 'position:fixed;top:48px;right:12px;z-index:25;display:none;color:#ccc;font:11px \"Segoe UI\",Arial,sans-serif;background:rgba(10,12,18,0.88);padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);max-height:70vh;overflow-y:auto;min-width:200px;backdrop-filter:blur(4px);box-shadow:0 4px 16px rgba(0,0,0,0.5)';
  document.body.appendChild(panelEl);

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between';
  hdr.innerHTML = '<span>Zone Filters</span><span style="cursor:pointer;color:#888" id="zone-filter-close">✕</span>';
  hdr.querySelector('#zone-filter-close')?.addEventListener('click', function() { panelEl.style.display = 'none'; });
  panelEl.appendChild(hdr);

  // Zone list container
  const list = document.createElement('div');
  list.id = 'zone-filter-list';
  panelEl.appendChild(list);

  // Action buttons
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
}

function setZoneVisible(name, visible) {
  const z = zoneMap[name];
  if (z && z.sprite) z.sprite.visible = visible;
  if (z && z.overlay) z.overlay.visible = visible;
}

function setAllVisible(visible) {
  appState.showZoneLabels = Boolean(visible);
  for (const name of Object.keys(checkboxes)) {
    checkboxes[name].checked = visible;
    setZoneVisible(name, visible);
  }
  saveFilterState();
}

// Called by Z key to toggle all zones without losing filter state
export function toggleAllZones(visible) {
  appState.showZoneLabels = Boolean(visible);
  for (var name in checkboxes) {
    checkboxes[name].checked = visible;
    setZoneVisible(name, visible);
  }
  saveFilterState();
}

function togglePanel() {
  if (!panelEl) return;
  panelEl.style.display = panelEl.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('keydown', function(e) {
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    togglePanel();
  }
});
