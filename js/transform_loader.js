// transform_loader.js
//
// Patches the RiftFlythrough OBJLoader callback to apply per-OBJ transforms
// from the Assets repo's `asset-mesh-manifest-v1` sidecars (one .obj.manifest.json
// per .obj). The manifest's `nif_hash` is matched to the OBJ group name.
//
// Drop-in usage: include this script after `world.js` is loaded. It hooks the
// `state.worldGroups` assignment and applies transforms in place.
//
// Schema fields consumed (all optional except nif_hash):
//   - nif_hash            (matched to obj group name or nif_hash registry)
//   - parent_node         (string|null — future: parent group index)
//   - transform           { translation: [x,y,z], rotation: [w,x,y,z] quaternion, scale: number }
//   - bounding_box        { min: [x,y,z], max: [x,y,z] }
//
// Failure mode: if the manifest is missing or malformed, the OBJ is rendered
// at its current world position (i.e. legacy behavior, no breakage).
//
// Copy-into-RiftFlythrough step: copy this file to
//   C:/RIFT MODDING/RiftFlythrough/js/transform_loader.js
// Then in index.html, add after the world.js script tag:
//   <script src="js/transform_loader.js"></script>
// And in world.js, after `state.worldGroups = children;`, add:
//   if (window.RiftTransformLoader) {
//     window.RiftTransformLoader.applyManifests(state.worldGroups).then(r => {
//       console.log('[transform_loader]', r);
//     });
//   }

(function () {
  "use strict";

  /**
   * Fetch a manifest by NIF hash. Tries a few candidate URL shapes because
   * the Assets repo's `bulk_export_for_flythrough.py` writes per-OBJ manifests
   * in a couple of layouts (flat or per-hash subdir).
   */
  async function fetchManifest(nifHash) {
    const candidates = [
      `objs/${nifHash}.obj.manifest.json`,
      `objs/${nifHash}/manifest.json`,
      `objs/${nifHash}/${nifHash}.obj.manifest.json`,
      `objs/${nifHash}/decode-nif-geometry-mesh6.obj.manifest.json`,
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (_) {
        // continue
      }
    }
    return null;
  }

  /**
   * Apply a manifest's transform to a Three.js Group.
   * Manifest rotation is a quaternion [w, x, y, z] (Gamebryo/Three.js convention).
   */
  function applyTransform(group, manifest) {
    if (!manifest || !manifest.transform) return false;
    const t = manifest.transform;
    if (Array.isArray(t.translation) && t.translation.length === 3) {
      group.position.set(t.translation[0], t.translation[1], t.translation[2]);
    }
    if (Array.isArray(t.rotation) && t.rotation.length === 4) {
      const [w, x, y, z] = t.rotation;
      group.quaternion.set(x, y, z, w);
    }
    if (typeof t.scale === "number") {
      group.scale.set(t.scale, t.scale, t.scale);
    }
    return true;
  }

  /**
   * Heuristic: extract the 16-char hex nif_hash from a group name like
   *   "decode-nif-geometry/decode-nif-geometry-mesh6"
   *   "ptonly_0603cce7cee15eb8"
   *   "0603cce7cee15eb8"
   */
  function extractNifHash(groupName) {
    if (!groupName) return null;
    const m = groupName.match(/[0-9a-f]{16}/i);
    return m ? m[0].toLowerCase() : null;
  }

  /**
   * Apply all matching manifests to the world groups.
   * Returns { applied, skipped, total }.
   */
  async function applyManifests(worldGroups) {
    if (!Array.isArray(worldGroups)) return { applied: 0, skipped: 0, total: 0 };
    const total = worldGroups.length;
    let applied = 0;
    let skipped = 0;
    await Promise.all(
      worldGroups.map(async (group) => {
        const hash = extractNifHash(group.name);
        if (!hash) { skipped++; return; }
        const manifest = await fetchManifest(hash);
        if (applyTransform(group, manifest)) applied++;
        else skipped++;
      })
    );
    return { applied, skipped, total };
  }

  window.RiftTransformLoader = {
    fetchManifest,
    applyTransform,
    applyManifests,
    extractNifHash,
  };
})();
