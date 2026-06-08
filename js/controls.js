// Keyboard/mouse input, pointer lock, and per-frame movement.

import * as THREE from "three";
import { LIGHT_MODES } from "./lighting.js";
import { camera, renderer } from "./scene.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

// ── DOM refs ──
const overlayEl = document.getElementById("overlay");
const crosshairEl = document.getElementById("crosshair");
const miniContainer = document.getElementById("minimap-container");
const miniLabel = document.getElementById("minimap-label");
const infoEl = document.getElementById("info");

// ── Euler for mouse look (YXZ order for FPS-style) ──
export const euler = new THREE.Euler(0, 0, 0, "YXZ");
const direction = new THREE.Vector3();
const right = new THREE.Vector3();
let mouseDX = 0;
let mouseDY = 0;

// ── Smooth speed ramp (exponential easing) ──
const RAMP_UP = 4.0;    // acceleration rate (higher = snappier)
const RAMP_DOWN = 3.0;  // deceleration rate
let currentSpeedMul = 0.0;

// ── Mouse movement ──
document.addEventListener("mousemove", (e) => {
  if (!state.mouseLocked) return;
  mouseDX += e.movementX;
  mouseDY += e.movementY;
});

// ── Keyboard ──
document.addEventListener("keydown", (e) => {
  state.keys[e.code] = true;

  if (e.code === "KeyM") {
    state.showMinimap = !state.showMinimap;
    miniContainer.style.display = state.showMinimap ? "" : "none";
    miniLabel.style.display = state.showMinimap ? "" : "none";
  }
  if (e.code === "KeyH") {
    camera.position.set(0, 1000, 1500);
    camera.lookAt(0, 0, 0);
    showToast("Teleported home");
  }
});

document.addEventListener("keyup", (e) => {
  state.keys[e.code] = false;
});

// ── Pointer lock ──
overlayEl.addEventListener("click", () => renderer.domElement.requestPointerLock());

document.addEventListener("pointerlockchange", () => {
  state.mouseLocked = document.pointerLockElement === renderer.domElement;
  if (state.mouseLocked) {
    overlayEl.classList.add("hidden");
    crosshairEl.classList.add("active");
    mouseDX = 0;
    mouseDY = 0;
  } else {
    overlayEl.classList.remove("hidden");
    crosshairEl.classList.remove("active");
  }
});

// ── Scroll wheel ──
document.addEventListener("wheel", (e) => {
  if (state.orbitMode) {
    state.orbitDistance = Math.max(10, Math.min(5000, state.orbitDistance + e.deltaY * 0.5));
  } else {
    state.moveSpeed = Math.max(5, Math.min(500, state.moveSpeed + e.deltaY * -0.1));
    const sv = document.getElementById("speedval");
    if (sv) sv.textContent = Math.round(state.moveSpeed);
  }
});

// ── Per-frame movement (called from animate) ──
export function updateMovement(dt) {
  if (!state.mouseLocked) return;

  if (state.orbitMode) {
    updateOrbit();
  } else {
    updateFreeFly(dt);
  }

  mouseDX = 0;
  mouseDY = 0;

  // HUD
  const pos = camera.position;
  infoEl.innerHTML =
    "Pos: <span>" +
    pos.x.toFixed(0) +
    ", " +
    pos.y.toFixed(0) +
    ", " +
    pos.z.toFixed(0) +
    "</span> | " +
    'Speed: <span id="speedval">' +
    Math.round(state.moveSpeed) +
    "</span> | " +
    '<span style="color:#888">1-4=light L=next ' +
    LIGHT_MODES[state.lightMode].name +
    (state.orbitMode ? " O=orbit" : "") +
    "</span>";
}

// ── Free-fly movement ──

function updateFreeFly(dt) {
  // Mouse look
  euler.setFromQuaternion(camera.quaternion);
  euler.y -= mouseDX * state.mouseSensitivity;
  euler.x -= mouseDY * state.mouseSensitivity;
  euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
  camera.quaternion.setFromEuler(euler);

  // Movement with smooth speed ramp
  const moving =
    state.keys.KeyW || state.keys.KeyS || state.keys.KeyA || state.keys.KeyD ||
    state.keys.Space || state.keys.ControlLeft || state.keys.ControlRight;
  const targetMul = moving ? 1.0 : 0.0;
  const rampRate = targetMul > currentSpeedMul ? RAMP_UP : RAMP_DOWN;
  currentSpeedMul += (targetMul - currentSpeedMul) * Math.min(rampRate * dt, 1.0);
  if (Math.abs(targetMul - currentSpeedMul) < 0.001) currentSpeedMul = targetMul;

  const speed = state.moveSpeed * currentSpeedMul * (state.keys.ShiftLeft || state.keys.ShiftRight ? 3 : 1);
  camera.getWorldDirection(direction);
  right.crossVectors(camera.up, direction).normalize();

  if (state.keys.KeyW) camera.position.addScaledVector(direction, speed * dt);
  if (state.keys.KeyS) camera.position.addScaledVector(direction, -speed * dt);
  if (state.keys.KeyA) camera.position.addScaledVector(right, speed * dt);
  if (state.keys.KeyD) camera.position.addScaledVector(right, -speed * dt);
  if (state.keys.Space) camera.position.y += speed * dt;
  if (state.keys.ControlLeft || state.keys.ControlRight) camera.position.y -= speed * dt;
}

// ── Orbit camera movement ──

// Mouse deltas are already frame-rate-independent; no dt needed.
function updateOrbit() {
  if (!state.orbitTarget) return;

  // Mouse orbit (theta = yaw, phi = pitch)
  state.orbitTheta += mouseDX * state.mouseSensitivity * 3;
  state.orbitPhi -= mouseDY * state.mouseSensitivity * 3;
  state.orbitPhi = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, state.orbitPhi));

  // Compute camera position from spherical coords
  const cosPhi = Math.cos(state.orbitPhi);
  const camY = state.orbitTarget.y + state.orbitDistance * Math.sin(state.orbitPhi);
  camera.position.set(
    state.orbitTarget.x + state.orbitDistance * cosPhi * Math.sin(state.orbitTheta),
    Math.max(camY, state.worldGroundY + 10),
    state.orbitTarget.z + state.orbitDistance * cosPhi * Math.cos(state.orbitTheta),
  );
  camera.lookAt(state.orbitTarget);
}
