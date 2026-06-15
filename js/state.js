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

  visualProfile: "beauty",
  lightMode: 0,
  wireframeMode: false,
  lightTransition: { progress: 1 },
  waterPlane: null,
  minimapSize: 200,
  minimapCentroids: [], // pre-computed XY centroids for minimap dots

  orbitMode: false,
  orbitTarget: null, // THREE.Vector3
  orbitDistance: 500,
  orbitPhi: 0, // polar angle (radians, up/down)
  orbitTheta: 0, // azimuthal angle (radians, left/right)

  bookmarks: [], // { name: string, x: number, y: number, z: number }[]
  bookmarkIdx: -1, // current bookmark index for cycling

  tourActive: false,
  tourPaused: false,
  tourSpeed: 1.0, // speed multiplier (0.25-4.0)
  tourWaypoints: [], // { pos, lookAt }[]
  tourIdx: 0,
  tourT: 0, // lerp progress 0-1 between current pair

  screenshots: [], // { dataUrl: string, timestamp: number }[]
  teleportHistory: [], // { pos: {x,y,z}, target: {x,y,z} }[] — camera positions before teleport
  teleportHistoryIdx: -1, // current index in history (-1 = at latest, no redo available)
  renderScale: 1.0,
  worldGroundY: 0, // ground plane Y (set during OBJ load)
  fogDensity: 1.0, // fog far multiplier (1.0 = default 4000, 2.0 = 2000)
  waterOpacity: 1.0, // water shader opacity multiplier (0-1)
  groundOpacity: 0.3, // ground plane opacity (0-1)
  gridVisible: false, // grid and axes visibility
  groundVisible: false, // ground plane visibility
  waterVisible: false, // water plane visibility

  cycleEnabled: false, // day/night auto-cycle through lighting presets
  cyclePaused: false, // pause cycling without disabling
  cycleSpeed: 1.0, // cycle speed multiplier (0.25–4.0, default 1.0 = ~15s per preset)
  cycleTimer: 0, // accumulated time since last preset advance

  shakeAmount: 0, // camera shake intensity (decays over time)
  shakeTimer: 0, // elapsed time for shake oscillation

  showHudPos: true, // show position in HUD info bar
  showHudSpeed: true,
  showZoneLabels: false, // show zone/area/city label sprites and overlays

  autoExposure: false, // auto-adjust exposure based on scene luminance
  textureQuality: "high", // off/low/medium/high; high preserves max anisotropy

  pointCloudsVisible: false, // show point-only marker clouds from extracted OBJ data
  hideDegenerateGroups: true, // hide flat/zero-extent extraction artifacts in Beauty mode
  hideUnlinkedGroups: true, // hide mesh groups without source hash or texture links in Beauty mode
  hidePlaceholderTextureGroups: true, // hide groups mapped only to blank/placeholder textures in Beauty mode
  hideLowConfidenceGroups: true, // hide compact untextured/generic extraction artifacts in Beauty mode
  hideUntexturedLargeGeometry: false, // Beauty default: keep large terrain/structure visible even when untextured
  visualSuppressionStats: {
    hidden: 0,
    pointCloud: 0,
    degenerate: 0,
    unlinked: 0,
    placeholderTexture: 0,
    lowConfidence: 0,
  },
  lodEnabled: false, // switch far world groups to lightweight proxies
  lodProxyDistance: 1200,
  lodHideDistance: 2800,
  lodEntries: [],
  lodStats: { near: 0, proxy: 0, hidden: 0 },

  speedrunActive: false, // speed-run race in progress
  speedrunCheckpointIdx: 0, // current checkpoint index

  spectatorMode: false, // ultra-fast travel mode (5x speed)
};
