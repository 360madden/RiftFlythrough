// Main entry point — orchestrates all modules and runs the animate loop.

import * as THREE from "three";
import { updateMovement } from "./controls.js";
import { updateLightTransition } from "./lighting.js";
import { drawMinimap } from "./minimap.js";
import { camera, renderer, scene } from "./scene.js";
import { applySettings, loadSettings } from "./settings.js";
import { applyRenderScale } from "./scene.js";
import { state } from "./state.js";
import { waterUniforms, applyWaterOpacity, applyGroundOpacity } from "./world.js";
import { applyFogDensity } from "./lighting.js";
import "./ui.js";
import { updateTour } from "./tour.js";

const clock = new THREE.Clock();
let miniFrameCounter = 0;

// Apply persisted settings on init
const settings = loadSettings();
applySettings(settings);
applyRenderScale(settings.renderScale);
applyFogDensity(settings.fogDensity);
applyWaterOpacity(settings.waterOpacity);
applyGroundOpacity(settings.groundOpacity);

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

// ── Animate loop ──
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  try {
    updateLightTransition(dt);
    updateMovement(dt);

    miniFrameCounter++;
    if (state.showMinimap && miniFrameCounter % 5 === 0) {
      drawMinimap();
    }

    // Animate water
    if (state.waterPlane) {
      waterUniforms.uTime.value += dt;
    }

    if (state.tourActive) updateTour(dt);

    updateFps();

    // Frustum culling stats (every 30 frames)
    if (miniFrameCounter % 30 === 0) {
      updateCullingStats();
    }

    // Group label tooltip
    updateTooltip();

    renderer.render(scene, camera);
  } catch (err) {
    showCrash(err);
  }
}

// ── Frustum culling stats ──

const cullingFrustum = new THREE.Frustum();
const cullingMatrix = new THREE.Matrix4();

function updateCullingStats() {
  if (!state.worldGroups.length) return;
  let visible = 0;
  let total = 0;
  cullingFrustum.setFromProjectionMatrix(
    cullingMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  state.worldGroups.forEach((g) => {
    g.traverse((child) => {
      if (child.isMesh && child.geometry) {
        total++;
        const box = new THREE.Box3().setFromObject(child);
        if (cullingFrustum.intersectsBox(box)) visible++;
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
let tooltipTargets = null;  // cached mesh-to-group keys array
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
