// Distance-based LOD proxies for world groups.

import * as THREE from "three";
import { state } from "./state.js";

const MAX_PROXY_POINTS = 800;
const LOD_UPDATE_INTERVAL = 8;

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _vertex = new THREE.Vector3();

let _frame = 0;
let _lodApplied = false;

function isRenderable(child) {
  return (child.isMesh || child.isPoints) && !child.userData?.isLodProxy;
}

function collectRenderables(group) {
  const renderables = [];
  group.traverse((child) => {
    if (child !== group && isRenderable(child)) renderables.push(child);
  });
  return renderables;
}

function createProxy(group, color) {
  const meshes = [];
  let totalVertices = 0;

  group.traverse((child) => {
    if (!child.isMesh || child.userData?.isLodProxy) return;
    const position = child.geometry?.getAttribute("position");
    if (!position?.count) return;
    meshes.push({ mesh: child, position });
    totalVertices += position.count;
  });

  if (!meshes.length || totalVertices === 0) return null;

  const stride = Math.max(1, Math.ceil(totalVertices / MAX_PROXY_POINTS));
  const positions = [];

  group.updateWorldMatrix(true, true);
  for (const { mesh, position } of meshes) {
    for (let i = 0; i < position.count; i += stride) {
      _vertex.fromBufferAttribute(position, i);
      mesh.localToWorld(_vertex);
      group.worldToLocal(_vertex);
      positions.push(_vertex.x, _vertex.y, _vertex.z);
    }
  }

  if (positions.length < 3) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color,
    size: 2.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const proxy = new THREE.Points(geometry, material);
  proxy.name = `${group.name || "group"}-lod-proxy`;
  proxy.visible = false;
  proxy.userData.isLodProxy = true;
  group.add(proxy);
  return proxy;
}

function setEntryLevel(entry, level) {
  if (entry.level === level) return;
  entry.level = level;

  const showOriginal = level === "near" || (level === "proxy" && !entry.proxy);
  const showProxy = level === "proxy" && Boolean(entry.proxy);

  for (const child of entry.renderables) {
    child.visible = showOriginal;
  }
  if (entry.proxy) {
    entry.proxy.visible = showProxy;
  }
}

function updateLodStats(near, proxy, hidden) {
  state.lodStats = { near, proxy, hidden };
  const el = document.getElementById("stat-lod");
  if (el) el.textContent = `${near} / ${proxy} / ${hidden}`;
}

export function buildLodProxies(groups) {
  state.lodEntries = [];
  _frame = 0;
  _lodApplied = false;

  groups.forEach((group, index) => {
    const renderables = collectRenderables(group);
    if (!renderables.length) return;

    _box.setFromObject(group);
    if (_box.isEmpty()) return;

    const center = _box.getCenter(_center).clone();
    const radius = _box.getSize(_size).length() * 0.5;
    const hasMesh = renderables.some((child) => child.isMesh);
    const color = state.groupColors[index] || new THREE.Color(0x889999);
    const proxy = hasMesh ? createProxy(group, color) : null;

    if (proxy) state.meshToGroup.set(proxy, group);
    state.lodEntries.push({ group, renderables, proxy, center, radius, level: "near" });
  });

  updateLodStats(state.lodEntries.length, 0, 0);
}

export function restoreLod() {
  for (const entry of state.lodEntries) {
    setEntryLevel(entry, "near");
  }
  _lodApplied = false;
  updateLodStats(state.lodEntries.length, 0, 0);
}

export function setLodEnabled(enabled) {
  state.lodEnabled = enabled;
  if (!enabled) restoreLod();
}

export function updateLod(camera, force = false) {
  if (!state.lodEntries.length) return;
  if (!state.lodEnabled) {
    if (_lodApplied) restoreLod();
    return;
  }

  _frame = (_frame + 1) % LOD_UPDATE_INTERVAL;
  if (!force && _frame !== 0) return;

  const proxyDistance = Math.max(100, state.lodProxyDistance || 1200);
  const hideDistance = Math.max(proxyDistance + 100, state.lodHideDistance || 2800);
  let near = 0;
  let proxy = 0;
  let hidden = 0;

  for (const entry of state.lodEntries) {
    if (!entry.group.visible) continue;
    const distance = Math.max(0, camera.position.distanceTo(entry.center) - entry.radius);
    let level = "near";
    if (distance >= hideDistance) level = "hidden";
    else if (distance >= proxyDistance) level = "proxy";

    setEntryLevel(entry, level);
    if (level === "hidden") hidden++;
    else if (level === "proxy") proxy++;
    else near++;
  }

  _lodApplied = true;
  updateLodStats(near, proxy, hidden);
}
