// Scene, camera, renderer — created once, shared by reference.

import * as THREE from "three";

// ── Scene ──
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);
scene.fog = new THREE.Fog(0x0a0a14, 500, 4000);

// ── Camera ──
export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  1,
  10000,
);
camera.position.set(0, 100, 200);
camera.lookAt(0, 0, 0);

// ── Renderer ──
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

let _renderScale = 1.0;

/** Apply render scale (clamped 0.25–1.0). Called on settings change and resize. */
export function applyRenderScale(scale) {
  _renderScale = Math.max(0.25, Math.min(1.0, scale));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * _renderScale);
}

// ── Resize handler ──
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyRenderScale(_renderScale);
});
