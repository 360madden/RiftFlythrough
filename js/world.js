// World geometry: axes, grid, OBJ loader, ground plane, water plane, legend, info.

import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { createParticles } from "./particles.js";
import { camera, scene } from "./scene.js";
import { state } from "./state.js";
import { flyToGroup } from "./teleport.js";
import { groupColor } from "./utils.js";
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

// ── Ground plane toggle ──
export function setGroundVisible(visible) {
  if (groundPlane) groundPlane.visible = visible;
}

// ── Water plane toggle ──
export function setWaterVisible(visible) {
  if (waterPlane) waterPlane.visible = visible;
}

let groundPlane = null;
let waterPlane = null;
export const waterUniforms = {
  uTime: { value: 0 },
  uOpacity: { value: 1.0 },
  uEnvMap: { value: null },
  uHasEnvMap: { value: false },
  uReflectStrength: { value: 0.4 },
  uCameraPos: { value: new THREE.Vector3() },
};

/** Apply the scene environment map to the water shader for reflections. */
export function updateWaterEnvMap(envMap) {
  waterUniforms.uEnvMap.value = envMap;
  waterUniforms.uHasEnvMap.value = !!envMap;
}

/** Adjust water reflection strength (0–1). */
export function applyWaterReflectStrength(val) {
  waterUniforms.uReflectStrength.value = Math.max(0, Math.min(1, val));
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
      let groupObj = null;
      let p = child.parent;
      while (p && p !== obj) {
        if (groupIndexMap.has(p)) {
          groupIdx = groupIndexMap.get(p);
          groupObj = p;
          break;
        }
        p = p.parent;
      }
      const color = state.groupColors[groupIdx] || new THREE.Color(0x889999);
      const groupName = groupObj?.name || "";

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
          color,
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
    if (state.wireframeMode) {
      children.forEach((g) => {
        g.traverse((child) => {
          if (child.isMesh && child.material.wireframe !== undefined) {
            child.material.wireframe = true;
          }
        });
      });
    }

    camera.position.set(0, maxDim * 0.3, maxDim * 0.6);
    camera.lookAt(0, 0, 0);

    // -- Texture Discovery -- apply linked textures from TEXTURE_MAP
    // TEXTURE_MAP loaded via <script> tag in flythrough.html: { pattern: "nif_hash", url: "path/to/png" }
    if (typeof TEXTURE_MAP !== "undefined" && TEXTURE_MAP.length > 0) {
      const textureLookup = {};
      for (const entry of TEXTURE_MAP) {
        if (!textureLookup[entry.pattern]) textureLookup[entry.pattern] = entry.url;
      }


      const texLoader = new THREE.TextureLoader();
      const meshTextureMap = [];
      const groupsMissing = new Set();

      obj.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        // OBJLoader strips "o " prefix, sets NIF hash as Mesh.name directly
        const nifName = child.name || (child.parent && child.parent.name);
        if (nifName && /^(ptonly_)?[0-9a-f]{16}$/.test(nifName)) {
          let nifHash = nifName;
          if (nifHash.startsWith("ptonly_")) nifHash = nifHash.slice(7);
          const url = textureLookup[nifHash];
          if (url) {
            meshTextureMap.push({ mesh: child, url });
          } else if (!groupsMissing.has(nifHash)) {
            groupsMissing.add(nifHash);
          }
        }
      });

      if (groupsMissing.size > 0) {
        console.log("Texture discovery:", groupsMissing.size, "groups without linked textures");
        console.log("Sample missing:", [...groupsMissing].slice(0, 5));
      }

      if (meshTextureMap.length > 0) {
        const uniqueUrls = [...new Set(meshTextureMap.map((e) => e.url))];
        let loadedCount = 0;
        let meshCount = 0;
        for (const url of uniqueUrls) {
          texLoader.load(
            url,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.wrapS = THREE.RepeatWrapping;
              tex.wrapT = THREE.RepeatWrapping;
              loadedCount++;
              let applied = 0;
              for (const { mesh, url: meshUrl } of meshTextureMap) {
                if (meshUrl === url && mesh.material) {
                  mesh.material.map = tex;
                  mesh.material.needsUpdate = true;
                  applied++;
                }
              }
              meshCount += applied;
              if (loadedCount === uniqueUrls.length) {
                console.log(`Texture discovery: ${uniqueUrls.length} textures on ${meshCount} meshes`);
              }
            },
            undefined,
            () => console.warn(`Texture discovery: failed ${url}`),
          );
        }
      } else {
        console.warn("Texture discovery: no mesh-to-texture matches found");
      }
    } else {
      console.warn("Texture discovery: TEXTURE_MAP not loaded");
    }
    camera.position.set(0, maxDim * 0.3, maxDim * 0.6);
    camera.lookAt(0, 0, 0);

    // Initialize zone location labels after scene is fully loaded
    initCalibrate();
    Promise.all([initZoneLabels(), initZoneOverlays()]).then(() => applySavedPositions(); initZoneFilter() initZoneFilter()).catch(err => console.warn("Zone init failed:", err));
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
