// Pure helpers for conservative visual-fidelity group suppression.

export const DEGENERATE_EXTENT_EPSILON = 0.001;
export const LOW_CONFIDENCE_FACE_THRESHOLD = 300;
export const LOW_CONFIDENCE_MAX_EXTENT = 2.25;
export const PLACEHOLDER_TEXTURE_TOKENS = Object.freeze([
  "diffuse_blank",
  "environmentmap_blank",
  "pure_white",
  "placeholder",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeExtents(extents) {
  if (!extents || typeof extents !== "object") return null;
  const x = finiteNumber(extents.x) ? Math.max(0, extents.x) : 0;
  const y = finiteNumber(extents.y) ? Math.max(0, extents.y) : 0;
  const z = finiteNumber(extents.z) ? Math.max(0, extents.z) : 0;
  return { x, y, z };
}

export function isDegenerateVisualExtents(extents, epsilon = DEGENERATE_EXTENT_EPSILON) {
  const normalized = normalizeExtents(extents);
  if (!normalized) return false;
  const threshold = finiteNumber(epsilon) && epsilon >= 0 ? epsilon : DEGENERATE_EXTENT_EPSILON;
  const axes = [normalized.x, normalized.y, normalized.z];
  const maxExtent = Math.max(...axes);
  const nonZeroAxes = axes.filter((extent) => extent > threshold).length;
  return maxExtent <= threshold || nonZeroAxes <= 1;
}

export function isCompactLowConfidenceVisualGroup(groupData) {
  const data = groupData || {};
  const extents = normalizeExtents(data.extents);
  if (!extents) return false;
  const faceCount = finiteNumber(data.faceCount) ? data.faceCount : 0;
  if (faceCount < LOW_CONFIDENCE_FACE_THRESHOLD) return false;

  const maxExtent = Math.max(extents.x, extents.y, extents.z);
  const hasStrongSourceEvidence = Boolean(data.hasNifHash && data.hasTextureMap);
  return maxExtent <= LOW_CONFIDENCE_MAX_EXTENT && !hasStrongSourceEvidence;
}

export function isUnlinkedVisualGroup(groupData) {
  const data = groupData || {};
  const faceCount = finiteNumber(data.faceCount) ? data.faceCount : 0;
  if (faceCount <= 0) return false;
  return !data.hasNifHash || !data.hasTextureMap;
}

export function isPlaceholderTextureUrl(url) {
  if (typeof url !== "string" || !url) return false;
  const normalized = url.split("?")[0].split("#")[0].toLowerCase();
  return PLACEHOLDER_TEXTURE_TOKENS.some((token) => normalized.includes(token));
}

export function visualGroupSuppressionReason(groupData, settings) {
  const data = groupData || {};
  const options = settings || {};
  if (data.isPointOnlyGroup && !options.pointCloudsVisible) return "point-cloud";
  if (data.isDegenerateVisualGroup && options.hideDegenerateGroups) return "degenerate";
  if (data.isUnlinkedVisualGroup && options.hideUnlinkedGroups) return "unlinked";
  if (data.isPlaceholderTextureGroup && options.hidePlaceholderTextureGroups) return "placeholder-texture";
  if (data.isLowConfidenceVisualGroup && options.hideLowConfidenceGroups) return "low-confidence";
  return "";
}
