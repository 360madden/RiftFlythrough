// Auto-fly tour mode: follows scripted waypoints through the world.

import * as THREE from "three";
import { camera } from "./scene.js";
import { state } from "./state.js";

const BASE_TOUR_SPEED = 0.15; // waypoints per second at 1.0x
const _tourPos = new THREE.Vector3();
const _tourLook = new THREE.Vector3();

function buildTourWaypoints() {
  // Use bookmarks if available, otherwise generate a spiral over the world
  if (state.bookmarks.length >= 2) {
    state.tourWaypoints = state.bookmarks.map((bm) => ({
      pos: { x: bm.x, y: bm.y + 80, z: bm.z + 120 },
      lookAt: { x: bm.x, y: bm.y, z: bm.z },
      name: bm.name,
    }));
    return;
  }
  // Default spiral path over world bounds
  const { minX, maxX, minZ, maxZ } = state.worldBounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const r = Math.max(maxX - minX, maxZ - minZ) * 0.35;
  const h = Math.max(maxX - minX, maxZ - minZ) * 0.25;
  const steps = 12;
  state.tourWaypoints = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const high = i % 2 === 0 ? h : h * 0.4;
    state.tourWaypoints.push({
      pos: { x: cx + Math.cos(a) * r, y: high, z: cz + Math.sin(a) * r },
      lookAt: { x: cx, y: 0, z: cz },
      name: `Tour ${i + 1}/${steps}`,
    });
  }
}

export function startTour() {
  // Guard: world must be loaded before starting tour
  if (!state.worldGroups.length) return;
  buildTourWaypoints();
  if (!state.tourWaypoints.length) return;
  state.tourIdx = 0;
  state.tourT = 0;
  state.tourActive = true;
  state.tourPaused = false;
  state.orbitMode = false;
  state.orbitTarget = null;
}

export function updateTour(dt) {
  if (!state.tourWaypoints.length) {
    state.tourActive = false;
    return;
  }
  if (state.tourPaused) return;
  state.tourT += BASE_TOUR_SPEED * state.tourSpeed * dt;
  if (state.tourT >= 1) {
    state.tourT -= 1;
    state.tourIdx++;
    if (state.tourIdx >= state.tourWaypoints.length) {
      state.tourIdx = 0;
      state.tourT = 0;
    }
  }
  const a = state.tourWaypoints[state.tourIdx];
  const b = state.tourWaypoints[state.tourIdx + 1] || state.tourWaypoints[0];
  const t = state.tourT;
  _tourPos.set(
    a.pos.x + (b.pos.x - a.pos.x) * t,
    a.pos.y + (b.pos.y - a.pos.y) * t,
    a.pos.z + (b.pos.z - a.pos.z) * t,
  );
  _tourLook.set(
    a.lookAt.x + (b.lookAt.x - a.lookAt.x) * t,
    a.lookAt.y + (b.lookAt.y - a.lookAt.y) * t,
    a.lookAt.z + (b.lookAt.z - a.lookAt.z) * t,
  );
  camera.position.copy(_tourPos);
  camera.lookAt(_tourLook);
}
