# RIFT World Flythrough

Offline 3D flythrough viewer for the RIFT MMORPG game world, built from extracted OBJ geometry.

## Quickstart

```bash
# Serve and open the viewer
python -m http.server 8080
# Open http://localhost:8080/flythrough.html
```

Click the page to lock the mouse, then fly with WASD + mouse look.

| Key | Action |
|-----|--------|
| WASD | Move forward/left/back/right |
| Mouse | Look around |
| Space | Fly up |
| Ctrl | Fly down |
| Shift | Sprint (3x speed) |
| Scroll | Adjust move speed |
| Esc | Release mouse |

## Updating the world data

When new OBJs are exported from the [Assets](https://github.com/your-org/rift-assets) project:

```bash
python merge_objs.py --objs-dir ../Assets/Exports --faced-only
```

This merges all faced OBJs into `merged.obj`. The viewer auto-loads it.

## Current world

- **270 meshes** with faces
- **20,135 vertices, 30,864 faces**
- World extents: ~3,200 units across all axes (centered near origin)
- **80 additional position-only meshes** available (no faces, excluded by default)

## Tech

- Three.js 0.170 (CDN, no build step)
- Pure static HTML — no server-side code, no npm install
- OBJ format via Three.js OBJLoader
