// Overlay toggles, settings panel, help, stats, screenshot, lighting — UI-only key actions.

import * as THREE from "three";
import { LIGHT_MODES, startLightTransition } from "./lighting.js";
import { camera, renderer, scene } from "./scene.js";
import { deselectGroup, highlightGroup } from "./selection.js";
import { loadSettings, saveSettings } from "./settings.js";
import { state } from "./state.js";

// ── Settings form helpers ──

function populateSettingsForm(s) {
  const sensEl = document.getElementById("set-sensitivity");
  const speedEl = document.getElementById("set-speed");
  const sizeEl = document.getElementById("set-minimap-size");
  const mmVisEl = document.getElementById("set-minimap-visible");
  const fpsVisEl = document.getElementById("set-fps-visible");
  if (sensEl) sensEl.value = Math.round(s.mouseSensitivity * 1000);
  if (speedEl) speedEl.value = s.moveSpeed;
  if (sizeEl) sizeEl.value = s.minimapSize;
  if (mmVisEl) mmVisEl.checked = s.minimapVisible;
  if (fpsVisEl) fpsVisEl.checked = s.fpsVisible;
  const valSensEl = document.getElementById("val-sensitivity");
  if (valSensEl) valSensEl.textContent = (s.mouseSensitivity * 1000).toFixed(1);
  const valSpeedEl = document.getElementById("val-speed");
  if (valSpeedEl) valSpeedEl.textContent = s.moveSpeed;
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
  if (e.code === "Tab") {
    e.preventDefault();
    const settingsOverlay = getSettingsOverlay();
    if (settingsOverlay.classList.contains("active")) {
      closeSettings();
    } else {
      openSettings();
    }
    return;
  }
  if (e.code === "F1") {
    const helpOverlay = document.getElementById("help-overlay");
    helpOverlay.classList.toggle("active");
    e.preventDefault();
    return;
  }
  if (e.code === "KeyF" && !e.repeat) {
    const fpsEl = document.getElementById("fps");
    const isHidden = fpsEl.style.display === "none" || fpsEl.style.display === "";
    fpsEl.style.display = isHidden ? "block" : "none";
  }
  if (e.code === "Escape") {
    const settingsOverlay = getSettingsOverlay();
    if (settingsOverlay.classList.contains("active")) {
      closeSettings();
      e.preventDefault();
      return;
    }
    const helpOverlay = document.getElementById("help-overlay");
    if (helpOverlay.classList.contains("active")) {
      helpOverlay.classList.remove("active");
      e.preventDefault();
      return;
    }
    if (state.selectedGroup) {
      deselectGroup();
      e.preventDefault();
      return;
    }
  }
  if (e.code === "KeyI") {
    const statsPanel = document.getElementById("stats-panel");
    statsPanel.classList.toggle("active");
  }
  if (e.code === "KeyP") {
    if (!state.worldGroups.length) return;
    renderer.render(scene, camera);
    const link = document.createElement("a");
    link.download = `rift-flythrough-${Date.now()}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  }
  if (e.code === "KeyL") {
    setLightMode((state.lightMode + 1) % LIGHT_MODES.length);
  }
  // Direct lighting presets: 1=Day, 2=Sunset, 3=Night, 4=Dawn
  if (e.code >= "Digit1" && e.code <= "Digit4" && !e.repeat) {
    setLightMode(parseInt(e.code.slice(-1)) - 1);
  }
  if (e.code === "KeyO" && !e.repeat) {
    state.orbitMode = !state.orbitMode;
    if (state.orbitMode) {
      // Compute orbit target from current look direction
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const target = camera.position.clone().addScaledVector(dir, state.orbitDistance);
      state.orbitTarget = target;
      // Initialize spherical coords from current camera position relative to target
      const offset = camera.position.clone().sub(target);
      state.orbitPhi = Math.asin(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1));
      state.orbitTheta = Math.atan2(offset.x, offset.z);
    } else {
      state.orbitTarget = null;
    }
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
  }
  // Focus search bar
  if (e.code === "Slash" && !e.repeat) {
    const input = document.getElementById("search-input");
    if (document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  }
  // Navigate search results with arrow keys
  if (document.activeElement === document.getElementById("search-input")) {
    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      e.preventDefault();
      navigateSearch(e.code === "ArrowDown" ? 1 : -1);
    }
    if (e.code === "Enter") {
      e.preventDefault();
      selectHighlightedResult();
    }
    if (e.code === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  }
});

// ── Group name search ──

const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
let searchHighlightIdx = -1;
let searchMatches = [];
const searchBox = new THREE.Box3();
const searchCenter = new THREE.Vector3();
const searchSize = new THREE.Vector3();

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
