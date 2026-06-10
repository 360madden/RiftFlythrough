// Main entry point — orchestrates all modules and runs the animate loop.

import * as THREE from "three";
import { updateMovement } from "./controls.js";
import {
  applyFogDensity,
  applyShadowQuality,
  updateDayNightCycle,
  updateLightTransition,
} from "./lighting.js";
import { drawMinimap } from "./minimap.js";
import {
  applyExposure,
  applyRenderScale,
  camera,
  composer,
  renderer,
  setBloomEnabled,
  setDofEnabled,
  setDofFocus,
} from "./scene.js";
import { updateZoneLabels } from "./zones.js";
import { applySettings, loadSettings } from "./settings.js";
import { state } from "./state.js";
import {
  applyGroundOpacity,
  applyWaterOpacity,
  applyWaterReflectStrength,
  waterUniforms,
} from "./world.js";
import "./ui.js";
import { onBlur, onFocus, resumeAudio, setAudioEnabled, updateAudio } from "./audio.js";
import "./catalog.js";
import { updateCoords } from "./coords.js";
import { setParticlesVisible, updateParticles } from "./particles.js";
import { updatePerf } from "./perf.js";
import { initSpeedrun, updateSpeedrun } from "./speedrun.js";
import { updateTour } from "./tour.js";
import { setWeatherEnabled, updateWeather } from "./weather.js";

initSpeedrun();

const clock = new THREE.Clock();
let miniFrameCounter = 0;

// Apply persisted settings on init
const settings = loadSettings();
applySettings(settings);
applyRenderScale(settings.renderScale);
applyExposure(settings.exposure);
applyFogDensity(settings.fogDensity);
applyShadowQuality(settings.shadowQuality ?? 2);
setBloomEnabled(settings.bloomEnabled ?? true);
applyWaterOpacity(settings.waterOpacity);
applyWaterReflectStrength(settings.waterReflect ?? 0.4);
applyGroundOpacity(settings.groundOpacity);

// Auto-exposure
state.autoExposure = settings.autoExposure ?? false;

// Depth of field
setDofEnabled(settings.dofEnabled ?? false);
if (settings.dofFocus) setDofFocus(settings.dofFocus);

// Day/night cycle state
state.cycleEnabled = settings.cycleEnabled ?? false;
state.cycleSpeed = settings.cycleSpeed ?? 1.0;

// Particle visibility
if (settings.particlesVisible ?? true) {
  setParticlesVisible(true);
} else {
  setParticlesVisible(false);
}

// Audio
if (settings.audioEnabled ?? true) {
  setAudioEnabled(true);
} else {
  setAudioEnabled(false);
}

// Weather
if (settings.weatherEnabled ?? true) {
  setWeatherEnabled(true);
} else {
  setWeatherEnabled(false);
}

// Apply visibility toggle settings to state (actual objects don't exist yet;
// world.js applies them after OBJ load completes)
state.gridVisible = settings.gridVisible;
state.groundVisible = settings.groundVisible;
state.waterVisible = settings.waterVisible;
state.wireframeMode = settings.wireframeMode;
state.showHudPos = settings.showHudPos ?? true;
state.showHudSpeed = settings.showHudSpeed ?? true;

// Apply minimap visibility from settings
if (!settings.minimapVisible) {
  state.showMinimap = false;
  document.getElementById("minimap-container").style.display = "none";
  document.getElementById("minimap-label").style.display = "none";
}

// Apply minimap canvas size from settings
const miniCanvas = document.getElementById("minimap-canvas");
miniCanvas.width = settings.minimapSize;
miniCanvas.height = settings.minimapSize;
const miniContainer = document.getElementById("minimap-container");
miniContainer.style.width = `${settings.minimapSize}px`;
miniContainer.style.height = `${settings.minimapSize}px`;

// Apply FPS default from settings
if (settings.fpsVisible) {
  const fpsEl = document.getElementById("fps");
  fpsEl.style.display = "block";
}

// ── FPS counter ──
const fpsEl = document.getElementById("fps");
let fpsFrameCount = 0;
let fpsLastTime = performance.now();

function updateFps() {
  if (fpsEl.style.display === "none" || fpsEl.style.display === "") return;
  fpsFrameCount++;
  const now = performance.now();
  if (now - fpsLastTime >= 1000) {
    const fps = Math.round(fpsFrameCount / ((now - fpsLastTime) / 1000));
    fpsEl.textContent = `${fps} FPS`;
    fpsFrameCount = 0;
    fpsLastTime = now;
  }
}

// ── Crash recovery ──
let crashShown = false;

function showCrash(error) {
  if (crashShown) return;
  crashShown = true;
  const overlay = document.getElementById("crash-overlay");
  const details = document.getElementById("crash-details");
  if (details)
    details.textContent = error ? error.stack || error.message || String(error) : "Unknown error";
  if (overlay) overlay.classList.add("active");
  console.error("Render loop crash:", error);
}

// Handle WebGL context loss
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  console.warn("WebGL context lost — pausing render loop");
  const overlay = document.getElementById("crash-overlay");
  const details = document.getElementById("crash-details");
  if (details)
    details.textContent =
      "WebGL context lost. This can happen when the GPU driver resets or the system runs out of graphics memory. Reload the page to recover.";
  if (overlay) overlay.classList.add("active");
  crashShown = true;
});

renderer.domElement.addEventListener("webglcontextrestored", () => {
  console.log("WebGL context restored — resuming");
  const overlay = document.getElementById("crash-overlay");
  if (overlay) overlay.classList.remove("active");
  crashShown = false;
});

// Resume audio context on first user interaction (browser policy)
window.addEventListener("click", resumeAudio, { once: true });
window.addEventListener("keydown", resumeAudio, { once: true });
window.addEventListener("blur", onBlur);
window.addEventListener("focus", onFocus);

// ── Auto-exposure system ──

/**
 * Hand-tuned target exposures per lighting mode.
 * Darker presets get higher exposure to maintain visibility.
 */
const AUTO_EXPOSURE_TARGETS = [
  1.2, // Day
  1.5, // Sunset
  2.2, // Night
  1.6, // Dawn
  1.4, // Storm
  1.0, // Golden Hour
  2.5, // Moonlight
  1.1, // Overcast
];

/**
 * Smoothly adjust tone mapping exposure toward the target for the current
 * lighting mode. Called each frame from the animate loop.
 */
function updateAutoExposure(dt) {
  if (!state.autoExposure) return;
  // During light transitions, interpolate target exposures
  const tr = state.lightTransition;
  let target;
  if (tr.progress < 1) {
    const fromT = AUTO_EXPOSURE_TARGETS[tr.from] || 1.2;
    const toT = AUTO_EXPOSURE_TARGETS[tr.to] || 1.2;
    target = fromT + (toT - fromT) * tr.progress;
  } else {
    target = AUTO_EXPOSURE_TARGETS[state.lightMode] || 1.2;
  }
  // Smooth lerp toward target (converges in ~0.5s)
  const current = renderer.toneMappingExposure;
  const newExp = current + (target - current) * Math.min(dt * 2.5, 1);
  applyExposure(newExp);
}

// ── Animate loop ──
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  try {
    updateLightTransition(dt);
    updateDayNightCycle(dt);
    updateMovement(dt);

    miniFrameCounter++;
    if (state.showMinimap && miniFrameCounter % 5 === 0) {
      drawMinimap();
    }

    // Animate water
    if (state.waterPlane) {
      waterUniforms.uTime.value += dt;
      waterUniforms.uCameraPos.value.copy(camera.position);
    }

    if (state.tourActive) updateTour(dt);

    updateParticles(dt);

    // Update ambient audio based on camera altitude and speed
    updateAudio(camera.position.y, state.moveSpeed);

    updateWeather(camera.position.x, camera.position.y, camera.position.z, dt);

    updateAutoExposure(dt);

    updateSpeedrun(dt);

    updateCoords();

    updatePerf(dt);

    updateFps();

    // Frustum culling stats (every 30 frames)
    if (miniFrameCounter % 30 === 0) {
      updateCullingStats();
    }

    // Group label tooltip
    updateTooltip();
    updateZoneLabels();

    composer.render();
  } catch (err) {
    showCrash(err);
  }
}

// ── Frustum culling stats ──

const cullingFrustum = new THREE.Frustum();
const cullingMatrix = new THREE.Matrix4();
const _cullBox = new THREE.Box3(); // reused per-mesh to avoid thousands of allocations

function updateCullingStats() {
  if (!state.worldGroups.length) return;
  let visible = 0;
  let total = 0;
  cullingFrustum.setFromProjectionMatrix(
    cullingMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  state.worldGroups.forEach((g) => {
    g.traverse((child) => {
      if (child.isMesh && child.geometry) {
        total++;
        _cullBox.setFromObject(child);
        if (cullingFrustum.intersectsBox(_cullBox)) visible++;
      }
    });
  });
  const el = document.getElementById("stat-visible");
  if (el) el.textContent = `${visible} / ${total}`;
}

// ── Group label tooltip ──

const tooltipEl = document.getElementById("tooltip");
const tooltipRaycaster = new THREE.Raycaster();
const tooltipMouse = new THREE.Vector2();
let tooltipGroup = null;
let tooltipClientX = 0;
let tooltipClientY = 0;
let tooltipTargets = null; // cached mesh-to-group keys array
let tooltipFrameSkip = 0;

document.addEventListener("mousemove", (e) => {
  if (!state.mouseLocked) return;
  tooltipMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  tooltipMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  tooltipClientX = e.clientX;
  tooltipClientY = e.clientY;
});

function updateTooltip() {
  if (!state.mouseLocked || !state.worldGroups.length) {
    tooltipEl.style.display = "none";
    tooltipGroup = null;
    renderer.domElement.style.cursor = "";
    return;
  }
  // Throttle: raycast every 3 frames (inexpensive when no hit; cursor update is instant)
  tooltipFrameSkip = (tooltipFrameSkip + 1) % 3;
  if (tooltipFrameSkip !== 0) return;

  // Cache targets array (rebuild only when meshToGroup changes)
  if (!tooltipTargets || tooltipTargets.length !== state.meshToGroup.size) {
    tooltipTargets = [...state.meshToGroup.keys()];
  }
  tooltipRaycaster.setFromCamera(tooltipMouse, camera);
  const hits = tooltipRaycaster.intersectObjects(tooltipTargets, false);
  if (hits.length > 0) {
    const group = state.meshToGroup.get(hits[0].object);
    if (group && group !== tooltipGroup) {
      tooltipGroup = group;
      const name = (group.name || "unknown").replace(/^ptonly_/, "");
      tooltipEl.textContent = name;
      tooltipEl.style.display = "block";
    }
    if (tooltipGroup) {
      tooltipEl.style.left = `${tooltipClientX + 16}px`;
      tooltipEl.style.top = `${tooltipClientY - 16}px`;
      renderer.domElement.style.cursor = "pointer";
    }
  } else {
    tooltipEl.style.display = "none";
    tooltipGroup = null;
    renderer.domElement.style.cursor = "";
  }
}

animate();
