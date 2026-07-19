// transform_loader.js
//
// Patches the RiftFlythrough OBJLoader callback to apply per-OBJ transforms
// from the Assets repo's `asset-mesh-manifest-v1` sidecars (one .obj.manifest.json
// per .obj). The manifest's `nif_hash` is matched to the OBJ group name.
//
// v2 — Pre-loaded manifest cache from riftflythrough-delivery.json (153 consumer-ready
// assets), eliminating per-file HTTP fetches for known assets. Falls back to
// per-OBJ HTTP fetch for assets not in the cache.
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

  // ── Delivery JSON manifest cache ──────────────────────────────────────────

  /** @type {Map<string, object>|null} */
  let manifestCache = null;
  /** @type {Promise<void>|null} */
  let cacheLoading = null;

  /**
   * Convert a flat 3×3 rotation matrix to a quaternion [w, x, y, z].
   * The delivery JSON stores rotation as 9 floats: [m00, m01, m02, m10, m11, m12, m20, m21, m22].
   */
  function matrixToQuaternion(m) {
    if (!Array.isArray(m) || m.length !== 9) {
      return [1, 0, 0, 0];  // identity quaternion
    }
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
    const trace = m00 + m11 + m22;
    let w, x, y, z;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      w = 0.25 / s;
      x = (m21 - m12) * s;
      y = (m02 - m20) * s;
      z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
      w = (m21 - m12) / s;
      x = 0.25 * s;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = 0.25 * s;
      z = (m12 + m21) / s;
    } else {
      const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = 0.25 * s;
    }
    return [w, x, y, z];
  }

  /**
   * Convert a delivery JSON entry into the manifest shape expected by
   * applyTransform() (i.e. { nif_hash, transform: { translation, rotation, scale } }).
   */
  function deliveryEntryToManifest(entry) {
    return {
      nif_hash: entry.asset_id,
      transform: {
        translation: entry.translation || [0, 0, 0],
        rotation: matrixToQuaternion(entry.rotation),
        scale: entry.scale ?? 1,
      },
    };
  }

  /**
   * Load the pre-built delivery JSON and index entries by asset_id.
   * Called once at script init; fetchManifest() awaits this Promise before
   * checking the cache.
   */
  async function loadManifestCache() {
    try {
      const r = await fetch("js/riftflythrough-delivery.json", { cache: "no-store" });
      if (!r.ok) {
        console.warn("[transform_loader] delivery JSON fetch failed (" + r.status + "), using HTTP fallback");
        return;
      }
      const data = await r.json();
      const entries = data.entries || [];
      manifestCache = new Map();
      for (const e of entries) {
        manifestCache.set(e.asset_id, e);
      }
      buildZoneCache();
      const stats = getZoneStats();
      console.log(
        "[transform_loader] pre-loaded " +
          manifestCache.size +
          " manifests + " +
          stats.matched +
          " zone records (" +
          stats.distinctZones +
          " distinct zones; " +
          stats.unmatched +
          " unmatched) from delivery JSON",
      );
    } catch (err) {
      console.warn("[transform_loader] failed to load delivery JSON, using HTTP fallback:", err.message);
    }
  }

  // ── Source zone registry (per-asset zone_tuple from delivery JSON) ────
  //
  // Each consumer-ready delivery entry carries a `zone_tuple` field
  // (e.g. "ep1.world_objects.housing") derived from the asset's source
  // archive in the game data. The registry surfaces that classification
  // to the consumer UI so users can filter mesh groups by category.
  //
  // Schema fields consumed (all optional except asset_id):
  //   - zone_tuple      (string|null — null for the 6 unmatched entries)
  //   - zone_expansion  (string|null — e.g. "vanilla", "ep1", "ep2")
  //   - zone_category   (string|null — e.g. "world_objects", "vfx", "character")
  //   - zone_name       (string|null — e.g. "housing", "nature", "atmosphere")
  //   - zone_method     ("direct"|"neighbor"|"unmatched")
  //   - zone_delta      (number|null — signed entry-index delta for neighbor matches)

  /** @type {Map<string, object>} */
  let zoneCache = new Map();

  /**
   * Extract the per-asset source zone record from a delivery entry.
   * Returns null for entries without a zone_tuple (the 6 unmatched).
   */
  function deliveryEntryZone(entry) {
    if (!entry || !entry.zone_tuple) return null;
    return {
      tuple: entry.zone_tuple,
      expansion: entry.zone_expansion || null,
      category: entry.zone_category || null,
      name: entry.zone_name || null,
      method: entry.zone_method || "unmatched",
      delta: typeof entry.zone_delta === "number" ? entry.zone_delta : null,
      first4: typeof entry.first4 === "string" ? entry.first4 : "",
      // Cycle 5.2: high/medium/low per (method, |delta|) — see
      // docs/handoffs/2026-06-28-archive-neighbor-verification.md
      confidence: entry.confidence || null,
    };
  }

  function buildZoneCache() {
    zoneCache = new Map();
    if (!manifestCache) return;
    for (const [aid, entry] of manifestCache.entries()) {
      const z = deliveryEntryZone(entry);
      if (z) zoneCache.set(aid, z);
    }
  }

  /**
   * Read the zone record for an asset_id, or null if unmatched/missing.
   */
  function getZone(assetId) {
    return zoneCache.get(assetId) || null;
  }

  /**
   * Sorted distinct zone_tuple strings (e.g. "ep1.world_objects.housing").
   * Empty array if delivery cache not yet loaded.
   */
  function getAllZones() {
    const tuples = new Set();
    for (const z of zoneCache.values()) {
      if (z.tuple) tuples.add(z.tuple);
    }
    return [...tuples].sort();
  }

  /**
   * Asset IDs in a given zone_tuple, sorted. Empty array if not loaded.
   */
  function getAssetIdsForZone(tuple) {
    const ids = [];
    for (const [aid, z] of zoneCache.entries()) {
      if (z.tuple === tuple) ids.push(aid);
    }
    return ids.sort();
  }

  /**
   * Zone-coverage statistics for diagnostics and the filter UI.
   * `unmatched` is the count of manifest entries that lack a zone_tuple.
   * Cycle 5.2: also returns `byConfidence` (high/medium/low) and
   * `byMethod` (direct/neighbor) for opt-out filtering.
   */
  function getZoneStats() {
    const byZone = {};
    const byConfidence = { high: 0, medium: 0, low: 0, null: 0 };
    const byMethod = { direct: 0, neighbor: 0, unmatched: 0 };
    let matched = 0;
    let unmatched = 0;
    for (const z of zoneCache.values()) {
      const c = z.confidence || null;
      byConfidence[c === null ? "null" : c] = (byConfidence[c === null ? "null" : c] || 0) + 1;
      byMethod[z.method] = (byMethod[z.method] || 0) + 1;
      if (z.tuple) {
        byZone[z.tuple] = (byZone[z.tuple] || 0) + 1;
        matched++;
      } else {
        unmatched++;
      }
    }
    return {
      matched,
      unmatched,
      total: matched + unmatched,
      byZone,
      byConfidence,
      byMethod,
      distinctZones: Object.keys(byZone).length,
    };
  }

  // Start loading the cache immediately (non-blocking)
  cacheLoading = loadManifestCache();

  // ── Per-OBJ HTTP fetch (fallback) ────────────────────────────────────────

  /**
   * Fetch a manifest by NIF hash. Checks the delivery JSON cache first;
   * falls back to per-OBJ HTTP fetch for assets not in the cache.
   */
  async function fetchManifest(nifHash) {
    // Wait for the delivery JSON cache to finish loading (if still in flight)
    if (cacheLoading) {
      await cacheLoading;
      cacheLoading = null;  // don't re-await on subsequent calls
    }

    // Check cache
    if (manifestCache && manifestCache.has(nifHash)) {
      return deliveryEntryToManifest(manifestCache.get(nifHash));
    }

    // When delivery JSON loaded successfully, it is authoritative — skip the
    // multi-path HTTP manifest storm (4 404s per missing hash). Only fall back
    // to per-OBJ fetch when delivery was never available.
    if (manifestCache) {
      return null;
    }

    // Fallback: per-OBJ HTTP fetch (delivery cache failed / missing)
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
   * Also tags each group with `userData.sourceZone` from the same delivery
   * entry (powers the RiftZoneRegistry filter in zone-filter.js and the
   * zone badge in catalog.js).
   * Returns { applied, skipped, total, tagged }.
   */
  /** @type {Promise<{applied:number,skipped:number,total:number,tagged:number}>|null} */
  let lastApplyPromise = null;
  let lastApplyDone = false;

  /**
   * Apply zone tags (and optionally transforms) to world groups.
   *
   * Flythrough `merged.obj` is world-baked: vertex positions already include
   * placement. Re-applying delivery transforms double-offsets the 4 non-identity
   * assets. So we only tag source zones here; transforms stay off by default.
   */
  async function applyManifests(worldGroups, options) {
    const applyTransforms = Boolean(options && options.applyTransforms);
    if (!Array.isArray(worldGroups)) {
      lastApplyDone = true;
      return { applied: 0, skipped: 0, total: 0, tagged: 0 };
    }
    // Wait for delivery cache so zone tags land in one pass
    if (cacheLoading) {
      await cacheLoading;
      cacheLoading = null;
    }
    const total = worldGroups.length;
    let applied = 0;
    let skipped = 0;
    let tagged = 0;
    await Promise.all(
      worldGroups.map(async (group) => {
        const hash = extractNifHash(group.name);
        if (!hash) { skipped++; return; }

        if (applyTransforms) {
          const manifest = await fetchManifest(hash);
          const transformOk = applyTransform(group, manifest);
          if (transformOk) applied++;
          else skipped++;
        } else {
          skipped++;
        }

        // Tag the group with the per-asset source zone from the delivery
        // entry (if available). World groups without a delivery match get
        // userData.sourceZone === undefined so the filter ignores them.
        if (group.userData && manifestCache && manifestCache.has(hash)) {
          const zone = deliveryEntryZone(manifestCache.get(hash));
          if (zone) {
            group.userData.sourceZone = zone.tuple;
            group.userData.sourceZoneRecord = zone;
            // Cycle 5.2: also surface confidence + first4 for the
            // catalog badge and opt-out filtering.
            group.userData.sourceZoneConfidence = zone.confidence;
            group.userData.sourceZoneFirst4 = zone.first4;
            tagged++;
          } else {
            // Delivery entry exists but no zone_tuple (the unmatched).
            group.userData.sourceZone = "unmatched";
            group.userData.sourceZoneConfidence = null;
            group.userData.sourceZoneFirst4 = "";
            tagged++;
          }
        }
      })
    );
    lastApplyDone = true;
    return { applied, skipped, total, tagged };
  }

  function applyManifestsTracked(worldGroups, options) {
    lastApplyDone = false;
    lastApplyPromise = applyManifests(worldGroups, options).catch((err) => {
      lastApplyDone = true;
      throw err;
    });
    return lastApplyPromise;
  }

  window.RiftTransformLoader = {
    fetchManifest,
    applyTransform,
    applyManifests: applyManifestsTracked,
    extractNifHash,
    /** Resolves when the latest applyManifests finishes (or immediately if none). */
    whenApplied: () => lastApplyPromise || Promise.resolve(null),
    /** True after the latest applyManifests completed. */
    isApplied: () => lastApplyDone,
  };

  // Per-asset source-zone registry (separate from per-OBJ transform
  // registry above; same delivery JSON, different schema slice).
  window.RiftZoneRegistry = {
    getZone,
    getAllZones,
    getAssetIdsForZone,
    getZoneStats,
    /** True once the delivery cache has been loaded and the zone map is queryable. */
    isReady: () => zoneCache.size > 0,
    /** True once world group tagging from applyManifests has finished. */
    isWorldTagged: () => lastApplyDone,
  };
})();
