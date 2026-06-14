// RIFT Zone Hover Cards — rich metadata card on zone label hover
import * as THREE from 'three';
import { scene, camera } from './scene.js';
import { getZoneLabels } from './zones.js';

const hoverRaycaster = new THREE.Raycaster();
const hoverMouse = new THREE.Vector2();
let hoverCard = null;
let hoverFrameSkip = 0;
let lastHoveredZone = null;

function ensureCard() {
  if (!hoverCard) hoverCard = document.getElementById('zone-hover');
  return hoverCard;
}

function getTypeBadge(type, color) {
  const colors = {
    zone:  '#4a9eff',
    area:  '#7fc8ff',
    city:  '#ffd700'
  };
  return '<span class="zh-type" style="background:' + (color || colors[type] || '#888') + '33;color:' + (color || colors[type] || '#aaa') + ';border:1px solid ' + (color || colors[type] || '#555') + '44">' + (type || 'zone') + '</span>';
}

document.addEventListener('mousemove', function(e) {
  hoverMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  hoverMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  if (hoverCard && hoverCard.style.display !== 'none') {
    hoverCard.style.left = (e.clientX + 20) + 'px';
    hoverCard.style.top  = (e.clientY - 10) + 'px';
  }
});

export function updateZoneHover() {
  hoverFrameSkip = (hoverFrameSkip + 1) % 3;
  if (hoverFrameSkip !== 0) return;

  const card = ensureCard();
  if (!card) return;

  const sprites = getZoneLabels().filter((sprite) => sprite.visible);
  if (!sprites || sprites.length === 0) {
    card.style.display = 'none';
    lastHoveredZone = null;
    return;
  }

  hoverRaycaster.setFromCamera(hoverMouse, camera);
  const hits = hoverRaycaster.intersectObjects(sprites, false);

  if (hits.length > 0) {
    const s = hits[0].object;
    if (s !== lastHoveredZone) {
      lastHoveredZone = s;
      const d = s.userData;
      const name = d.zoneName || 'Unknown';
      const type = d.zoneType || 'zone';
      const level = d.levelRange || '';
      const faction = d.faction || '';
      const desc = d.description || '';
      const adj = d.adjacentTo;

      let html = '<div class="zh-name">' + name + '</div>';
      html += getTypeBadge(type, null);
      if (level || faction) {
        html += '<div class="zh-meta">';
        if (level) html += 'Lv ' + level;
        if (level && faction) html += ' &middot; ';
        if (faction) html += faction;
        html += '</div>';
      }
      if (desc) html += '<div class="zh-desc">' + desc + '</div>';
      if (adj && adj.length) {
        html += '<div class="zh-adj">&#8596; ' + adj.slice(0, 4).join(', ') + '</div>';
      }

      card.innerHTML = html;
      card.style.display = 'block';
      card.classList.add('visible');
    }
  } else {
    if (lastHoveredZone) {
      lastHoveredZone = null;
      card.classList.remove('visible');
      setTimeout(function() {
        if (!lastHoveredZone) card.style.display = 'none';
      }, 150);
    }
  }
}
