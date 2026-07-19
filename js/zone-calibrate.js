// RIFT Zone Calibration — drag zone markers to correct world positions
import * as THREE from "three";
import { scene, camera, renderer } from "./scene.js";
import { getZoneLabels } from "./zones.js";
import { getZoneOverlays } from "./zone-overlays.js";
import { releasePointerForUi, setUiSurface, UI_SURFACE, updateResumeBar } from "./ui_mode.js";

const STORAGE_KEY = "rift-zone-positions";
const calibRaycaster = new THREE.Raycaster();
const calibMouse = new THREE.Vector2();

let calibrating = false;
let selectedSprite = null;
let dragY = 0;
let dragOffset = new THREE.Vector3();
let statusEl = null;
let coordEl = null;

export function isCalibrating() {
  return calibrating;
}

export function toggleCalibrateMode() {
  calibrating = !calibrating;
  console.log("Calibration mode:" + (calibrating ? "ENTERING" : "EXITING"));
  if (calibrating) {
    setUiSurface(UI_SURFACE.calibrate, true);
    releasePointerForUi();
    showStatus("CALIBRATE: drag zone markers · Shift+C to save & exit");
    document.body.style.cursor = "grab";
    updateResumeBar();
  } else {
    setUiSurface(UI_SURFACE.calibrate, false);
    hideStatus();
    document.body.style.cursor = "";
    if (selectedSprite) {
      if (selectedSprite.material) selectedSprite.material.opacity = 1;
      selectedSprite = null;
    }
    savePositions();
    updateResumeBar();
  }
}

function showStatus(msg) {
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = "calib-status";
    statusEl.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:30;color:#0f0;font:13px monospace;background:rgba(0,0,0,0.8);padding:6px 16px;border-radius:4px;border:1px solid rgba(0,255,0,0.3);pointer-events:none";
    document.body.appendChild(statusEl);
  }
  statusEl.textContent = msg;
  statusEl.style.display = "block";
}

function hideStatus() {
  if (statusEl) statusEl.style.display = "none";
  if (coordEl) coordEl.style.display = "none";
}

function showCoords(x, z) {
  if (!coordEl) {
    coordEl = document.createElement("div");
    coordEl.id = "calib-coords";
    coordEl.style.cssText =
      "position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:30;color:#ff0;font:12px monospace;background:rgba(0,0,0,0.8);padding:4px 12px;border-radius:3px;pointer-events:none";
    document.body.appendChild(coordEl);
  }
  coordEl.textContent = "X: " + Math.round(x) + "  Z: " + Math.round(z);
  coordEl.style.display = "block";
}

function getGroundIntersection(event) {
  const canvas = renderer.domElement;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  calibMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  calibMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  calibRaycaster.setFromCamera(calibMouse, camera);
  const ray = calibRaycaster.ray;
  if (Math.abs(ray.direction.y) < 0.0001) return null;
  const t = (dragY - ray.origin.y) / ray.direction.y;
  if (t <= 0) return null;
  return ray.origin.clone().addScaledVector(ray.direction, t);
}

function onMouseDown(e) {
  if (!calibrating || e.button !== 0) return;
  const sprites = getZoneLabels();
  if (!sprites.length) return;
  const canvas = renderer.domElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  calibMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  calibMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  calibRaycaster.setFromCamera(calibMouse, camera);
  const hits = calibRaycaster.intersectObjects(sprites, false);
  if (hits.length > 0) {
    selectedSprite = hits[0].object;
    dragY = selectedSprite.position.y;
    if (selectedSprite.material) selectedSprite.material.opacity = 0.6;
    const pt = getGroundIntersection(e);
    if (pt) dragOffset.copy(selectedSprite.position).sub(pt);
    document.body.style.cursor = "grabbing";
    e.preventDefault();
    e.stopPropagation();
  }
}

function onMouseMove(e) {
  if (!calibrating || !selectedSprite) return;
  const pt = getGroundIntersection(e);
  if (!pt) return;
  const newPos = pt.add(dragOffset);
  selectedSprite.position.x = newPos.x;
  selectedSprite.position.z = newPos.z;
  showCoords(newPos.x, newPos.z);
  // Move corresponding overlay
  const zname = selectedSprite.userData?.zoneName;
  const overlays = getZoneOverlays();
  for (const ov of overlays) {
    if (ov.userData?.zoneName === zname) {
      ov.position.x = newPos.x;
      ov.position.z = newPos.z;
      break;
    }
  }
}

function onMouseUp() {
  if (!calibrating || !selectedSprite) return;
  if (selectedSprite.material) selectedSprite.material.opacity = 1;
  selectedSprite = null;
  if (coordEl) coordEl.style.display = "none";
  document.body.style.cursor = "grab";
}

function savePositions() {
  const sprites = getZoneLabels();
  if (!sprites.length) return;
  const data = {};
  for (const s of sprites) {
    const name = s.userData?.zoneName;
    if (name) {
      data[name] = { x: Math.round(s.position.x), z: Math.round(s.position.z) };
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    showStatus("SAVED: " + Object.keys(data).length + " zone positions. Shift+C to re-enter.");
    setTimeout(function () {
      if (!calibrating && statusEl) statusEl.style.display = "none";
    }, 2000);
  } catch (err) {
    console.warn("Failed to save zone positions:", err);
  }
}

export function loadSavedPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

export function initCalibrate() {
  const canvas = renderer.domElement;
  if (!canvas) return;
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseUp);
}

export function applySavedPositions() {
  const saved = loadSavedPositions();
  if (!saved) return;
  const sprites = getZoneLabels();
  if (sprites.length) {
    for (const s of sprites) {
      const pos = saved[s.userData?.zoneName];
      if (pos) {
        s.position.x = pos.x;
        s.position.z = pos.z;
      }
    }
    const overlays = getZoneOverlays();
    for (const ov of overlays) {
      const pos = saved[ov.userData?.zoneName];
      if (pos) {
        ov.position.x = pos.x;
        ov.position.z = pos.z;
      }
    }
    console.log("Loaded " + Object.keys(saved).length + " saved zone positions");
  }
}
