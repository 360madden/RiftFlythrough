// Lighting presets and creation. Mutates scene directly.

import * as THREE from "three";
import { renderer, scene } from "./scene.js";
import { state } from "./state.js";
import { updateWaterEnvMap } from "./world.js";

// ── Procedural skybox / environment map ──

const pmremGenerator = new THREE.PMREMGenerator(renderer);

/** Simple gradient sky scene used for environment map generation. */
const _skyScene = new THREE.Scene();
const _skyGeo = new THREE.SphereGeometry(500, 32, 32);
const _skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uTopColor: { value: new THREE.Color(0x3366aa) },
    uBotColor: { value: new THREE.Color(0x112233) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorldPos;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTopColor;
    uniform vec3 uBotColor;
    varying vec3 vWorldPos;
    void main() {
      float h = normalize(vWorldPos).y;
      float t = smoothstep(-0.2, 0.5, h);
      gl_FragColor = vec4(mix(uBotColor, uTopColor, t), 1.0);
    }
  `,
});
_skyScene.add(new THREE.Mesh(_skyGeo, _skyMat));

/** Generate and apply environment map from top/bottom gradient colors. */
export function updateEnvironmentMap(topColor, bottomColor) {
  _skyMat.uniforms.uTopColor.value.set(topColor);
  _skyMat.uniforms.uBotColor.value.set(bottomColor);
  try {
    const envMap = pmremGenerator.fromScene(_skyScene, 0.04);
    if (envMap?.texture) {
      if (scene.environment) scene.environment.dispose();
      scene.environment = envMap.texture;
      updateWaterEnvMap(envMap.texture);
    }
  } catch (_) {
    // PMREMGenerator may fail on some GPUs — fall back to no environment map
  }
}

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
    skyTop: 0x3366aa,
    skyBot: 0x112244,
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
    skyTop: 0x664422,
    skyBot: 0x1a0a05,
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
    skyTop: 0x0a0a1a,
    skyBot: 0x050510,
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
    skyTop: 0x554466,
    skyBot: 0x1a0a15,
  },
  {
    name: "Storm",
    sunColor: 0x445566,
    sunY: 300,
    sunX: 200,
    ambColor: 0x1a1a22,
    ambInt: 0.2,
    hemiSky: 0x334455,
    hemiGnd: 0x111122,
    hemiInt: 0.15,
    fogColor: 0x0a0a14,
    bgColor: 0x0a0a14,
    skyTop: 0x334455,
    skyBot: 0x0a0a14,
  },
  {
    name: "Golden Hour",
    sunColor: 0xffcc88,
    sunY: 30,
    sunX: 700,
    ambColor: 0x443322,
    ambInt: 0.4,
    hemiSky: 0x997755,
    hemiGnd: 0x332211,
    hemiInt: 0.3,
    fogColor: 0x2a1a0a,
    bgColor: 0x2a1a0a,
    skyTop: 0x886644,
    skyBot: 0x2a1508,
  },
  {
    name: "Moonlight",
    sunColor: 0x334466,
    sunY: 600,
    sunX: -300,
    ambColor: 0x0a0a18,
    ambInt: 0.12,
    hemiSky: 0x112244,
    hemiGnd: 0x050510,
    hemiInt: 0.08,
    fogColor: 0x030310,
    bgColor: 0x030310,
    skyTop: 0x0a0a22,
    skyBot: 0x030310,
  },
  {
    name: "Overcast",
    sunColor: 0xcccccc,
    sunY: 500,
    sunX: 0,
    ambColor: 0x333344,
    ambInt: 0.45,
    hemiSky: 0x666677,
    hemiGnd: 0x333344,
    hemiInt: 0.3,
    fogColor: 0x1a1a22,
    bgColor: 0x1a1a22,
    skyTop: 0x555566,
    skyBot: 0x1a1a22,
  },
];

// ── Shadow quality presets ──

export const SHADOW_PRESETS = [
  {
    name: "Low",
    mapSize: 1024,
    near: 1,
    far: 2000,
    left: -600,
    right: 600,
    top: 600,
    bottom: -600,
    bias: -0.0005,
    normalBias: 0.04,
  },
  {
    name: "Medium",
    mapSize: 2048,
    near: 1,
    far: 3000,
    left: -900,
    right: 900,
    top: 900,
    bottom: -900,
    bias: -0.0004,
    normalBias: 0.03,
  },
  {
    name: "High",
    mapSize: 2048,
    near: 1,
    far: 4000,
    left: -1200,
    right: 1200,
    top: 1200,
    bottom: -1200,
    bias: -0.0003,
    normalBias: 0.02,
  },
  {
    name: "Ultra",
    mapSize: 4096,
    near: 1,
    far: 5000,
    left: -1500,
    right: 1500,
    top: 1500,
    bottom: -1500,
    bias: -0.0002,
    normalBias: 0.015,
  },
];

/** Apply a shadow quality preset to the directional light. */
export function applyShadowQuality(presetIndex) {
  const p = SHADOW_PRESETS[presetIndex] || SHADOW_PRESETS[2];
  sunLight.shadow.mapSize.set(p.mapSize, p.mapSize);
  sunLight.shadow.camera.near = p.near;
  sunLight.shadow.camera.far = p.far;
  sunLight.shadow.camera.left = p.left;
  sunLight.shadow.camera.right = p.right;
  sunLight.shadow.camera.top = p.top;
  sunLight.shadow.camera.bottom = p.bottom;
  sunLight.shadow.bias = p.bias;
  sunLight.shadow.normalBias = p.normalBias;
}

// ── Light objects (used by applyLighting) ──
const ambientLight = new THREE.AmbientLight(0x334466, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffcc, 1.2);
sunLight.position.set(500, 800, 300);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 4000;
sunLight.shadow.camera.left = -1200;
sunLight.shadow.camera.right = 1200;
sunLight.shadow.camera.top = 1200;
sunLight.shadow.camera.bottom = -1200;
sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.02;
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
  scene.fog = new THREE.FogExp2(m.fogColor, FOG_DENSITIES[mode] || 0.0003);
  applyFogDensity(state.fogDensity);
  updateEnvironmentMap(m.skyTop, m.skyBot);
}

// ── Fog density ──

/** Default fog densities per light mode — adjusted so Day has light fog, Night has heavy. */
const FOG_DENSITIES = [0.00025, 0.0004, 0.0007, 0.00035, 0.0005, 0.0003, 0.0008, 0.00045]; // Day/Sunset/Night/Dawn/Storm/GoldenHr/Moonlight/Overcast

export function applyFogDensity(density) {
  if (!scene.fog) return;
  const mode = state.lightMode;
  const base = FOG_DENSITIES[mode] || 0.0003;
  scene.fog.density = base * Math.max(0.25, Math.min(2.0, density));
}

// ── Smooth lighting transitions ──

function lerpColor3(out, a, b, t) {
  out.r = a.r + (b.r - a.r) * t;
  out.g = a.g + (b.g - a.g) * t;
  out.b = a.b + (b.b - a.b) * t;
}

function colorFromHex(hex) {
  return new THREE.Color(hex);
}

// ── Day/night auto-cycle ──

/** Base seconds per preset at cycleSpeed=1.0. */
const CYCLE_BASE_SECONDS = 15;

/**
 * Advance the day/night cycle. Called each frame from main.js.
 * When enough time has elapsed, starts a transition to the next preset.
 */
export function updateDayNightCycle(dt) {
  if (!state.cycleEnabled || state.cyclePaused) return;
  if (state.lightTransition.progress < 1) return; // wait for current transition to finish

  state.cycleTimer += dt;
  const threshold = CYCLE_BASE_SECONDS / Math.max(0.25, Math.min(4.0, state.cycleSpeed));
  if (state.cycleTimer >= threshold) {
    state.cycleTimer = 0;
    const next = (state.lightMode + 1) % LIGHT_MODES.length;
    startLightTransition(state.lightMode, next);
  }
}

export function startLightTransition(fromMode, toMode) {
  state.lightTransition = { from: fromMode, to: toMode, progress: 0 };
}

export function updateLightTransition(dt) {
  const tr = state.lightTransition;
  if (tr.progress >= 1) return;

  tr.progress = Math.min(1, tr.progress + dt * 2);
  const t = tr.progress;
  const from = LIGHT_MODES[tr.from];
  const to = LIGHT_MODES[tr.to];

  const ambColor = colorFromHex(from.ambColor);
  const sunColor = colorFromHex(from.sunColor);
  const hemiSkyColor = colorFromHex(from.hemiSky);
  const hemiGndColor = colorFromHex(from.hemiGnd);

  lerpColor3(ambColor, ambColor, colorFromHex(to.ambColor), t);
  lerpColor3(sunColor, sunColor, colorFromHex(to.sunColor), t);
  lerpColor3(hemiSkyColor, hemiSkyColor, colorFromHex(to.hemiSky), t);
  lerpColor3(hemiGndColor, hemiGndColor, colorFromHex(to.hemiGnd), t);

  ambientLight.color.copy(ambColor);
  ambientLight.intensity = from.ambInt + (to.ambInt - from.ambInt) * t;
  sunLight.color.copy(sunColor);
  sunLight.position.set(
    from.sunX + (to.sunX - from.sunX) * t,
    from.sunY + (to.sunY - from.sunY) * t,
    300,
  );
  hemiLight.color.copy(hemiSkyColor);
  hemiLight.groundColor.copy(hemiGndColor);
  hemiLight.intensity = from.hemiInt + (to.hemiInt - from.hemiInt) * t;

  const bgColor = colorFromHex(from.bgColor);
  lerpColor3(bgColor, bgColor, colorFromHex(to.bgColor), t);
  scene.background = new THREE.Color(bgColor);

  const fogColor = colorFromHex(from.fogColor);
  lerpColor3(fogColor, fogColor, colorFromHex(to.fogColor), t);
  const fromDensity = FOG_DENSITIES[tr.from] || 0.0003;
  const toDensity = FOG_DENSITIES[tr.to] || 0.0003;
  // Lerp base density then apply user fog multiplier — do NOT call applyFogDensity
  // mid-transition (it uses state.lightMode which may still be the "from" mode).
  const baseDensity = fromDensity + (toDensity - fromDensity) * t;
  const mul = Math.max(0.25, Math.min(2.0, state.fogDensity));
  scene.fog = new THREE.FogExp2(fogColor, baseDensity * mul);

  if (tr.progress >= 1) {
    state.lightMode = tr.to;
    // Snap fog to final mode base * user multiplier
    applyFogDensity(state.fogDensity);
    // Regenerate skybox once transition completes
    updateEnvironmentMap(colorFromHex(to.skyTop), colorFromHex(to.skyBot));
  }
}
