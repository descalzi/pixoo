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
import random
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


# ---- making uploads lighter -----------------------------------------------------------
SLOW_MS = 400  # above this per frame, the device is too slow to re-upload a scene every minute


def collapse_runs(frames, speed):
    """Lossless: if every frame is repeated k times in a row, keep one of each and play k times slower."""
    runs, i = [], 0
    while i < len(frames):
        j = i
        while j + 1 < len(frames) and frames[j + 1] == frames[i]:
            j += 1
        runs.append(j - i + 1)
        i = j + 1
    from math import gcd
    k = 0
    for r in runs:
        k = gcd(k, r)
    if k <= 1:
        return frames, speed
    return frames[::k], speed * k


def lighten(frames, speed, loop, slow):
    frames, speed = collapse_runs(frames, speed)
    if slow and loop and len(frames) > 20:  # half the frames, same timing, for slow devices
        frames, speed = frames[::2], speed * 2
    return frames, speed


# The device draws these itself in slow mode, so the clock stays right without re-uploading.
OVERLAY = [
    {"TextId": 1, "type": 5, "x": 2, "y": 2, "dir": 0, "font": 18, "TextWidth": 30, "Textheight": 6,
     "speed": 100, "align": 1, "color": "#FFD36B"},
    {"TextId": 2, "type": 17, "x": 34, "y": 2, "dir": 0, "font": 18, "TextWidth": 28, "Textheight": 6,
     "speed": 100, "align": 3, "color": "#8FD3FF"},
]


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


# ---- choosing what a character does ------------------------------------------------------
# Characters are whatever packs the page has uploaded. Tilly has her own day (tilly_plan); every
# other character simply gets one of its scenes per half hour, so a new character needs nothing
# here: draw its scenes in the page and it joins in.
MIX = "mix"
SLOT_MIN = 30


def _slot(now):
    return (now.hour * 60 + now.minute) // SLOT_MIN


def rotate_plan(character, scenes, now):
    """One of the character's scenes per half hour, in an order shuffled for each day."""
    names = sorted(scenes)
    order = random.Random(f"{now.date()}-{character}").sample(names, len(names))
    name, sky = order[_slot(now) % len(order)]
    return f"{character}:{name}", [(name, sky, SLOT_MIN * 60)]


def pick_character(now, available):
    """Mix mode: who's on for this half hour. Characters take turns in rounds, each round in a new
    random order, so everyone gets turns and nobody is on twice in a row. Tilly takes the night
    shift (she has a proper sleeping scene)."""
    available = sorted(available)
    if not available:
        return None
    h = now.hour + now.minute / 60
    if (h >= 23 or h < 7) and "Tilly Tock" in available:
        return "Tilly Tock"
    n, slot = len(available), _slot(now)

    def order(cycle):  # a fresh shuffle for every round, so the pattern doesn't repeat
        o = random.Random(f"{now.date()}-{cycle}").sample(available, n)
        if cycle > 0 and n > 1 and o[0] == order(cycle - 1)[-1]:
            o = o[1:] + o[:1]  # never the same character twice in a row
        return o
    return order(slot // n)[slot % n]


def mood_for(now, weather, character="Tilly Tock", scenes=None):
    """(key, plan) for this moment: plan is a list of (scene, sky, seconds) steps to cycle through,
    seconds=None meaning play once (walking off or back on). scenes: {(name, sky)} of the character."""
    if character != "Tilly Tock":
        return rotate_plan(character, scenes or {("idle", "day")}, now)
    return tilly_plan(now, weather)


def tilly_plan(now, weather):
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
        self.scenes_dir, self.state_file = self.dir / "scenes", self.dir / "tilly_state.json"
        self.scenes = {}      # (character, name, sky) -> scene
        self.packs = {}       # character -> version of its uploaded scenes
        self.current = None   # the character on now (differs from config in mix mode)
        self.config = {}
        self.weather, self.weather_at, self.weather_error = None, 0.0, None
        self.now_playing = None
        self.overlay_on = False
        self.mood = None
        self.error = None
        self._stop = threading.Event()
        self._thread = None
        self._load()

    # -- persistence
    def _load(self):
        for f in sorted(self.scenes_dir.glob("*.json")) if self.scenes_dir.exists() else []:
            try:
                d = json.loads(f.read_text())
                self._add_pack(d["character"], d["version"], d["scenes"])
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

    def _add_pack(self, character, version, pack):
        scenes = {}
        for sc in pack:
            frames = sc["frames"][:40]
            if not frames or any(len(base64.b64decode(f)) != S * S * 3 for f in frames[:1]):
                raise ValueError(f"bad frames in {sc.get('name')}")
            scenes[(character, sc["name"], sc["sky"])] = {"speed": int(sc["speed"]), "loop": bool(sc["loop"]), "frames": frames}
        if not scenes:
            raise ValueError("no scenes")
        self.scenes = {k: v for k, v in self.scenes.items() if k[0] != character}
        self.scenes.update(scenes)
        self.packs[character] = version

    def upload(self, pack, meta=None):
        """Store one character's scenes (other characters' scenes are kept)."""
        meta = meta or {}
        character, version = str(meta.get("character", "Tilly Tock"))[:60], str(meta.get("version", ""))[:40]
        self._add_pack(character, version, pack)
        self.scenes_dir.mkdir(parents=True, exist_ok=True)
        slug = "".join(ch if ch.isalnum() else "_" for ch in character.lower())
        (self.scenes_dir / f"{slug}.json").write_text(json.dumps({"character": character, "version": version, "scenes": pack}))
        return len([k for k in self.scenes if k[0] == character])

    def characters(self):
        return sorted(self.packs)

    # -- control
    @property
    def running(self):
        return bool(self._thread and self._thread.is_alive())

    def start(self, config):
        if not self.scenes:
            raise ValueError("Upload the characters' scenes first")
        if config.get("character", "Tilly Tock") not in (MIX, *self.packs):
            raise ValueError(f"No scenes for {config.get('character')} yet")
        self.stop(save=False)
        self.config = {k: config[k] for k in ("lat", "lon", "character") if config.get(k) not in (None, "")}
        self.weather_at = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(self._stop,), daemon=True)
        self.mood = self._mood(datetime.now())[0]
        self._thread.start()
        self._save_state(True)

    def set_location(self, cfg):
        """The weather location changed in the page's Settings: use it from now on."""
        if cfg.get("lat") and cfg.get("lon"):
            self.config.update(lat=cfg["lat"], lon=cfg["lon"])
            self.weather_at = 0
            if self.running:
                self._save_state(True)

    def _mood(self, now):
        who = self.config.get("character", "Tilly Tock")
        if who == MIX:
            who = pick_character(now, self.packs) or "Tilly Tock"
        self.current = who
        key, plan = mood_for(now, self.weather, who, {(n, s) for c, n, s in self.scenes if c == who})
        return f"{who}|{key}", plan

    def stop(self, save=True):
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=10)
        self._thread = None
        self.now_playing = None
        if self.overlay_on:  # take the device-drawn clock off again
            try:
                self.pixoo.send(b'{"Command":"Draw/ClearHttpText"}')
            except OSError:
                pass
            self.overlay_on = False
        if save:
            self._save_state(False)

    def status(self):
        return {
            "running": self.running, "scenes": len(self.scenes), "packs": self.packs,
            "mood": self.mood and self.mood.split("|", 1)[-1],
            "character": self.config.get("character", "Tilly Tock"), "current": self.current,
            "scene": self.now_playing and self.now_playing[0], "sky": self.now_playing and self.now_playing[1],
            "weather": self.weather, "weather_error": self.weather_error, "error": self.error, "config": self.config,
            "slow": self.slow, "frame_ms": round(self.pixoo.frame_ms) if self.pixoo.frame_ms else None,
        }

    @property
    def slow(self):
        # a Pixoo that downloads GIFs gets a whole scene in one request, so it's never slow
        return self.pixoo.gif_ok is not True and bool(self.pixoo.frame_ms and self.pixoo.frame_ms > SLOW_MS)

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
        who = self.current or "Tilly Tock"
        return self.scenes.get((who, name, sky)) or self.scenes.get((who, name, "day")) \
            or self.scenes.get((who, "idle", sky)) or next(iter(self.scenes.values()))

    def _push(self, name, sky, first_frame_only=False):
        sc = self._scene(name, sky)
        now = datetime.now()
        hhmm = now.strftime("%H:%M")
        temp = self.weather["t"] if self.weather else None
        slow = self.slow
        frames, speed = lighten(sc["frames"], sc["speed"], sc["loop"], slow)
        if first_frame_only:
            frames = frames[:1]
        send = lambda body: self.pixoo.send(json.dumps(body).encode())
        if self.overlay_on and not slow:
            send({"Command": "Draw/ClearHttpText"})
            self.overlay_on = False
        frames = frames if slow else [stamp_band(f, hhmm, temp) for f in frames]
        if not self.pixoo.play(frames, speed, stop=self._stop):
            return sc
        if slow:  # let the device keep the time and temperature current
            if self.config.get("lat"):
                send({"Command": "Sys/LogAndLat", "Latitude": self.config["lat"], "Longitude": self.config["lon"]})
            send({"Command": "Draw/ClearHttpText"})
            send({"Command": "Draw/SendHttpItemList", "ItemList": OVERLAY})
            self.overlay_on = True
        self.now_playing = (name, sky)
        return {"frames": frames, "speed": speed}

    def _run(self, stop):
        step = 0
        plan_key = None
        while not stop.is_set():
            try:
                self._refresh_weather()
                mood, plan = self._mood(datetime.now())
                if mood != plan_key:
                    plan_key, step = mood, 0
                self.mood = mood
                name, sky, seconds = plan[step % len(plan)]
                # show the first frame straight away (one quick request) so a change of scene
                # never lingers on the old one while the full animation uploads
                if self.now_playing != (name, sky) and self.pixoo.gif_ok is not True:
                    self._push(name, sky, first_frame_only=True)
                sc = self._push(name, sky)
                self.error = None
                if seconds is None:  # walk off or on: play once, then move straight on
                    stop.wait(len(sc["frames"]) * sc["speed"] / 1000)
                    step += 1
                    continue
                if self.slow:  # each upload takes a while, so stay on a scene for longer
                    seconds = max(seconds * 3, 120)
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
                    if self._mood(datetime.now())[0] != plan_key:
                        break
                    if not self.slow:  # in slow mode the device draws the time itself
                        self._push(name, sky)
            except OSError as e:
                self.error = f"Pixoo unreachable: {e}"
                stop.wait(20)
            except Exception as e:  # keep playing whatever happens
                self.error = str(e)
                stop.wait(20)
