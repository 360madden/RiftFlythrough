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
};
