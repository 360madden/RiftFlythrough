// Performance monitoring overlay — FPS graph, draw calls, GPU memory.

import { renderer } from "./scene.js";

const HISTORY_SIZE = 120; // ~2 seconds at 60fps
const fpsHistory = new Float32Array(HISTORY_SIZE);
let fpsWriteIdx = 0;
let _visible = false;
let _canvas = null;
let _ctx = null;
let _frameCount = 0;
let _lastSecond = performance.now();

/** Toggle the performance overlay on/off. */
export function togglePerf() {
  setPerfVisible(!_visible);
}

/** Set performance overlay visibility absolutely (sidebar + hotkey). */
export function setPerfVisible(enabled) {
  _visible = Boolean(enabled);
  const panel = document.getElementById("perf-panel");
  if (panel) panel.style.display = _visible ? "block" : "none";
}

/** @returns {boolean} */
export function isPerfVisible() {
  return _visible;
}

/** Update FPS history and redraw the graph each frame. */
export function updatePerf(_dt) {
  if (!_visible) return;

  // FPS tracking
  _frameCount++;
  const now = performance.now();
  if (now - _lastSecond >= 1000) {
    const fps = Math.round(_frameCount / ((now - _lastSecond) / 1000));
    _lastSecond = now;
    _frameCount = 0;
    fpsHistory[fpsWriteIdx % HISTORY_SIZE] = fps;
    fpsWriteIdx++;
    redraw(fps);
  }
}

function redraw(currentFps) {
  const panel = document.getElementById("perf-panel");
  if (!panel) return;

  if (!_canvas) {
    _canvas = document.getElementById("perf-graph");
    if (_canvas) _ctx = _canvas.getContext("2d");
  }
  if (!_ctx) return;

  const w = _canvas.width;
  const h = _canvas.height;
  const ctx = _ctx;

  // Clear
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = "rgba(0,255,0,0.08)";
  ctx.lineWidth = 0.5;
  for (let y = 0; y <= 4; y++) {
    const yPos = (h / 5) * y;
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(w, yPos);
    ctx.stroke();
    if (y < 5) {
      ctx.fillStyle = "rgba(0,255,0,0.3)";
      ctx.font = "8px monospace";
      ctx.fillText(`${y * 15}`, 2, yPos - 2);
    }
  }
  // 60 fps target line
  const target60Y = h - (60 / 75) * h;
  ctx.strokeStyle = "rgba(255,170,0,0.2)";
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(0, target60Y);
  ctx.lineTo(w, target60Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // FPS line graph
  ctx.strokeStyle = "#4f4";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const samples = Math.min(fpsWriteIdx, HISTORY_SIZE);
  for (let i = 0; i < samples; i++) {
    const idx = (fpsWriteIdx - samples + i) % HISTORY_SIZE;
    const fps = Math.min(fpsHistory[idx], 75);
    const x = (i / HISTORY_SIZE) * w;
    const y = h - (fps / 75) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Current FPS number
  ctx.fillStyle = "#4f4";
  ctx.font = "bold 14px monospace";
  ctx.fillText(`${currentFps}`, 4, 16);

  // Draw calls and triangles from renderer info
  const info = renderer.info;
  const draws = info.render.calls || 0;
  const tris = info.render.triangles || 0;

  // Update text stats
  const fpsEl = document.getElementById("perf-fps");
  const drawEl = document.getElementById("perf-draws");
  const triEl = document.getElementById("perf-tris");
  const memEl = document.getElementById("perf-mem");
  if (fpsEl) fpsEl.textContent = `${currentFps} FPS`;
  if (drawEl) drawEl.textContent = `${draws} calls`;
  if (triEl) triEl.textContent = `${(tris / 1000).toFixed(1)}k tris`;

  // GPU memory (Chrome only)
  if (memEl) {
    const mem = performance.memory;
    if (mem) {
      memEl.textContent = `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB`;
    } else {
      memEl.textContent = "—";
    }
  }
}
