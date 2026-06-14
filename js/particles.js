// Atmospheric particle effects — floating dust motes for ambiance.

import * as THREE from "three";
import { scene } from "./scene.js";
import { state } from "./state.js";

const PARTICLE_COUNT = 2000;
let points = null;
let _visible = true;
let _particleTime = 0; // independent time accumulator (not tied to cycleTimer)

// Precomputed per-particle phase offsets to avoid multiplication in hot loop
const _phases = new Float32Array(PARTICLE_COUNT * 3);

/** Create dust motes scattered across world bounds. */
export function createParticles() {
  if (points) return;

  const { minX, maxX, minZ, maxZ } = state.worldBounds;
  const rangeX = maxX - minX || 2000;
  const rangeZ = maxZ - minZ || 2000;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = cx + (Math.random() - 0.5) * rangeX * 1.3;
    positions[i * 3 + 1] = Math.random() * 600 + 10; // Y: 10–610
    positions[i * 3 + 2] = cz + (Math.random() - 0.5) * rangeZ * 1.3;
    // Precompute phase offsets
    _phases[i * 3] = Math.random() * Math.PI * 2;
    _phases[i * 3 + 1] = Math.random() * Math.PI * 2;
    _phases[i * 3 + 2] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xddccaa,
    size: 1.2,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  points = new THREE.Points(geo, mat);
  points.name = "dust-particles";
  points.visible = _visible; // respect visibility setting from startup
  scene.add(points);
}

/** Remove particles from the scene. */
export function disposeParticles() {
  if (!points) return;
  scene.remove(points);
  points.geometry.dispose();
  points.material.dispose();
  points = null;
}

/** Show or hide particles (without destroying them). */
export function setParticlesVisible(visible) {
  _visible = visible;
  if (points) points.visible = visible;
}

/** Animate particles each frame — gentle drift and subtle bobbing using independent time. */
export function updateParticles(dt) {
  if (!points || !_visible) return;

  _particleTime += dt;
  const t = _particleTime;
  const positions = points.geometry.attributes.position.array;
  const speed = 15; // units per second base drift
  const { minX, maxX, minZ, maxZ } = state.worldBounds;
  const rangeX = maxX - minX || 2000;
  const rangeZ = maxZ - minZ || 2000;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfX = rangeX * 0.65;
  const halfZ = rangeZ * 0.65;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const idx = i * 3;
    const px = _phases[idx];
    const py = _phases[idx + 1];
    const pz = _phases[idx + 2];

    // Gentle horizontal drift with precomputed phase offsets
    const driftX = Math.sin(px + t * 0.3) * speed * 0.3;
    const driftZ = Math.cos(pz + t * 0.25) * speed * 0.3;

    positions[idx] += driftX * dt;
    positions[idx + 1] += Math.sin(py + t * 0.6) * speed * 0.15 * dt;
    positions[idx + 2] += driftZ * dt;

    // Wrap around world bounds
    if (positions[idx] > cx + halfX) positions[idx] -= rangeX * 1.3;
    if (positions[idx] < cx - halfX) positions[idx] += rangeX * 1.3;
    if (positions[idx + 2] > cz + halfZ) positions[idx + 2] -= rangeZ * 1.3;
    if (positions[idx + 2] < cz - halfZ) positions[idx + 2] += rangeZ * 1.3;
    if (positions[idx + 1] > 610) positions[idx + 1] = 10;
    if (positions[idx + 1] < 10) positions[idx + 1] = 610;
  }

  points.geometry.attributes.position.needsUpdate = true;
}
