import assert from "node:assert/strict";

import {
  VISUAL_PROFILE_LEVELS,
  applyVisualProfileSettings,
  normalizeVisualProfile,
  visualProfileSettings,
} from "../js/visual_profiles.js";

assert.deepEqual(VISUAL_PROFILE_LEVELS, ["beauty", "explore", "debug"]);
assert.equal(Object.isFrozen(VISUAL_PROFILE_LEVELS), true);

assert.equal(normalizeVisualProfile("beauty"), "beauty");
assert.equal(normalizeVisualProfile("explore"), "explore");
assert.equal(normalizeVisualProfile("debug"), "debug");
assert.equal(normalizeVisualProfile("BEAUTY"), "beauty");
assert.equal(normalizeVisualProfile("unexpected"), "beauty");
assert.equal(normalizeVisualProfile(null), "beauty");
assert.equal(normalizeVisualProfile(undefined), "beauty");
assert.equal(normalizeVisualProfile(""), "beauty");

assert.deepEqual(visualProfileSettings("beauty"), {
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
    hideUntexturedLargeGeometry: false,
  particlesVisible: false,
  weatherEnabled: false,
  lodEnabled: false,
  textureQuality: "high",
  fogDensity: 0.2,
  exposure: 2,
});

assert.deepEqual(visualProfileSettings("explore"), {
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
    hideUntexturedLargeGeometry: true,
  particlesVisible: true,
  weatherEnabled: true,
  lodEnabled: true,
  textureQuality: "high",
  fogDensity: 1.0,
  exposure: 1.2,
});

assert.deepEqual(visualProfileSettings("debug"), {
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
  hideUntexturedLargeGeometry: true,
  hideLowConfidenceGroups: false,
  particlesVisible: true,
  weatherEnabled: true,
  lodEnabled: false,
  textureQuality: "high",
  fogDensity: 1.0,
  exposure: 1.2,
});

const beautySettings = visualProfileSettings("beauty");
beautySettings.gridVisible = true;
assert.equal(visualProfileSettings("beauty").gridVisible, false);

const target = { moveSpeed: 100, visualProfile: "debug", gridVisible: true };
const returned = applyVisualProfileSettings(target, "BEAUTY");
assert.equal(returned, target);
assert.equal(target.moveSpeed, 100);
assert.equal(target.visualProfile, "beauty");
assert.equal(target.gridVisible, false);
assert.equal(target.textureQuality, "high");

console.log("[OK] visual_profiles regression tests passed");
