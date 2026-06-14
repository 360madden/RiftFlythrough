// Group catalog browser — searchable, sortable list of all world groups.

import { state } from "./state.js";
import { flyToGroup } from "./teleport.js";

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
    return { group: g, index: i, name, isPtonly, verts, visible: g.visible };
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
      return (
        `<div class="cat-row${visClass}" data-idx="${g.index}">` +
        `<span class="cat-swatch" style="background:${hex}"></span>` +
        `<span class="cat-name">${g.name}</span>` +
        `<span class="cat-verts">${g.verts.toLocaleString()}v</span>` +
        `<span class="cat-type ${g.isPtonly ? "ptonly" : "faced"}">` +
        `${g.isPtonly ? "cloud" : "mesh"}</span>` +
        `</div>`
      );
    })
    .join("");
  countEl.textContent = `${list.length} / ${_allGroups.length} groups`;
}

/** Toggle catalog overlay open/closed. */
export function toggleCatalog() {
  if (!state.worldGroups.length) return;
  if (overlay.classList.contains("active")) {
    closeCatalog();
  } else {
    rebuildGroupList();
    render();
    overlay.classList.add("active");
    searchInput.focus();
  }
}

function closeCatalog() {
  overlay.classList.remove("active");
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
