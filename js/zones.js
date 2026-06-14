// RIFT Zone Labels — canvas-sprite markers for zone/area names
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { state } from './state.js';

const ZONE_DATA_URL = 'zone_locations.json';

const FONT_CONFIG = {
  zone:   { size: 28, color: '#ffffff', bgAlpha: 0.55, scale: 180 },
  area:   { size: 22, color: '#e0f0ff', bgAlpha: 0.40, scale: 120 },
  city:   { size: 32, color: '#ffd700', bgAlpha: 0.60, scale: 220 },
};

function makeLabelTexture(name, colorHex, bgAlpha, fontSize) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const padding = 16;
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  const metrics = ctx.measureText(name);
  const tw = metrics.width;
  const th = fontSize * 1.4;
  canvas.width = Math.ceil(tw + padding * 2);
  canvas.height = Math.ceil(th + padding * 2);

  // Background pill
  ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
  const rx = canvas.height / 2;
  ctx.beginPath();
  ctx.moveTo(rx, 2);
  ctx.lineTo(canvas.width - rx, 2);
  ctx.arc(canvas.width - rx, canvas.height / 2, rx - 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(rx, canvas.height - 2);
  ctx.arc(rx, canvas.height / 2, rx - 2, Math.PI / 2, -Math.PI / 2);
  ctx.fill();

  // Text
  ctx.fillStyle = colorHex;
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { texture: tex, aspect: canvas.width / canvas.height };
}

let labelSprites = [];

export async function initZoneLabels() {
  try {
    const resp = await fetch(ZONE_DATA_URL);
    const data = await resp.json();
    const zones = data.zones || [];
    console.log(`Zone labels: loading ${zones.length} zone markers`);

    for (const zone of zones) {
      const cfg = FONT_CONFIG[zone.type] || FONT_CONFIG.zone;
      const { texture, aspect } = makeLabelTexture(zone.name, zone.color || cfg.color, cfg.bgAlpha, cfg.size);

      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      const s = cfg.scale;
      sprite.position.set(zone.x, zone.y, zone.z);
      sprite.scale.set(s * aspect, s, 1);
      sprite.visible = state.showZoneLabels !== false;
      sprite.userData = { zoneName: zone.name, zoneType: zone.type, levelRange: zone.levelRange || "", faction: zone.faction || "", description: zone.description || "" };

      scene.add(sprite);
      labelSprites.push(sprite);
    }

    console.log(`Zone labels: ${labelSprites.length} markers placed`);
  } catch (err) {
    console.warn('Zone labels: failed to load zone data', err);
  }
}

export function getZoneLabels() {
  return labelSprites;
}

// Distance-based fade: labels fade out as camera moves away
export function setZoneLabelsVisible(visible) {
  state.showZoneLabels = Boolean(visible);
  for (const sprite of labelSprites) {
    sprite.visible = state.showZoneLabels;
  }
}

export function updateZoneLabels() {
  const camPos = camera.position;
  for (const sprite of labelSprites) {
    const dist = camPos.distanceTo(sprite.position);
    // Visible from 200 to 6000 units, fade in/out at edges
    const nearDist = 200, farDist = 5000;
    let alpha = 1.0;
    if (dist < nearDist) alpha = dist / nearDist;
    else if (dist > farDist) alpha = Math.max(0, 1 - (dist - farDist) / 1500);
    sprite.material.opacity = alpha;
  }
}
