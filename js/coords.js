// Coordinate overlay — shows current world position and nearby group names.
// Toggled with C key, updates every 10 frames for performance.

import { camera } from "./scene.js";
import { state } from "./state.js";

const panel = document.getElementById("coord-panel");
const coordsEl = document.getElementById("coord-position");
const nearbyEl = document.getElementById("coord-nearby");

let _visible = false;
let _frameSkip = 0;

/** Toggle the coordinate overlay on/off. */
export function toggleCoords() {
  _visible = !_visible;
  _frameSkip = 0; // reset throttle so first update is immediate
  panel.style.display = _visible ? "block" : "none";
}

/** Update coordinate display (called from animate loop, throttled). */
export function updateCoords() {
  if (!_visible) return;
  _frameSkip = (_frameSkip + 1) % 10;
  if (_frameSkip !== 0) return;

  const pos = camera.position;
  coordsEl.textContent = `X: ${pos.x.toFixed(0)}  Y: ${pos.y.toFixed(0)}  Z: ${pos.z.toFixed(0)}`;

  // Find nearby groups — iterate worldGroup centroids, sort by distance
  if (!state.worldGroups.length || !state.minimapCentroids.length) {
    nearbyEl.innerHTML = '<span style="color:#555">(no world loaded)</span>';
    return;
  }

  const nearby = [];
  for (let i = 0; i < state.worldGroups.length; i++) {
    const g = state.worldGroups[i];
    if (!g || !g.visible) continue;
    const c = state.minimapCentroids[i];
    if (!c) continue;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    nearby.push({ name: (g.name || "?").replace(/^o /, ""), dist, index: i });
  }

  nearby.sort((a, b) => a.dist - b.dist);
  const top = nearby.slice(0, 8);

  nearbyEl.innerHTML = top
    .map((n) => {
      const color = state.groupColors[n.index] || "#889999";
      const hex = typeof color === "string" ? color : `#${color.getHexString()}`;
      const name = n.name.length > 28 ? n.name.slice(0, 25) + "…" : n.name;
      return `<span style="color:${hex}">■</span> ${name} <span style="color:#555">${n.dist.toFixed(0)}u</span>`;
    })
    .join("<br>");
}
