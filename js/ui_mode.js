// Fly vs UI interaction mode.
//
// While pointer-locked (flying), the browser hides the cursor and routes mouse
// input to look — so menus appear but cannot be clicked. This module tracks
// interactive UI surfaces, releases pointer lock when any are open, keeps the
// full-screen start overlay from covering mid-session UI, and shows a compact
// resume bar so the user can free the cursor, use menus, then click the world
// to resume look.

import { state } from "./state.js";

/** Interactive surfaces that require a free cursor. */
export const UI_SURFACE = {
  settings: "settings",
  help: "help",
  catalog: "catalog",
  gallery: "gallery",
  zoneFilter: "zoneFilter",
  search: "search",
  bookmarks: "bookmarks",
  pause: "pause",
  crash: "crash",
  sidebar: "sidebar",
  calibrate: "calibrate",
};

/** Full-screen overlays that should block re-locking until closed. */
const BLOCKING_SURFACES = new Set([
  UI_SURFACE.settings,
  UI_SURFACE.help,
  UI_SURFACE.catalog,
  UI_SURFACE.gallery,
  UI_SURFACE.crash,
]);

/** Surfaces that must not re-acquire pointer lock (menus + calibrate drag). */
const FLY_LOCK_BLOCKERS = new Set([...BLOCKING_SURFACES, UI_SURFACE.calibrate]);

const openSurfaces = new Set();
const changeListeners = new Set();

let resumeBarEl = null;
let resumeBarReady = false;

/**
 * True when any interactive UI surface is open (cursor should be free).
 * @returns {boolean}
 */
export function isUiMode() {
  return openSurfaces.size > 0;
}

/**
 * True when a full-screen panel is open (do not re-lock pointer on canvas click).
 * @returns {boolean}
 */
export function hasBlockingUi() {
  for (const id of openSurfaces) {
    if (BLOCKING_SURFACES.has(id)) return true;
  }
  return false;
}

/**
 * True when pointer lock / resume look should be refused (blocking menus or calibrate).
 * @returns {boolean}
 */
export function blocksFlyLock() {
  for (const id of openSurfaces) {
    if (FLY_LOCK_BLOCKERS.has(id)) return true;
  }
  return false;
}

/**
 * True when WASD fly should keep working (free cursor / pause / sidebar only).
 * Full-screen menus and search freeze movement so typing and sliders are safe.
 * @returns {boolean}
 */
export function allowsKeyboardFly() {
  if (openSurfaces.size === 0) return true;
  if (hasBlockingUi()) return false;
  if (openSurfaces.has(UI_SURFACE.search) || openSurfaces.has(UI_SURFACE.bookmarks)) {
    return false;
  }
  // pause, zone filter, sidebar focus — cursor free, keyboard fly ok
  return true;
}

/** @returns {string[]} */
export function getOpenUiSurfaces() {
  return [...openSurfaces];
}

/**
 * Subscribe to UI-mode transitions.
 * @param {(active: boolean, surfaces: string[]) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onUiModeChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/**
 * Open or close a named UI surface and sync pointer-lock / resume chrome.
 * @param {string} id
 * @param {boolean} open
 */
export function setUiSurface(id, open) {
  if (!id) return;
  const before = openSurfaces.size > 0;
  if (open) openSurfaces.add(id);
  else openSurfaces.delete(id);
  applyUiMode(before);
}

/**
 * Mark free-cursor "pause" without a specific panel (e.g. Esc while flying).
 * @param {boolean} open
 */
export function setPauseMode(open) {
  setUiSurface(UI_SURFACE.pause, open);
}

/**
 * Re-scan known DOM panels and sync surfaces from their visible state.
 * Call after any external class/display toggle (sidebar wiring, etc.).
 */
export function refreshUiSurfaces() {
  const before = openSurfaces.size > 0;

  // Preserve intentional pause unless a blocking panel is open (then pause is redundant).
  const keepPause = openSurfaces.has(UI_SURFACE.pause);

  openSurfaces.clear();

  if (document.getElementById("settings-overlay")?.classList.contains("active")) {
    openSurfaces.add(UI_SURFACE.settings);
  }
  if (document.getElementById("help-overlay")?.classList.contains("active")) {
    openSurfaces.add(UI_SURFACE.help);
  }
  if (document.getElementById("catalog-overlay")?.classList.contains("active")) {
    openSurfaces.add(UI_SURFACE.catalog);
  }
  if (document.getElementById("gallery-overlay")?.classList.contains("active")) {
    openSurfaces.add(UI_SURFACE.gallery);
  }
  if (document.getElementById("crash-overlay")?.classList.contains("active")) {
    openSurfaces.add(UI_SURFACE.crash);
  }

  const zonePanel = document.getElementById("zone-filter-panel");
  if (zonePanel && zonePanel.style.display === "block") {
    openSurfaces.add(UI_SURFACE.zoneFilter);
  }

  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");
  if (
    document.activeElement === searchInput ||
    searchResults?.classList.contains("active")
  ) {
    openSurfaces.add(UI_SURFACE.search);
  }

  // Bookmarks list is passive sidebar chrome — only treat as UI surface while
  // the user is renaming (contenteditable / focused input inside the panel).
  const bookmarkPanel = document.getElementById("bookmark-panel");
  if (
    bookmarkPanel?.classList.contains("active") &&
    document.activeElement &&
    bookmarkPanel.contains(document.activeElement) &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.isContentEditable)
  ) {
    openSurfaces.add(UI_SURFACE.bookmarks);
  }

  const sidebar = document.getElementById("sidebar");
  if (sidebar && !sidebar.classList.contains("collapsed") && sidebar.dataset.uiFocus === "1") {
    openSurfaces.add(UI_SURFACE.sidebar);
  }

  if (keepPause && !hasBlockingUiFromSet(openSurfaces)) {
    openSurfaces.add(UI_SURFACE.pause);
  }

  applyUiMode(before);
}

/**
 * Release pointer lock so the OS cursor is available for menus.
 * Safe to call when already unlocked.
 */
export function releasePointerForUi() {
  try {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Ensure the compact resume bar exists in the DOM.
 */
export function ensureResumeBar() {
  if (resumeBarReady) return resumeBarEl;
  resumeBarEl = document.getElementById("ui-resume-bar");
  if (!resumeBarEl) {
    resumeBarEl = document.createElement("div");
    resumeBarEl.id = "ui-resume-bar";
    resumeBarEl.setAttribute("role", "status");
    resumeBarEl.innerHTML =
      '<span class="ui-resume-text"></span>' +
      '<button type="button" class="ui-resume-btn" id="ui-resume-btn">Resume look</button>';
    document.body.appendChild(resumeBarEl);
  }
  resumeBarReady = true;
  return resumeBarEl;
}

/**
 * Update resume-bar visibility and copy from current mode.
 */
export function updateResumeBar() {
  const bar = ensureResumeBar();
  const textEl = bar.querySelector(".ui-resume-text");
  const btn = bar.querySelector(".ui-resume-btn");
  const session = Boolean(state.sessionStarted);
  const locked = Boolean(state.mouseLocked);
  const blocking = hasBlockingUi();

  if (!session || locked) {
    bar.classList.remove("visible");
    return;
  }

  bar.classList.add("visible");
  const flyBlocked = blocksFlyLock();
  if (btn) {
    btn.disabled = flyBlocked;
    btn.title = flyBlocked
      ? openSurfaces.has(UI_SURFACE.calibrate)
        ? "Exit calibrate mode first (Shift+C)"
        : "Close the open menu first"
      : "Resume mouse look";
  }
  if (!textEl) return;

  if (openSurfaces.has(UI_SURFACE.calibrate)) {
    textEl.textContent = "Calibrate mode — drag zone markers · Shift+C to save & exit";
  } else if (blocking) {
    textEl.textContent = "Menu open — interact freely · Esc closes · then Resume look / click world";
  } else if (openSurfaces.has(UI_SURFACE.zoneFilter) || openSurfaces.has(UI_SURFACE.sidebar)) {
    textEl.textContent = "Cursor free for menus · click the world to resume mouse look";
  } else if (openSurfaces.has(UI_SURFACE.pause) || openSurfaces.has(UI_SURFACE.search)) {
    textEl.textContent = "Cursor free — use sidebar & menus · click the world to resume mouse look";
  } else {
    textEl.textContent = "Cursor free · click the world to resume mouse look";
  }
}

/**
 * @param {Set<string>} set
 * @returns {boolean}
 */
function hasBlockingUiFromSet(set) {
  for (const id of set) {
    if (BLOCKING_SURFACES.has(id)) return true;
  }
  return false;
}

/**
 * @param {boolean} wasActive
 */
function applyUiMode(wasActive) {
  const active = openSurfaces.size > 0;
  state.uiMode = active;

  // Always release lock while any UI surface is open — covers late
  // pointerlock success racing a menu open (requestPointerLock is async).
  if (active && document.pointerLockElement) {
    releasePointerForUi();
  } else if (active && !wasActive) {
    releasePointerForUi();
  }

  // Drop pause when a real panel is open (pause is only for free-cursor freelook).
  if (hasBlockingUi() && openSurfaces.has(UI_SURFACE.pause)) {
    openSurfaces.delete(UI_SURFACE.pause);
  }

  state.uiMode = openSurfaces.size > 0;
  document.body.classList.toggle("ui-mode", state.uiMode);
  document.body.classList.toggle("session-started", Boolean(state.sessionStarted));
  updateResumeBar();

  for (const fn of changeListeners) {
    try {
      fn(state.uiMode, getOpenUiSurfaces());
    } catch (err) {
      console.warn("[ui_mode] listener error:", err);
    }
  }
}

// Keep resume bar in sync if something else toggles lock state.
document.addEventListener("pointerlockchange", () => {
  // Defer so controls.js can update state.mouseLocked first.
  queueMicrotask(() => updateResumeBar());
});
