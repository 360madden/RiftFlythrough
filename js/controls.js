// Keyboard/mouse input, pointer lock, and per-frame movement.
//
// Session model:
// - Start overlay is only for the first click-to-fly (and full session reset).
// - Opening menus / Esc while flying frees the cursor without re-showing the
//   start overlay so UI stays clickable.
// - Click the world (or Resume look) to re-acquire pointer lock.

import * as THREE from "three";
import { LIGHT_MODES } from "./lighting.js";
import { camera, renderer } from "./scene.js";
import { state } from "./state.js";
import { commitTeleportHistory, pushTeleportHistory } from "./teleport.js";
import {
  allowsKeyboardFly,
  blocksFlyLock,
  ensureResumeBar,
  hasBlockingUi,
  isUiMode,
  onUiModeChange,
  refreshUiSurfaces,
  setPauseMode,
  setUiSurface,
  UI_SURFACE,
  updateResumeBar,
} from "./ui_mode.js";
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
const RAMP_UP = 4.0; // acceleration rate (higher = snappier)
const RAMP_DOWN = 3.0; // deceleration rate
let currentSpeedMul = 0.0;

// Track successful lock acquisition so a failed first request does not
// re-show the start overlay as if the user quit.
let wasPointerLocked = false;

// ── Mouse movement ──
document.addEventListener("mousemove", (e) => {
  if (!state.mouseLocked || state.uiMode) return;
  mouseDX += e.movementX;
  mouseDY += e.movementY;
});

// ── Keyboard ──

/** Returns true if the user is typing in an HTML input/textarea/select. */
export function isTyping() {
  const el = document.activeElement;
  return (
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

document.addEventListener("keydown", (e) => {
  // Don't set movement keys while typing, blocking menu, or tour (Space pauses tour)
  if (!isTyping() && allowsKeyboardFly() && !state.tourActive) {
    state.keys[e.code] = true;
  } else if (state.tourActive && e.code === "Space") {
    // Tour owns Space — do not queue fly-up
    state.keys.Space = false;
  }

  // Non-movement hotkeys must not fire while typing or while a full-screen menu owns focus
  if (isTyping()) return;
  if (hasBlockingUi()) return;

  if (e.code === "KeyM") {
    state.showMinimap = !state.showMinimap;
    if (miniContainer) miniContainer.style.display = state.showMinimap ? "" : "none";
    if (miniLabel) miniLabel.style.display = state.showMinimap ? "" : "none";
    if (window.updateSidebarDot) window.updateSidebarDot("sb-toggle-minimap", state.showMinimap);
  }
  // Shift+C = zone calibrate (bare C is coords overlay in ui.js)
  if (e.code === "KeyC" && e.shiftKey && !e.repeat) {
    import("./zone-calibrate.js").then((m) => m.toggleCalibrateMode());
    return;
  }
  if (e.code === "KeyH") {
    pushTeleportHistory();
    camera.position.set(0, 1000, 1500);
    camera.lookAt(0, 0, 0);
    commitTeleportHistory();
    showToast("Teleported home");
  }
});

document.addEventListener("keyup", (e) => {
  state.keys[e.code] = false;
});

// Clear all held keys on window blur to prevent stuck-key drifting after Alt-Tab
window.addEventListener("blur", () => {
  state.keys = {};
  mouseDX = 0;
  mouseDY = 0;
});

// ── Session / pointer lock ──

/**
 * Begin or resume a fly session: hide start overlay and request pointer lock.
 * Safe to call from start-overlay click, canvas click, or resume button.
 */
export function startOrResumeFly() {
  if (blocksFlyLock()) {
    updateResumeBar();
    return false;
  }

  state.sessionStarted = true;

  // Blur form controls first so refreshUiSurfaces does not re-add search surface
  const active = document.activeElement;
  if (
    active &&
    active !== document.body &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.tagName === "SELECT" ||
      active.isContentEditable)
  ) {
    try {
      active.blur();
    } catch (_) {
      /* ignore */
    }
  }

  setPauseMode(false);
  // Soft panels are unusable under pointer lock — close them on resume
  const zonePanel = document.getElementById("zone-filter-panel");
  if (zonePanel && zonePanel.style.display === "block") {
    zonePanel.style.display = "none";
  }
  setUiSurface(UI_SURFACE.zoneFilter, false);
  // Clear sidebar focus flag if any
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.dataset.uiFocus = "0";
  setUiSurface(UI_SURFACE.sidebar, false);
  setUiSurface(UI_SURFACE.search, false);
  // Clear search results DOM so refreshUiSurfaces does not re-add search surface
  const searchResults = document.getElementById("search-results");
  if (searchResults) searchResults.classList.remove("active");
  // Reconcile surface set from DOM after soft clears
  refreshUiSurfaces();

  if (overlayEl) overlayEl.classList.add("hidden");
  crosshairEl?.classList.add("active");
  updateResumeBar();

  requestFlyLock();
  return true;
}

/** Request pointer lock on the renderer canvas (best-effort). */
export function requestFlyLock() {
  if (blocksFlyLock()) return;
  try {
    const p = renderer.domElement.requestPointerLock?.();
    p?.catch?.((err) => {
      console.warn("Pointer lock failed:", err?.message || err);
    });
  } catch (err) {
    console.warn("Pointer lock failed:", err?.message || err);
  }
}

/**
 * Free the cursor without ending the session (menus stay usable).
 * Used by Esc and by opening interactive UI.
 */
export function freeCursorForUi(reason = "pause") {
  if (!state.sessionStarted) return;
  if (reason === "pause") {
    setPauseMode(true);
  }
  try {
    if (document.pointerLockElement) document.exitPointerLock();
  } catch (_) {
    /* ignore */
  }
  updateResumeBar();
}

/** Hide the start overlay permanently for this session without locking. */
export function hideStartOverlay() {
  state.sessionStarted = true;
  if (overlayEl) overlayEl.classList.add("hidden");
}

// Start overlay: first-time click-to-fly
overlayEl?.addEventListener("click", () => {
  startOrResumeFly();
});

// Canvas click resumes look when cursor is free and no menu/calibrate is open
renderer.domElement.addEventListener("click", (e) => {
  if (!state.sessionStarted) return;
  if (state.mouseLocked) return;
  if (blocksFlyLock()) return;
  // Ignore clicks that originated on HUD chrome over the canvas (rare)
  if (e.target !== renderer.domElement) return;
  startOrResumeFly();
});

// Resume bar button
function wireResumeBar() {
  ensureResumeBar();
  const btn = document.getElementById("ui-resume-btn");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startOrResumeFly();
  });
}
wireResumeBar();

document.addEventListener("pointerlockchange", () => {
  const isLocked = document.pointerLockElement === renderer.domElement;
  state.mouseLocked = isLocked;

  if (isLocked) {
    // Late lock success after a menu/calibrate opened: immediately unlock again
    if (blocksFlyLock() || isUiMode()) {
      state.mouseLocked = false;
      try {
        document.exitPointerLock();
      } catch (_) {
        /* ignore */
      }
      updateResumeBar();
      return;
    }
    crosshairEl?.classList.add("active");
    mouseDX = 0;
    mouseDY = 0;
    wasPointerLocked = true;
    state.sessionStarted = true;
    // Successfully flying — drop free-cursor pause surfaces
    setPauseMode(false);
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.dataset.uiFocus = "0";
    setUiSurface(UI_SURFACE.sidebar, false);
    if (overlayEl) overlayEl.classList.add("hidden");
    refreshUiSurfaces();
  } else {
    crosshairEl?.classList.remove("active");
    // Mid-session unlock (menus / Esc): never re-show the full start overlay.
    // Only show start overlay if the user never successfully started (failed first lock)
    // and we are not already in a started session.
    if (wasPointerLocked) {
      wasPointerLocked = false;
      if (!state.sessionStarted) {
        overlayEl?.classList.remove("hidden");
      } else if (!isUiMode()) {
        // Soft pause so sidebar/menus are usable until they click the world
        setPauseMode(true);
      }
    }
  }
  updateResumeBar();
});

// ── Scroll wheel ──
document.addEventListener(
  "wheel",
  (e) => {
    // Block speed-scroll only for real menus / form targets — pure pause still allows speed change
    if (hasBlockingUi()) return;
    const t = e.target;
    if (
      t &&
      typeof t.closest === "function" &&
      t.closest(
        "#sidebar, #settings-overlay, #help-overlay, #catalog-overlay, #gallery-overlay, #zone-filter-panel, input, select, textarea",
      )
    ) {
      return;
    }

    if (state.orbitMode) {
      state.orbitDistance = Math.max(10, Math.min(5000, state.orbitDistance + e.deltaY * 0.5));
    } else {
      state.moveSpeed = Math.max(5, Math.min(500, state.moveSpeed + e.deltaY * -0.1));
      const sv = document.getElementById("speedval");
      if (sv) sv.textContent = Math.round(state.moveSpeed);
    }
  },
  { passive: true },
);

// Clear movement keys when entering a blocking UI so WASD does not stick
onUiModeChange((active) => {
  if (active && !allowsKeyboardFly()) {
    state.keys = {};
    mouseDX = 0;
    mouseDY = 0;
  }
});

// ── Per-frame movement (called from animate) ──
export function updateMovement(dt) {
  // Always refresh HUD while in session; freeze look/move during UI mode
  if (!state.sessionStarted && !state.mouseLocked) {
    return;
  }

  const canFly = allowsKeyboardFly();
  if (canFly) {
    // Guard against orphaned orbit (null target) — force back to free-fly
    if (state.orbitMode && !state.orbitTarget) {
      state.orbitMode = false;
    }

    if (state.orbitMode) {
      updateOrbit();
    } else {
      updateFreeFly(dt);
    }

    // Screen shake (applies in both orbit and free-fly modes)
    applyShake(dt);
  }

  mouseDX = 0;
  mouseDY = 0;

  // HUD (respect visibility settings from state — updated by ui.js on checkbox change)
  if (!infoEl) return;
  const pos = camera.position;
  const parts = [];
  if (state.showHudPos) {
    parts.push(`Pos: <span>${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}</span>`);
  }
  if (state.showHudSpeed) {
    parts.push(`Speed: <span id="speedval">${Math.round(state.moveSpeed)}</span>`);
  }
  const modeHint = state.uiMode
    ? " <span style='color:#7fc8ff'>UI</span>"
    : state.mouseLocked
      ? ""
      : " <span style='color:#fbbf24'>CURSOR FREE</span>";
  parts.push(
    `<span style="color:#888">1-4=light L=next ${LIGHT_MODES[state.lightMode].name}${state.orbitMode ? " O=orbit" : ""}${state.spectatorMode ? " <span style='color:#fa0'>SPECTATOR</span>" : ""}${modeHint}</span>`,
  );
  infoEl.innerHTML = parts.join(" | ");
}

// ── Free-fly movement ──

function updateFreeFly(dt) {
  // Mouse look only while pointer-locked
  if (state.mouseLocked) {
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= mouseDX * state.mouseSensitivity;
    euler.x -= mouseDY * state.mouseSensitivity;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.quaternion.setFromEuler(euler);
  }

  // Movement with smooth speed ramp (keyboard works with free cursor too)
  const moving =
    state.keys.KeyW ||
    state.keys.KeyS ||
    state.keys.KeyA ||
    state.keys.KeyD ||
    state.keys.Space ||
    state.keys.ControlLeft ||
    state.keys.ControlRight;
  const targetMul = moving ? 1.0 : 0.0;
  const rampRate = targetMul > currentSpeedMul ? RAMP_UP : RAMP_DOWN;
  currentSpeedMul += (targetMul - currentSpeedMul) * Math.min(rampRate * dt, 1.0);
  if (Math.abs(targetMul - currentSpeedMul) < 0.001) currentSpeedMul = targetMul;

  const speed =
    state.moveSpeed *
    currentSpeedMul *
    (state.keys.ShiftLeft || state.keys.ShiftRight ? 3 : 1) *
    (state.spectatorMode ? 5 : 1);
  camera.getWorldDirection(direction);
  right.crossVectors(camera.up, direction).normalize();

  if (state.keys.KeyW) camera.position.addScaledVector(direction, speed * dt);
  if (state.keys.KeyS) camera.position.addScaledVector(direction, -speed * dt);
  if (state.keys.KeyA) camera.position.addScaledVector(right, speed * dt);
  if (state.keys.KeyD) camera.position.addScaledVector(right, -speed * dt);
  if (state.keys.Space) camera.position.y += speed * dt;
  if (state.keys.ControlLeft || state.keys.ControlRight) camera.position.y -= speed * dt;

  // Apply camera bob after movement
  applyCameraBob(dt, speed);
}

// ── Camera effects: subtle bob while moving + screen shake ──

let _bobPhase = 0;

function applyCameraBob(dt, speed) {
  const isMoving = speed > 5;
  if (isMoving) {
    _bobPhase += dt * (8 + speed * 0.02);
    const bobAmount = Math.min(speed * 0.002, 1.2);
    camera.position.y += Math.sin(_bobPhase) * bobAmount;
  } else {
    _bobPhase *= 0.9;
  }
}

/** Screen shake — called at updateMovement level so it works in orbit mode too. */
function applyShake(dt) {
  if (state.shakeAmount <= 0.001) return;
  state.shakeTimer += dt * 30;
  const decay = Math.exp(-state.shakeTimer * 0.3);
  const shake = state.shakeAmount * decay;
  camera.position.x += Math.sin(state.shakeTimer * 1.7) * shake;
  camera.position.y += Math.cos(state.shakeTimer * 2.3) * shake * 0.7;
  camera.position.z += Math.cos(state.shakeTimer * 1.9) * shake;
  if (decay < 0.001) state.shakeAmount = 0;
}

// ── Orbit camera movement ──

// Mouse deltas are already frame-rate-independent; no dt needed.
function updateOrbit() {
  if (!state.orbitTarget) return;
  if (!state.mouseLocked) return;

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

