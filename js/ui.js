// Overlay toggles, settings panel, help, stats, screenshot, lighting — UI-only key actions.

import * as THREE from "three";
import { setAudioEnabled } from "./audio.js";
import {
  applyFogDensity,
  applyShadowQuality,
  LIGHT_MODES,
  startLightTransition,
} from "./lighting.js";
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
import { flyToGroup, pushTeleportHistory, redoTeleport, undoTeleport } from "./teleport.js";
import { setWeatherEnabled } from "./weather.js";
import {
  applyGroundOpacity,
  applyWaterOpacity,
  applyWaterReflectStrength,
  setGridVisible,
  setGroundVisible,
  setWaterVisible,
} from "./world.js";

// ── Settings form helpers ──

function populateSettingsForm(s) {
  const sensEl = document.getElementById("set-sensitivity");
  const speedEl = document.getElementById("set-speed");
  const sizeEl = document.getElementById("set-minimap-size");
  const mmVisEl = document.getElementById("set-minimap-visible");
  const fpsVisEl = document.getElementById("set-fps-visible");
  const fogEl = document.getElementById("set-fog-density");
  const waterEl = document.getElementById("set-water-opacity");
  const waterReflEl = document.getElementById("set-water-reflect");
  const groundEl = document.getElementById("set-ground-opacity");
  const renderScaleEl = document.getElementById("set-render-scale");
  const exposureEl = document.getElementById("set-exposure");
  const shadowEl = document.getElementById("set-shadow-quality");
  const bloomEl = document.getElementById("set-bloom-enabled");
  if (sensEl) sensEl.value = Math.round(s.mouseSensitivity * 1000);
  if (speedEl) speedEl.value = s.moveSpeed;
  if (sizeEl) sizeEl.value = s.minimapSize;
  if (mmVisEl) mmVisEl.checked = s.minimapVisible;
  if (fpsVisEl) fpsVisEl.checked = s.fpsVisible;
  if (fogEl) fogEl.value = s.fogDensity;
  if (waterEl) waterEl.value = s.waterOpacity;
  if (waterReflEl) waterReflEl.value = s.waterReflect ?? 0.4;
  if (groundEl) groundEl.value = s.groundOpacity;
  if (renderScaleEl) renderScaleEl.value = s.renderScale;
  if (exposureEl) exposureEl.value = s.exposure;
  if (shadowEl) shadowEl.value = s.shadowQuality ?? 2;
  if (bloomEl) bloomEl.checked = s.bloomEnabled ?? true;
  const particlesEl = document.getElementById("set-particles-visible");
  if (particlesEl) particlesEl.checked = s.particlesVisible ?? true;
  const audioEl = document.getElementById("set-audio-enabled");
  if (audioEl) audioEl.checked = s.audioEnabled ?? true;
  const weatherEl = document.getElementById("set-weather-enabled");
  if (weatherEl) weatherEl.checked = s.weatherEnabled ?? true;
  const autoExpEl = document.getElementById("set-auto-exposure");
  if (autoExpEl) autoExpEl.checked = s.autoExposure ?? false;
  const exposureSlider = document.getElementById("set-exposure");
  if (exposureSlider) exposureSlider.disabled = s.autoExposure ?? false;
  const dofEnabledEl = document.getElementById("set-dof-enabled");
  if (dofEnabledEl) dofEnabledEl.checked = s.dofEnabled ?? false;
  const dofFocusEl = document.getElementById("set-dof-focus");
  if (dofFocusEl) {
    dofFocusEl.value = s.dofFocus ?? 500;
    dofFocusEl.disabled = !(s.dofEnabled ?? false);
  }
  const valDofFocusEl = document.getElementById("val-dof-focus");
  if (valDofFocusEl) valDofFocusEl.textContent = (s.dofFocus ?? 500).toString();
  const hudPosEl = document.getElementById("set-hud-pos");
  if (hudPosEl) hudPosEl.checked = s.showHudPos ?? true;
  const hudSpeedEl = document.getElementById("set-hud-speed");
  if (hudSpeedEl) hudSpeedEl.checked = s.showHudSpeed ?? true;
  const legendVisEl = document.getElementById("set-legend-visible");
  if (legendVisEl) legendVisEl.checked = s.showLegend ?? true;
  const valSensEl = document.getElementById("val-sensitivity");
  if (valSensEl) valSensEl.textContent = (s.mouseSensitivity * 1000).toFixed(1);
  const valSpeedEl = document.getElementById("val-speed");
  if (valSpeedEl) valSpeedEl.textContent = s.moveSpeed;
  const valFogEl = document.getElementById("val-fog-density");
  if (valFogEl) valFogEl.textContent = `${parseFloat(s.fogDensity).toFixed(2)}x`;
  const valWaterEl = document.getElementById("val-water-opacity");
  if (valWaterEl) valWaterEl.textContent = `${Math.round(s.waterOpacity * 100)}%`;
  const valWaterReflEl = document.getElementById("val-water-reflect");
  if (valWaterReflEl) valWaterReflEl.textContent = `${Math.round((s.waterReflect ?? 0.4) * 100)}%`;
  const valGroundEl = document.getElementById("val-ground-opacity");
  if (valGroundEl) valGroundEl.textContent = `${Math.round(s.groundOpacity * 100)}%`;
  const valExposureEl = document.getElementById("val-exposure");
  if (valExposureEl) valExposureEl.textContent = parseFloat(s.exposure).toFixed(1);
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
  const val = Math.round(Number.parseFloat(e.target.value));
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

document.getElementById("set-water-reflect").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-water-reflect").textContent = `${Math.round(val * 100)}%`;
  const s = loadSettings();
  s.waterReflect = val;
  saveSettings(s);
  applyWaterReflectStrength(val);
});

document.getElementById("set-ground-opacity").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-ground-opacity").textContent = `${Math.round(val * 100)}%`;
  const s = loadSettings();
  s.groundOpacity = val;
  saveSettings(s);
  state.groundOpacity = val;
  applyGroundOpacity(val);
});

document.getElementById("set-exposure").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-exposure").textContent = val.toFixed(1);
  const s = loadSettings();
  s.exposure = val;
  saveSettings(s);
  applyExposure(val);
});

document.getElementById("set-shadow-quality").addEventListener("change", (e) => {
  const val = parseInt(e.target.value, 10);
  const s = loadSettings();
  s.shadowQuality = val;
  saveSettings(s);
  applyShadowQuality(val);
});

document.getElementById("set-bloom-enabled").addEventListener("change", (e) => {
  const s = loadSettings();
  s.bloomEnabled = e.target.checked;
  saveSettings(s);
  setBloomEnabled(e.target.checked);
});

document.getElementById("set-particles-visible").addEventListener("change", (e) => {
  const s = loadSettings();
  s.particlesVisible = e.target.checked;
  saveSettings(s);
  setParticlesVisible(e.target.checked);
});

document.getElementById("set-cycle-speed").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  document.getElementById("val-cycle-speed").textContent = `${val.toFixed(2)}x`;
  const s = loadSettings();
  s.cycleSpeed = val;
  saveSettings(s);
  state.cycleSpeed = val;
});

document.getElementById("set-audio-enabled").addEventListener("change", (e) => {
  const s = loadSettings();
  s.audioEnabled = e.target.checked;
  saveSettings(s);
  setAudioEnabled(e.target.checked);
});

document.getElementById("set-weather-enabled").addEventListener("change", (e) => {
  const s = loadSettings();
  s.weatherEnabled = e.target.checked;
  saveSettings(s);
  setWeatherEnabled(e.target.checked);
});

document.getElementById("set-auto-exposure").addEventListener("change", (e) => {
  const s = loadSettings();
  s.autoExposure = e.target.checked;
  saveSettings(s);
  state.autoExposure = e.target.checked;
  // Disable manual exposure slider when auto is on
  const exposureEl = document.getElementById("set-exposure");
  if (exposureEl) exposureEl.disabled = e.target.checked;
  if (!e.target.checked) {
    applyExposure(s.exposure);
  }
});

document.getElementById("set-dof-enabled").addEventListener("change", (e) => {
  const s = loadSettings();
  s.dofEnabled = e.target.checked;
  saveSettings(s);
  setDofEnabled(e.target.checked);
  const focusEl = document.getElementById("set-dof-focus");
  if (focusEl) focusEl.disabled = !e.target.checked;
});

document.getElementById("set-dof-focus").addEventListener("input", (e) => {
  const val = parseInt(e.target.value, 10);
  document.getElementById("val-dof-focus").textContent = val.toString();
  const s = loadSettings();
  s.dofFocus = val;
  saveSettings(s);
  setDofFocus(val);
});

document.getElementById("set-hud-pos").addEventListener("change", (e) => {
  const s = loadSettings();
  s.showHudPos = e.target.checked;
  saveSettings(s);
  applyHudVisibility();
});

document.getElementById("set-hud-speed").addEventListener("change", (e) => {
  const s = loadSettings();
  s.showHudSpeed = e.target.checked;
  saveSettings(s);
  applyHudVisibility();
});

document.getElementById("set-legend-visible").addEventListener("change", (e) => {
  const s = loadSettings();
  s.showLegend = e.target.checked;
  saveSettings(s);
  const legendEl = document.getElementById("legend");
  if (legendEl) legendEl.style.display = e.target.checked ? "" : "none";
});

/** Apply HUD visibility from current settings to shared state (read by controls.js). */
function applyHudVisibility() {
  const s = loadSettings();
  state.showHudPos = s.showHudPos ?? true;
  state.showHudSpeed = s.showHudSpeed ?? true;
}

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
    if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-fps",isHidden);
    return false;
  }
  if (e.code === "Escape") {
    if (galleryOverlay.classList.contains("active")) {
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
    import("./perf.js").then((m) => {m.togglePerf();if(window.updateSidebarDot) window.updateSidebarDot("sb-toggle-perf",!document.getElementById("perf-panel")?.style?.display||document.getElementById("perf-panel").style.display==="none");}).catch(() => {});
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
    state.wireframeMode = !state.wireframeMode;
    state.worldGroups.forEach((g) => {
      g.traverse((child) => {
        if (child.isMesh && child.material.wireframe !== undefined) {
          child.material.wireframe = state.wireframeMode;
        }
      });
    });
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

let _bmClickTarget = null;
let _bmClickTimer = null;

bookmarkList.addEventListener("click", (e) => {
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
    // Double-click → rename
    if (_bmClickTarget === nameEl) {
      clearTimeout(_bmClickTimer);
      _bmClickTarget = null;
      startRename(nameEl, idx);
      return;
    }
    // Single click → teleport (after 250ms delay to distinguish from dblclick)
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
  // Exit orbit mode so teleport sticks
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
  if (galleryOverlay.classList.contains("active")) renderGallery();
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

galleryGrid.addEventListener("click", (e) => {
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
