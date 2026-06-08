// 2D canvas minimap: draw world overview, player position, click-to-teleport.

import * as THREE from "three";
import { euler } from "./controls.js";
import { camera } from "./scene.js";
import { state } from "./state.js";

const miniCanvas = document.getElementById("minimap-canvas");
const miniCtx = miniCanvas.getContext("2d");

// ── Draw minimap ──
export function drawMinimap() {
  const w = state.minimapSize;
  const h = state.minimapSize;
  miniCtx.fillStyle = "rgba(5,5,15,0.9)";
  miniCtx.fillRect(0, 0, w, h);

  const { minX, maxX, minZ, maxZ } = state.worldBounds;

  // Guard: avoid division-by-zero if the world has no extent
  if (maxX <= minX || maxZ <= minZ) return;
  const padX = (maxX - minX) * 0.05;
  const padZ = (maxZ - minZ) * 0.05;
  const mapMinX = minX - padX;
  const mapMaxX = maxX + padX;
  const mapMinZ = minZ - padZ;
  const mapMaxZ = maxZ + padZ;
  const scaleX = w / (mapMaxX - mapMinX);
  const scaleZ = h / (mapMaxZ - mapMinZ);

  function toScreen(wx, wz) {
    return [(wx - mapMinX) * scaleX, h - (wz - mapMinZ) * scaleZ];
  }

  // World bounds outline
  miniCtx.strokeStyle = "rgba(0,255,0,0.3)";
  miniCtx.lineWidth = 1;
  const [bx, bz] = toScreen(minX, minZ);
  const [bx2, bz2] = toScreen(maxX, maxZ);
  miniCtx.strokeRect(bx, bz2, bx2 - bx, bz - bz2);

  // Distance ticks every 500 units
  miniCtx.fillStyle = "rgba(0,255,0,0.4)";
  miniCtx.font = "9px monospace";
  miniCtx.textAlign = "center";
  const tickStartX = Math.ceil(mapMinX / 500) * 500;
  for (let tick = tickStartX; tick <= mapMaxX; tick += 500) {
    const [tx] = toScreen(tick, mapMinZ);
    if (tx > 4 && tx < w - 4) {
      miniCtx.fillRect(tx - 0.5, h - 8, 1, 6);
      if (tick % 1000 === 0) miniCtx.fillText(tick, tx, h - 2);
    }
  }
  miniCtx.textAlign = "left";
  const tickStartZ = Math.ceil(mapMinZ / 500) * 500;
  for (let tick = tickStartZ; tick <= mapMaxZ; tick += 500) {
    const [, ty] = toScreen(mapMinX, tick);
    if (ty > 8 && ty < h - 4) {
      miniCtx.fillRect(2, ty - 0.5, 6, 1);
      if (tick % 1000 === 0) miniCtx.fillText(tick, 10, ty + 3);
    }
  }

  // Compass
  miniCtx.font = "bold 11px monospace";
  miniCtx.textAlign = "center";
  miniCtx.fillStyle = "#0f0";
  const [cx] = toScreen((mapMinX + mapMaxX) / 2, mapMinZ);
  miniCtx.fillText("N", cx, 14);
  miniCtx.fillText("S", cx, h - 14);
  miniCtx.textAlign = "left";
  const [, cy2] = toScreen(mapMinX, (mapMinZ + mapMaxZ) / 2);
  miniCtx.fillText("W", 4, cy2 + 4);
  miniCtx.textAlign = "right";
  miniCtx.fillText("E", w - 4, cy2 + 4);

  // Group centroid dots (from pre-computed centroids)
  const seenDirs = new Set();
  for (let i = 0; i < state.worldGroups.length; i++) {
    if (!state.worldGroups[i].visible) continue;
    const centroid = state.minimapCentroids[i];
    if (!centroid) continue;
    const [sx, sy] = toScreen(centroid.x, centroid.z);
    const key = `${Math.round(sx / 3)},${Math.round(sy / 3)}`;
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);

    const color = state.groupColors[i] || new THREE.Color(0x889999);
    miniCtx.fillStyle = `#${color.getHexString()}`;
    const dotSize = Math.max(1.5, 4 - (i / state.worldGroups.length) * 3);
    miniCtx.fillRect(sx - dotSize / 2, sy - dotSize / 2, dotSize, dotSize);
  }

  // Player position
  const [px, py] = toScreen(camera.position.x, camera.position.z);
  miniCtx.fillStyle = "#0f0";
  miniCtx.beginPath();
  miniCtx.arc(px, py, 4, 0, Math.PI * 2);
  miniCtx.fill();
  miniCtx.strokeStyle = "#fff";
  miniCtx.lineWidth = 1;
  miniCtx.stroke();

  // Direction indicator
  const dx = -Math.sin(euler.y);
  const dz = -Math.cos(euler.y);
  miniCtx.strokeStyle = "#0f0";
  miniCtx.lineWidth = 1.5;
  miniCtx.beginPath();
  miniCtx.moveTo(px, py);
  miniCtx.lineTo(px + dx * 12, py + dz * 12);
  miniCtx.stroke();
}

// ── Click-to-teleport ──
miniCanvas.addEventListener("click", (e) => {
  if (!state.worldGroups.length) return;
  const rect = miniCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  // Use the current canvas dimensions (which account for CSS scaling)
  const size = state.minimapSize;
  const { minX, maxX, minZ, maxZ } = state.worldBounds;
  if (maxX <= minX || maxZ <= minZ) return;
  const padX = (maxX - minX) * 0.05;
  const padZ = (maxZ - minZ) * 0.05;
  const mapMinX = minX - padX;
  const mapMaxX = maxX + padX;
  const mapMinZ = minZ - padZ;
  const mapMaxZ = maxZ + padZ;

  // Scale click relative to actual canvas display size
  const displaySize = rect.width;
  const scaleFactor = size / displaySize;
  const scaledCx = cx * scaleFactor;
  const scaledCy = cy * scaleFactor;

  camera.position.x = mapMinX + (scaledCx / size) * (mapMaxX - mapMinX);
  camera.position.z = mapMinZ + ((size - scaledCy) / size) * (mapMaxZ - mapMinZ);
});
