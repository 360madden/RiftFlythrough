// Pure utility functions — no side effects, no state imports.

import * as THREE from "three";

const GOLDEN_ANGLE = 0.618033988749895;

/** HSL golden-angle cycling color for group *index* out of *total*. */
export function groupColor(index) {
  const hue = ((index * GOLDEN_ANGLE * 360) % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.55, 0.55);
}
