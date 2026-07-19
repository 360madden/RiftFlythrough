import assert from "node:assert/strict";

import {
  chooseTextureSet,
  isNonColorUtilityTexture,
  isNormalTexture,
  isPreferredColorTexture,
  textureName,
} from "../js/texture_roles.js";

assert.equal(textureName("textures/converted/foo_c.png?cache=1#frag"), "foo_c.png");

assert.equal(isPreferredColorTexture("textures/converted/rock_diffuse.png"), true);
assert.equal(isPreferredColorTexture("textures/converted/rock_albedo.webp"), true);
assert.equal(isPreferredColorTexture("textures/converted/rock_c.png"), true);
assert.equal(isPreferredColorTexture("textures/converted/rock-d.jpg"), true);
assert.equal(isPreferredColorTexture("textures/converted/rock_spec.png"), false);

assert.equal(isNormalTexture("textures/converted/rock_normal.png"), true);
assert.equal(isNormalTexture("textures/converted/rock_n.png"), true);
assert.equal(isNormalTexture("textures/converted/rock_n_01.png"), true);
assert.equal(isNormalTexture("textures/converted/rock_normalgl.png"), true);
assert.equal(isNormalTexture("textures/converted/rock_color.png"), false);
// Zone-prefixed color maps must NOT be classified as normals
assert.equal(isNormalTexture("textures/converted/n_ec_grass_02_c.png"), false);
assert.equal(isNormalTexture("textures/converted/n_w_ocean_chunk_01_d.png"), false);
assert.equal(isNormalTexture("textures/converted/n_dr_rock_s.png"), false);

assert.equal(isNonColorUtilityTexture("textures/converted/rock_spec.png"), true);
assert.equal(isNonColorUtilityTexture("textures/converted/rock_gloss.png"), true);
assert.equal(isNonColorUtilityTexture("textures/converted/rock_rough.png"), true);
assert.equal(isNonColorUtilityTexture("textures/converted/rock_metal.png"), true);
assert.equal(isNonColorUtilityTexture("textures/converted/rock_environmentmap.png"), true);
assert.equal(isNonColorUtilityTexture("textures/converted/rock_detail.png"), false);

assert.deepEqual(
  chooseTextureSet([
    "textures/converted/rock_spec.png",
    "textures/converted/rock_normal.png",
    "textures/converted/rock_albedo.png",
  ]),
  {
    color: "textures/converted/rock_albedo.png",
    normal: "textures/converted/rock_normal.png",
  },
);

assert.deepEqual(
  chooseTextureSet([
    "textures/converted/rock_spec.png",
    "textures/converted/rock_detail.png",
    "textures/converted/rock_n.png",
  ]),
  {
    color: "textures/converted/rock_detail.png",
    normal: "textures/converted/rock_n.png",
  },
);

assert.deepEqual(chooseTextureSet(["textures/converted/rock_spec.png"]), {
  color: null,
  normal: null,
});
assert.deepEqual(chooseTextureSet([]), { color: null, normal: null });
assert.deepEqual(chooseTextureSet(null), { color: null, normal: null });

console.log("[OK] texture_roles regression tests passed");
