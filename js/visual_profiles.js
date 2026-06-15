// Visual-fidelity presets. "Beauty" is the human-facing default; Explore and
// Debug keep the previous map/debug affordances available when needed.

export const VISUAL_PROFILE_LEVELS = Object.freeze(["beauty", "explore", "debug"]);

const PROFILE_SETTINGS = Object.freeze({
  beauty: Object.freeze({
    gridVisible: false,
    groundVisible: false,
    waterVisible: false,
    wireframeMode: false,
    showZoneLabels: false,
    showLegend: false,
    pointCloudsVisible: false,
    hideDegenerateGroups: true,
    hideUnlinkedGroups: true,
    hidePlaceholderTextureGroups: true,
    hideLowConfidenceGroups: true,
    hideUntexturedLargeGeometry: false,  // Show terrain/structure even without textures
    particlesVisible: false,
    weatherEnabled: false,
    lodEnabled: false,
    textureQuality: "high",
    fogDensity: 0.2,
    exposure: 2.0,
  }),
  explore: Object.freeze({
    gridVisible: true,
    groundVisible: true,
    waterVisible: true,
    wireframeMode: false,
    showZoneLabels: true,
    showLegend: true,
    pointCloudsVisible: true,
    hideDegenerateGroups: false,
    hideUnlinkedGroups: false,
    hidePlaceholderTextureGroups: false,
    hideLowConfidenceGroups: false,
    hideUntexturedLargeGeometry: true,  // Keep default suppression in Explore
    particlesVisible: true,
    weatherEnabled: true,
    lodEnabled: true,
    textureQuality: "high",
    fogDensity: 1.0,
    exposure: 1.2,
  }),
  debug: Object.freeze({
    gridVisible: true,
    groundVisible: true,
    waterVisible: true,
    wireframeMode: true,
    showZoneLabels: true,
    showLegend: true,
    pointCloudsVisible: true,
    hideDegenerateGroups: false,
    hideUnlinkedGroups: false,
    hidePlaceholderTextureGroups: false,
    hideLowConfidenceGroups: false,
    hideUntexturedLargeGeometry: true,  // Keep default suppression in Debug
    particlesVisible: true,
    weatherEnabled: true,
    lodEnabled: false,
    textureQuality: "high",
    fogDensity: 1.0,
    exposure: 1.2,
  }),
});

export function normalizeVisualProfile(profile) {
  const value = typeof profile === "string" ? profile.toLowerCase() : "";
  return VISUAL_PROFILE_LEVELS.includes(value) ? value : "beauty";
}

export function visualProfileSettings(profile) {
  return { ...PROFILE_SETTINGS[normalizeVisualProfile(profile)] };
}

export function applyVisualProfileSettings(settings, profile) {
  const visualProfile = normalizeVisualProfile(profile);
  Object.assign(settings, visualProfileSettings(visualProfile), { visualProfile });
  return settings;
}
