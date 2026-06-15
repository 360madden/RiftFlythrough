// Overlay toggles, help, stats, screenshot, lighting — UI-only key actions.
//
// The simplified flythrough.html no longer ships a settings panel, so the
// per-input `set-*` change handlers and `populateSettingsForm` were removed.
// Visual settings are still applied at startup (via applySettings in main.js)
// and at runtime via the keyboard shortcuts in handleFeatureKeys below.

import * as THREE from "three";
import { setAudioEnabled } from "./audio.js";
import {
  applyFogDensity,
  applyShadowQuality,
  LIGHT_MODES,
  startLightTransition,
} from "./lighting.js";
import { setLodEnabled, updateLod } from "./lod.js";
import { setParticlesVisible } from "./particles.js";
import {
  applyExposure,
  applyRenderScale,
  camera,
  captureHighRes,
  composer,
  renderer,
  setBloomEnabled,
  setDofEnabled,
  setDofFocus,
} from "./scene.js";
import { deselectGroup } from "./selection.js";
import { loadSettings, saveSettings } from "./settings.js";
import { state } from "./state.js";
import { normalizeTextureQuality } from "./texture_quality.js";
import { flyToGroup, pushTeleportHistory, redoTeleport, undoTeleport } from "./teleport.js";
import { applyVisualProfileSettings, normalizeVisualProfile } from "./visual_profiles.js";
import { setWeatherEnabled } from "./weather.js";
import {
  applyGroundOpacity,
  applyTextureQuality,
  applyWaterOpacity,
  applyWaterReflectStrength,
  setGroundVisible,
  setGridVisible,
  setPointCloudsVisible,
  setVisualGroupSuppression,
  setWaterVisible,
} from "./world.js";
import { setZoneLabelsVisible } from "./zones.js";
import { setZoneOverlaysVisible } from "./zone-overlays.js";

// ── Wireframe & visual settings helpers ──

function applyWireframeMode(enabled) {
  state.wireframeMode = Boolean(enabled);
  state.worldGroups.forEach((g) => {
    g.traverse((child) => {
      if (!child.isMesh || !child.material) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material && "wireframe" in material) {
          material.wireframe = state.wireframeMode;
        }
      }
    });
  });
}

function syncSidebarVisualDots(settings) {
  if (!window.updateSidebarDot) return;
  window.updateSidebarDot("sb-toggle-legend", settings.showLegend ?? false);
  window.updateSidebarDot("sb-toggle-labels", settings.showZoneLabels ?? false);
  window.updateSidebarDot("sb-toggle-wireframe", settings.wireframeMode ?? false);
  window.updateSidebarDot("sb-toggle-grid", settings.gridVisible ?? false);
  window.updateSidebarDot("sb-toggle-ground", settings.groundVisible ?? false);
  window.updateSidebarDot("sb-toggle-water", settings.waterVisible ?? false);
}

function applyVisualSettingsLive(settings) {
  state.visualProfile = normalizeVisualProfile(settings.visualProfile);
  state.gridVisible = Boolean(settings.gridVisible);
  state.groundVisible = Boolean(settings.groundVisible);
  state.waterVisible = Boolean(settings.waterVisible);
  state.showZoneLabels = Boolean(settings.showZoneLabels);
  state.pointCloudsVisible = Boolean(settings.pointCloudsVisible);
  state.hideDegenerateGroups = Boolean(settings.hideDegenerateGroups);
  state.hideUnlinkedGroups = Boolean(settings.hideUnlinkedGroups);
  state.hidePlaceholderTextureGroups = Boolean(settings.hidePlaceholderTextureGroups);
  state.hideLowConfidenceGroups = Boolean(settings.hideLowConfidenceGroups);
  state.lodEnabled = Boolean(settings.lodEnabled);
  state.fogDensity = settings.fogDensity;
  state.textureQuality = normalizeTextureQuality(settings.textureQuality);

  setGridVisible(state.gridVisible);
  setGroundVisible(state.groundVisible);
  setWaterVisible(state.waterVisible);
  setPointCloudsVisible(state.pointCloudsVisible);
  setVisualGroupSuppression({
    hideDegenerateGroups: state.hideDegenerateGroups,
    hideUnlinkedGroups: state.hideUnlinkedGroups,
    hidePlaceholderTextureGroups: state.hidePlaceholderTextureGroups,
    hideLowConfidenceGroups: state.hideLowConfidenceGroups,
  });
  applyWireframeMode(Boolean(settings.wireframeMode));
  setZoneLabelsVisible(state.showZoneLabels);
  setZoneOverlaysVisible(state.showZoneLabels);
  setLodEnabled(state.lodEnabled);
  updateLod(camera, true);
  applyFogDensity(settings.fogDensity);
  applyExposure(settings.exposure);
  const textureResult = applyTextureQuality(state.textureQuality);
  setParticlesVisible(settings.particlesVisible ?? false);
  setWeatherEnabled(settings.weatherEnabled ?? false);

  const legendEl = document.getElementById("legend");
  if (legendEl) legendEl.style.display = settings.showLegend ? "" : "none";

  syncSidebarVisualDots(settings);
  if (textureResult.reloadRequired) {
    showToast("Reload to load texture maps");
  }
}

// ── Shared lighting-mode setter (used by L key and Digit1-4) ──

function setLightMode(mode) {
  if (mode === state.lightMode) return;
  const prev = state.lightMode;
  state.lightMode = mode;
  startLightTransition(prev, mode);
  const s = loadSettings();
  s.lightMode = mode;
  saveSettings(s);
}

// ── UI key actions ──

document.addEventListener("keydown", (e) => {
  if (handleOverlayKeys(e)) return;
  if (handleFeatureKeys(e)) return;
  handleSearchKeys(e);
});

/** Overlay toggles: Tab, F1, F, Escape, I, V */
function handleOverlayKeys(e) {
  if (e.code === "Tab") {
    // The settings overlay is not part of the current HTML. Swallow Tab so
    // the browser doesn't lose focus to the address bar / chrome.
    e.preventDefault();
    return true;
  }
  if (e.code === "F1") {
    const helpOverlay = document.getElementById("help-overlay");
    if (helpOverlay) helpOverlay.classList.toggle("active");
    e.preventDefault();
    return true;
  }
  if (e.code === "KeyF" && !e.repeat) {
    const fpsEl = document.getElementById("fps");
    if (!fpsEl) return false;
    const isHidden = fpsEl.style.display === "none" || fpsEl.style.display === "";
    fpsEl.style.display = isHidden ? "block" : "none";
    if (window.updateSidebarDot) window.updateSidebarDot("sb-toggle-fps", isHidden);
    return false;
  }
  if (e.code === "Escape") {
    if (galleryOverlay?.classList.contains("active")) {
      galleryOverlay.classList.remove("active");
      e.preventDefault();
      return true;
    }
    const catalogOverlay = document.getElementById("catalog-overlay");
    if (catalogOverlay?.classList.contains("active")) {
      catalogOverlay.classList.remove("active");
      e.preventDefault();
      return true;
    }
    const helpOverlay = document.getElementById("help-overlay");
    if (helpOverlay?.classList.contains("active")) {
      helpOverlay.classList.remove("active");
      e.preventDefault();
      return true;
    }
    if (state.selectedGroup) {
      deselectGroup();
      e.preventDefault();
      return true;
    }
    return false;
  }
  if (e.code === "KeyI") {
    const statsPanel = document.getElementById("stats-panel");
    if (statsPanel) statsPanel.classList.toggle("active");
    return false;
  }
  if (e.code === "KeyK" && !e.repeat) {
    import("./catalog.js").then((m) => m.toggleCatalog()).catch(() => {});
    return false;
  }
  if (e.code === "KeyZ" && e.ctrlKey && !e.shiftKey && !e.repeat) {
    if (
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA"
    )
      return false;
    e.preventDefault();
    if (undoTeleport()) {
      showToast(`Undo (${state.teleportHistoryIdx + 1}/${state.teleportHistory.length})`);
    }
    return true;
  }
  if (
    (e.code === "KeyY" && e.ctrlKey && !e.repeat) ||
    (e.code === "KeyZ" && e.ctrlKey && e.shiftKey && !e.repeat)
  ) {
    if (
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA"
    )
      return false;
    e.preventDefault();
    if (redoTeleport()) {
      showToast(`Redo (${state.teleportHistoryIdx + 1}/${state.teleportHistory.length})`);
    }
    return true;
  }
  if (e.code === "KeyC" && !e.repeat) {
    import("./coords.js").then((m) => m.toggleCoords()).catch(() => {});
    return false;
  }
  if (e.code === "Semicolon" && !e.repeat) {
    import("./perf.js").then((m) => {m.togglePerf();var dot=document.querySelector("#sb-toggle-perf .sb-dot");if(dot){dot.classList.toggle("on");dot.classList.toggle("off");try{localStorage.setItem("rift-sb-perf",dot.classList.contains("on")?"0":"1")}catch(e){}}}).catch(() => {});
    return false;
  }
  if (e.code === "KeyV" && !e.repeat) {
    toggleGallery();
    return false;
  }
  return false;
}

/** Feature actions: P, L, Digit1-8, O, G, T, B, brackets */
function handleFeatureKeys(e) {
  if (e.code === "KeyP" && e.ctrlKey && !e.repeat) {
    if (
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA"
    )
      return false;
    e.preventDefault();
    if (!state.worldGroups.length) return false;
    const dataUrl = captureHighRes(3840);
    const link = document.createElement("a");
    link.download = `rift-flythrough-4k-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    state.screenshots.unshift({ dataUrl, timestamp: Date.now() });
    if (state.screenshots.length > 20) state.screenshots.length = 20;
    updateGalleryIfOpen();
    showToast("4K screenshot saved");
    return false;
  }
  if (e.code === "KeyP" && !e.ctrlKey) {
    if (!state.worldGroups.length) return false;
    composer.render();
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `rift-flythrough-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    state.screenshots.unshift({ dataUrl, timestamp: Date.now() });
    if (state.screenshots.length > 20) state.screenshots.length = 20;
    updateGalleryIfOpen();
    showToast("Screenshot saved");
    return false;
  }
  if (e.code === "KeyL") {
    const m = (state.lightMode + 1) % LIGHT_MODES.length;
    setLightMode(m);
    showToast(`Lighting: ${LIGHT_MODES[m].name}`);
    return false;
  }
  if (e.code >= "Digit1" && e.code <= "Digit8" && !e.repeat) {
    const m = parseInt(e.code.slice(-1), 10) - 1;
    if (m >= LIGHT_MODES.length) return false;
    setLightMode(m);
    showToast(`Lighting: ${LIGHT_MODES[m].name}`);
    return false;
  }
  if (e.code === "KeyO" && !e.repeat) {
    state.orbitMode = !state.orbitMode;
    if (state.orbitMode) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const target = camera.position.clone().addScaledVector(dir, state.orbitDistance);
      state.orbitTarget = target;
      const offset = camera.position.clone().sub(target);
      state.orbitPhi = Math.asin(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1));
      state.orbitTheta = Math.atan2(offset.x, offset.z);
    } else {
      state.orbitTarget = null;
    }
    showToast(state.orbitMode ? "Orbit mode on" : "Orbit mode off");
    return false;
  }
  if (e.code === "KeyR" && e.shiftKey && !e.repeat) {
    import("./speedrun.js").then((m) => m.toggleSpeedrun()).catch(() => {});
    return false;
  }
  if (e.code === "KeyR" && !e.repeat) {
    state.gridVisible = !state.gridVisible;
    setGridVisible(state.gridVisible);
    const s = loadSettings();
    s.gridVisible = state.gridVisible;
    saveSettings(s);
    if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-grid",state.gridVisible);
    showToast(state.gridVisible ? "Grid shown" : "Grid hidden");
    return false;
  }
  if (e.code === "KeyU" && !e.repeat) {
    state.groundVisible = !state.groundVisible;
    setGroundVisible(state.groundVisible);
    const s = loadSettings();
    s.groundVisible = state.groundVisible;
    saveSettings(s);
    if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-ground",state.groundVisible);
    showToast(state.groundVisible ? "Ground shown" : "Ground hidden");
    return false;
  }
  if (e.code === "KeyY" && !e.repeat) {
    state.waterVisible = !state.waterVisible;
    setWaterVisible(state.waterVisible);
    const s = loadSettings();
    s.waterVisible = state.waterVisible;
    saveSettings(s);
    if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-water",state.waterVisible);
    showToast(state.waterVisible ? "Water shown" : "Water hidden");
    return false;
  }
  if (e.code === "KeyG") {
    applyWireframeMode(!state.wireframeMode);
    const s = loadSettings();
    s.wireframeMode = state.wireframeMode;
    saveSettings(s);
    if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-wireframe",state.wireframeMode);
    showToast(state.wireframeMode ? "Wireframe on" : "Wireframe off");
    return false;
  }
  if (e.code === "KeyJ" && !e.repeat && !e.ctrlKey) {
    const s = loadSettings();
    s.audioEnabled = !(s.audioEnabled ?? true);
    saveSettings(s);
    setAudioEnabled(s.audioEnabled);
    showToast(s.audioEnabled ? "Audio on" : "Audio off");
    return false;
  }
  if (e.code === "KeyN" && !e.repeat && !e.shiftKey && !e.ctrlKey) {
    state.cycleEnabled = !state.cycleEnabled;
    if (state.cycleEnabled) state.cycleTimer = 0;
    const s = loadSettings();
    s.cycleEnabled = state.cycleEnabled;
    saveSettings(s);
    showToast(state.cycleEnabled ? "Day/night cycle on" : "Day/night cycle off");
    return false;
  }
  if (e.code === "KeyN" && e.shiftKey && !e.repeat && !e.ctrlKey && state.cycleEnabled) {
    state.cyclePaused = !state.cyclePaused;
    showToast(state.cyclePaused ? "Cycle paused" : "Cycle resumed");
    return false;
  }
  if (e.code === "KeyT" && !e.repeat) {
    if (state.tourActive) {
      state.tourActive = false;
      state.tourPaused = false;
      const el = document.getElementById("tour-pause-indicator");
      if (el) el.style.display = "none";
      showToast("Tour stopped");
    } else {
      import("./tour.js")
        .then((m) => {
          m.startTour();
          showToast("Tour started");
        })
        .catch(() => {});
    }
    return false;
  }
  if (e.code === "Space" && state.tourActive && !e.repeat) {
    e.preventDefault();
    state.tourPaused = !state.tourPaused;
    const el = document.getElementById("tour-pause-indicator");
    if (el) el.style.display = state.tourPaused ? "block" : "none";
    showToast(state.tourPaused ? "Tour paused" : "Tour resumed");
    return true;
  }
  if ((e.code === "Equal" || e.code === "Minus") && state.tourActive && !e.repeat) {
    const delta = e.code === "Equal" ? 0.25 : -0.25;
    state.tourSpeed = Math.max(0.25, Math.min(4.0, state.tourSpeed + delta));
    showTourSpeedIndicator();
    return false;
  }
  if (e.code === "KeyB" && !e.repeat) {
    const n = state.bookmarks.length + 1;
    state.bookmarks.push({
      name: `Bookmark ${n}`,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    });
    saveBookmarks();
    updateBookmarkPanel();
    showToast(`Bookmark ${n} saved`);
    return false;
  }
  if (e.code === "BracketRight" && !e.repeat && state.bookmarks.length) {
    const idx = (state.bookmarkIdx ?? -1) + 1;
    state.bookmarkIdx = idx >= state.bookmarks.length ? 0 : idx;
    teleportToBookmark(state.bookmarks[state.bookmarkIdx]);
    return false;
  }
  if (e.code === "BracketLeft" && !e.repeat && state.bookmarks.length) {
    const idx = (state.bookmarkIdx ?? -1) - 1;
    state.bookmarkIdx = idx < 0 ? state.bookmarks.length - 1 : idx;
    teleportToBookmark(state.bookmarks[state.bookmarkIdx]);
    return false;
  }
  if (e.code === "KeyX" && !e.repeat && !e.ctrlKey) {
    state.spectatorMode = !state.spectatorMode;
    showToast(state.spectatorMode ? "Spectator mode on (5x speed)" : "Spectator mode off");
    return false;
  }
  if (e.code === "KeyZ" && !e.repeat && !e.ctrlKey && !e.shiftKey) {
    const s = loadSettings();
    s.weatherEnabled = !(s.weatherEnabled ?? true);
    saveSettings(s);
    setWeatherEnabled(s.weatherEnabled);
    showToast(s.weatherEnabled ? "Weather on" : "Weather off");
    return false;
  }
  return false;
}

/** Search bar keys: Slash, ArrowDown/Up, Enter, Escape */
function handleSearchKeys(e) {
  if (e.code === "Slash" && !e.repeat) {
    const input = document.getElementById("search-input");
    if (input && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
    return true;
  }
  if (document.activeElement === document.getElementById("search-input")) {
    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      e.preventDefault();
      navigateSearch(e.code === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (e.code === "Enter") {
      e.preventDefault();
      selectHighlightedResult();
      return true;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      closeSearch();
      return true;
    }
  }
  return false;
}

// ── Group name search ──

const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const galleryOverlay = document.getElementById("gallery-overlay");
const galleryGrid = document.getElementById("gallery-grid");
let searchHighlightIdx = -1;
let searchMatches = [];
let bmTimeout = null;
const BM_STORAGE_KEY = "rift-flythrough-bookmarks";

function saveBookmarks() {
  try {
    localStorage.setItem(BM_STORAGE_KEY, JSON.stringify(state.bookmarks));
  } catch (_) {}
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BM_STORAGE_KEY);
    if (raw) state.bookmarks = JSON.parse(raw);
  } catch (_) {}
}

function exportBookmarks() {
  if (!state.bookmarks.length) {
    showToast("No bookmarks to export");
    return;
  }
  const blob = new Blob([JSON.stringify(state.bookmarks, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "rift-flythrough-bookmarks.json";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`${state.bookmarks.length} bookmarks exported`);
}

function importBookmarks() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("Not an array");
        const valid = data.filter(
          (b) =>
            b &&
            typeof b.name === "string" &&
            typeof b.x === "number" &&
            typeof b.y === "number" &&
            typeof b.z === "number",
        );
        if (!valid.length) {
          showToast("No valid bookmarks found in file");
          return;
        }
        state.bookmarks.push(...valid);
        state.bookmarkIdx = -1;
        saveBookmarks();
        updateBookmarkPanel();
        showToast(
          `Added ${valid.length} bookmark${valid.length !== 1 ? "s" : ""} (${state.bookmarks.length} total)`,
        );
      } catch (_) {
        showToast("Invalid bookmark file");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function normalizeName(name) {
  return (name || "")
    .replace(/^ptonly_/, "")
    .replace(/^o /, "")
    .toLowerCase();
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    searchHighlightIdx = -1;
    if (!query || !state.worldGroups.length) {
      searchResults?.classList.remove("active");
      searchMatches = [];
      return;
    }
    searchMatches = state.worldGroups
      .map((g, i) => ({ group: g, idx: i, name: normalizeName(g.name) }))
      .filter(({ name }) => name.includes(query))
      .slice(0, 10);
    if (!searchMatches.length) {
      searchResults?.classList.remove("active");
      return;
    }
    if (!searchResults) return;
    searchResults.classList.add("active");
    searchResults.innerHTML = searchMatches
      .map(
        ({ group, idx }, i) =>
          `<div class="search-result${group.name?.startsWith("ptonly_") ? " ptonly" : ""}" data-idx="${idx}" data-si="${i}">${(group.name || "?").replace(/^o /, "")}</div>`,
      )
      .join("");
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== searchInput) closeSearch();
    }, 150);
  });
}

function navigateSearch(dir) {
  if (!searchMatches.length) return;
  const items = searchResults?.querySelectorAll(".search-result");
  if (!items?.length) return;
  if (searchHighlightIdx >= 0 && items[searchHighlightIdx])
    items[searchHighlightIdx].classList.remove("highlight");
  searchHighlightIdx = (((searchHighlightIdx + dir) % items.length) + items.length) % items.length;
  items[searchHighlightIdx].classList.add("highlight");
  items[searchHighlightIdx].scrollIntoView({ block: "nearest" });
}

function selectHighlightedResult() {
  if (searchHighlightIdx < 0 || searchHighlightIdx >= searchMatches.length) return;
  const { group } = searchMatches[searchHighlightIdx];
  teleportToGroup(group);
}

function teleportToGroup(group) {
  if (!group) return;
  flyToGroup(group);
  closeSearch();
}

function closeSearch() {
  searchResults?.classList.remove("active");
  searchHighlightIdx = -1;
  searchMatches = [];
  if (searchInput) searchInput.value = "";
}

// ── Bookmark panel ──

const bookmarkList = document.getElementById("bookmark-list");
const bookmarkPanel = document.getElementById("bookmark-panel");

loadBookmarks();
if (state.bookmarks.length) updateBookmarkPanel();

function updateBookmarkPanel() {
  if (!bookmarkPanel) return;
  if (!state.bookmarks.length) {
    bookmarkPanel.classList.remove("active");
    return;
  }
  bookmarkPanel.classList.add("active");
  if (!bookmarkList) return;
  bookmarkList.innerHTML = state.bookmarks
    .map(
      (bm, i) =>
        `<div class="bm-row">` +
        `<span class="bm-name" data-bmi="${i}">${bm.name}</span>` +
        `<span class="bm-del" data-bmi="${i}">&times;</span>` +
        `</div>`,
    )
    .join("");
}

let _bmClickTarget = null;
let _bmClickTimer = null;

bookmarkList?.addEventListener("click", (e) => {
  const nameEl = e.target.closest(".bm-name");
  const delEl = e.target.closest(".bm-del");
  if (delEl) {
    if (_bmClickTimer) {
      clearTimeout(_bmClickTimer);
      _bmClickTarget = null;
    }
    const idx = parseInt(delEl.dataset.bmi, 10);
    if (!Number.isNaN(idx) && state.bookmarks[idx]) {
      state.bookmarks.splice(idx, 1);
      if (state.bookmarkIdx >= state.bookmarks.length) state.bookmarkIdx = -1;
      saveBookmarks();
      updateBookmarkPanel();
    }
    return;
  }
  if (nameEl) {
    const idx = parseInt(nameEl.dataset.bmi, 10);
    if (Number.isNaN(idx) || !state.bookmarks[idx]) return;
    if (_bmClickTarget === nameEl) {
      clearTimeout(_bmClickTimer);
      _bmClickTarget = null;
      startRename(nameEl, idx);
      return;
    }
    if (_bmClickTimer) clearTimeout(_bmClickTimer);
    _bmClickTarget = nameEl;
    _bmClickTimer = setTimeout(() => {
      _bmClickTarget = null;
      state.bookmarkIdx = idx;
      teleportToBookmark(state.bookmarks[idx]);
    }, 250);
  }
});

function startRename(nameEl, idx) {
  const bm = state.bookmarks[idx];
  const input = document.createElement("input");
  input.type = "text";
  input.className = "bm-rename-input";
  input.value = bm.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let _done = false;
  function finish(commit) {
    if (_done) return;
    _done = true;
    const newName = commit && input.value.trim() ? input.value.trim() : bm.name;
    if (newName !== bm.name) {
      state.bookmarks[idx].name = newName;
      saveBookmarks();
    }
    updateBookmarkPanel();
  }

  input.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      e.preventDefault();
      finish(true);
    }
    if (e.code === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

const bmExportBtn = document.getElementById("bm-export");
const bmImportBtn = document.getElementById("bm-import");
const bmClearBtn = document.getElementById("bm-clear");
if (bmExportBtn) bmExportBtn.addEventListener("click", () => exportBookmarks());
if (bmImportBtn) bmImportBtn.addEventListener("click", () => importBookmarks());
let _clearPending = false;
if (bmClearBtn)
  bmClearBtn.addEventListener("click", () => {
    if (!state.bookmarks.length) return;
    if (!_clearPending) {
      _clearPending = true;
      showToast("Click Clear again to confirm");
      setTimeout(() => {
        _clearPending = false;
      }, 2500);
      return;
    }
    _clearPending = false;
    const count = state.bookmarks.length;
    state.bookmarks = [];
    state.bookmarkIdx = -1;
    saveBookmarks();
    updateBookmarkPanel();
    showToast(`Cleared ${count} bookmark${count !== 1 ? "s" : ""}`);
  });

function teleportToBookmark(bm) {
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }
  pushTeleportHistory();
  camera.position.set(bm.x, bm.y + 50, bm.z + 100);
  camera.lookAt(bm.x, bm.y, bm.z);
  if (state.selectedGroup) deselectGroup();
  const selName = document.getElementById("selected-name");
  if (selName) {
    selName.textContent = `\u{1F4CD} ${bm.name}`;
    selName.style.display = "block";
  }
  if (bmTimeout) clearTimeout(bmTimeout);
  bmTimeout = setTimeout(() => {
    if (selName && selName.textContent === `\u{1F4CD} ${bm.name}`) {
      selName.style.display = "none";
      selName.textContent = "";
    }
  }, 3000);
}

// ── Click-outside-to-close for overlays ──

document.getElementById("help-overlay")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("active");
});
document.getElementById("gallery-overlay")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) toggleGallery();
});

// ── Screenshot gallery ──

function toggleGallery() {
  if (!galleryOverlay) return;
  if (galleryOverlay.classList.contains("active")) {
    galleryOverlay.classList.remove("active");
  } else {
    renderGallery();
    galleryOverlay.classList.add("active");
  }
}

function renderGallery() {
  if (!galleryGrid) return;
  if (!state.screenshots.length) {
    galleryGrid.innerHTML =
      '<p style="color:#555;text-align:center">No screenshots yet. Press P to capture.</p>';
    return;
  }
  galleryGrid.innerHTML = state.screenshots
    .map(
      (ss, i) =>
        `<div class="gallery-item">` +
        `<img src="${ss.dataUrl}" data-ssi="${i}" title="${new Date(ss.timestamp).toLocaleTimeString()}">` +
        `<div class="gallery-actions">` +
        `<button type="button" data-ssi="${i}" data-action="dl">Save</button>` +
        `<button type="button" data-ssi="${i}" data-action="del">Del</button>` +
        `</div></div>`,
    )
    .join("");
}

function updateGalleryIfOpen() {
  if (galleryOverlay?.classList.contains("active")) renderGallery();
}

// ── Toast notifications ──

let _toastTimer = null;

export function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

// ── Tour speed indicator ──

let tourSpeedTimer = null;

function showTourSpeedIndicator() {
  const el = document.getElementById("tour-speed-indicator");
  if (!el) return;
  el.textContent = `Tour: ${state.tourSpeed.toFixed(2)}x`;
  el.classList.add("show");
  if (tourSpeedTimer) clearTimeout(tourSpeedTimer);
  tourSpeedTimer = setTimeout(() => el.classList.remove("show"), 1500);
}

galleryGrid?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const idx = parseInt(btn.dataset.ssi, 10);
  if (Number.isNaN(idx) || !state.screenshots[idx]) return;
  if (btn.dataset.action === "del") {
    state.screenshots.splice(idx, 1);
    renderGallery();
  } else if (btn.dataset.action === "dl") {
    const link = document.createElement("a");
    link.download = `rift-screenshot-${state.screenshots[idx].timestamp}.png`;
    link.href = state.screenshots[idx].dataUrl;
    link.click();
  }
});
