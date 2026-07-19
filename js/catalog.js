// Group catalog browser — searchable, sortable list of all world groups.

import { state } from "./state.js";
import { flyToGroup } from "./teleport.js";
import { releasePointerForUi, setUiSurface, UI_SURFACE } from "./ui_mode.js";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const overlay = document.getElementById("catalog-overlay");
const searchInput = document.getElementById("catalog-search");
const sortSelect = document.getElementById("catalog-sort");
const listEl = document.getElementById("catalog-list");
const countEl = document.getElementById("catalog-count");

let _allGroups = [];

function normalizeName(name) {
  return (name || "").replace(/^o /, "").replace(/^ptonly_/, "");
}

/** Rebuild the flat group list from state.worldGroups. */
function rebuildGroupList() {
  _allGroups = state.worldGroups.map((g, i) => {
    const name = normalizeName(g.name);
    const isPtonly = (g.name || "").startsWith("ptonly_");
    let verts = 0;
    g.traverse((c) => {
      if ((c.isMesh || c.isPoints) && c.geometry?.getAttribute("position")) {
        verts += c.geometry.getAttribute("position").count;
      }
    });
    // Surface the per-asset source zone (set by RiftTransformLoader.applyManifests)
    const sourceZone = g.userData?.sourceZone || null;
    // Cycle 5.2: also surface confidence + first4 for the row badge.
    const sourceZoneConfidence = g.userData?.sourceZoneConfidence ?? null;
    const sourceZoneFirst4 = g.userData?.sourceZoneFirst4 || "";
    return {
      group: g,
      index: i,
      name,
      isPtonly,
      verts,
      visible: g.visible,
      sourceZone,
      sourceZoneConfidence,
      sourceZoneFirst4,
    };
  });
}

function getSortedGroups() {
  const query = searchInput.value.trim().toLowerCase();
  let list = [..._allGroups];

  // Filter
  if (query) {
    list = list.filter(
      (g) => g.name.toLowerCase().includes(query) || String(g.verts).includes(query),
    );
  }

  // Sort
  const sort = sortSelect.value;
  if (sort === "verts-desc") list.sort((a, b) => b.verts - a.verts);
  else if (sort === "verts-asc") list.sort((a, b) => a.verts - b.verts);
  else list.sort((a, b) => a.name.localeCompare(b.name));

  return list;
}

function render() {
  const list = getSortedGroups();
  listEl.innerHTML = list
    .map((g) => {
      const color = state.groupColors[g.index] || "#889999";
      const hex = typeof color === "string" ? color : `#${color.getHexString()}`;
      const visClass = g.group.visible ? "" : " hidden-group";
      // Cycle 5.2: confidence badge (high/medium/low/null) — small dot
      // with tooltip explaining the bucket. Consumers can use this to
      // opt out of low-confidence attributions.
      const conf = g.sourceZoneConfidence;
      const confBadge = conf
        ? (() => {
            const confMeta = {
              high:   { color: "#4ade80", glyph: "H", tip: "high — direct match (delta=0) or tight sibling (|delta|<=5)" },
              medium: { color: "#fbbf24", glyph: "M", tip: "medium — plausible sibling (6<=|delta|<=30)" },
              low:    { color: "#f87171", glyph: "L", tip: "low — coincidental adjacency (|delta|>30)" },
            };
            const m = confMeta[conf] || confMeta.medium;
            return (
              `<span class="cat-conf" title="${m.tip}" ` +
              `style="display:inline-block;width:14px;height:14px;line-height:14px;` +
              `text-align:center;font-size:9px;font-weight:700;border-radius:50%;` +
              `background:${m.color}33;color:${m.color};border:1px solid ${m.color}66;` +
              `margin-left:4px;flex-shrink:0">${m.glyph}</span>`
            );
          })()
        : "";
      // Source-zone badge (only shown for tagged assets)
      const sourceZone = g.sourceZone;
      const zoneBadge = sourceZone && sourceZone !== "unmatched"
        ? (() => {
            const parts = sourceZone.split(".");
            const exp = parts[0] || "";
            const rest = parts.slice(1).join(".") || sourceZone;
            const expColors = { vanilla: "#4a9eff", ep1: "#7fc8ff", ep2: "#ffb84a", ep3: "#ff7faa" };
            const expColor = expColors[exp] || "#888";
            return (
              `<span class="cat-zone" title="${escapeHtml(sourceZone)}" ` +
              `style="font-size:9px;font-weight:700;padding:1px 4px;border-radius:2px;` +
              `background:${expColor}22;color:${expColor};border:1px solid ${expColor}44;` +
              `margin-left:4px;flex-shrink:0">${escapeHtml(exp)}</span>` +
              `<span class="cat-zone-name" style="font-size:10px;color:#aaa;margin-left:2px;` +
              `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:0 1 auto">` +
              `${escapeHtml(rest)}</span>`
            );
          })()
        : (sourceZone === "unmatched"
            ? `<span class="cat-zone" title="No source zone (unmatched)" ` +
              `style="font-size:9px;color:#666;margin-left:4px;flex-shrink:0;font-style:italic">—</span>`
            : "");
      return (
        `<div class="cat-row${visClass}" data-idx="${g.index}">` +
        `<span class="cat-swatch" style="background:${hex}"></span>` +
        `<span class="cat-name">${escapeHtml(g.name)}</span>` +
        zoneBadge +
        confBadge +
        `<span class="cat-verts">${g.verts.toLocaleString()}v</span>` +
        `<span class="cat-type ${g.isPtonly ? "ptonly" : "faced"}">` +
        `${g.isPtonly ? "cloud" : "mesh"}</span>` +
        `</div>`
      );
    })
    .join("");
  countEl.textContent = `${list.length} / ${_allGroups.length} groups`;
}

/**
 * Toggle catalog overlay open/closed. Retries the rebuild up to 10x
 * (every 250ms) if RiftZoneRegistry is not yet ready — without this
 * retry, opening the catalog within the first ~100ms of world load
 * would show no zone badges because applyManifests() is async.
 */
export function toggleCatalog() {
  if (!state.worldGroups.length) return;
  if (overlay.classList.contains("active")) {
    closeCatalog();
  } else {
    _catalogOpenGen += 1;
    openCatalogWithZoneRetry(0);
    overlay.classList.add("active");
    setUiSurface(UI_SURFACE.catalog, true);
    releasePointerForUi();
    searchInput?.focus();
  }
}

let _catalogOpenGen = 0;

function openCatalogWithZoneRetry(attempt) {
  const gen = _catalogOpenGen;
  rebuildGroupList();
  render();
  // Wait for applyManifests to finish tagging — not "every group has a zone"
  // (many groups never get delivery tags). Caps at 10 attempts × 250ms = 2.5s.
  const taggingDone =
    window.RiftTransformLoader?.isApplied?.() ||
    window.RiftZoneRegistry?.isWorldTagged?.();
  if (!taggingDone && attempt < 10) {
    setTimeout(() => {
      if (gen !== _catalogOpenGen) return; // catalog closed/reopened
      openCatalogWithZoneRetry(attempt + 1);
    }, 250);
  }
}

/** Close catalog and blur search so WASD is not stuck in "typing" mode. */
export function closeCatalog() {
  _catalogOpenGen += 1; // cancel in-flight zone retries
  overlay.classList.remove("active");
  setUiSurface(UI_SURFACE.catalog, false);
  try {
    searchInput?.blur();
  } catch (_) {
    /* ignore */
  }
}

// Search input
searchInput.addEventListener("input", () => render());

// Sort change
sortSelect.addEventListener("change", () => render());

// Click on a row
listEl.addEventListener("click", (e) => {
  const row = e.target.closest(".cat-row");
  if (!row) return;
  const idx = parseInt(row.dataset.idx, 10);
  if (Number.isNaN(idx) || !_allGroups[idx]) return;
  const g = _allGroups[idx];

  if (e.shiftKey) {
    // Toggle visibility
    g.group.visible = !g.group.visible;
    g.visible = g.group.visible;
    render();
    return;
  }

  // Fly to group
  flyToGroup(g.group);
  closeCatalog();
});

// Click outside to close
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeCatalog();
});
