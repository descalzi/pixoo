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
- **Draw**: a 64×64 pixel editor with palette, fill, eraser and multiple frames.
- **Info displays**: a clock, or a clock with weather from [Open-Meteo](https://open-meteo.com) (free, no key). Updates every minute while the page is open.
- **Play**: three arcade games with the shaded pixel look: Snake, Rock Patrol (an asteroid-style shooter) and Lantern Maze (a maze chase). Play with the arrow keys and Space, by swiping, or with the on-screen pad. Each game runs in step with the Pixoo, so no move is dropped however few frames a second it manages.

You can also open `web/index.html` directly on a computer on the same wifi. Phone browsers usually block
that, so use the server there.

## Pixoo API notes

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
