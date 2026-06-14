// Weather particle system — rain (Storm mode) and snow (Night/Moonlight).
// Particles are recycled in a cylinder above the camera for a localized effect.

import * as THREE from "three";
import { scene } from "./scene.js";
import { state } from "./state.js";

const RAIN_COUNT = 3000;
const SNOW_COUNT = 2000;
const WEATHER_RADIUS = 800;
const WEATHER_HEIGHT = 600;

let rainPoints = null;
let snowPoints = null;
let _weatherType = "none"; // "none" | "rain" | "snow"
let _enabled = true;
let _snowTime = 0; // accumulated time for snow drift (dt-based)

// ── Rain ──

function createRain() {
  const positions = new Float32Array(RAIN_COUNT * 3);
  const velocities = new Float32Array(RAIN_COUNT); // per-particle fall speed variation
  for (let i = 0; i < RAIN_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * WEATHER_RADIUS * 2;
    positions[i * 3 + 1] = Math.random() * WEATHER_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * WEATHER_RADIUS * 2;
    velocities[i] = 400 + Math.random() * 300; // 400-700 units/sec
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // Store per-particle velocity as a custom attribute
  geo.setAttribute("velocity", new THREE.BufferAttribute(velocities, 1));

  const mat = new THREE.PointsMaterial({
    color: 0x8899bb,
    size: 1.8,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  rainPoints = new THREE.Points(geo, mat);
  rainPoints.name = "weather-rain";
  rainPoints.visible = false;
  rainPoints.renderOrder = 999;
  rainPoints.material.depthTest = true;
  scene.add(rainPoints);
}

// ── Snow ──

function createSnow() {
  const positions = new Float32Array(SNOW_COUNT * 3);
  const phases = new Float32Array(SNOW_COUNT); // precomputed phase for horizontal drift
  for (let i = 0; i < SNOW_COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * WEATHER_RADIUS * 2;
    positions[i * 3 + 1] = Math.random() * WEATHER_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * WEATHER_RADIUS * 2;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("phase", new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 3.0,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  snowPoints = new THREE.Points(geo, mat);
  snowPoints.name = "weather-snow";
  snowPoints.visible = false;
  snowPoints.renderOrder = 999;
  snowPoints.material.depthTest = true;
  scene.add(snowPoints);
}

// ── Initialization (called lazily on first update) ──

let _initialized = false;

function ensureCreated() {
  if (_initialized) return;
  createRain();
  createSnow();
  _initialized = true;
}

// ── Determine weather type from lighting mode ──

function getWeatherForMode(mode) {
  // Storm (index 4) → rain, Night (2) / Moonlight (6) → snow
  if (mode === 4) return "rain";
  if (mode === 2 || mode === 6) return "snow";
  return "none";
}

// ── Public API ──

/** Enable or disable the weather system entirely. */
export function setWeatherEnabled(enabled) {
  _enabled = enabled;
  if (!enabled) {
    if (rainPoints) rainPoints.visible = false;
    if (snowPoints) snowPoints.visible = false;
  }
}

/** Update weather each frame. Called from main.js animate loop. */
export function updateWeather(camX, camY, camZ, dt) {
  if (!_enabled) return;
  ensureCreated();

  // Determine target weather from lighting mode
  const targetWeather = getWeatherForMode(state.lightMode);

  // Show/hide appropriate particle systems
  if (targetWeather !== _weatherType) {
    _weatherType = targetWeather;
    if (rainPoints) rainPoints.visible = targetWeather === "rain";
    if (snowPoints) snowPoints.visible = targetWeather === "snow";
  }

  if (_weatherType === "rain" && rainPoints) {
    updateRain(camX, camY, camZ, dt);
  } else if (_weatherType === "snow" && snowPoints) {
    _snowTime += dt;
    updateSnow(camX, camY, camZ, dt);
  }
}

// ── Rain update ──

function updateRain(cx, cy, cz, dt) {
  const positions = rainPoints.geometry.attributes.position.array;
  const velocities = rainPoints.geometry.attributes.velocity.array;
  const halfW = WEATHER_RADIUS;

  for (let i = 0; i < RAIN_COUNT; i++) {
    const idx = i * 3;
    // Fall
    positions[idx + 1] -= velocities[i] * dt;

    // Wrap: if below camera, reset above
    if (positions[idx + 1] < cy - 100) {
      positions[idx] = cx + (Math.random() - 0.5) * halfW * 2;
      positions[idx + 1] = cy + WEATHER_HEIGHT * 0.5 + Math.random() * WEATHER_HEIGHT * 0.5;
      positions[idx + 2] = cz + (Math.random() - 0.5) * halfW * 2;
      velocities[i] = 400 + Math.random() * 300;
    }

    // Slight wind drift
    positions[idx] += 20 * dt;
    positions[idx + 2] += 15 * dt;

    // Wrap horizontally
    if (positions[idx] > cx + halfW) positions[idx] -= halfW * 2;
    if (positions[idx] < cx - halfW) positions[idx] += halfW * 2;
    if (positions[idx + 2] > cz + halfW) positions[idx + 2] -= halfW * 2;
    if (positions[idx + 2] < cz - halfW) positions[idx + 2] += halfW * 2;
  }

  rainPoints.geometry.attributes.position.needsUpdate = true;
}

// ── Snow update ──

function updateSnow(cx, cy, cz, dt) {
  const positions = snowPoints.geometry.attributes.position.array;
  const phases = snowPoints.geometry.attributes.phase.array;
  const halfW = WEATHER_RADIUS;
  const time = _snowTime;

  for (let i = 0; i < SNOW_COUNT; i++) {
    const idx = i * 3;
    const phase = phases[i];

    // Gentle fall
    positions[idx + 1] -= (15 + Math.sin(phase + time * 0.5) * 8) * dt;

    // Horizontal drift (swirling)
    positions[idx] += Math.sin(phase + time * 0.7) * 25 * dt;
    positions[idx + 2] += Math.cos(phase + time * 0.6) * 25 * dt;

    // Wrap vertically
    if (positions[idx + 1] < cy - 100) {
      positions[idx] = cx + (Math.random() - 0.5) * halfW * 2;
      positions[idx + 1] = cy + WEATHER_HEIGHT * 0.5 + Math.random() * WEATHER_HEIGHT * 0.5;
      positions[idx + 2] = cz + (Math.random() - 0.5) * halfW * 2;
    }

    // Wrap horizontally
    if (positions[idx] > cx + halfW) positions[idx] -= halfW * 2;
    if (positions[idx] < cx - halfW) positions[idx] += halfW * 2;
    if (positions[idx + 2] > cz + halfW) positions[idx + 2] -= halfW * 2;
    if (positions[idx + 2] < cz - halfW) positions[idx + 2] += halfW * 2;
  }

  snowPoints.geometry.attributes.position.needsUpdate = true;
}
