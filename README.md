# RIFT World Flythrough

Offline 3D flythrough viewer for the RIFT MMORPG game world, built from extracted OBJ geometry. Fly through the world like Glier for Ultima Online.

## Quickstart

**One click:** Double-click `run.bat` → server starts + browser opens.

**Or manually:**
```bash
python -m http.server 8000
# Open http://localhost:8000/flythrough.html
```

Click the page to lock the mouse, then fly.

## Controls

| Key | Action |
|-----|--------|
| WASD | Move forward/left/back/right |
| Mouse | Look around |
| Space / Ctrl | Fly up / down |
| Shift | Sprint (3x speed) |
| Scroll | Adjust move speed |
| **M** | Toggle minimap |
| **L** | Cycle day/night lighting (4 modes) |
| **H** | Teleport home (overview) |
| **P** | Save screenshot (PNG) |
| **Click minimap** | Teleport to that location |
| Esc | Release mouse |

## Features

- **350 world groups**: 270 colored mesh families + 80 point clouds
- **20,135 vertices, 30,864 faces** spanning ~3,200 units
- **Minimap** with compass directions, distance ticks, click-to-teleport
- **Day/night cycle** (Day, Sunset, Night, Dawn)
- **Animated water plane** at Y=0 with wave displacement
- **Semi-transparent ground plane** for height reference
- **Coordinate HUD** with real-time position and speed
- **Point clouds** for position-only meshes (rendered as colored dots)
- **Screenshot capture** (press P)

## Updating the world

When new OBJs are exported from the [RIFT Assets](https://github.com/360madden/rift-assets) project:

```bash
python merge_objs.py --objs-dir ../Assets/Exports --faced-only --include-pos-only
```

This merges all OBJs into `merged.obj`. The viewer auto-loads it.

## Tech

- Three.js 0.170 (CDN, no build step)
- Pure static HTML + custom GLSL shaders
- OBJ format via Three.js OBJLoader
- Zero dependencies beyond a web browser
