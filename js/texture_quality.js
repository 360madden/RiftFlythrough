const DEFAULT_TEXTURE_QUALITY = "high";
const TEXTURE_QUALITY_ANISOTROPY = Object.freeze({
  off: 0,
  low: 1,
  medium: 4,
});

export const TEXTURE_QUALITY_LEVELS = Object.freeze([
  "off",
  "low",
  "medium",
  DEFAULT_TEXTURE_QUALITY,
]);

export function normalizeTextureQuality(value) {
  return TEXTURE_QUALITY_LEVELS.includes(value) ? value : DEFAULT_TEXTURE_QUALITY;
}

export function textureQualityLoadsTextures(value) {
  return normalizeTextureQuality(value) !== "off";
}

export function textureQualityAnisotropy(maxAnisotropy, value) {
  const quality = normalizeTextureQuality(value);
  if (quality === "off") return 0;

  const safeMax = Number.isFinite(maxAnisotropy)
    ? Math.max(1, Math.floor(maxAnisotropy))
    : 1;
  if (quality === DEFAULT_TEXTURE_QUALITY) return safeMax;

  return Math.min(safeMax, TEXTURE_QUALITY_ANISOTROPY[quality] ?? safeMax);
}
