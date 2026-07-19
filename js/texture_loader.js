// texture_loader.js
//
// Delivery-authoritative texture overlay for RiftFlythrough.
//
// The Assets repo's `riftflythrough-delivery.json` carries NIF-confirmed
// `linked_texture_urls` per asset (v0.2+). This module loads that JSON once,
// builds a Map<nifHash, url[]>, and exposes it so world.js's texture selection
// can prefer the authoritative delivery linkage over the independently-built
// TEXTURE_MAP (which is derived from a separate source and can drift).
//
// Merge policy (delivery-first): for a given NIF hash, delivery URLs take
// precedence. Where the delivery JSON has no entry for a hash (e.g. the 64
// non-consumer-ready assets), the existing TEXTURE_MAP entries still apply.
//
// Failure mode: if the delivery JSON is missing, malformed, or fails to fetch,
// the overlay stays empty and behaviour is identical to today (pure fallback to
// TEXTURE_MAP). Worst-case visual regression = zero.
//
// Drop-in usage: include this script after texture_map.js. world.js consults
// RiftTextureLoader.urlsForSync(hash) after whenReady().

(function () {
  "use strict";

  /** @type {Map<string, string[]>} nifHash -> resolved texture urls */
  let overlay = new Map();
  /** @type {Promise<void>} */
  let overlayLoading;
  /** True after the one-shot load attempt finishes (success or failure). */
  let overlayReady = false;
  /** @type {{hashes:number, urls:number}} last-load stats, for diagnostics */
  let stats = { hashes: 0, urls: 0 };

  /**
   * Load the delivery JSON and index entries[].linked_texture_urls by asset_id.
   */
  async function loadOverlay() {
    try {
      const r = await fetch("js/riftflythrough-delivery.json", { cache: "no-store" });
      if (!r.ok) {
        console.warn(
          "[texture_loader] delivery JSON fetch failed (" + r.status + "), TEXTURE_MAP fallback only",
        );
        return;
      }
      const data = await r.json();
      const entries = data.entries || [];
      let urlCount = 0;
      for (const e of entries) {
        const urls = (e.linked_texture_urls || [])
          .map((u) => (u && typeof u.url === "string" ? u.url : null))
          .filter((url) => typeof url === "string" && url.length > 0);
        if (urls.length > 0) {
          overlay.set(e.asset_id, urls);
          urlCount += urls.length;
        }
      }
      stats = { hashes: overlay.size, urls: urlCount };
      console.log(
        "[texture_loader] delivery overlay: " +
          stats.hashes +
          " hashes, " +
          stats.urls +
          " textures authoritative",
      );
    } catch (err) {
      console.warn(
        "[texture_loader] failed to load delivery overlay, TEXTURE_MAP fallback only:",
        err.message,
      );
    } finally {
      overlayReady = true;
    }
  }

  overlayLoading = loadOverlay();

  /**
   * @param {string} nifHash
   * @returns {Promise<string[]|null>}
   */
  async function urlsFor(nifHash) {
    if (!overlayReady) {
      await overlayLoading;
    }
    if (!nifHash || !overlay.has(nifHash)) return null;
    return overlay.get(nifHash);
  }

  /**
   * Synchronous peek after ready. Returns null if still loading or no entry.
   * @param {string} nifHash
   * @returns {string[]|null}
   */
  function urlsForSync(nifHash) {
    if (!nifHash || !overlayReady || !overlay.has(nifHash)) return null;
    return overlay.get(nifHash);
  }

  window.RiftTextureLoader = {
    urlsFor,
    urlsForSync,
    stats: () => ({ ...stats }),
    isReady: () => overlayReady,
    whenReady: () => (overlayReady ? Promise.resolve() : overlayLoading),
  };
})();
