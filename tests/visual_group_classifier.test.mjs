import assert from "node:assert/strict";

import {
  TERRAIN_FACE_THRESHOLD,
  STRUCTURE_FACE_THRESHOLD,
  TERRAIN_MAX_EXTENT_THRESHOLD,
  STRUCTURE_MAX_EXTENT_THRESHOLD,
  DETAIL_MAX_EXTENT_THRESHOLD,
  DETAIL_FACE_THRESHOLD,
  VISUAL_CATEGORIES,
  classifyVisualGroup,
  isStructurallySignificantGroup,
  isPointOnlyGroupName,
  normalizeExtents,
} from "../js/visual_group_classifier.js";

// ── Constants ──

assert.equal(TERRAIN_FACE_THRESHOLD, 80);
assert.equal(STRUCTURE_FACE_THRESHOLD, 20);
assert.equal(TERRAIN_MAX_EXTENT_THRESHOLD, 5.0);
assert.equal(STRUCTURE_MAX_EXTENT_THRESHOLD, 1.5);
assert.equal(DETAIL_MAX_EXTENT_THRESHOLD, 0.5);
assert.equal(DETAIL_FACE_THRESHOLD, 5);

// Categories list is frozen
assert.throws(() => { VISUAL_CATEGORIES.push("new"); });
assert.ok(VISUAL_CATEGORIES.includes("terrain"));
assert.ok(VISUAL_CATEGORIES.includes("structure"));
assert.ok(VISUAL_CATEGORIES.includes("prop"));
assert.ok(VISUAL_CATEGORIES.includes("detail"));
assert.ok(VISUAL_CATEGORIES.includes("point-cloud"));
assert.ok(VISUAL_CATEGORIES.includes("degenerate"));
assert.ok(VISUAL_CATEGORIES.includes("unknown"));

// ── normalizeExtents ──

assert.deepEqual(normalizeExtents({ x: 10, y: -1, z: Number.NaN }), { x: 10, y: 0, z: 0 });
assert.equal(normalizeExtents(null), null);
assert.deepEqual(normalizeExtents({ x: 5, y: 20, z: 3 }), { x: 5, y: 20, z: 3 });

// ── isPointOnlyGroupName ──

assert.equal(isPointOnlyGroupName("ptonly_decode-nif-geometry-mesh6"), true);
assert.equal(isPointOnlyGroupName("decode-nif-geometry-mesh6"), false);
assert.equal(isPointOnlyGroupName(""), false);
assert.equal(isPointOnlyGroupName(null), false);

// ── classifyVisualGroup ──

// Point-only -> point-cloud
assert.equal(
  classifyVisualGroup({ faceCount: 0, extents: { x: 5, y: 3, z: 2 }, isPointOnly: true }),
  "point-cloud",
);

// Degenerate -> degenerate
assert.equal(
  classifyVisualGroup({ faceCount: 10, extents: { x: 0, y: 0, z: 0 }, isDegenerate: true }),
  "degenerate",
);

// Terrain: large face count + large extent
assert.equal(
  classifyVisualGroup({ faceCount: 100, extents: { x: 50, y: 10, z: 30 } }),
  "terrain",
);

// Terrain boundary: exactly at threshold
assert.equal(
  classifyVisualGroup({ faceCount: TERRAIN_FACE_THRESHOLD, extents: { x: TERRAIN_MAX_EXTENT_THRESHOLD, y: 0, z: 0 } }),
  "terrain",
);

// Structure: moderate face count + moderate extent
assert.equal(
  classifyVisualGroup({ faceCount: 30, extents: { x: 2, y: 5, z: 1 } }),
  "structure",
);

// Structure boundary: exactly at threshold
assert.equal(
  classifyVisualGroup({ faceCount: STRUCTURE_FACE_THRESHOLD, extents: { x: STRUCTURE_MAX_EXTENT_THRESHOLD, y: 0, z: 0 } }),
  "structure",
);

// Detail: few faces + small extent
assert.equal(
  classifyVisualGroup({ faceCount: 3, extents: { x: 0.1, y: 0.2, z: 0.3 } }),
  "detail",
);

// Detail: zero faces but not point-only
// (0 faces with any extents falls through to detail check: fc <= DETAIL_FACE_THRESHOLD)
assert.equal(
  classifyVisualGroup({ faceCount: 0, extents: { x: 10, y: 5, z: 3 } }),
  "detail",
);

// Prop: moderate faces but small extent (below structure threshold)
assert.equal(
  classifyVisualGroup({ faceCount: 15, extents: { x: 0.5, y: 0.3, z: 0.1 } }),
  "detail",
);

// Prop: a few faces, moderate extent
assert.equal(
  classifyVisualGroup({ faceCount: 10, extents: { x: 1, y: 2, z: 0.5 } }),
  "prop",
);

// Prop: many faces but tiny extent (below structure threshold)
assert.equal(
  classifyVisualGroup({ faceCount: 50, extents: { x: 1, y: 0.5, z: 0.5 } }),
  "prop",
);

// Unknown: null extents
assert.equal(
  classifyVisualGroup({ faceCount: 10, extents: null }),
  "unknown",
);

// Unknown: empty options
assert.equal(classifyVisualGroup({}), "unknown");
assert.equal(classifyVisualGroup(null), "unknown");

// ── isStructurallySignificantGroup ──

assert.equal(isStructurallySignificantGroup({ faceCount: 100, extents: { x: 50, y: 10, z: 30 } }), true);
assert.equal(isStructurallySignificantGroup({ faceCount: 30, extents: { x: 2, y: 5, z: 1 } }), true);
assert.equal(isStructurallySignificantGroup({ faceCount: 5, extents: { x: 0.5, y: 0.3, z: 0.1 } }), false);
assert.equal(isStructurallySignificantGroup({ faceCount: 10, extents: { x: 1, y: 2, z: 0.5 } }), false);

console.log("PASS: visual_group_classifier.test.mjs - all", assert.AssertionError ? "assertions passed" : "tests passed");
