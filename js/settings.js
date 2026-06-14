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
  waterReflect: 0.4,
  groundOpacity: 0.3,
  exposure: 1.2,
  shadowQuality: 2,
  bloomEnabled: true,
  gridVisible: true,
  groundVisible: true,
  waterVisible: true,
  wireframeMode: false,
  cycleEnabled: false,
  cycleSpeed: 1.0,
  particlesVisible: true,
  audioEnabled: true,
  weatherEnabled: true,
  autoExposure: false,
  dofEnabled: false,
  dofFocus: 500,
  lodEnabled: true,
  lodProxyDistance: 1200,
  lodHideDistance: 2800,
  showHudPos: true,
  showHudSpeed: true,
  showLegend: true,
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
  state.lodEnabled = s.lodEnabled;
  state.lodProxyDistance = s.lodProxyDistance;
  state.lodHideDistance = s.lodHideDistance;
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
      if (!Number.isFinite(merged.mouseSensitivity) || merged.mouseSensitivity <= 0)
        merged.mouseSensitivity = defaults.mouseSensitivity;
      if (!Number.isFinite(merged.moveSpeed) || merged.moveSpeed < 1)
        merged.moveSpeed = defaults.moveSpeed;
      if (!Number.isFinite(merged.renderScale) || merged.renderScale <= 0)
        merged.renderScale = defaults.renderScale;
      if (!Number.isFinite(merged.lodProxyDistance) || merged.lodProxyDistance < 100)
        merged.lodProxyDistance = defaults.lodProxyDistance;
      if (
        !Number.isFinite(merged.lodHideDistance) ||
        merged.lodHideDistance <= merged.lodProxyDistance
      ) {
        merged.lodHideDistance = Math.max(defaults.lodHideDistance, merged.lodProxyDistance + 100);
      }
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
