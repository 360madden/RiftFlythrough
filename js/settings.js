// Settings management with localStorage persistence.
// Imported by modules that need configurable values.

import { applyLighting } from "./lighting.js";
import { state } from "./state.js";
import { normalizeTextureQuality } from "./texture_quality.js";
import {
  VISUAL_PROFILE_LEVELS,
  normalizeVisualProfile,
  visualProfileSettings,
} from "./visual_profiles.js";

const STORAGE_KEY = "rift-flythrough-settings";
const DEFAULT_VISUAL_PROFILE = "beauty";
const LEGACY_VISUAL_DEFAULTS = Object.freeze({
  gridVisible: true,
  groundVisible: true,
  waterVisible: true,
  wireframeMode: false,
  showLegend: true,
  particlesVisible: true,
  weatherEnabled: true,
  lodEnabled: true,
});
const LEGACY_VISUAL_MIGRATION_KEYS = Object.freeze([
  "gridVisible",
  "groundVisible",
  "waterVisible",
  "wireframeMode",
  "showZoneLabels",
  "showLegend",
  "pointCloudsVisible",
  "hideDegenerateGroups",
  "hideUnlinkedGroups",
  "hidePlaceholderTextureGroups",
  "hideLowConfidenceGroups",
  "hideUntexturedLargeGeometry",
  "particlesVisible",
  "weatherEnabled",
  "lodEnabled",
]);

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
  visualProfile: DEFAULT_VISUAL_PROFILE,
  gridVisible: false,
  groundVisible: false,
  waterVisible: false,
  wireframeMode: false,
  cycleEnabled: false,
  cycleSpeed: 1.0,
  particlesVisible: true,
  audioEnabled: true,
  weatherEnabled: true,
  autoExposure: false,
  dofEnabled: false,
  dofFocus: 500,
  textureQuality: "high",
  lodEnabled: false,
  lodProxyDistance: 1200,
  lodHideDistance: 2800,
  showHudPos: true,
  showHudSpeed: true,
  showZoneLabels: false,
  showLegend: false,
  pointCloudsVisible: false,
  hideDegenerateGroups: true,
  hideUnlinkedGroups: true,
  hidePlaceholderTextureGroups: true,
  hideLowConfidenceGroups: true,
  ...visualProfileSettings(DEFAULT_VISUAL_PROFILE),
};

function hasKnownVisualProfile(settings) {
  const value = typeof settings?.visualProfile === "string" ? settings.visualProfile.toLowerCase() : "";
  return VISUAL_PROFILE_LEVELS.includes(value);
}

function shouldApplyLegacyBeautyMigration(parsed) {
  if (!parsed || hasKnownVisualProfile(parsed)) return false;

  for (const [key, legacyValue] of Object.entries(LEGACY_VISUAL_DEFAULTS)) {
    if (key in parsed && parsed[key] !== legacyValue) return false;
  }
  return true;
}

function applyLegacyBeautyMigration(settings) {
  const profile = visualProfileSettings(DEFAULT_VISUAL_PROFILE);
  for (const key of LEGACY_VISUAL_MIGRATION_KEYS) {
    settings[key] = profile[key];
  }
  settings.visualProfile = DEFAULT_VISUAL_PROFILE;
}

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
  state.pointCloudsVisible = s.pointCloudsVisible;
  state.hideDegenerateGroups = s.hideDegenerateGroups;
  state.hideUnlinkedGroups = s.hideUnlinkedGroups;
  state.hidePlaceholderTextureGroups = s.hidePlaceholderTextureGroups;
  state.hideLowConfidenceGroups = s.hideLowConfidenceGroups;
  state.hideUntexturedLargeGeometry = s.hideUntexturedLargeGeometry;
  state.showZoneLabels = s.showZoneLabels;
  state.visualProfile = normalizeVisualProfile(s.visualProfile);
  state.textureQuality = normalizeTextureQuality(s.textureQuality);
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
      if (shouldApplyLegacyBeautyMigration(parsed)) {
        applyLegacyBeautyMigration(merged);
      } else {
        merged.visualProfile = normalizeVisualProfile(merged.visualProfile);
        // The visual profile is authoritative for the "visual mode" keys.
        // A user with visualProfile=beauty and a stale wireframeMode=true
        // (left over from before the Beauty migration) would otherwise keep
        // the wireframe sphere render. Re-apply the profile's values to
        // LEGACY_VISUAL_MIGRATION_KEYS so the selected profile wins.
        // Numeric customizations (fogDensity, exposure, renderScale, etc.)
        // are NOT in this list and remain user-controlled.
        const profile = visualProfileSettings(merged.visualProfile);
        for (const key of LEGACY_VISUAL_MIGRATION_KEYS) {
          merged[key] = profile[key];
        }
      }
      if (!("hideDegenerateGroups" in parsed)) {
        merged.hideDegenerateGroups = visualProfileSettings(merged.visualProfile).hideDegenerateGroups;
      }
      if (!("hideUnlinkedGroups" in parsed)) {
        merged.hideUnlinkedGroups = visualProfileSettings(merged.visualProfile).hideUnlinkedGroups;
      }
      if (!("hidePlaceholderTextureGroups" in parsed)) {
        merged.hidePlaceholderTextureGroups = visualProfileSettings(
          merged.visualProfile,
        ).hidePlaceholderTextureGroups;
      }
      if (!("hideLowConfidenceGroups" in parsed)) {
        merged.hideLowConfidenceGroups = visualProfileSettings(
          merged.visualProfile,
        ).hideLowConfidenceGroups;
      }
      // Sanitize critical fields — NaN/zero/negative values break the camera
      if (!Number.isFinite(merged.mouseSensitivity) || merged.mouseSensitivity <= 0)
        merged.mouseSensitivity = defaults.mouseSensitivity;
      if (!Number.isFinite(merged.moveSpeed) || merged.moveSpeed < 1)
        merged.moveSpeed = defaults.moveSpeed;
      if (!Number.isFinite(merged.renderScale) || merged.renderScale <= 0)
        merged.renderScale = defaults.renderScale;
      merged.textureQuality = normalizeTextureQuality(merged.textureQuality);
      if (!Number.isFinite(merged.lodProxyDistance) || merged.lodProxyDistance < 100)
        merged.lodProxyDistance = defaults.lodProxyDistance;
      if (
        !Number.isFinite(merged.lodHideDistance) ||
        merged.lodHideDistance <= merged.lodProxyDistance
      ) {
        merged.lodHideDistance = Math.max(defaults.lodHideDistance, merged.lodProxyDistance + 100);
      }
      merged.showZoneLabels = Boolean(merged.showZoneLabels);
      merged.showLegend = Boolean(merged.showLegend);
      merged.pointCloudsVisible = Boolean(merged.pointCloudsVisible);
      merged.hideDegenerateGroups = Boolean(merged.hideDegenerateGroups);
      merged.hideUnlinkedGroups = Boolean(merged.hideUnlinkedGroups);
      merged.hidePlaceholderTextureGroups = Boolean(merged.hidePlaceholderTextureGroups);
      merged.hideLowConfidenceGroups = Boolean(merged.hideLowConfidenceGroups);
      merged.particlesVisible = Boolean(merged.particlesVisible);
      merged.weatherEnabled = Boolean(merged.weatherEnabled);
      merged.lodEnabled = Boolean(merged.lodEnabled);
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
