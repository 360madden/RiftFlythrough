// Mesh selection via raycasting with highlight/deselect.

import * as THREE from "three";
import { camera, renderer } from "./scene.js";
import { state } from "./state.js";
import { getZoneLabels } from "./zones.js";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ── Highlight a group ──
export function highlightGroup(group) {
  const orig = [];
  group.traverse((child) => {
    if (child.isMesh && child.material.isMeshPhongMaterial) {
      orig.push({
        object: child,
        origEmissive: child.material.emissive.getHex(),
        origEmissiveIntensity: child.material.emissiveIntensity,
      });
      child.material.emissive.set(0xffff44);
      child.material.emissiveIntensity = 0.55;
      // Wireframe outline
      const edges = new THREE.EdgesGeometry(child.geometry, 15);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: 0xffff44,
          linewidth: 1,
          transparent: true,
          opacity: 0.7,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
      );
      child.add(line);
      orig.push({ wireframe: line, parent: child });
    } else if (child.isPoints && child.material.isPointsMaterial) {
      orig.push({
        object: child,
        origColor: child.material.color.getHex(),
      });
      child.material.color.set(0xffff44);
      child.material.size = 3.0;
    }
  });
  return orig;
}

// ── Deselect current group ──
export function deselectGroup() {
  state.selectedOrigMaterials.forEach((entry) => {
    if (entry.origEmissive !== undefined) {
      entry.object.material.emissive.setHex(entry.origEmissive);
      entry.object.material.emissiveIntensity = entry.origEmissiveIntensity;
    } else if (entry.origColor !== undefined) {
      entry.object.material.color.setHex(entry.origColor);
      entry.object.material.size = 1.5;
    } else if (entry.wireframe) {
      entry.parent.remove(entry.wireframe);
      entry.wireframe.geometry.dispose();
      entry.wireframe.material.dispose();
    }
  });
  state.selectedGroup = null;
  state.selectedOrigMaterials = [];
  const selName = document.getElementById("selected-name");
  selName.style.display = "none";
  selName.textContent = "";
}

// ── Click → raycast selection ──
renderer.domElement.addEventListener("click", (e) => {
  if (!state.mouseLocked || !state.worldGroups.length) return;
  if (e.target !== renderer.domElement) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const rayTargets = [...state.meshToGroup.keys()].filter((object) => {
    return object.visible && state.meshToGroup.get(object)?.visible !== false;
  });
  const hits = raycaster.intersectObjects(rayTargets, false);
  if (hits.length > 0) {
    const hitObj = hits[0].object;
    const group = state.meshToGroup.get(hitObj);
    if (!group) return;
    if (state.selectedGroup === group) return;
    if (state.selectedGroup) deselectGroup();

    state.selectedGroup = group;
    state.selectedOrigMaterials = highlightGroup(group);

    const selName = document.getElementById("selected-name");
    const name = group.name || "unknown";
    const cleanName = name.startsWith("ptonly_") ? name.slice(7) : name;
    selName.textContent = `\uD83D\uDCCD ${cleanName}`;
    selName.style.display = "block";
  } else {
    // Check zone sprites for camera teleport
    const zoneSprites = getZoneLabels();
    if (zoneSprites.length > 0) {
      raycaster.setFromCamera(mouse, camera);
      const zoneHits = raycaster.intersectObjects(zoneSprites);
      if (zoneHits.length > 0) {
        const s = zoneHits[0].object;
        const zn = s.userData.zoneName || "Zone";
        const el = document.getElementById("selected-name");
        if (el) { var adj = s.userData.adjacentTo; var txt = adj && adj.length ? zn + " ↔ " + adj.slice(0,3).join(", ") : zn; el.textContent = txt; el.style.display = "block"; }
        // Teleport camera to zone position
        const camDist = 500;
        const camPos = s.position.clone().add(new THREE.Vector3(0, camDist * 0.5, camDist));
        camera.position.copy(camPos);
        camera.lookAt(s.position);
        return;
      }
    }
    if (state.selectedGroup) deselectGroup();
  }
});
