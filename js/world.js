// World geometry: axes, grid, OBJ loader, ground plane, water plane, legend, info.

import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { camera, scene } from "./scene.js";
import { state } from "./state.js";
import { groupColor } from "./utils.js";

// ── Axis indicators ──
const axisLen = 500;
function makeAxis(points, color) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color }),
  );
}
scene.add(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLen, 0, 0)], 0xff3333));
scene.add(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLen, 0)], 0x33ff33));
scene.add(makeAxis([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axisLen)], 0x3333ff));

// ── Grid ──
scene.add(new THREE.GridHelper(2000, 40, 0x333355, 0x222244));

let groundPlane = null;
let waterPlane = null;
export const waterUniforms = { uTime: { value: 0 } };

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

    // Color-code each group
    const children = obj.children.filter((c) => c.isGroup);
    state.groupColors = children.map((_, i) => groupColor(i));

    let groupCounter = 0;
    const groupIndexMap = new Map();
    obj.traverse((child) => {
      if (child.isGroup && child.name?.startsWith("o ")) {
        groupIndexMap.set(child, groupCounter++);
      }
    });
    obj.traverse((child) => {
      let groupIdx = 0;
      let p = child.parent;
      while (p && p !== obj) {
        if (groupIndexMap.has(p)) {
          groupIdx = groupIndexMap.get(p);
          break;
        }
        p = p.parent;
      }
      const color = state.groupColors[groupIdx] || new THREE.Color(0x889999);

      if (child.isMesh) {
        child.material = new THREE.MeshPhongMaterial({
          color,
          specular: 0x111111,
          shininess: 10,
          flatShading: false,
          side: THREE.DoubleSide,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      } else if (child.isPoints) {
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
      opacity: 0.3,
    });
    state.worldGroundY = groundY;
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.set(0, groundY - 0.5, 0);
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Animated water plane at Y=0
    const waterGeo = new THREE.PlaneGeometry(size.x * 1.15, size.z * 1.15, 64, 64);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime;
        varying float vHeight;
        void main() {
          vec3 pos = position;
          float wave1 = sin(pos.x * 0.008 + uTime * 1.2) * cos(pos.z * 0.006 + uTime * 0.7) * 3.0;
          float wave2 = sin(pos.x * 0.015 - uTime * 0.9) * sin(pos.z * 0.012 + uTime * 1.1) * 2.0;
          float wave3 = cos((pos.x + pos.z) * 0.005 + uTime * 0.5) * 4.0;
          pos.y += wave1 + wave2 + wave3;
          vHeight = pos.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying float vHeight;
        void main() {
          float h = vHeight / 10.0;
          vec3 shallow = vec3(0.1, 0.35, 0.55);
          vec3 deep = vec3(0.02, 0.08, 0.2);
          vec3 color = mix(deep, shallow, smoothstep(-1.0, 1.0, h));
          float alpha = 0.55 + h * 0.15;
          gl_FragColor = vec4(color, clamp(alpha, 0.3, 0.7));
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    waterPlane = new THREE.Mesh(waterGeo, waterMat);
    waterPlane.position.y = 0;
    scene.add(waterPlane);
    state.waterPlane = waterPlane;

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

    // Group counts
    const ptonlyCount = children.filter((g) => g.name?.startsWith("ptonly_")).length;
    const facedCount = children.length - ptonlyCount;

    // Populate stats panel
    const loadTime = ((loadEndTime - loadStartTime) / 1000).toFixed(1);
    const fileSizeMB =
      loadFileSize > 0 ? `${(loadFileSize / (1024 * 1024)).toFixed(2)} MB` : "\u2014";
    const setStat = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
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
      .filter(({ g }) => g.name && !g.name.startsWith("ptonly_"))
      .slice(0, 12)
      .map(({ g, origIdx }) => {
        const c = state.groupColors[origIdx];
        const name = (g.name || "?").slice(0, 30);
        return (
          `<span class="legend-entry" data-group="${origIdx}" style="cursor:pointer;color:#${c.getHexString()}">` +
          `&#9632;</span> <span class="legend-name">${name}</span>`
        );
      });
    legendEl.innerHTML =
      topGroups.join("<br>") +
      (facedCount > 12 ? `<br>... +${facedCount - 12} more faced` : "") +
      (ptonlyCount > 0
        ? `<br><span style="color:#aac">. ${ptonlyCount} point clouds</span>`
        : "");

    // Click-to-toggle group visibility
    legendEl.style.pointerEvents = "auto";
    legendEl.addEventListener("click", (e) => {
      const entry = e.target.closest(".legend-entry");
      if (!entry) return;
      const idx = parseInt(entry.dataset.group);
      if (isNaN(idx) || !children[idx]) return;
      children[idx].visible = !children[idx].visible;
      const nameSpan = entry.nextElementSibling;
      if (nameSpan) {
        nameSpan.style.textDecoration = children[idx].visible ? "" : "line-through";
        nameSpan.style.opacity = children[idx].visible ? "" : "0.4";
      }
      entry.style.opacity = children[idx].visible ? "" : "0.4";
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

    camera.position.set(0, maxDim * 0.3, maxDim * 0.6);
    camera.lookAt(0, 0, 0);
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
    console.error("OBJ load error:", err);
  },
);
