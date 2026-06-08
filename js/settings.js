// Settings management with localStorage persistence.
// Imported by modules that need configurable values.

import { applyLighting } from "./lighting.js";
import { state } from "./state.js";

const STORAGE_KEY = "rift-flythrough-settings";

export const defaults = {
  mouseSensitivity: 0.002,
  moveSpeed: 50,
  minimapSize: 200,
  minimapVisible: true,
  fpsVisible: false,
  lightMode: 0,
  renderScale: 1.0,
  fogDensity: 1.0,
  waterOpacity: 1.0,
  groundOpacity: 0.3,
  gridVisible: true,
  groundVisible: true,
  waterVisible: true,
  wireframeMode: false,
};

/** Apply settings to shared state and scene (lighting). Called once at startup by main.js. */
export function applySettings(s) {
  state.moveSpeed = s.moveSpeed;
  state.mouseSensitivity = s.mouseSensitivity;
  state.lightMode = s.lightMode;
  state.minimapSize = s.minimapSize;
  state.renderScale = s.renderScale;
  state.fogDensity = s.fogDensity;
  state.waterOpacity = s.waterOpacity;
  state.groundOpacity = s.groundOpacity;
  applyLighting(s.lightMode);
}

/** Load settings from localStorage, merging with defaults for missing keys.
 *  Sanitizes numeric fields to prevent NaN/negative from corrupting camera matrix. */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...defaults, ...parsed };
      // Sanitize critical fields — NaN/zero/negative values break the camera
      if (!isFinite(merged.mouseSensitivity) || merged.mouseSensitivity <= 0) merged.mouseSensitivity = defaults.mouseSensitivity;
      if (!isFinite(merged.moveSpeed) || merged.moveSpeed < 1) merged.moveSpeed = defaults.moveSpeed;
      if (!isFinite(merged.renderScale) || merged.renderScale <= 0) merged.renderScale = defaults.renderScale;
      return merged;
    }
  } catch (_) {
    // Corrupt or missing — use defaults
  }
  return { ...defaults };
}

/** Save settings object to localStorage. */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {
    // Storage full or unavailable — silently ignore
  }
}
