# Product: Pixoo Studio

## Platform
web (phone and desktop browsers on the home wifi)

## Stack
Static HTML + CSS + vanilla JS (`web/`), no build step. Served by `server.py` (Python standard library), which also forwards commands to the Pixoo. Tailwind: n/a.

## Users and scene
Primary user: Martin, at home, making animations and info screens for his Divoom Pixoo 64 and steering live games on it.
Physical scene: on a phone or laptop in the living room, often in the evening, looking back and forth between the screen and the glowing Pixoo panel → theme: both, following the OS, dark as the lead (pixel art reads truest on a dark surround).

## What it does
Previews and sends 64×64 animations (generated effects or hand-drawn frames), keeps a clock/weather display updated, and mirrors live arcade games (Snake, Rock Patrol, Lantern Maze) to the device.

## Surfaces and modes
| Surface | Mode | Primary action |
|---|---|---|
| #effects | Operate | Send to Pixoo |
| #draw | Operate | Send to Pixoo |
| #info | Operate | Start a live display |
| #play | Operate | Start a game |
| #settings | Operate | Test connection |

## Real assets and facts
- Device: Pixoo 64 at 192.168.4.192 by default (editable in Settings).
- API: `:80/post` (original firmware) or `:9000/divoom_api` (newer), auto-detected.

## Constraints
WCAG 2.2 AA. Must work opened from the home server on a phone. Max 40 frames per animation.
