// World geometry: axes, grid, OBJ loader, ground plane, water plane, legend, info.

import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { buildLodProxies } from "./lod.js";
import { createParticles } from "./particles.js";
import { camera, renderer, scene } from "./scene.js";
import { state } from "./state.js";
import { chooseTextureSet } from "./texture_roles.js";
import {
  normalizeTextureQuality,
  textureQualityAnisotropy,
  textureQualityLoadsTextures,
} from "./texture_quality.js";
import { flyToGroup } from "./teleport.js";
import { groupColor } from "./utils.js";
import {
  isDegenerateVisualExtents,
  isCompactLowConfidenceVisualGroup,
  isPlaceholderTextureUrl,
  isUnlinkedVisualGroup,
  visualGroupSuppressionReason,
} from "./visual_group_filter.js";
import { initZoneLabels } from "./zones.js";
import { initZoneOverlays } from "./zone-overlays.js";
import { initCalibrate, applySavedPositions } from "./zone-calibrate.js";
import { initZoneFilter } from "./zone-filter.js";

// ── Water opacity ──
export function applyWaterOpacity(opacity) {
  waterUniforms.uOpacity.value = Math.max(0, Math.min(1.0, opacity));
}

// ── Ground opacity ──
let _groundMat = null;
export function applyGroundOpacity(opacity) {
  if (_groundMat) _groundMat.opacity = Math.max(0, Math.min(1.0, opacity));
}

// ── Axis indicators ──
const axisLen = 500;
const _axes = [];
const _gridHelpers = [];

function makeAxis(points, color) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
}
_axes.push(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLen, 0, 0)], 0xff3333));
_axes.push(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLen, 0)], 0x33ff33));
_axes.push(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLen)], 0x3333ff));
_axes.forEach((a) => {
  scene.add(a);
});

// ── Grid ──
const gridHelper = new THREE.GridHelper(2000, 40, 0x333355, 0x222244);
_gridHelpers.push(gridHelper);
scene.add(gridHelper);

// ── Grid/axes toggle ──
export function setGridVisible(visible) {
  _axes.forEach((a) => {
    a.visible = visible;
  });
  _gridHelpers.forEach((g) => {
    g.visible = visible;
  });
}
setGridVisible(state.gridVisible);

// ── Ground plane toggle ──
export function setGroundVisible(visible) {
  if (groundPlane) groundPlane.visible = visible;
}

// ── Water plane toggle ──
export function setWaterVisible(visible) {
  if (waterPlane) waterPlane.visible = visible;
}

function applyVisualGroupSuppression() {
  const stats = {
    hidden: 0,
    pointCloud: 0,
    degenerate: 0,
    unlinked: 0,
    placeholderTexture: 0,
    lowConfidence: 0,
  };
  for (const group of state.worldGroups || []) {
    const previousReason = group.userData?.visualSuppressionReason || "";
    const reason = visualGroupSuppressionReason(group.userData, {
      pointCloudsVisible: state.pointCloudsVisible,
      hideDegenerateGroups: state.hideDegenerateGroups,
      hideUnlinkedGroups: state.hideUnlinkedGroups,
      hidePlaceholderTextureGroups: state.hidePlaceholderTextureGroups,
      hideLowConfidenceGroups: state.hideLowConfidenceGroups,
    });

    if (reason) {
      group.visible = false;
      stats.hidden++;
      if (reason === "point-cloud") stats.pointCloud++;
      if (reason === "degenerate") stats.degenerate++;
      if (reason === "unlinked") stats.unlinked++;
      if (reason === "placeholder-texture") stats.placeholderTexture++;
      if (reason === "low-confidence") stats.lowConfidence++;
    } else if (previousReason) {
      group.visible = true;
    }
    group.userData.visualSuppressionReason = reason;
  }
  state.visualSuppressionStats = stats;
}

function hasOwnOption(options, key) {
  return Object.prototype.hasOwnProperty.call(options, key);
}

// ── Point-only group toggle ──
export function setPointCloudsVisible(visible) {
  const enabled = Boolean(visible);
  state.pointCloudsVisible = enabled;

  for (const group of state.worldGroups || []) {
    group.traverse((child) => {
      if (child.isPoints && !child.userData?.isLodProxy) {
        child.visible = enabled;
      }
    });
  }
  applyVisualGroupSuppression();
}

export function setVisualGroupSuppression(options = {}) {
  if (hasOwnOption(options, "hideDegenerateGroups")) {
    state.hideDegenerateGroups = Boolean(options.hideDegenerateGroups);
  }
  if (hasOwnOption(options, "hideUnlinkedGroups")) {
    state.hideUnlinkedGroups = Boolean(options.hideUnlinkedGroups);
  }
  if (hasOwnOption(options, "hidePlaceholderTextureGroups")) {
    state.hidePlaceholderTextureGroups = Boolean(options.hidePlaceholderTextureGroups);
  }
  if (hasOwnOption(options, "hideLowConfidenceGroups")) {
    state.hideLowConfidenceGroups = Boolean(options.hideLowConfidenceGroups);
  }
  applyVisualGroupSuppression();
}

export function setDegenerateGroupsHidden(hidden) {
  setVisualGroupSuppression({ hideDegenerateGroups: hidden });
}

let groundPlane = null;
let waterPlane = null;
const _textureAssignments = [];
const _loadedTexturesByKey = new Map();
const _visualFilterBox = new THREE.Box3();
const _visualFilterSize = new THREE.Vector3();
const _visibleWorldBox = new THREE.Box3();
const _visibleWorldSize = new THREE.Vector3();
const _visibleWorldCenter = new THREE.Vector3();
let _textureDiscoveryDisabled = false;
let _textureStats = null;
export const waterUniforms = {
  uTime: { value: 0 },
  uOpacity: { value: 1.0 },
  uEnvMap: { value: null },
  uHasEnvMap: { value: false },
  uReflectStrength: { value: 0.4 },
  uCameraPos: { value: new THREE.Vector3() },
};

function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

/** Return read-only world visibility state for smoke tests and diagnostics. */
export function getWorldVisibilityState() {
  let worldMeshCount = 0;
  let visibleWorldGroupCount = 0;
  let visibleWorldMeshCount = 0;
  let pointCloudGroupCount = 0;
  let visiblePointCloudGroupCount = 0;
  let degenerateGroupCount = 0;
  let visibleDegenerateGroupCount = 0;
  let unlinkedGroupCount = 0;
  let visibleUnlinkedGroupCount = 0;
  let placeholderTextureGroupCount = 0;
  let visiblePlaceholderTextureGroupCount = 0;
  let lowConfidenceGroupCount = 0;
  let visibleLowConfidenceGroupCount = 0;
  let wireframeMaterialCount = 0;
  let nonWireframeMaterialCount = 0;

  for (const group of state.worldGroups) {
    const groupVisible = group.visible !== false;
    if (groupVisible) visibleWorldGroupCount++;
    if (group.userData?.isPointOnlyGroup) {
      pointCloudGroupCount++;
      if (groupVisible) visiblePointCloudGroupCount++;
    }
    if (group.userData?.isDegenerateVisualGroup) {
      degenerateGroupCount++;
      if (groupVisible) visibleDegenerateGroupCount++;
    }
    if (group.userData?.isUnlinkedVisualGroup) {
      unlinkedGroupCount++;
      if (groupVisible) visibleUnlinkedGroupCount++;
    }
    if (group.userData?.isPlaceholderTextureGroup) {
      placeholderTextureGroupCount++;
      if (groupVisible) visiblePlaceholderTextureGroupCount++;
    }
    if (group.userData?.isLowConfidenceVisualGroup) {
      lowConfidenceGroupCount++;
      if (groupVisible) visibleLowConfidenceGroupCount++;
    }
    group.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      worldMeshCount++;
      if (groupVisible && child.visible !== false) visibleWorldMeshCount++;
      for (const material of materialList(child.material)) {
        if (material?.wireframe) wireframeMaterialCount++;
        else nonWireframeMaterialCount++;
      }
    });
  }

  return {
    axisCount: _axes.length,
    gridHelperCount: _gridHelpers.length,
    axesVisible: _axes.every((axis) => axis.visible),
    gridHelpersVisible: _gridHelpers.every((helper) => helper.visible),
    gridVisible:
      _axes.length > 0 &&
      _gridHelpers.length > 0 &&
      _axes.every((axis) => axis.visible) &&
      _gridHelpers.every((helper) => helper.visible),
    groundVisible: groundPlane ? groundPlane.visible : null,
    waterVisible: waterPlane ? waterPlane.visible : null,
    pointCloudsVisible: state.pointCloudsVisible,
    hideDegenerateGroups: state.hideDegenerateGroups,
    hideUnlinkedGroups: state.hideUnlinkedGroups,
    hidePlaceholderTextureGroups: state.hidePlaceholderTextureGroups,
    hideLowConfidenceGroups: state.hideLowConfidenceGroups,
    pointCloudGroupCount,
    visiblePointCloudGroupCount,
    degenerateGroupCount,
    visibleDegenerateGroupCount,
    unlinkedGroupCount,
    visibleUnlinkedGroupCount,
    placeholderTextureGroupCount,
    visiblePlaceholderTextureGroupCount,
    lowConfidenceGroupCount,
    visibleLowConfidenceGroupCount,
    visualSuppressionStats: state.visualSuppressionStats,
    worldGroupCount: state.worldGroups.length,
    visibleWorldGroupCount,
    worldMeshCount,
    visibleWorldMeshCount,
    wireframeMaterialCount,
    nonWireframeMaterialCount,
    allWorldMaterialsWireframe: worldMeshCount > 0 && nonWireframeMaterialCount === 0,
  };
}

/** Apply the scene environment map to the water shader for reflections. */
export function updateWaterEnvMap(envMap) {
  waterUniforms.uEnvMap.value = envMap;
  waterUniforms.uHasEnvMap.value = !!envMap;
}

/** Adjust water reflection strength (0–1). */
export function applyWaterReflectStrength(val) {
  waterUniforms.uReflectStrength.value = Math.max(0, Math.min(1, val));
}

function configureLoadedTexture(texture, role, anisotropy) {
  texture.colorSpace = role === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
}

function textureJobKey(role, url) {
  return `${role}|${url}`;
}

function textureMapKeyFromObjectName(name) {
  const firstSegment = (name || "").split("/")[0];
  if (!firstSegment) return "";
  let nifHash = firstSegment.replace(".json", "").replace("decode-nif-geometry-", "");
  if (nifHash.startsWith("ptonly_")) nifHash = nifHash.slice(7);
  return /^[0-9a-f]{16}$/.test(nifHash) ? nifHash : "";
}

function textureMapKeyForObject(object) {
  let current = object;
  while (current) {
    const nifHash = textureMapKeyFromObjectName(current.name);
    if (nifHash) return nifHash;
    current = current.parent;
  }
  return "";
}

function textureMapUrls(nifHash) {
  if (!nifHash || typeof TEXTURE_MAP === "undefined" || !Array.isArray(TEXTURE_MAP)) return [];
  return TEXTURE_MAP.filter((entry) => entry?.pattern === nifHash)
    .map((entry) => entry?.url)
    .filter((url) => typeof url === "string" && url.length > 0);
}

function textureQualitySettings() {
  const quality = normalizeTextureQuality(state.textureQuality);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  return {
    quality,
    maxAnisotropy,
    anisotropy: textureQualityAnisotropy(maxAnisotropy, quality),
    loadsTextures: textureQualityLoadsTextures(quality),
  };
}

function markTextureForRuntimeFilterUpdate(texture, anisotropy) {
  if (!texture) return;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
}

function assignMaterialTexture(material, key, texture) {
  if (!material || material[key] === texture) return false;
  material[key] = texture;
  material.needsUpdate = true;
  return true;
}

function setStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function textureStatsSuffix(failedCount) {
  return failedCount > 0 ? ` (${failedCount} failed)` : "";
}

function updateTextureStatsDisplay(settings) {
  if (!textureQualityLoadsTextures(settings.quality)) {
    setStat("stat-textures", "off");
    return;
  }
  if (_textureDiscoveryDisabled && _loadedTexturesByKey.size === 0) {
    setStat("stat-textures", "reload");
    return;
  }
  if (!_textureStats || _textureStats.total === 0) {
    setStat("stat-textures", "0");
    return;
  }
  setStat(
    "stat-textures",
    `${_textureStats.loaded}/${_textureStats.total} / ${settings.anisotropy}x${textureStatsSuffix(_textureStats.failed)}`,
  );
}

export function applyTextureQuality(quality = state.textureQuality) {
  state.textureQuality = normalizeTextureQuality(quality);
  const settings = textureQualitySettings();
  let changedMaterials = 0;

  if (!settings.loadsTextures) {
    for (const { mesh, color, normal } of _textureAssignments) {
      if (!mesh.material) continue;
      if (color) changedMaterials += assignMaterialTexture(mesh.material, "map", null) ? 1 : 0;
      if (normal) changedMaterials += assignMaterialTexture(mesh.material, "normalMap", null) ? 1 : 0;
    }
    updateTextureStatsDisplay(settings);
    return {
      quality: settings.quality,
      anisotropy: settings.anisotropy,
      changedMaterials,
      reloadRequired: false,
      loadedTextures: _loadedTexturesByKey.size,
    };
  }

  if (_textureDiscoveryDisabled && _loadedTexturesByKey.size === 0) {
    updateTextureStatsDisplay(settings);
    return {
      quality: settings.quality,
      anisotropy: settings.anisotropy,
      changedMaterials,
      reloadRequired: true,
      loadedTextures: 0,
    };
  }

  for (const texture of _loadedTexturesByKey.values()) {
    markTextureForRuntimeFilterUpdate(texture, settings.anisotropy);
  }
  for (const { mesh, color, normal } of _textureAssignments) {
    if (!mesh.material) continue;
    if (color) {
      const texture = _loadedTexturesByKey.get(textureJobKey("color", color)) || null;
      if (texture) changedMaterials += assignMaterialTexture(mesh.material, "map", texture) ? 1 : 0;
    }
    if (normal) {
      const texture = _loadedTexturesByKey.get(textureJobKey("normal", normal)) || null;
      if (texture) changedMaterials += assignMaterialTexture(mesh.material, "normalMap", texture) ? 1 : 0;
    }
  }
  updateTextureStatsDisplay(settings);
  return {
    quality: settings.quality,
    anisotropy: settings.anisotropy,
    changedMaterials,
    reloadRequired: false,
    loadedTextures: _loadedTexturesByKey.size,
  };
}

function hasRenderableGeometry(object) {
  return (object.isMesh || object.isPoints) && object.geometry?.getAttribute("position")?.count > 0;
}

function containsRenderableGeometry(object) {
  let found = false;
  object.traverse((child) => {
    if (hasRenderableGeometry(child)) found = true;
  });
  return found;
}

function normalizedGroupName(group) {
  const name = group?.name || "";
  return name.startsWith("o ") ? name.slice(2) : name;
}

function isPointOnlyGroup(group) {
  return normalizedGroupName(group).startsWith("ptonly_");
}

function meshFaceCount(mesh) {
  if (!mesh.isMesh || !mesh.geometry) return 0;
  const position = mesh.geometry.getAttribute("position");
  if (!position?.count) return 0;
  const index = mesh.geometry.index;
  return index ? index.count / 3 : position.count / 3;
}

function groupMeshFaceCount(group) {
  let faces = 0;
  group.traverse((child) => {
    faces += meshFaceCount(child);
  });
  return faces;
}

function groupVisualExtents(group) {
  _visualFilterBox.setFromObject(group);
  if (_visualFilterBox.isEmpty()) return null;
  _visualFilterBox.getSize(_visualFilterSize);
  return { x: _visualFilterSize.x, y: _visualFilterSize.y, z: _visualFilterSize.z };
}

function markVisualGroupMetadata(group) {
  const faceCount = groupMeshFaceCount(group);
  const extents = groupVisualExtents(group);
  const textureMapKey = textureMapKeyForObject(group);
  const textureUrls = textureMapUrls(textureMapKey);
  const textureCount = textureUrls.length;
  const textureSet = chooseTextureSet(textureUrls);
  group.userData.visualFaceCount = faceCount;
  group.userData.visualExtents = extents;
  group.userData.textureMapKey = textureMapKey;
  group.userData.textureMapCount = textureCount;
  group.userData.textureMapColorUrl = textureSet.color || "";
  group.userData.isDegenerateVisualGroup =
    !group.userData?.isPointOnlyGroup && faceCount > 0 && isDegenerateVisualExtents(extents);
  group.userData.isUnlinkedVisualGroup =
    !group.userData?.isPointOnlyGroup &&
    !group.userData.isDegenerateVisualGroup &&
    isUnlinkedVisualGroup({
      faceCount,
      hasNifHash: Boolean(textureMapKey),
      hasTextureMap: textureCount > 0,
    });
  group.userData.isPlaceholderTextureGroup =
    !group.userData?.isPointOnlyGroup &&
    !group.userData.isDegenerateVisualGroup &&
    !group.userData.isUnlinkedVisualGroup &&
    isPlaceholderTextureUrl(textureSet.color);
  group.userData.isLowConfidenceVisualGroup =
    !group.userData?.isPointOnlyGroup &&
    !group.userData.isDegenerateVisualGroup &&
    !group.userData.isUnlinkedVisualGroup &&
    !group.userData.isPlaceholderTextureGroup &&
    isCompactLowConfidenceVisualGroup({
      faceCount,
      extents,
      hasNifHash: Boolean(textureMapKey),
      hasTextureMap: textureCount > 0,
    });
}

function visibleWorldBox() {
  _visibleWorldBox.makeEmpty();
  for (const group of state.worldGroups || []) {
    if (group.visible !== false) _visibleWorldBox.expandByObject(group);
  }
  return _visibleWorldBox.isEmpty() ? null : _visibleWorldBox;
}

function frameCameraToVisibleWorld(fallbackMaxDim) {
  const box = visibleWorldBox();
  if (!box) {
    const span = Math.max(fallbackMaxDim, 1000);
    camera.position.set(0, span * 0.3, span * 0.6);
    camera.lookAt(0, 0, 0);
    return;
  }

  box.getSize(_visibleWorldSize);
  box.getCenter(_visibleWorldCenter);
  const span = Math.max(_visibleWorldSize.x, _visibleWorldSize.y, _visibleWorldSize.z, 6);
  camera.near = Math.min(1, span / 100);
  camera.far = Math.max(10000, span * 8);
  camera.position.set(
    _visibleWorldCenter.x,
    _visibleWorldCenter.y + span * 0.45,
    _visibleWorldCenter.z + span * 0.9,
  );
  camera.lookAt(_visibleWorldCenter);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function collectWorldGroups(root) {
  const existingGroups = root.children.filter((child) => child.isGroup && containsRenderableGeometry(child));
  if (existingGroups.length > 0) return existingGroups;

  const directRenderables = root.children.filter(hasRenderableGeometry);
  return directRenderables.map((child, index) => {
    const group = new THREE.Group();
    group.name = child.name || `world_group_${index + 1}`;
    root.add(group);
    group.add(child);
    return group;
  });
}

// ── OBJ Loading ──
const loadingEl = document.getElementById("loading");
const progressBar = document.getElementById("progress-bar-inner");
const progressText = document.getElementById("progress-text");
const progressEta = document.getElementById("progress-eta");
const legendEl = document.getElementById("legend");
const infoEl = document.getElementById("info");

let loadStartTime = 0;
let loadFileSize = 0;
let loadEndTime = 0;

const loader = new OBJLoader();
loader.load(
  "merged.obj",
  (obj) => {
    try {
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Store world bounds for minimap
    state.worldBounds = {
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    };
    obj.position.sub(center);
    state.worldBounds.minX -= center.x;
    state.worldBounds.maxX -= center.x;
    state.worldBounds.minZ -= center.z;
    state.worldBounds.maxZ -= center.z;

    // Color-code each logical group. OBJLoader may return either Group
    // wrappers or direct Mesh/Points children depending on the OBJ shape.
    const children = collectWorldGroups(obj);
    children.forEach((group) => {
      group.userData.isPointOnlyGroup = isPointOnlyGroup(group);
      markVisualGroupMetadata(group);
    });
    state.groupColors = children.map((_, i) => groupColor(i));

    const groupIndexMap = new Map(children.map((group, index) => [group, index]));
    obj.traverse((child) => {
      let groupIdx = 0;
      let groupObj = null;
      let p = child;
      while (p && p !== obj) {
        if (groupIndexMap.has(p)) {
          groupIdx = groupIndexMap.get(p);
          groupObj = p;
          break;
        }
        p = p.parent;
      }
      const color = state.groupColors[groupIdx] || new THREE.Color(0x889999);
      const groupName = normalizedGroupName(groupObj) || child.name || "";
      const materialColor = groupObj?.userData?.textureMapCount > 0 ? new THREE.Color(0xffffff) : color;

      if (child.isMesh) {
        // Skip meshes with no geometry or zero vertices (corrupt data)
        if (!child.geometry?.getAttribute("position")) return;
        const posCount = child.geometry.getAttribute("position").count;
        if (posCount === 0) return;

        // PBR: vary roughness/metalness by group type
        // terrain → rough/matte, structures → slightly reflective, ptonly → fully rough
        const isPtonly = groupName.startsWith("ptonly_");
        const isTerrain =
          groupName.toLowerCase().includes("terrain") || groupName.toLowerCase().includes("ground");
        const roughness = isPtonly ? 1.0 : isTerrain ? 0.75 : 0.4;
        const metalness = isPtonly ? 0.0 : isTerrain ? 0.02 : 0.08;

        child.material = new THREE.MeshStandardMaterial({
          color: materialColor,
          roughness,
          metalness,
          flatShading: false,
          side: THREE.DoubleSide,
          envMapIntensity: 0.35,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      } else if (child.isPoints) {
        if (!child.geometry?.getAttribute("position")) return;
        if (child.geometry.getAttribute("position").count === 0) return;

        child.material = new THREE.PointsMaterial({
          color,
          size: 1.5,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.8,
        });
      }
    });

    scene.add(obj);
    state.worldGroups = children;
    window.worldGroups = children;

    // Pre-compute minimap centroids for all world groups
    const tmpVec = new THREE.Vector3();
    const tmpBox = new THREE.Box3();
    state.minimapCentroids = children.map((g) => {
      tmpBox.setFromObject(g);
      const c = tmpBox.getCenter(tmpVec);
      return { x: c.x, z: c.z };
    });

    // Build mesh-to-group lookup for raycast selection
    children.forEach((g) => {
      g.traverse((child) => {
        if (child.isMesh || child.isPoints) state.meshToGroup.set(child, g);
      });
    });

    // Ground plane at world bottom
    const groundY = box.min.y - center.y;
    const groundGeo = new THREE.PlaneGeometry(size.x * 1.1, size.z * 1.1);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0x1a1a2e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: state.groundOpacity,
    });
    state.worldGroundY = groundY;
    _groundMat = groundMat;
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.set(0, groundY - 0.5, 0);
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Animated water plane at Y=0
    const waterGeo = new THREE.PlaneGeometry(size.x * 1.15, size.z * 1.15, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);
    // Try shader material first; fall back to Standard if shader compilation fails
    let waterMat;
    try {
      waterUniforms.uEnvMap.value = scene.environment || null;
      waterUniforms.uHasEnvMap.value = !!scene.environment;
      waterMat = new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        vertexShader: `
          uniform float uTime;
          uniform vec3 uCameraPos;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeight;
          varying vec3 vViewDir;
          void main() {
            vec3 pos = position;
            // Gerstner-style waves
            float t = uTime;
            float wave1 = sin(pos.x * 0.006 + t * 1.1) * cos(pos.z * 0.005 + t * 0.8) * 3.5;
            float wave2 = sin(pos.x * 0.013 - t * 0.9) * sin(pos.z * 0.011 + t * 1.2) * 2.5;
            float wave3 = cos((pos.x + pos.z) * 0.004 + t * 0.5) * 5.0;
            float wave4 = sin(pos.x * 0.025 + t * 1.5) * cos(pos.z * 0.022 - t * 0.7) * 1.2;
            pos.y += wave1 + wave2 + wave3 + wave4;
            vHeight = pos.y;

            // Approximate normals for reflections
            float eps = 0.5;
            float nx = (sin((pos.x + eps) * 0.006 + t * 1.1) * cos(pos.z * 0.005 + t * 0.8) * 3.5
                       - sin((pos.x - eps) * 0.006 + t * 1.1) * cos(pos.z * 0.005 + t * 0.8) * 3.5) / (eps * 2.0);
            float nz = (sin(pos.x * 0.006 + t * 1.1) * cos((pos.z + eps) * 0.005 + t * 0.8) * 3.5
                       - sin(pos.x * 0.006 + t * 1.1) * cos((pos.z - eps) * 0.005 + t * 0.8) * 3.5) / (eps * 2.0);
            vec3 approxNormal = normalize(vec3(-nx, 1.0, -nz));

            vec4 worldPos = modelMatrix * vec4(pos, 1.0);
            vWorldPos = worldPos.xyz;
            vWorldNormal = normalize(mat3(modelMatrix) * approxNormal);
            vViewDir = normalize(uCameraPos - worldPos.xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          uniform float uReflectStrength;
          uniform bool uHasEnvMap;
          #ifdef HAS_ENVMAP
          uniform samplerCube uEnvMap;
          #endif
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying float vHeight;
          varying vec3 vViewDir;
          void main() {
            // Fresnel: glancing angles = more reflective
            float fresnel = pow(1.0 - abs(dot(normalize(vViewDir), normalize(vWorldNormal))), 3.5);
            fresnel = clamp(fresnel, 0.05, 0.85);

            // Environment reflection
            vec3 reflectDir = reflect(-normalize(vViewDir), normalize(vWorldNormal));
            vec3 envColor = vec3(0.1, 0.35, 0.55); // fallback water color
            #ifdef HAS_ENVMAP
            if (uHasEnvMap) {
              envColor = textureCube(uEnvMap, reflectDir).rgb;
            }
            #endif

            // Water base color (shallow vs deep)
            float h = vHeight / 10.0;
            vec3 shallow = vec3(0.12, 0.4, 0.6);
            vec3 deep = vec3(0.03, 0.1, 0.25);
            vec3 waterColor = mix(deep, shallow, smoothstep(-1.0, 1.0, h));

            // Mix reflection with water color via Fresnel
            float refl = fresnel * uReflectStrength;
            vec3 color = mix(waterColor, envColor, refl);

            // Foam on wave peaks
            float foam = smoothstep(0.6, 1.2, abs(vHeight));
            color = mix(color, vec3(0.85, 0.9, 0.95), foam * 0.3);

            float alpha = (0.5 + h * 0.15 + fresnel * 0.2) * uOpacity;
            alpha = clamp(alpha, 0.15, 0.75);
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
      });
    } catch (_) {
      // Shader compilation failed — fall back to a translucent Standard material
      console.warn("Water shader compilation failed, using fallback material");
      waterMat = new THREE.MeshStandardMaterial({
        color: 0x1a5588,
        roughness: 0.2,
        metalness: 0.4,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    waterPlane = new THREE.Mesh(waterGeo, waterMat);
    waterPlane.position.y = 0;
    scene.add(waterPlane);
    state.waterPlane = waterPlane;

    // Create atmospheric dust particles after world bounds are known
    createParticles();

    // Track load time
    loadEndTime = Date.now();

    // Count vertices and faces from children
    let totalVerts = 0;
    let totalFaces = 0;
    children.forEach((g) => {
      g.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const posAttr = child.geometry.getAttribute("position");
          if (posAttr) totalVerts += posAttr.count;
          const idx = child.geometry.index;
          totalFaces += idx ? idx.count / 3 : posAttr ? posAttr.count / 3 : 0;
        } else if (child.isPoints && child.geometry) {
          const posAttr = child.geometry.getAttribute("position");
          if (posAttr) totalVerts += posAttr.count;
        }
      });
    });

    loadingEl.classList.add("hidden");
    const statusEl = document.getElementById("load-status");
    if (statusEl) {
      statusEl.textContent = "\u2713";
      statusEl.className = "ok";
    }

    // Group counts
    const ptonlyCount = children.filter(isPointOnlyGroup).length;
    const facedCount = children.length - ptonlyCount;

    // Populate stats panel
    const loadTime = ((loadEndTime - loadStartTime) / 1000).toFixed(1);
    const fileSizeMB =
      loadFileSize > 0 ? `${(loadFileSize / (1024 * 1024)).toFixed(2)} MB` : "\u2014";
    setStat("stat-filesize", fileSizeMB);
    setStat("stat-loadtime", `${loadTime}s`);
    setStat("stat-groups", children.length);
    setStat("stat-faced", facedCount);
    setStat("stat-ptonly", ptonlyCount);
    setStat("stat-verts", totalVerts.toLocaleString());
    setStat("stat-faces", Math.round(totalFaces).toLocaleString());
    setStat("stat-worldx", size.x.toFixed(0));
    setStat("stat-worldz", size.z.toFixed(0));

    // Legend — preserve original indices through filtering so colors match.
    // Groups are clickable to toggle visibility (strikethrough = hidden).
    const topGroups = children
      .map((g, origIdx) => ({ g, origIdx }))
      .filter(({ g }) => normalizedGroupName(g) && !isPointOnlyGroup(g))
      .slice(0, 12)
      .map(({ g, origIdx }) => {
        const c = state.groupColors[origIdx];
        const name = (normalizedGroupName(g) || "?").slice(0, 30);
        return (
          `<span class="legend-entry" data-group="${origIdx}" style="cursor:pointer;color:#${c.getHexString()}">` +
          `&#9632;</span> <span class="legend-name">${name}</span>`
        );
      });
    legendEl.innerHTML =
      topGroups.join("<br>") +
      (facedCount > 12 ? `<br>... +${facedCount - 12} more faced` : "") +
      `<br><span style="color:#555;font-size:9px">Click=toggle &bull; Shift+click=teleport</span>` +
      (ptonlyCount > 0 ? `<br><span style="color:#aac">. ${ptonlyCount} point clouds</span>` : "");

    // Click-to-toggle group visibility, shift+click to teleport
    legendEl.style.pointerEvents = "auto";
    legendEl.addEventListener("click", (e) => {
      const entry = e.target.closest(".legend-entry");
      if (!entry) return;
      const idx = parseInt(entry.dataset.group, 10);
      if (Number.isNaN(idx) || !children[idx]) return;
      const group = children[idx];

      if (e.shiftKey) {
        flyToGroup(group);
        // Also make sure the group is visible
        if (!group.visible) {
          group.visible = true;
          const nameSpan = entry.nextElementSibling;
          if (nameSpan) {
            nameSpan.style.textDecoration = "";
            nameSpan.style.opacity = "";
          }
          entry.style.opacity = "";
        }
        return;
      }

      // Normal click: toggle visibility
      group.visible = !group.visible;
      const nameSpan = entry.nextElementSibling;
      if (nameSpan) {
        nameSpan.style.textDecoration = group.visible ? "" : "line-through";
        nameSpan.style.opacity = group.visible ? "" : "0.4";
      }
      entry.style.opacity = group.visible ? "" : "0.4";
    });

    infoEl.innerHTML =
      "Groups: <span>" +
      children.length +
      "</span> | " +
      "World: <span>" +
      size.x.toFixed(0) +
      " x " +
      size.z.toFixed(0) +
      "</span> | " +
      'Speed: <span id="speedval">50</span>';

    // Apply persisted visibility toggles (loaded from state by main.js)
    setGridVisible(state.gridVisible);
    setGroundVisible(state.groundVisible);
    setWaterVisible(state.waterVisible);
    setPointCloudsVisible(state.pointCloudsVisible);
    setVisualGroupSuppression({
      hideDegenerateGroups: state.hideDegenerateGroups,
      hideUnlinkedGroups: state.hideUnlinkedGroups,
      hidePlaceholderTextureGroups: state.hidePlaceholderTextureGroups,
      hideLowConfidenceGroups: state.hideLowConfidenceGroups,
    });
    if (state.wireframeMode) {
      children.forEach((g) => {
        g.traverse((child) => {
          if (child.isMesh && child.material.wireframe !== undefined) {
            child.material.wireframe = true;
          }
        });
      });
    }

    buildLodProxies(children);

    // -- Texture Discovery -- apply linked textures from TEXTURE_MAP
    // TEXTURE_MAP loaded via <script> tag in flythrough.html: { pattern: "nif_hash", url: "path/to/png" }
    _textureAssignments.length = 0;
    _loadedTexturesByKey.clear();
    _textureDiscoveryDisabled = false;
    _textureStats = null;
    const textureSettings = textureQualitySettings();
    if (!textureSettings.loadsTextures) {
      _textureDiscoveryDisabled = true;
      setStat("stat-textures", "off");
      console.log("Texture discovery: disabled by texture quality setting");
    } else if (typeof TEXTURE_MAP !== "undefined" && TEXTURE_MAP.length > 0) {
      const textureLookup = new Map();
      for (const entry of TEXTURE_MAP) {
        if (!textureLookup.has(entry.pattern)) textureLookup.set(entry.pattern, []);
        textureLookup.get(entry.pattern).push(entry.url);
      }

      const texLoader = new THREE.TextureLoader();
      const meshTextureMap = [];
      const groupsMissing = new Set();

      obj.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        if (!child.geometry?.getAttribute("uv")) return;
        const nifHash = textureMapKeyForObject(child);
        if (nifHash) {
          const urls = textureLookup.get(nifHash);
          if (urls?.length) meshTextureMap.push({ mesh: child, ...chooseTextureSet(urls) });
          else if (!groupsMissing.has(nifHash)) groupsMissing.add(nifHash);
        }
      });

      if (groupsMissing.size > 0) {
        console.log("Texture discovery:", groupsMissing.size, "groups without linked textures");
        console.log("Sample missing:", [...groupsMissing].slice(0, 5));
      }

      if (meshTextureMap.length > 0) {
        _textureAssignments.push(...meshTextureMap);
        const textureJobs = [
          ...new Set(
            meshTextureMap.flatMap((entry) => {
              const urls = [];
              if (entry.color) urls.push(`color|${entry.color}`);
              if (entry.normal) urls.push(`normal|${entry.normal}`);
              return urls;
            }),
          ),
        ].map((job) => {
          const [role, url] = job.split("|");
          return { role, url };
        });
        if (textureJobs.length === 0) {
          setStat("stat-textures", "0");
          console.warn("Texture discovery: no supported color or normal texture maps found");
        } else {
          _textureStats = {
            loaded: 0,
            failed: 0,
            total: textureJobs.length,
            color: 0,
            normal: 0,
          };
          let loadedCount = 0;
          let failedCount = 0;
          let colorMeshCount = 0;
          let normalMeshCount = 0;
          const finishTextureJob = () => {
            if (loadedCount + failedCount !== textureJobs.length) return;
            _textureStats.loaded = loadedCount;
            _textureStats.failed = failedCount;
            _textureStats.color = colorMeshCount;
            _textureStats.normal = normalMeshCount;
            updateTextureStatsDisplay(textureQualitySettings());
            console.log(
              "Texture discovery:",
              `${textureJobs.length} textures`,
              `loaded=${loadedCount}`,
              `failed=${failedCount}`,
              `color=${colorMeshCount}`,
              `normal=${normalMeshCount}`,
              `quality=${textureSettings.quality}`,
              `anisotropy=${textureSettings.anisotropy}`,
              `maxAnisotropy=${textureSettings.maxAnisotropy}`,
            );
          };
          for (const { role, url } of textureJobs) {
            texLoader.load(
              url,
              (tex) => {
                configureLoadedTexture(tex, role, textureSettings.anisotropy);
                _loadedTexturesByKey.set(textureJobKey(role, url), tex);
                loadedCount++;
                let applied = 0;
                for (const { mesh, color, normal } of meshTextureMap) {
                  if (role === "color" && color === url && mesh.material) {
                    mesh.material.map = tex;
                    mesh.material.needsUpdate = true;
                    applied++;
                  } else if (role === "normal" && normal === url && mesh.material) {
                    mesh.material.normalMap = tex;
                    mesh.material.needsUpdate = true;
                    applied++;
                  }
                }
                if (role === "color") colorMeshCount += applied;
                else if (role === "normal") normalMeshCount += applied;

                finishTextureJob();
              },
              undefined,
              () => {
                failedCount++;
                console.warn(`Texture discovery: failed ${url}`);
                finishTextureJob();
              },
            );
          }
        }
      } else {
        setStat("stat-textures", "0");
        console.warn("Texture discovery: no mesh-to-texture matches found");
      }
    } else {
      setStat("stat-textures", "not loaded");
      console.warn("Texture discovery: TEXTURE_MAP not loaded");
    }
    frameCameraToVisibleWorld(maxDim);

    // Initialize zone location labels after scene is fully loaded
    initCalibrate();
    Promise.all([initZoneLabels(), initZoneOverlays()]).then(() => { applySavedPositions(); initZoneFilter(); }).catch(err => console.warn("Zone init failed:", err));
    } catch (e) { console.error("World init failed:", e); const co = document.getElementById("crash-overlay"); if (co) { co.classList.add("active"); const cm = co.querySelector(".crash-msg"); if (cm) cm.textContent = "World init: " + (e?.message || e); } }
  },
  (xhr) => {
    if (xhr.total > 0) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressText) progressText.textContent = `${pct}%`;

      // ETA calculation
      if (!loadStartTime) {
        loadStartTime = Date.now();
        loadFileSize = xhr.total;
      }
      if (loadStartTime && pct > 0 && pct < 100) {
        const elapsed = Math.max((Date.now() - loadStartTime) / 1000, 0.001);
        const bytesPerSec = xhr.loaded / elapsed;
        const remaining = (xhr.total - xhr.loaded) / bytesPerSec;
        if (progressEta) {
          if (remaining > 60)
            progressEta.textContent = `~${Math.round(remaining / 60)} min remaining`;
          else progressEta.textContent = `~${Math.round(remaining)}s remaining`;
        }
      }
    }
  },
  (err) => {
    // Show a user-visible error with recovery instructions
    const msg = err.message || String(err);
    loadingEl.innerHTML =
      '<div style="text-align:center;max-width:500px">' +
      '<p style="color:#f44;font-size:1.1em;margin-bottom:8px">Failed to load world geometry</p>' +
      '<p style="color:#aaa;font-size:0.85em;margin-bottom:6px">' +
      msg +
      "</p>" +
      '<p style="color:#888;font-size:0.75em">' +
      "The file <code>merged.obj</code> may be missing or corrupt.<br>" +
      "Run <code>python validate_obj.py</code> to check integrity,<br>" +
      "or <code>python merge_objs.py</code> to rebuild from exports." +
      "</p></div>";
    loadingEl.style.display = "flex";
    loadingEl.classList.remove("hidden");
    const statusEl = document.getElementById("load-status");
    if (statusEl) { statusEl.textContent = "\u2717"; statusEl.className = "err"; }
    console.error("OBJ load error:", err);
  },
);
