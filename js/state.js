// Shared mutable state — imported by all feature modules.
// Using a plain object for live bindings (objects are passed by reference).

export const state = {
  keys: {},
  mouseLocked: false,
  moveSpeed: 50,
  mouseSensitivity: 0.002,
  showMinimap: true,

  worldGroups: [],
  groupColors: [],
  worldBounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 },

  selectedGroup: null,
  selectedOrigMaterials: [],
  meshToGroup: new Map(),

  lightMode: 0,
  wireframeMode: false,
  lightTransition: { progress: 1 },
  waterPlane: null,
  minimapSize: 200,
  minimapCentroids: [],  // pre-computed XY centroids for minimap dots

  orbitMode: false,
  orbitTarget: null,      // THREE.Vector3
  orbitDistance: 500,
  orbitPhi: 0,            // polar angle (radians, up/down)
  orbitTheta: 0,          // azimuthal angle (radians, left/right)

  bookmarks: [],           // { name: string, x: number, y: number, z: number }[]
  bookmarkIdx: -1,         // current bookmark index for cycling
};
