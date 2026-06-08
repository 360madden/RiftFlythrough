// Overlay toggles, settings panel, help, stats, screenshot, lighting — UI-only key actions.

import * as THREE from "three";
import { LIGHT_MODES, startLightTransition, applyFogDensity } from "./lighting.js";
import { camera, renderer, scene } from "./scene.js";
import { deselectGroup, highlightGroup } from "./selection.js";
import { applyRenderScale } from "./scene.js";
import { applyWaterOpacity } from "./world.js";
import { loadSettings, saveSettings } from "./settings.js";
import { state } from "./state.js";

// ── Settings form helpers ──

function populateSettingsForm(s) {
  const sensEl = document.getElementById("set-sensitivity");
  const speedEl = document.getElementById("set-speed");
  const sizeEl = document.getElementById("set-minimap-size");
  const mmVisEl = document.getElementById("set-minimap-visible");
  const fpsVisEl = document.getElementById("set-fps-visible");
  const fogEl = document.getElementById("set-fog-density");
  const waterEl = document.getElementById("set-water-opacity");
  const renderScaleEl = document.getElementById("set-render-scale");
  if (sensEl) sensEl.value = Math.round(s.mouseSensitivity * 1000);
  if (speedEl) speedEl.value = s.moveSpeed;
  if (sizeEl) sizeEl.value = s.minimapSize;
  if (mmVisEl) mmVisEl.checked = s.minimapVisible;
  if (fpsVisEl) fpsVisEl.checked = s.fpsVisible;
  if (fogEl) fogEl.value = s.fogDensity;
  if (waterEl) waterEl.value = s.waterOpacity;
  if (renderScaleEl) renderScaleEl.value = s.renderScale;
  const valSensEl = document.getElementById("val-sensitivity");
  if (valSensEl) valSensEl.textContent = (s.mouseSensitivity * 1000).toFixed(1);
  const valSpeedEl = document.getElementById("val-speed");
  if (valSpeedEl) valSpeedEl.textContent = s.moveSpeed;
  const valFogEl = document.getElementById("val-fog-density");
  if (valFogEl) valFogEl.textContent = `${parseFloat(s.fogDensity).toFixed(2)}x`;
  const valWaterEl = document.getElementById("val-water-opacity");
  if (valWaterEl) valWaterEl.textContent = `${Math.round(s.waterOpacity * 100)}%`;
}

function getSettingsOverlay() {
  return document.getElementById("settings-overlay");
}

function openSettings() {
  getSettingsOverlay().classList.add("active");
  populateSettingsForm(loadSettings());
}

function closeSettings() {
  getSettingsOverlay().classList.remove("active");
}

// Sync form on DOM ready (load from localStorage — main.js has already set state)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => populateSettingsForm(loadSettings()));
} else {
  populateSettingsForm(loadSettings());
}

// ── Settings form change handlers ──

document.getElementById("set-sensitivity").addEventListener("input", (e) => {
  const val = Math.round(parseFloat(e.target.value));
  document.getElementById("val-sensitivity").textContent = val.toFixed(1);
  state.mouseSensitivity = val / 1000;
  const s = loadSettings();
  s.mouseSensitivity = state.mouseSensitivity;
  saveSettings(s);
});

document.getElementById("set-speed").addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("val-speed").textContent = val;
  const s = loadSettings();
  s.moveSpeed = val;
  saveSettings(s);
  state.moveSpeed = val;
});

document.getElementById("set-minimap-size").addEventListener("change", (e) => {
  const val = parseInt(e.target.value, 10);
  const s = loadSettings();
  s.minimapSize = val;
  saveSettings(s);
  state.minimapSize = val;
  const mc = document.getElementById("minimap-canvas");
  mc.width = val;
  mc.height = val;
  const container = document.getElementById("minimap-container");
  container.style.width = `${val}px`;
  container.style.height = `${val}px`;
});

document.getElementById("set-minimap-visible").addEventListener("change", (e) => {
  const s = loadSettings();
  s.minimapVisible = e.target.checked;
  saveSettings(s);
});

document.getElementById("set-fps-visible").addEventListener("change", (e) => {
  const s = loadSettings();
  s.fpsVisible = e.target.checked;
  saveSettings(s);
});

document.getElementById("set-render-scale").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-render-scale").textContent = `${Math.round(val * 100)}%`;
  const s = loadSettings();
  s.renderScale = val;
  saveSettings(s);
  state.renderScale = val;
  applyRenderScale(val);
});

document.getElementById("set-fog-density").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-fog-density").textContent = `${val.toFixed(2)}x`;
  const s = loadSettings();
  s.fogDensity = val;
  saveSettings(s);
  state.fogDensity = val;
  applyFogDensity(val);
});

document.getElementById("set-water-opacity").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-water-opacity").textContent = `${Math.round(val * 100)}%`;
  const s = loadSettings();
  s.waterOpacity = val;
  saveSettings(s);
  state.waterOpacity = val;
  applyWaterOpacity(val);
});

// ── Shared lighting-mode setter (used by L key and Digit1-4)

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
    e.preventDefault();
    const settingsOverlay = getSettingsOverlay();
    if (settingsOverlay.classList.contains("active")) {
      closeSettings();
    } else {
      openSettings();
    }
    return true;
  }
  if (e.code === "F1") {
    const helpOverlay = document.getElementById("help-overlay");
    helpOverlay.classList.toggle("active");
    e.preventDefault();
    return true;
  }
  if (e.code === "KeyF" && !e.repeat) {
    const fpsEl = document.getElementById("fps");
    const isHidden = fpsEl.style.display === "none" || fpsEl.style.display === "";
    fpsEl.style.display = isHidden ? "block" : "none";
    return false;
  }
  if (e.code === "Escape") {
    if (galleryOverlay.classList.contains("active")) {
      galleryOverlay.classList.remove("active");
      e.preventDefault();
      return true;
    }
    const settingsOverlay = getSettingsOverlay();
    if (settingsOverlay.classList.contains("active")) {
      closeSettings();
      e.preventDefault();
      return true;
    }
    const helpOverlay = document.getElementById("help-overlay");
    if (helpOverlay.classList.contains("active")) {
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
    statsPanel.classList.toggle("active");
    return false;
  }
  if (e.code === "KeyV" && !e.repeat) {
    toggleGallery();
    return false;
  }
  return false;
}

/** Feature actions: P, L, Digit1-4, O, G, T, B, brackets */
function handleFeatureKeys(e) {
  if (e.code === "KeyP") {
    if (!state.worldGroups.length) return false;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `rift-flythrough-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    state.screenshots.unshift({ dataUrl, timestamp: Date.now() });
    if (state.screenshots.length > 20) state.screenshots.length = 20;
    updateGalleryIfOpen();
    return false;
  }
  if (e.code === "KeyL") {
    setLightMode((state.lightMode + 1) % LIGHT_MODES.length);
    return false;
  }
  if (e.code >= "Digit1" && e.code <= "Digit4" && !e.repeat) {
    setLightMode(parseInt(e.code.slice(-1)) - 1);
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
    return false;
  }
  if (e.code === "KeyG") {
    state.wireframeMode = !state.wireframeMode;
    state.worldGroups.forEach((g) => {
      g.traverse((child) => {
        if (child.isMesh && child.material.wireframe !== undefined) {
          child.material.wireframe = state.wireframeMode;
        }
      });
    });
    return false;
  }
  if (e.code === "KeyT" && !e.repeat) {
    if (state.tourActive) {
      state.tourActive = false;
      state.tourPaused = false;
    } else {
      import("./tour.js").then((m) => m.startTour()).catch(() => {});
    }
    return false;
  }
  if (e.code === "Space" && state.tourActive && !e.repeat) {
    e.preventDefault();
    state.tourPaused = !state.tourPaused;
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
  return false;
}

/** Search bar keys: Slash, ArrowDown/Up, Enter, Escape */
function handleSearchKeys(e) {
  if (e.code === "Slash" && !e.repeat) {
    const input = document.getElementById("search-input");
    if (document.activeElement !== input) {
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
const searchBox = new THREE.Box3();
const searchCenter = new THREE.Vector3();
const searchSize = new THREE.Vector3();
let bmTimeout = null;
const BM_STORAGE_KEY = "rift-flythrough-bookmarks";

function saveBookmarks() {
  try { localStorage.setItem(BM_STORAGE_KEY, JSON.stringify(state.bookmarks)); } catch (_) {}
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BM_STORAGE_KEY);
    if (raw) state.bookmarks = JSON.parse(raw);
  } catch (_) {}
}

function normalizeName(name) {
  return (name || "").replace(/^ptonly_/, "").replace(/^o /, "").toLowerCase();
}

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();
  searchHighlightIdx = -1;
  if (!query || !state.worldGroups.length) {
    searchResults.classList.remove("active");
    searchMatches = [];
    return;
  }
  // Filter groups by name (case-insensitive substring match)
  searchMatches = state.worldGroups
    .map((g, i) => ({ group: g, idx: i, name: normalizeName(g.name) }))
    .filter(({ name }) => name.includes(query))
    .slice(0, 10);
  if (!searchMatches.length) {
    searchResults.classList.remove("active");
    return;
  }
  searchResults.classList.add("active");
  searchResults.innerHTML = searchMatches
    .map(
      ({ group, idx }, i) =>
        `<div class="search-result${group.name?.startsWith("ptonly_") ? " ptonly" : ""}" data-idx="${idx}" data-si="${i}">${(group.name || "?").replace(/^o /, "")}</div>`,
    )
    .join("");
});

searchInput.addEventListener("blur", () => {
  // Delay close so click on result registers
  setTimeout(() => {
    if (document.activeElement !== searchInput) closeSearch();
  }, 150);
});

function navigateSearch(dir) {
  if (!searchMatches.length) return;
  const items = searchResults.querySelectorAll(".search-result");
  if (!items.length) return;
  // Remove old highlight
  if (searchHighlightIdx >= 0 && items[searchHighlightIdx])
    items[searchHighlightIdx].classList.remove("highlight");
  // Move
  searchHighlightIdx = ((searchHighlightIdx + dir) % items.length + items.length) % items.length;
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
  // Get group bounding box center
  searchBox.setFromObject(group);
  searchBox.getCenter(searchCenter);
  searchBox.getSize(searchSize);
  const dist = Math.max(searchSize.x, searchSize.y, searchSize.z) * 1.8;
  // Position camera to look at group center from a reasonable distance
  camera.position.set(
    searchCenter.x + dist * 0.6,
    searchCenter.y + dist * 0.5,
    searchCenter.z + dist * 0.8,
  );
  camera.lookAt(searchCenter);
  // Highlight the group
  if (state.selectedGroup) deselectGroup();
  state.selectedGroup = group;
  state.selectedOrigMaterials = highlightGroup(group);
  const selName = document.getElementById("selected-name");
  const name = group.name || "unknown";
  const cleanName = name.startsWith("ptonly_") ? name.slice(7) : name;
  selName.textContent = `\uD83D\uDCCD ${cleanName}`;
  selName.style.display = "block";
  closeSearch();
}

function closeSearch() {
  searchResults.classList.remove("active");
  searchHighlightIdx = -1;
  searchMatches = [];
  searchInput.value = "";
}

// ── Bookmark panel ──

const bookmarkList = document.getElementById("bookmark-list");
const bookmarkPanel = document.getElementById("bookmark-panel");

// Load persisted bookmarks on startup, render if any exist
loadBookmarks();
if (state.bookmarks.length) updateBookmarkPanel();

function updateBookmarkPanel() {
  if (!state.bookmarks.length) {
    bookmarkPanel.classList.remove("active");
    return;
  }
  bookmarkPanel.classList.add("active");
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

bookmarkList.addEventListener("click", (e) => {
  const nameEl = e.target.closest(".bm-name");
  const delEl = e.target.closest(".bm-del");
  if (delEl) {
    const idx = parseInt(delEl.dataset.bmi);
    if (!isNaN(idx) && state.bookmarks[idx]) {
      state.bookmarks.splice(idx, 1);
      if (state.bookmarkIdx >= state.bookmarks.length) state.bookmarkIdx = -1;
      saveBookmarks();
      updateBookmarkPanel();
    }
    return;
  }
  if (nameEl) {
    const idx = parseInt(nameEl.dataset.bmi);
    if (!isNaN(idx) && state.bookmarks[idx]) {
      state.bookmarkIdx = idx;
      teleportToBookmark(state.bookmarks[idx]);
    }
  }
});

function teleportToBookmark(bm) {
  // Exit orbit mode so teleport sticks
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }
  camera.position.set(bm.x, bm.y + 50, bm.z + 100);
  camera.lookAt(bm.x, bm.y, bm.z);
  if (state.selectedGroup) deselectGroup();
  const selName = document.getElementById("selected-name");
  selName.textContent = `\u{1F4CD} ${bm.name}`;
  selName.style.display = "block";
  if (bmTimeout) clearTimeout(bmTimeout);
  bmTimeout = setTimeout(() => {
    if (selName.textContent === `\u{1F4CD} ${bm.name}`) {
      selName.style.display = "none";
      selName.textContent = "";
    }
  }, 3000);
}

// ── Click-outside-to-close for overlays ──

document.getElementById("settings-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeSettings();
});
document.getElementById("help-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove("active");
});
document.getElementById("gallery-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) toggleGallery();
});

// ── Screenshot gallery ──

function toggleGallery() {
  if (galleryOverlay.classList.contains("active")) {
    galleryOverlay.classList.remove("active");
  } else {
    renderGallery();
    galleryOverlay.classList.add("active");
  }
}

function renderGallery() {
  if (!state.screenshots.length) {
    galleryGrid.innerHTML = '<p style="color:#555;text-align:center">No screenshots yet. Press P to capture.</p>';
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
  if (galleryOverlay.classList.contains("active")) renderGallery();
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

galleryGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const idx = parseInt(btn.dataset.ssi);
  if (isNaN(idx) || !state.screenshots[idx]) return;
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
