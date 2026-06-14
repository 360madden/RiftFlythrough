// Scene, camera, renderer — created once, shared by reference.

import * as THREE from "three";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ── Scene ──
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);
scene.fog = new THREE.FogExp2(0x0a0a14, 0.00025);

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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ── Post-processing composer ──
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.3, // strength
  0.4, // radius
  0.85, // threshold
);
bloomPass.enabled = true;

// Depth-of-field: BokehPass adds cinematic focus blur
const bokehPass = new BokehPass(scene, camera, {
  focus: 500,
  aperture: 0.0005,
  maxblur: 0.01,
  width: window.innerWidth,
  height: window.innerHeight,
});
bokehPass.enabled = false;

export const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(bokehPass);

/** Enable or disable bloom post-processing at runtime. */
export function setBloomEnabled(enabled) {
  bloomPass.enabled = enabled;
}

/** Adjust bloom intensity (clamped 0–1). */
export function setBloomStrength(strength) {
  bloomPass.strength = Math.max(0, Math.min(2, strength));
}

/** Enable or disable depth-of-field post-processing. */
export function setDofEnabled(enabled) {
  bokehPass.enabled = enabled;
}

/** Adjust DoF focus distance (clamped 10–5000). */
export function setDofFocus(distance) {
  bokehPass.uniforms.focus.value = Math.max(10, Math.min(5000, distance));
}

let _renderScale = 1.0;

/** Apply render scale (clamped 0.25–1.0). Called on settings change and resize. */
export function applyRenderScale(scale) {
  _renderScale = Math.max(0.25, Math.min(1.0, scale));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * _renderScale);
}

/** Adjust tone mapping exposure (clamped 0.3–3.0). */
export function applyExposure(exposure) {
  renderer.toneMappingExposure = Math.max(0.3, Math.min(3.0, exposure));
}

// ── Resize handler ──
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bokehPass.setSize(window.innerWidth, window.innerHeight);
  applyRenderScale(_renderScale);
});

// ── High-resolution screenshot capture ──

/**
 * Capture a high-resolution screenshot at the given target width.
 * Temporarily resizes the renderer, renders, captures, and restores.
 * @param {number} [targetWidth=3840] — target width in pixels (height auto-calculated from aspect)
 * @returns {string} data URL of the captured PNG
 */
export function captureHighRes(targetWidth = 3840) {
  const origSize = new THREE.Vector2();
  renderer.getSize(origSize);
  const ratio = origSize.y / origSize.x;
  const targetHeight = Math.round(targetWidth * ratio);

  // Temporarily set renderer to target resolution
  renderer.setSize(targetWidth, targetHeight);
  renderer.setPixelRatio(1); // don't double-scale — targetWidth is the exact pixel count
  composer.setSize(targetWidth, targetHeight);
  composer.render();

  const dataUrl = renderer.domElement.toDataURL("image/png");

  // Restore original settings
  renderer.setSize(origSize.x, origSize.y);
  composer.setSize(origSize.x, origSize.y);
  applyRenderScale(_renderScale);
  return dataUrl;
}
