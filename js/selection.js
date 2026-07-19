// Mesh selection via raycasting with highlight/deselect.

import * as THREE from "three";
import { camera, renderer } from "./scene.js";
import { state } from "./state.js";
import { getZoneLabels } from "./zones.js";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/** Materials that support emissive highlight (PBR + legacy phong). */
function canEmissiveHighlight(material) {
  return (
    material &&
    material.emissive &&
    typeof material.emissive.set === "function" &&
    (material.isMeshStandardMaterial ||
      material.isMeshPhysicalMaterial ||
      material.isMeshPhongMaterial ||
      material.isMeshLambertMaterial)
  );
}

// ── Highlight a group ──
export function highlightGroup(group) {
  const orig = [];
  group.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!canEmissiveHighlight(mat)) continue;
        orig.push({
          object: child,
          material: mat,
          origEmissive: mat.emissive.getHex(),
          origEmissiveIntensity: mat.emissiveIntensity ?? 1,
        });
        mat.emissive.set(0xffff44);
        mat.emissiveIntensity = 0.55;
      }
      // Wireframe outline (once per mesh)
      if (child.geometry) {
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
      }
    } else if (child.isPoints && child.material?.isPointsMaterial) {
      orig.push({
        object: child,
        origColor: child.material.color.getHex(),
        origSize: child.material.size,
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
      const mat = entry.material || entry.object?.material;
      if (mat?.emissive) {
        mat.emissive.setHex(entry.origEmissive);
        mat.emissiveIntensity = entry.origEmissiveIntensity;
      }
    } else if (entry.origColor !== undefined && entry.object?.material) {
      entry.object.material.color.setHex(entry.origColor);
      entry.object.material.size = entry.origSize ?? 1.5;
    } else if (entry.wireframe && entry.parent) {
      entry.parent.remove(entry.wireframe);
      entry.wireframe.geometry?.dispose();
      entry.wireframe.material?.dispose();
    }
  });
  state.selectedGroup = null;
  state.selectedOrigMaterials = [];
  const selName = document.getElementById("selected-name");
  if (selName) {
    selName.style.display = "none";
    selName.textContent = "";
  }
}

// ── Click → raycast selection ──
renderer.domElement.addEventListener("click", (e) => {
  if (!state.mouseLocked || !state.worldGroups.length) return;
  if (e.target !== renderer.domElement) return;

  // Pointer lock freezes clientX/Y — raycast from screen center (crosshair)
  mouse.x = 0;
  mouse.y = 0;

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
    if (selName) {
      const name = group.name || "unknown";
      const cleanName = name.startsWith("ptonly_") ? name.slice(7) : name;
      selName.textContent = `\uD83D\uDCCD ${cleanName}`;
      selName.style.display = "block";
    }
  } else {
    // Check zone sprites for camera teleport
    const zoneSprites = getZoneLabels().filter((sprite) => sprite.visible);
    if (zoneSprites.length > 0) {
      raycaster.setFromCamera(mouse, camera);
      const zoneHits = raycaster.intersectObjects(zoneSprites);
      if (zoneHits.length > 0) {
        const s = zoneHits[0].object;
        const zn = s.userData.zoneName || "Zone";
        const el = document.getElementById("selected-name");
        if (el) {
          const adj = s.userData.adjacentTo;
          const txt =
            adj && adj.length ? zn + " ↔ " + adj.slice(0, 3).join(", ") : zn;
          el.textContent = txt;
          el.style.display = "block";
        }
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
