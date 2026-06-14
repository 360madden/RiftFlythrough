import assert from "node:assert/strict";

import {
  TEXTURE_QUALITY_LEVELS,
  normalizeTextureQuality,
  textureQualityAnisotropy,
  textureQualityLoadsTextures,
} from "../js/texture_quality.js";

assert.deepEqual(TEXTURE_QUALITY_LEVELS, ["off", "low", "medium", "high"]);
assert.equal(Object.isFrozen(TEXTURE_QUALITY_LEVELS), true);

assert.equal(normalizeTextureQuality("off"), "off");
assert.equal(normalizeTextureQuality("low"), "low");
assert.equal(normalizeTextureQuality("medium"), "medium");
assert.equal(normalizeTextureQuality("high"), "high");
assert.equal(normalizeTextureQuality("unexpected"), "high");
assert.equal(normalizeTextureQuality(null), "high");
assert.equal(normalizeTextureQuality(undefined), "high");
assert.equal(normalizeTextureQuality("HIGH"), "high");
assert.equal(normalizeTextureQuality(""), "high");

assert.equal(textureQualityLoadsTextures("off"), false);
assert.equal(textureQualityLoadsTextures("low"), true);
assert.equal(textureQualityLoadsTextures("medium"), true);
assert.equal(textureQualityLoadsTextures("high"), true);
assert.equal(textureQualityLoadsTextures("HIGH"), true);
assert.equal(textureQualityLoadsTextures("unexpected"), true);

assert.equal(textureQualityAnisotropy(16, "off"), 0);
assert.equal(textureQualityAnisotropy(16, "low"), 1);
assert.equal(textureQualityAnisotropy(16, "medium"), 4);
assert.equal(textureQualityAnisotropy(16, "high"), 16);
assert.equal(textureQualityAnisotropy(2, "medium"), 2);
assert.equal(textureQualityAnisotropy(4, "low"), 1);
assert.equal(textureQualityAnisotropy(0, "low"), 1);
assert.equal(textureQualityAnisotropy(0, "medium"), 1);
assert.equal(textureQualityAnisotropy(0, "high"), 1);
assert.equal(textureQualityAnisotropy(-8, "high"), 1);
assert.equal(textureQualityAnisotropy(3.9, "high"), 3);
assert.equal(textureQualityAnisotropy(Number.NaN, "high"), 1);
assert.equal(textureQualityAnisotropy(Number.POSITIVE_INFINITY, "high"), 1);
assert.equal(textureQualityAnisotropy(16, "unexpected"), 16);
assert.equal(textureQualityAnisotropy(16, "HIGH"), 16);

console.log("[OK] texture_quality regression tests passed");
