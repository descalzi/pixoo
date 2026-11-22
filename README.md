# Pixoo Studio

Animations, a pixel editor, info displays and live games for the Divoom Pixoo 64, controlled from a web page.
Design follows the uiux library; see `DESIGN.md` and `PRODUCT.md`.

## Quick start (home server, works on phones)

```sh
git clone https://github.com/descalzi/pixoo && cd pixoo
python3 server.py                 # Python 3 only, nothing to install
```

Open `http://<server-ip>:8080` on any phone or computer on the same wifi.
The server hosts the page and forwards commands to the Pixoo, so browser restrictions on calling
local devices don't apply.

Options: `python3 server.py --pixoo 192.168.4.192 --port 8080`. If the port is taken, the server tries the next free one and prints the address to open.

## What's in the page

Sections: Effects, Characters, Draw, Info, Play and Settings (Pixoo address, connection method, theme). The connection status sits in the top bar.

- **Effects**: plasma, aurora, fire, rainbow tunnel, starfield, matrix rain, bouncing heart (up to 40 frames, adjustable speed).
- **Characters**: Tilly Tock (an alarm-clock character who waves and winks) and a cheeky Santa whose trousers fall down. Tilly has a *live face* mode: the Pixoo itself draws the real time and temperature above her and keeps them current, so nothing has to stay running.
  - **Living Tilly** (needs the home server): press *Start on home server* and the server plays her scenes all day. She idles, dances, wanders off ("back soon") and comes back; yawns in the evening and sleeps from 23:00 to 07:00; holds an umbrella when it rains; wears a scarf and shivers at 5 °C or below or in snow; puts on sunglasses at 27 °C or above. The time and temperature are drawn above her in the 3D font and refreshed every minute. Weather comes from the location in Info. The page renders the scenes once and uploads them (kept in `data/`); the server resumes Tilly after a restart, and stops her when you send something else from the page.
- **Draw**: a 64×64 pixel editor with palette, fill, eraser and multiple frames.
- **Info displays**: a clock, or a clock with weather from [Open-Meteo](https://open-meteo.com) (free, no key). Updates every minute while the page is open.
- **Play**: three arcade games with the shaded pixel look: Snake, Rock Patrol (an asteroid-style shooter) and Lantern Maze (a maze chase). Play with the arrow keys and Space, by swiping, or with the on-screen pad. Each game runs in step with the Pixoo, so no move is dropped however few frames a second it manages.

You can also open `web/index.html` directly on a computer on the same wifi. Phone browsers usually block
that, so use the server there.

### Living Tilly API (server.py)

- `POST /api/tilly/scenes` `{"scenes": [{name, sky, speed, loop, frames: [base64 RGB]}]}` stores the rendered scenes.
- `POST /api/tilly/start` `{"lat", "lon"}` starts the player, `POST /api/tilly/stop` stops it, `GET /api/tilly/status` reports mood, scene, weather and errors.
- Scene choice lives in `mood_for()` in `tilly_player.py`; the drawings live in `web/js/tilly.js`.

## Pixoo API notes

- **Upload speed.** The device takes one frame per request, and some units need up to a second per frame, so a 40-frame animation can take 40 s. That is the device, not the network. The page measures it (Settings, *Animation uploads*), sends repeated frames only once (playing them slower, so nothing changes visually), and in *Automatic* mode sends at most 20 frames when the device is slower than 0.4 s per frame. Living Tilly does the same, and on a slow device it lets the Pixoo draw the time and temperature itself instead of re-uploading every minute. `/api/health` reports the measured `frame_ms`.

| Firmware | Endpoint | Reply |
|---|---|---|
| Original Pixoo 64 | `POST http://IP:80/post` | `error_code` |
| Newer ("Pixoo-64 II") | `POST http://IP:9000/divoom_api` | `ReturnCode` / `ReturnMessage` |

Both take a JSON body with a `Command` field (`Draw/SendHttpGif`, `Draw/ResetHttpGifId`, `Channel/SetBrightness`, …).
The page, the server and the Python client auto-detect which one your device uses.
Requests are paced at least 30 ms apart because the device handles one at a time.

Live overlays use `Draw/SendHttpItemList`: each item has a `type` the device fills in and updates itself
(5 = hour:minute, 17 = temperature, 14 = weekday, 20 = weather word, 22 = fixed text,
23 = text fetched from a URL that returns `{"DispData": "..."}`). `Draw/ClearHttpText` removes them.
`Sys/LogAndLat` sets the device's weather location.

## Python client (optional)

```sh
pip install -r requirements.txt
python animations/plasma.py --preview   # writes animations/plasma_preview.gif
python animations/plasma.py             # sends it to the Pixoo
```

`pixoo.py` has `Pixoo(ip).push_frames(frames)`, `text()`, `brightness()` and `settings()`.
