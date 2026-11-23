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

**Always live with the home server.** When the page is opened from `server.py`, pressing Send on an Info display or a character hands it to the server, which keeps it current on the Pixoo by itself (page closed, after restarts): info screens are redrawn every minute (`live_info.py`, a Python port of the page's drawing code), characters run their scene schedules with the time and temperature drawn into the picture (`tilly_player.py`). One thing plays at a time; sending an effect, a drawing or a game takes over. If the Pixoo can download GIFs from the server (tried once, remembered in `data/device.json`), whole animations go over in one request. Without the server, the page falls back to the Pixoo's own time overlay, which it draws on a solid strip.

**Weather location** lives in Settings: search for your town (Open-Meteo geocoding) or type coordinates. It's saved on the home server (`data/config.json`, `GET/POST /api/config`) so every device shares it. Browsers only allow "Use my location" on https pages, so that button only shows where it can work.

Sections: Effects, Characters, Draw, Info, Flights, Play and Settings (Pixoo address, connection method, theme). The connection status sits in the top bar.

- **Effects**: plasma, aurora, fire, rainbow tunnel, starfield, matrix rain, bouncing heart (up to 40 frames, adjustable speed).
- **Characters**: Tilly Tock (an alarm-clock character who waves and winks) and a cheeky Santa whose trousers fall down, who also laughs and juggles presents. Both have a *live face* mode: the Pixoo itself draws the real time and temperature above her and keeps them current, so nothing has to stay running.
  - **Mix characters** (tick it in Characters, then Send): the characters take turns, a different one every half hour, each round in a new random order; Tilly takes the night shift. To add a character, draw it in `characters.js`, add it to `CHARACTERS`, and list its scenes in `LIVING` (`tilly.js`). The server gives it one scene per half hour and includes it in the mix with no Python changes.
  - **Cheeky Santa on the home server** gets a new routine every half hour (trousers, belly laugh, juggling), with the time and temperature above him.
  - **Pip the Cactus, Bolt the Robot, Mochi the Cat and Frosty the Snowman** (`cast.js`) each have three routines the home server rotates every half hour: Pip waters himself, sunbathes and blooms; Bolt sweeps, recharges and does a glitch dance; Mochi stretches, chases a moth and naps; Frosty loses his nose, builds a mini snowman and melts then refreezes.
  - **Living Tilly** (needs the home server): press *Start on home server* and the server plays her scenes all day. She idles, dances, wanders off ("back soon") and comes back; yawns in the evening and sleeps from 23:00 to 07:00; holds an umbrella when it rains; wears a scarf and shivers at 5 °C or below or in snow; puts on sunglasses at 27 °C or above. The time and temperature are drawn above her in the 3D font and refreshed every minute. Weather comes from the location in Settings. The page renders the scenes once and uploads them (kept in `data/`); the server resumes Tilly after a restart, and stops her when you send something else from the page.
- **Draw**: a 64×64 pixel editor with palette, fill, eraser and multiple frames.
- **Info displays**: a clock, a clock with weather, a week forecast (seven rows: day, icon, low, range bar, high), or today in focus with the next six days along the bottom, all from [Open-Meteo](https://open-meteo.com) (free, no key). Updates every minute while the page is open.
- **Flights** (needs the home server): the plane flying closest to home as a flight card: airline logo and callsign, route (e.g. STN > MAD with city names), altitude with a climb/descend marker, aircraft type, distance with an arrow pointing where it is, and speed. Send keeps it on the Pixoo, refreshed every 10 s, with the page closed. Optionally it takes over the Pixoo by itself when a plane is closer and lower than your limits, then goes back to the character that was playing (or the Pixoo's own clock) once it has gone. Home is the location from Settings.
- **Play**: three arcade games with the shaded pixel look: Snake, Rock Patrol (an asteroid-style shooter) and Lantern Maze (a maze chase). Play with the arrow keys and Space, by swiping, or with the on-screen pad. Each game runs in step with the Pixoo, so no move is dropped however few frames a second it manages.

You can also open `web/index.html` directly on a computer on the same wifi. Phone browsers usually block
that, so use the server there.

### Flights (flights.py)

- Positions: [airplanes.live](https://airplanes.live) `GET /v2/point/{lat}/{lon}/{radius_nm}`, falling back to adsb.lol and adsb.fi (same readsb JSON). Free, no key; polled every 10 s, and only while the page is open, the card is on the Pixoo, or auto takeover is on.
- Route and airline: [adsbdb.com](https://www.adsbdb.com) `GET /v0/callsign/{callsign}`, cached for 6 h. Logos: `pics.avs.io/64/64/{IATA}.png`, else `Jxck-S/airline-logos` by ICAO code, cached in `data/logos/` (an empty file means none was found).
- `GET /api/flights/status` returns the closest plane, its route and the rendered card (`frame`, base64 RGB); `POST /api/flights/config` `{radius, auto, auto_nm, auto_ft}`, `POST /api/flights/show`, `POST /api/flights/stop`. Settings are kept in `data/flights.json`.
- Anything the page draws stops the card and pauses auto takeover for 5 minutes; starting a character on the server stops it too.

Every request the server sends to the Pixoo, with its reply, is logged to `data/pixoo.log`; the last 300 are at `http://<server>:8080/api/log`. Useful when the device freezes or restarts.

### Living Tilly API (server.py)

- `POST /api/tilly/scenes` `{"scenes": [{name, sky, speed, loop, frames: [base64 RGB]}]}` stores the rendered scenes.
- **What the server remembers** (in `data/`, survives restarts): the weather location, GIF link and the page's shared choices (`config.json`: character, mix, effect, game, info screen, upload mode), Flights settings (`flights.json`), the character or info screen playing (`tilly_state.json`, `info_state.json`, resumed on start), the character scenes (`scenes/`) and what the page last sent (`now.json`). The theme and the Pixoo address stay per browser.
- `GET /api/now` tells the status bar on every page what's on the Pixoo (a character, an info screen, the flight card or something the page sent), any upload in progress (frame x of y), the last error, and whether Flights takeover is on. The page names what it sends with `POST /api/now {"what"}`.
- `POST /api/tilly/start` `{"lat", "lon", "character"}` starts the player for any character in `LIVING` (or `"mix"`) (lat/lon default to the Settings location), `POST /api/tilly/stop` stops it, `GET /api/tilly/status` reports mood, scene, weather and errors.
- Scene choice lives in `mood_for()` in `tilly_player.py`; the drawings live in `web/js/tilly.js`.

## Pixoo API notes

- **Upload speed.** The device takes one frame per request, and some units need up to a second per frame, so a 40-frame animation can take 40 s. That is the device, not the network. The page measures it (Settings, *Animation uploads*), sends repeated frames only once (playing them slower, so nothing changes visually), and in *Automatic* mode sends at most 20 frames when the device is slower than 0.4 s per frame. Living Tilly does the same, and on a slow device it lets the Pixoo draw the time and temperature itself instead of re-uploading every minute. `/api/health` reports the measured `frame_ms`.
- **GIF link (experimental).** With Settings → *How to send animations* → *As one GIF*, the page posts all frames to `POST /api/gif`; the server encodes a GIF (`gifenc.py`, stdlib), serves it at `/gif/animN.gif`, and sends `Device/PlayTFGif` with `FileType: 2` and that link. The server waits up to 8 s to see the Pixoo download the file; if it doesn't, the page falls back to frame by frame. The choice is saved on the server (`gif_link` in `data/config.json`) and also covers the characters and screens the server plays by itself. It is off by default: some Pixoos download the GIF but can't open it and show a heart icon instead, which the server can't detect.

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
