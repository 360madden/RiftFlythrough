// Main entry point — orchestrates all modules and runs the animate loop.

import * as THREE from "three";
import { updateMovement } from "./controls.js";
import { drawMinimap } from "./minimap.js";
import { camera, renderer, scene } from "./scene.js";
import { applySettings, loadSettings } from "./settings.js";
import { state } from "./state.js";
import { waterUniforms } from "./world.js";
import "./ui.js";

const clock = new THREE.Clock();
let miniFrameCounter = 0;

// Apply persisted settings on init
const settings = loadSettings();
applySettings(settings);

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
    updateMovement(dt);

    miniFrameCounter++;
    if (state.showMinimap && miniFrameCounter % 5 === 0) {
      drawMinimap();
    }

    // Animate water
    if (state.waterPlane) {
      waterUniforms.uTime.value += dt;
    }

    updateFps();

    renderer.render(scene, camera);
  } catch (err) {
    showCrash(err);
  }
}

animate();
