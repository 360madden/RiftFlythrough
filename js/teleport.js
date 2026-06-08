// Shared teleport utility — fly camera to any world group and highlight it.

import * as THREE from "three";
import { camera } from "./scene.js";
import { state } from "./state.js";
import { deselectGroup, highlightGroup } from "./selection.js";

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/** Fly camera to a group, highlight it, and show its name on the HUD. */
export function flyToGroup(group) {
  if (!group) return;

  _box.setFromObject(group);
  _box.getCenter(_center);
  _box.getSize(_size);
  const dist = Math.max(_size.x, _size.y, _size.z) * 1.8;

  camera.position.set(
    _center.x + dist * 0.6,
    _center.y + dist * 0.5,
    _center.z + dist * 0.8,
  );
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
