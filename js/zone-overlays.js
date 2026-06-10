// RIFT Zone Ground Overlays — semi-transparent colored planes showing zone territories
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { state } from './state.js';

const ZONE_DATA_URL = 'zone_locations.json';
let overlayMeshes = [];

function makeOverlayMaterial(colorHex) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false
  });
}

export async function initZoneOverlays() {
  try {
    const resp = await fetch(ZONE_DATA_URL);
    const data = await resp.json();
    const zones = data.zones || data;
    
    for (const z of zones) {
      const bounds = z.bounds || { width: 1500, depth: 1500 };
      const geom = new THREE.PlaneGeometry(bounds.width, bounds.depth);
      const mat = makeOverlayMaterial(z.color || '#ffffff');
      const plane = new THREE.Mesh(geom, mat);
      
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(z.x, 0.5, z.z);
      plane.userData = {
        zoneName: z.name,
        zoneType: z.type,
        adjacentTo: z.adjacentTo || [],
        levelRange: z.levelRange || '',
        faction: z.faction || '',
        description: z.description || ''
      };
      plane.renderOrder = 998;
      plane.visible = state.showZoneLabels !== false;
      
      scene.add(plane);
      overlayMeshes.push(plane);
    }
    console.log('Zone overlays: ' + overlayMeshes.length + ' ground planes placed');
  } catch (err) {
    console.warn('Zone overlays init failed:', err);
  }
}

export function getZoneOverlays() {
  return overlayMeshes;
}

export function setZoneOverlaysVisible(visible) {
  for (const mesh of overlayMeshes) {
    mesh.visible = visible;
  }
}

export function updateZoneOverlays() {
  if (overlayMeshes.length === 0) return;
  const camPos = camera.position;
  for (const mesh of overlayMeshes) {
    const dist = camPos.distanceTo(mesh.position);
    if (dist > 8000) {
      mesh.material.opacity = 0;
    } else if (dist > 4000) {
      mesh.material.opacity = 0.15 * (1 - (dist - 4000) / 4000);
    } else if (dist < 300) {
      mesh.material.opacity = 0.15 * (dist / 300);
    } else {
      mesh.material.opacity = 0.15;
    }
  }
}
