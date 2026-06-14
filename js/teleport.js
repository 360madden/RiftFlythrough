// Shared teleport utility — fly camera to any world group and highlight it.

import * as THREE from "three";
import { camera } from "./scene.js";
import { deselectGroup, highlightGroup } from "./selection.js";
import { state } from "./state.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/** Record current camera position in teleport history before flying. */
export function pushTeleportHistory() {
  // Trim forward history if we're not at the latest position
  if (state.teleportHistoryIdx < state.teleportHistory.length - 1) {
    state.teleportHistory.length = state.teleportHistoryIdx + 1;
  }
  state.teleportHistory.push({
    pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  });
  state.teleportHistoryIdx = state.teleportHistory.length - 1;
  // Cap at 100 entries
  if (state.teleportHistory.length > 100) {
    state.teleportHistory.shift();
    state.teleportHistoryIdx--;
  }
}

/** Undo last teleport — restore previous camera position. Returns true on success. */
export function undoTeleport() {
  if (state.teleportHistoryIdx < 0 || !state.teleportHistory.length) return false;
  const entry = state.teleportHistory[state.teleportHistoryIdx];
  state.teleportHistoryIdx--;
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }
  if (state.selectedGroup) deselectGroup();
  camera.position.set(entry.pos.x, entry.pos.y, entry.pos.z);
  return true;
}

/** Redo a previously undone teleport. Returns true on success. */
export function redoTeleport() {
  if (state.teleportHistoryIdx >= state.teleportHistory.length - 1) return false;
  state.teleportHistoryIdx++;
  const entry = state.teleportHistory[state.teleportHistoryIdx];
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }
  if (state.selectedGroup) deselectGroup();
  camera.position.set(entry.pos.x, entry.pos.y, entry.pos.z);
  return true;
}

/** Fly camera to a group, highlight it, and show its name on the HUD. */
export function flyToGroup(group) {
  if (!group) return;

  _box.setFromObject(group);
  _box.getCenter(_center);
  _box.getSize(_size);
  const dist = Math.max(_size.x, _size.y, _size.z) * 1.8;

  // Push current position to history before teleporting
  pushTeleportHistory();

  // Trigger camera shake on teleport
  state.shakeAmount = Math.min(dist * 0.08, 8);
  state.shakeTimer = 0;

  camera.position.set(_center.x + dist * 0.6, _center.y + dist * 0.5, _center.z + dist * 0.8);
  camera.lookAt(_center);

  if (state.selectedGroup) deselectGroup();
  state.selectedGroup = group;
  state.selectedOrigMaterials = highlightGroup(group);

  const selName = document.getElementById("selected-name");
  if (selName) {
    const name = group.name || "unknown";
    const cleanName = name.startsWith("ptonly_") ? name.slice(7) : name;
    selName.textContent = `\uD83D\uDCCD ${cleanName}`;
    selName.style.display = "block";
  }
}
