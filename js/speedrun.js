// Speed-run mode: timed race through a circuit of checkpoints.
// Toggled with Shift+R. Leaderboard stored in localStorage.

import * as THREE from "three";
import { camera, scene } from "./scene.js";
import { state } from "./state.js";
import { showToast } from "./ui.js";

// ── Constants ──
const CHECKPOINT_COUNT = 10;
const CHECKPOINT_RADIUS = 80; // distance to trigger checkpoint
const LEADERBOARD_KEY = "rift-speedrun-leaderboard";
const MAX_LEADERBOARD = 10;

// ── Checkpoint circuit (generated at race start based on world bounds) ──
let checkpoints = []; // [{ x, y, z }]
let checkpointMarkers = []; // THREE.Mesh spheres in scene
let startTime = 0;
let finishTime = 0;
let countdownTimer = 0;
let countdownPhase = 0; // 0=idle, 1=3,2=2,3=1,4=GO!,5=racing,6=finished

// ── DOM refs (set on first use) ──
let _hud = null;
let _timerEl = null;
let _progressEl = null;
let _nextEl = null;
let _countdownEl = null;
let _leaderboardEl = null;

function getHud() {
  if (!_hud) {
    _hud = document.getElementById("speedrun-hud");
    _timerEl = document.getElementById("sr-timer");
    _progressEl = document.getElementById("sr-progress");
    _nextEl = document.getElementById("sr-next");
    _countdownEl = document.getElementById("sr-countdown");
    _leaderboardEl = document.getElementById("sr-leaderboard-list");
  }
  return _hud;
}

// ── Leaderboard ──

function loadLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveLeaderboard(board) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board.slice(0, MAX_LEADERBOARD)));
  } catch (_) {}
}

function addToLeaderboard(time) {
  const board = loadLeaderboard();
  board.push({ time, date: Date.now() });
  board.sort((a, b) => a.time - b.time);
  saveLeaderboard(board);
  return board;
}

function renderLeaderboard() {
  if (!_leaderboardEl) getHud();
  if (!_leaderboardEl) return;
  const board = loadLeaderboard();
  if (!board.length) {
    _leaderboardEl.innerHTML = '<span style="color:#555">No times yet</span>';
    return;
  }
  _leaderboardEl.innerHTML = board
    .slice(0, 10)
    .map(
      (entry, i) =>
        `<div class="sr-row">` +
        `<span class="sr-rank">${i + 1}.</span>` +
        `<span class="sr-time">${formatTime(entry.time)}</span>` +
        `<span class="sr-date">${new Date(entry.date).toLocaleDateString()}</span>` +
        `</div>`,
    )
    .join("");
}

// ── Checkpoint generation ──

/** Generate a circuit of checkpoints spread across the world bounds. */
function generateCircuit() {
  const { minX, maxX, minZ, maxZ } = state.worldBounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const halfW = (maxX - minX) * 0.4;
  const halfD = (maxZ - minZ) * 0.4;

  checkpoints = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i++) {
    const angle = (i / CHECKPOINT_COUNT) * Math.PI * 2;
    const r = 0.7 + 0.3 * Math.sin(angle * 2); // oval-ish path
    const x = cx + Math.cos(angle) * halfW * r;
    const z = cz + Math.sin(angle) * halfD * r;
    // Altitude: vary between 30-200 units above ground
    const y = state.worldGroundY + 40 + (i % 3) * 60;
    checkpoints.push({ x, y, z });
  }
}

/** Create glowing checkpoint sphere markers in the scene. */
function createMarkers() {
  disposeMarkers();
  const geo = new THREE.SphereGeometry(CHECKPOINT_RADIUS * 0.3, 16, 8);
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const color = i === 0 ? 0x00ff00 : 0xffaa00;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(cp.x, cp.y, cp.z);
    marker.userData.cpIndex = i;
    scene.add(marker);
    checkpointMarkers.push(marker);
  }
}

function disposeMarkers() {
  // Markers share one SphereGeometry — dispose it once after the loop
  let sharedGeo = null;
  for (const m of checkpointMarkers) {
    if (!sharedGeo && m.geometry) sharedGeo = m.geometry;
    m.material?.dispose();
    scene.remove(m);
  }
  if (sharedGeo) sharedGeo.dispose();
  checkpointMarkers = [];
}

// ── Race lifecycle ──

/** Toggle the speedrun. Called from ui.js on Shift+R.
 *  If no race is active, starts one. If a race is in progress, cancels.
 *  If no race and leaderboard panel is hidden, shows leaderboard. */
export function toggleSpeedrun() {
  if (countdownPhase >= 1 && countdownPhase <= 5) {
    cancelRace();
    return;
  }
  // If leaderboard is hidden, show it first press; start race on second press
  const lbPanel = document.getElementById("sr-leaderboard");
  if (lbPanel && lbPanel.style.display !== "block") {
    renderLeaderboard();
    lbPanel.style.display = "block";
    showToast("Leaderboard shown — Shift+R again to race");
    return;
  }
  if (lbPanel) lbPanel.style.display = "none";
  startRace();
}

/** Begin countdown, then race. */
function startRace() {
  if (!state.worldGroups.length) {
    showToast("World must be loaded first");
    return;
  }
  generateCircuit();
  createMarkers();
  state.speedrunActive = true;
  state.speedrunCheckpointIdx = 0;
  countdownPhase = 1;
  countdownTimer = 0;
  startTime = 0;
  finishTime = 0;
  getHud().style.display = "block";
  _countdownEl.style.display = "block";
  _countdownEl.textContent = "3";
  showToast("Speedrun: get ready!");
}

function cancelRace() {
  state.speedrunActive = false;
  state.speedrunCheckpointIdx = 0;
  countdownPhase = 0;
  disposeMarkers();
  getHud().style.display = "none";
  const lbPanel = document.getElementById("sr-leaderboard");
  if (lbPanel) lbPanel.style.display = "none";
  showToast("Speedrun cancelled");
}

function finishRace() {
  const elapsed = (performance.now() - startTime) / 1000;
  finishTime = elapsed;
  countdownPhase = 6;
  state.speedrunActive = false;
  disposeMarkers();

  const board = addToLeaderboard(elapsed);
  renderLeaderboard();

  _timerEl.textContent = formatTime(elapsed);
  _progressEl.textContent = `${CHECKPOINT_COUNT}/${CHECKPOINT_COUNT} — Complete!`;
  _nextEl.textContent = "";
  _countdownEl.style.display = "none";

  // Show leaderboard panel
  const lbPanel = document.getElementById("sr-leaderboard");
  if (lbPanel) lbPanel.style.display = "block";

  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (countdownPhase === 6) {
      getHud().style.display = "none";
      if (lbPanel) lbPanel.style.display = "none";
      countdownPhase = 0;
    }
  }, 10000);

  const rank = board.findIndex((e) => e.time === elapsed) + 1;
  showToast(
    rank === 1
      ? `🏆 NEW RECORD: ${formatTime(elapsed)}!`
      : `Finished: ${formatTime(elapsed)} (rank #${rank})`,
  );
}

// ── Per-frame update ──

/** Called from main.js animate loop. Handles countdown, racing, and checkpoint detection. */
export function updateSpeedrun(dt) {
  if (!state.speedrunActive && countdownPhase < 1) return;

  const hud = getHud();

  // ── Countdown phase ──
  if (countdownPhase >= 1 && countdownPhase <= 4) {
    countdownTimer += dt;
    const counts = [0, 3, 2, 1, 0]; // phase → number to show
    const target = counts[countdownPhase];

    if (countdownTimer >= 1) {
      countdownTimer = 0;
      countdownPhase++;
      if (countdownPhase === 4) {
        // GO!
        _countdownEl.textContent = "GO!";
      } else if (countdownPhase === 5) {
        // Start racing
        _countdownEl.style.display = "none";
        startTime = performance.now();
      } else {
        _countdownEl.textContent = String(counts[countdownPhase]);
      }
    } else if (countdownPhase === 4) {
      // Show GO! for 0.6s then transition to racing
      if (countdownTimer >= 0.6) {
        _countdownEl.style.display = "none";
        startTime = performance.now();
        countdownPhase = 5;
      }
    }

    // Update timer with countdown
    if (countdownPhase <= 4) {
      _timerEl.textContent = `—:——`;
      _progressEl.textContent = `0/${CHECKPOINT_COUNT}`;
    }
    return;
  }

  // ── Racing phase ──
  if (countdownPhase === 5) {
    const elapsed = (performance.now() - startTime) / 1000;
    _timerEl.textContent = formatTime(elapsed);
    _progressEl.textContent = `${state.speedrunCheckpointIdx}/${CHECKPOINT_COUNT}`;

    // Check if near next checkpoint
    if (state.speedrunCheckpointIdx < checkpoints.length) {
      const cp = checkpoints[state.speedrunCheckpointIdx];
      const dx = camera.position.x - cp.x;
      const dy = camera.position.y - cp.y;
      const dz = camera.position.z - cp.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < CHECKPOINT_RADIUS) {
        // Collected!
        state.speedrunCheckpointIdx++;
        // Flash marker green
        if (checkpointMarkers[state.speedrunCheckpointIdx - 1]) {
          checkpointMarkers[state.speedrunCheckpointIdx - 1].material.color.set(0x00ff00);
          checkpointMarkers[state.speedrunCheckpointIdx - 1].material.opacity = 0.8;
        }
        // Highlight next marker
        if (
          state.speedrunCheckpointIdx < checkpoints.length &&
          checkpointMarkers[state.speedrunCheckpointIdx]
        ) {
          checkpointMarkers[state.speedrunCheckpointIdx].material.color.set(0x00ff00);
          checkpointMarkers[state.speedrunCheckpointIdx].material.opacity = 0.8;
        }

        if (state.speedrunCheckpointIdx >= checkpoints.length) {
          finishRace();
        } else {
          showToast(`Checkpoint ${state.speedrunCheckpointIdx}/${CHECKPOINT_COUNT} ✓`);
        }
      } else {
        // Show direction/distance to next checkpoint
        _nextEl.textContent = `→ Next: ${dist.toFixed(0)}u at ${cp.y.toFixed(0)}Y`;
      }
    }
  }
}

// ── Formatting ──

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

// ── Cleanup ──

/** Initialize leaderboard display on module load. */
export function initSpeedrun() {
  renderLeaderboard();
}
