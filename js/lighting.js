// Lighting presets and creation. Mutates scene directly.

import * as THREE from "three";
import { scene } from "./scene.js";

// ── Presets ──
export const LIGHT_MODES = [
  {
    name: "Day",
    sunColor: 0xffffcc,
    sunY: 800,
    sunX: 500,
    ambColor: 0x334466,
    ambInt: 0.6,
    hemiSky: 0x8899cc,
    hemiGnd: 0x334422,
    hemiInt: 0.4,
    fogColor: 0x0a0a14,
    bgColor: 0x0a0a14,
  },
  {
    name: "Sunset",
    sunColor: 0xff8844,
    sunY: 100,
    sunX: 800,
    ambColor: 0x332211,
    ambInt: 0.3,
    hemiSky: 0x886644,
    hemiGnd: 0x221100,
    hemiInt: 0.2,
    fogColor: 0x1a0a05,
    bgColor: 0x1a0a05,
  },
  {
    name: "Night",
    sunColor: 0x222244,
    sunY: -500,
    sunX: 0,
    ambColor: 0x111122,
    ambInt: 0.15,
    hemiSky: 0x111133,
    hemiGnd: 0x0a0a11,
    hemiInt: 0.1,
    fogColor: 0x050510,
    bgColor: 0x050510,
  },
  {
    name: "Dawn",
    sunColor: 0xffaa66,
    sunY: 50,
    sunX: -600,
    ambColor: 0x332233,
    ambInt: 0.35,
    hemiSky: 0x664455,
    hemiGnd: 0x221122,
    hemiInt: 0.25,
    fogColor: 0x0f0a10,
    bgColor: 0x0f0a10,
  },
];

// ── Light objects (used by applyLighting) ──
const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffcc, 1.2);
sunLight.position.set(500, 800, 300);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 3000;
sunLight.shadow.camera.left = -1000;
sunLight.shadow.camera.right = 1000;
sunLight.shadow.camera.top = 1000;
sunLight.shadow.camera.bottom = -1000;
scene.add(sunLight);

const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x334422, 0.4);
scene.add(hemiLight);

// ── Apply a lighting mode ──
export function applyLighting(mode) {
  const m = LIGHT_MODES[mode];
  ambientLight.color.set(m.ambColor);
  ambientLight.intensity = m.ambInt;
  sunLight.color.set(m.sunColor);
  sunLight.position.set(m.sunX, m.sunY, 300);
  hemiLight.color.set(m.hemiSky);
  hemiLight.groundColor.set(m.hemiGnd);
  hemiLight.intensity = m.hemiInt;
  scene.background = new THREE.Color(m.bgColor);
  scene.fog = new THREE.Fog(m.fogColor, 500, 4000);
}

// Initial state synced by main.js or controls.js after settings are loaded
