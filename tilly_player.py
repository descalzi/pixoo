"""Living Tilly: the home server plays Tilly Tock's scenes on a schedule.

The web page renders every scene once (web/js/tilly.js) and uploads them here. This player then
picks a scene from the time of day and the weather (sleepy at night, umbrella in the rain,
shivering in the cold, sunglasses in the heat, otherwise idling, dancing and wandering off and
back), draws the live time and temperature in the band at the top of every frame in the same
bevelled pixel font as the page, and pushes it to the Pixoo. It re-pushes every minute so the
clock stays right. Standard library only.
"""
import base64
import json
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

S = 64
BAND_TEXT_Y = 2

# 5x7 glyphs, the same as BIG in web/js/pixelart.js
BIG = {
    '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ':': ['00', '11', '11', '00', '11', '11', '00'],
    '-': ['000', '000', '000', '111', '000', '000', '000'],
    '°': ['010', '101', '010', '000', '000', '000', '000'],
    ' ': ['00', '00', '00', '00', '00', '00', '00'],
}


def _hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def text_width(s):
    return max(0, sum(len(BIG.get(ch, BIG[' '])[0]) + 1 for ch in s) - 1)


def fancy_text(buf, s, x, y, top, bottom, align='left', outline='#1A1030', shadow=.55):
    """Python port of fancyText (big font, scale 1): gradient, bevel, outline and drop shadow,
    drawn into buf, a bytearray of 64x64 RGB."""
    w, h = text_width(s), 7
    if align == 'right':
        x -= w
    m = bytearray(w * h)
    x0 = 0
    for ch in s:
        g = BIG.get(ch, BIG[' '])
        for ry, row in enumerate(g):
            for rx, v in enumerate(row):
                if v == '1':
                    m[ry * w + x0 + rx] = 1
        x0 += len(g[0]) + 1

    def at(i, j):
        return 0 <= i < w and 0 <= j < h and m[j * w + i]

    def put(px, py, col):
        if 0 <= px < S and 0 <= py < S:
            k = (py * S + px) * 3
            buf[k:k + 3] = bytes(col)

    def darken(px, py):
        if 0 <= px < S and 0 <= py < S:
            k = (py * S + px) * 3
            buf[k:k + 3] = bytes(round(v * (1 - shadow)) for v in buf[k:k + 3])

    for j in range(-1, h + 1):
        for i in range(-1, w + 1):
            if at(i, j) or at(i - 1, j) or at(i + 1, j) or at(i, j - 1) or at(i, j + 1):
                darken(x + i + 1, y + j + 1)
    oc = _hex(outline)
    for j in range(-1, h + 1):
        for i in range(-1, w + 1):
            if not at(i, j) and any(at(i + di, j + dj) for di in (-1, 0, 1) for dj in (-1, 0, 1)):
                put(x + i, y + j, oc)
    t0, t1 = _hex(top), _hex(bottom)
    for j in range(h):
        base = _mix(t0, t1, j / (h - 1))
        for i in range(w):
            if not at(i, j):
                continue
            col = base
            if not at(i, j - 1) or not at(i - 1, j):
                col = _mix(base, (255, 255, 255), .45)
            elif not at(i, j + 1) or not at(i + 1, j):
                col = _mix(base, (0, 0, 0), .35)
            put(x + i, y + j, col)


def stamp_band(frame_b64, hhmm, temp):
    buf = bytearray(base64.b64decode(frame_b64))
    fancy_text(buf, hhmm, 3, BAND_TEXT_Y, '#FFFFFF', '#FFC94A')
    if temp is not None:
        warm = ('#FFE29A', '#FF7A3D') if temp >= 25 else ('#E6F6FF', '#5FB4FF') if temp <= 5 else ('#FFFFFF', '#7CF0C5')
        fancy_text(buf, f"{temp}°", 61, BAND_TEXT_Y, *warm, align='right')
    return base64.b64encode(bytes(buf)).decode()


# ---- weather --------------------------------------------------------------------------
RAIN = set(range(51, 68)) | {80, 81, 82, 95, 96, 99}
SNOW = set(range(71, 78)) | {85, 86}


def fetch_weather(lat, lon):
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
           "&current=temperature_2m,weather_code&timezone=auto" % (lat, lon))
    with urllib.request.urlopen(url, timeout=10) as r:
        cur = json.load(r)["current"]
    code = cur["weather_code"]
    kind = "rain" if code in RAIN else "snow" if code in SNOW else "clear"
    return {"t": round(cur["temperature_2m"]), "kind": kind}


# ---- choosing what Tilly does -----------------------------------------------------------
def mood_for(now, weather):
    """The plan for this moment: a list of (scene, sky, seconds) steps to cycle through.
    seconds=None means play the scene once (walking off or back on)."""
    h = now.hour + now.minute / 60
    night = h < 7 or h >= 20
    sky = "night" if night else "day"
    t = weather["t"] if weather else None
    kind = weather["kind"] if weather else "clear"
    if h >= 23 or h < 7:
        return "asleep", [("sleep", "night", 300)]
    if h >= 21 or h < 8:
        return "sleepy", [("yawn", "night", 40), ("idle", sky, 40)] if h >= 21 else [("yawn", "night", 40), ("idle", "day", 60)]
    if kind == "rain":
        return "rainy", [("rain", "rain", 300)]
    if kind == "snow" or (t is not None and t <= 5):
        return "cold", [("cold", "cold", 300)]
    if t is not None and t >= 27 and not night:
        return "hot", [("hot", "hot", 300)]
    return "playful", [
        ("idle", sky, 45), ("dance", sky, 25), ("idle", sky, 45),
        ("walk_out", sky, None), ("away", sky, 30), ("walk_in", sky, None),
    ]


class TillyPlayer:
    def __init__(self, pixoo, data_dir):
        self.pixoo = pixoo
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.scenes_file, self.state_file = self.dir / "tilly_scenes.json", self.dir / "tilly_state.json"
        self.scenes = {}
        self.config = {}
        self.weather, self.weather_at, self.weather_error = None, 0.0, None
        self.now_playing = None
        self.mood = None
        self.error = None
        self._stop = threading.Event()
        self._thread = None
        self._load()

    # -- persistence
    def _load(self):
        try:
            self._set_scenes(json.loads(self.scenes_file.read_text()))
        except (OSError, ValueError, KeyError, TypeError):
            pass
        try:
            state = json.loads(self.state_file.read_text())
            self.config = state.get("config", {})
            if state.get("running") and self.scenes:
                self.start(self.config)  # pick up where we left off after a restart
        except (OSError, ValueError):
            pass

    def _save_state(self, running):
        self.state_file.write_text(json.dumps({"running": running, "config": self.config}))

    def _set_scenes(self, pack):
        scenes = {}
        for sc in pack:
            frames = sc["frames"][:40]
            if not frames or any(len(base64.b64decode(f)) != S * S * 3 for f in frames[:1]):
                raise ValueError(f"bad frames in {sc.get('name')}")
            scenes[(sc["name"], sc["sky"])] = {"speed": int(sc["speed"]), "loop": bool(sc["loop"]), "frames": frames}
        if not scenes:
            raise ValueError("no scenes")
        self.scenes = scenes

    def upload(self, pack):
        self._set_scenes(pack)
        self.scenes_file.write_text(json.dumps(pack))
        return len(self.scenes)

    # -- control
    @property
    def running(self):
        return bool(self._thread and self._thread.is_alive())

    def start(self, config):
        if not self.scenes:
            raise ValueError("Upload Tilly's scenes first")
        self.stop(save=False)
        self.config = {k: config[k] for k in ("lat", "lon") if config.get(k) not in (None, "")}
        self.weather_at = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(self._stop,), daemon=True)
        self.mood = mood_for(datetime.now(), self.weather)[0]
        self._thread.start()
        self._save_state(True)

    def stop(self, save=True):
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=10)
        self._thread = None
        self.now_playing = None
        if save:
            self._save_state(False)

    def status(self):
        return {
            "running": self.running, "scenes": len(self.scenes), "mood": self.mood,
            "scene": self.now_playing and self.now_playing[0], "sky": self.now_playing and self.now_playing[1],
            "weather": self.weather, "weather_error": self.weather_error, "error": self.error, "config": self.config,
        }

    # -- the loop
    def _refresh_weather(self):
        if not self.config.get("lat") or time.time() - self.weather_at < 900:
            return
        self.weather_at = time.time()
        try:
            self.weather, self.weather_error = fetch_weather(self.config["lat"], self.config["lon"]), None
        except (OSError, ValueError, KeyError) as e:
            self.weather_error = str(e)

    def _scene(self, name, sky):
        return self.scenes.get((name, sky)) or self.scenes.get((name, "day")) or self.scenes.get(("idle", sky)) \
            or next(iter(self.scenes.values()))

    def _push(self, name, sky, first_frame_only=False):
        sc = self._scene(name, sky)
        now = datetime.now()
        hhmm = now.strftime("%H:%M")
        temp = self.weather["t"] if self.weather else None
        frames = sc["frames"][:1] if first_frame_only else sc["frames"]
        send = lambda body: self.pixoo.send(json.dumps(body).encode())
        send({"Command": "Draw/ResetHttpGifId"})
        for i, f in enumerate(frames):
            if self._stop.is_set():
                return sc
            send({"Command": "Draw/SendHttpGif", "PicNum": len(frames), "PicWidth": S, "PicOffset": i,
                  "PicID": 1, "PicSpeed": sc["speed"], "PicData": stamp_band(f, hhmm, temp)})
        self.now_playing = (name, sky)
        return sc

    def _run(self, stop):
        step = 0
        plan_key = None
        while not stop.is_set():
            try:
                self._refresh_weather()
                mood, plan = mood_for(datetime.now(), self.weather)
                if mood != plan_key:
                    plan_key, step = mood, 0
                self.mood = mood
                name, sky, seconds = plan[step % len(plan)]
                # show the first frame straight away (one quick request) so a change of scene
                # never lingers on the old one while the full animation uploads
                if self.now_playing != (name, sky):
                    self._push(name, sky, first_frame_only=True)
                sc = self._push(name, sky)
                self.error = None
                if seconds is None:  # walk off or on: play once, then move straight on
                    stop.wait(len(sc["frames"]) * sc["speed"] / 1000)
                    step += 1
                    continue
                end = time.time() + seconds
                while not stop.is_set():
                    left = end - time.time()
                    to_minute = 60 - datetime.now().second + .2
                    if left <= to_minute:
                        stop.wait(max(0, left))
                        step += 1
                        break
                    stop.wait(to_minute)
                    if stop.is_set():
                        break
                    # new minute: redraw the time on the same scene (or switch if the mood changed)
                    self._refresh_weather()
                    if mood_for(datetime.now(), self.weather)[0] != plan_key:
                        break
                    self._push(name, sky)
            except OSError as e:
                self.error = f"Pixoo unreachable: {e}"
                stop.wait(20)
            except Exception as e:  # keep playing whatever happens
                self.error = str(e)
                stop.wait(20)
