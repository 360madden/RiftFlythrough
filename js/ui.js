// Overlay toggles, settings panel, help, stats, screenshot, lighting — UI-only key actions.

import { applyLighting, LIGHT_MODES } from "./lighting.js";
import { camera, renderer, scene } from "./scene.js";
import { deselectGroup } from "./selection.js";
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
    state.lightMode = (state.lightMode + 1) % LIGHT_MODES.length;
    applyLighting(state.lightMode);
    const s = loadSettings();
    s.lightMode = state.lightMode;
    saveSettings(s);
  }
});
