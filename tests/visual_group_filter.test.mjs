import assert from "node:assert/strict";

import {
  DEGENERATE_EXTENT_EPSILON,
  LOW_CONFIDENCE_FACE_THRESHOLD,
  LOW_CONFIDENCE_MAX_EXTENT,
  PLACEHOLDER_TEXTURE_TOKENS,
  isCompactLowConfidenceVisualGroup,
  isDegenerateVisualExtents,
  isPlaceholderTextureUrl,
  isUnlinkedVisualGroup,
  normalizeExtents,
  visualGroupSuppressionReason,
} from "../js/visual_group_filter.js";

assert.equal(DEGENERATE_EXTENT_EPSILON, 0.001);
assert.equal(LOW_CONFIDENCE_FACE_THRESHOLD, 300);
assert.equal(LOW_CONFIDENCE_MAX_EXTENT, 2.25);
assert.equal(PLACEHOLDER_TEXTURE_TOKENS.includes("diffuse_blank"), true);

assert.deepEqual(normalizeExtents({ x: 2, y: -1, z: Number.NaN }), { x: 2, y: 0, z: 0 });
assert.equal(normalizeExtents(null), null);

assert.equal(isDegenerateVisualExtents({ x: 0, y: 0, z: 0 }), true);
assert.equal(isDegenerateVisualExtents({ x: 10, y: 0, z: 0 }), true);
assert.equal(isDegenerateVisualExtents({ x: 10, y: 0, z: 20 }), false);
assert.equal(isDegenerateVisualExtents({ x: 10, y: 2, z: 20 }), false);
assert.equal(isDegenerateVisualExtents(null), false);

assert.equal(
  isCompactLowConfidenceVisualGroup({
    faceCount: 300,
    extents: { x: 2, y: 2, z: 2 },
    hasNifHash: false,
    hasTextureMap: false,
  }),
  true,
);
assert.equal(
  isCompactLowConfidenceVisualGroup({
    faceCount: 300,
    extents: { x: 2, y: 2, z: 2 },
    hasNifHash: true,
    hasTextureMap: true,
  }),
  false,
);
assert.equal(
  isCompactLowConfidenceVisualGroup({
    faceCount: 299,
    extents: { x: 2, y: 2, z: 2 },
    hasNifHash: false,
    hasTextureMap: false,
  }),
  false,
);
assert.equal(
  isCompactLowConfidenceVisualGroup({
    faceCount: 300,
    extents: { x: 3, y: 2, z: 2 },
    hasNifHash: false,
    hasTextureMap: false,
  }),
  false,
);

assert.equal(isUnlinkedVisualGroup({ faceCount: 12, hasNifHash: false, hasTextureMap: false }), true);
assert.equal(isUnlinkedVisualGroup({ faceCount: 12, hasNifHash: true, hasTextureMap: false }), true);
assert.equal(isUnlinkedVisualGroup({ faceCount: 12, hasNifHash: true, hasTextureMap: true }), false);
assert.equal(isUnlinkedVisualGroup({ faceCount: 0, hasNifHash: false, hasTextureMap: false }), false);

assert.equal(isPlaceholderTextureUrl("textures/converted/a6ad5487_diffuse_blank.png"), true);
assert.equal(isPlaceholderTextureUrl("textures/converted/1e9dced1_environmentmap_blank.png"), true);
assert.equal(isPlaceholderTextureUrl("textures/converted/n_ec_grass_01_c.png"), false);
assert.equal(isPlaceholderTextureUrl(null), false);

assert.equal(
  visualGroupSuppressionReason(
    { isPointOnlyGroup: true, isDegenerateVisualGroup: false },
    { pointCloudsVisible: false, hideDegenerateGroups: true },
  ),
  "point-cloud",
);
assert.equal(
  visualGroupSuppressionReason(
    { isPointOnlyGroup: false, isDegenerateVisualGroup: true },
    { pointCloudsVisible: true, hideDegenerateGroups: true },
  ),
  "degenerate",
);
assert.equal(
  visualGroupSuppressionReason(
    { isUnlinkedVisualGroup: true },
    { hideUnlinkedGroups: true },
  ),
  "unlinked",
);
assert.equal(
  visualGroupSuppressionReason(
    { isPlaceholderTextureGroup: true },
    { hidePlaceholderTextureGroups: true },
  ),
  "placeholder-texture",
);
assert.equal(
  visualGroupSuppressionReason(
    { isLowConfidenceVisualGroup: true },
    { hideLowConfidenceGroups: true },
  ),
  "low-confidence",
);
assert.equal(
  visualGroupSuppressionReason(
    { isPointOnlyGroup: false, isDegenerateVisualGroup: true },
    { pointCloudsVisible: true, hideDegenerateGroups: false },
  ),
  "",
);

console.log("[OK] visual_group_filter regression tests passed");
