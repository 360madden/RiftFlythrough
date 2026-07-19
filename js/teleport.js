// Shared teleport utility — fly camera to any world group and highlight it.
//
// History model: each entry is a resting camera pose. Teleporting appends
// the pose *before* the jump, then the pose *after*, so undo/redo both work.

import * as THREE from "three";
import { camera } from "./scene.js";
import { deselectGroup, highlightGroup } from "./selection.js";
import { state } from "./state.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function snapshotPose() {
  return {
    pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  };
}

function applyPose(entry) {
  if (!entry?.pos) return;
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }
  if (state.selectedGroup) deselectGroup();
  camera.position.set(entry.pos.x, entry.pos.y, entry.pos.z);
}

function appendPose(entry) {
  // Drop any redo tail
  if (state.teleportHistoryIdx < state.teleportHistory.length - 1) {
    state.teleportHistory.length = state.teleportHistoryIdx + 1;
  }
  state.teleportHistory.push(entry);
  state.teleportHistoryIdx = state.teleportHistory.length - 1;
  // Cap at 100 entries
  while (state.teleportHistory.length > 100) {
    state.teleportHistory.shift();
    state.teleportHistoryIdx = Math.max(0, state.teleportHistoryIdx - 1);
  }
}

/** Record current camera position in teleport history (pre-jump). */
export function pushTeleportHistory() {
  appendPose(snapshotPose());
}

/**
 * After a teleport, record the landing pose so redo can restore it.
 * Call after moving the camera when you already called pushTeleportHistory().
 */
export function commitTeleportHistory() {
  appendPose(snapshotPose());
}

/** Undo last teleport — restore previous camera position. Returns true on success. */
export function undoTeleport() {
  if (state.teleportHistoryIdx <= 0 || !state.teleportHistory.length) return false;
  state.teleportHistoryIdx--;
  applyPose(state.teleportHistory[state.teleportHistoryIdx]);
  return true;
}

/** Redo a previously undone teleport. Returns true on success. */
export function redoTeleport() {
  if (state.teleportHistoryIdx >= state.teleportHistory.length - 1) return false;
  state.teleportHistoryIdx++;
  applyPose(state.teleportHistory[state.teleportHistoryIdx]);
  return true;
}

/** Fly camera to a group, highlight it, and show its name on the HUD. */
export function flyToGroup(group) {
  if (!group) return;

  // Exit orbit so free-look / frame updates don't snap back to old target
  if (state.orbitMode) {
    state.orbitMode = false;
    state.orbitTarget = null;
  }

  // Hidden groups produce empty boxes in Three.js — force visible for bounds
  const wasVisible = group.visible;
  if (!group.visible) group.visible = true;
  _box.setFromObject(group);
  if (!wasVisible) group.visible = false;

  if (_box.isEmpty()) {
    console.warn("[teleport] flyToGroup: empty bounds for", group.name);
    return;
  }
  _box.getCenter(_center);
  _box.getSize(_size);
  const dist = Math.max(_size.x, _size.y, _size.z, 10) * 1.8;

  // Pre-jump pose for undo
  pushTeleportHistory();

  // Trigger camera shake on teleport
  state.shakeAmount = Math.min(dist * 0.08, 8);
  state.shakeTimer = 0;

  camera.position.set(_center.x + dist * 0.6, _center.y + dist * 0.5, _center.z + dist * 0.8);
  camera.lookAt(_center);

  // Landing pose for redo
  commitTeleportHistory();

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
