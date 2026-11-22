# Pixoo Studio

Animations, a pixel editor, info displays and live games for the Divoom Pixoo 64, controlled from a web page.

## Quick start (home server, works on phones)

```sh
git clone https://github.com/descalzi/pixoo && cd pixoo
python3 server.py                 # Python 3 only, nothing to install
```

Open `http://<server-ip>:8080` on any phone or computer on the same wifi.
The server hosts the page and forwards commands to the Pixoo, so browser restrictions on calling
local devices don't apply.

Options: `python3 server.py --pixoo 192.168.4.192 --port 8080`

## What's in the page

- **Effects**: plasma, aurora, fire, rainbow tunnel, starfield, matrix rain, bouncing heart (up to 40 frames, adjustable speed).
- **Draw**: a 64×64 pixel editor with palette, fill, eraser and multiple frames.
- **Info displays**: a clock, or a clock with weather from [Open-Meteo](https://open-meteo.com) (free, no key). Updates every minute while the page is open.
- **Play**: snake steered with the arrow keys or by swiping, mirrored live to the Pixoo, with a frame-rate counter.

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

## Python client (optional)

```sh
pip install -r requirements.txt
python animations/plasma.py --preview   # writes animations/plasma_preview.gif
python animations/plasma.py             # sends it to the Pixoo
```

`pixoo.py` has `Pixoo(ip).push_frames(frames)`, `text()`, `brightness()` and `settings()`.
