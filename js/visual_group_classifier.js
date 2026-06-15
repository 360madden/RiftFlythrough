// Pure geometry-based visual group classifier.
//
// Classifies OBJ groups by face count, spatial extent, and vertex/face density
// so Beauty mode can make category-aware suppression decisions (e.g., keep
// large terrain-like geometry visible even without texture maps).
//
// Categories (ordered by decreasing structural significance):
//   terrain       — large face count + large spatial extent (likely ground/world)
//   structure     — moderate face count + moderate extent (likely building/wall)
//   prop          — low face count or small extent (likely decoration)
//   detail        — very low face count + tiny extent (likely small object)
//   point-cloud   — zero faces, points only
//   degenerate    — degenerate extents (maxExtent <= epsilon or <=1 non-zero axis)
//   unknown       — couldn't classify (data insufficiency)

export const TERRAIN_FACE_THRESHOLD = 80;
export const STRUCTURE_FACE_THRESHOLD = 20;
export const TERRAIN_MAX_EXTENT_THRESHOLD = 5.0;
export const STRUCTURE_MAX_EXTENT_THRESHOLD = 1.5;
export const DETAIL_MAX_EXTENT_THRESHOLD = 0.5;
export const DETAIL_FACE_THRESHOLD = 5;

const VISUAL_CATEGORIES = Object.freeze([
  "terrain",
  "structure",
  "prop",
  "detail",
  "point-cloud",
  "degenerate",
  "unknown",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeExtents(extents) {
  if (!extents || typeof extents !== "object") return null;
  const x = finiteNumber(extents.x) ? Math.max(0, extents.x) : 0;
  const y = finiteNumber(extents.y) ? Math.max(0, extents.y) : 0;
  const z = finiteNumber(extents.z) ? Math.max(0, extents.z) : 0;
  return { x, y, z };
}

/** Return true when a group name points to a point-only (no faces) group. */
export function isPointOnlyGroupName(name) {
  return typeof name === "string" && name.startsWith("ptonly_");
}

/**
 * Classify a visual group by its geometry properties.
 *
 * @param {object} options
 * @param {number} options.faceCount  - Number of polygon faces
 * @param {object} options.extents    - {x, y, z} spatial extents
 * @param {boolean} [options.isPointOnly] - True if group is point-only
 * @param {boolean} [options.isDegenerate] - True if group has degenerate extents
 * @returns {string} One of the VISUAL_CATEGORIES values
 */
export function classifyVisualGroup(options) {
  const { faceCount, extents, isPointOnly, isDegenerate } = options || {};

  // Point-only groups
  if (isPointOnly) return "point-cloud";

  // Degenerate extents (handled by visual_group_filter, but classify anyway)
  if (isDegenerate) return "degenerate";

  const fc = finiteNumber(faceCount) ? faceCount : 0;
  const ex = normalizeExtents(extents);
  if (!ex) return "unknown";

  const maxExtent = Math.max(ex.x, ex.y, ex.z);

  // Terrain: large face count + large spatial extent
  if (fc >= TERRAIN_FACE_THRESHOLD && maxExtent >= TERRAIN_MAX_EXTENT_THRESHOLD) {
    return "terrain";
  }

  // Structure: moderate face count + moderate extent
  if (fc >= STRUCTURE_FACE_THRESHOLD && maxExtent >= STRUCTURE_MAX_EXTENT_THRESHOLD) {
    return "structure";
  }

  // Detail: tiny extent + very few faces
  if (fc <= DETAIL_FACE_THRESHOLD || maxExtent <= DETAIL_MAX_EXTENT_THRESHOLD) {
    return "detail";
  }

  // Prop: everything else with faces
  if (fc > 0) {
    return "prop";
  }

  return "unknown";
}

/**
 * Return true when a group is large enough to show even without texture maps.
 * Terrain and large structures are structurally meaningful even untextured.
 */
export function isStructurallySignificantGroup(options) {
  const category = classifyVisualGroup(options);
  return category === "terrain" || category === "structure";
}

export { VISUAL_CATEGORIES, normalizeExtents };
