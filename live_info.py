"""Info displays drawn on the home server: clock, clock and weather, week forecast, today and the week.

These are Python ports of the drawing code in web/js/app.js and web/js/pixelart.js (fancyText,
litOval, the weather icons), so the server can redraw them every minute with the page closed.
The pixel fonts are read straight out of the JavaScript files, so there is one source for them.
Standard library only.
"""
import base64
import json
import math
import re
import threading
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

S = 64
WEB = Path(__file__).resolve().parent / "web" / "js"


def _rnd(v):
    """JavaScript's Math.round (halves round up), so colours match the page exactly."""
    return math.floor(v + .5)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(_rnd(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---- fonts, read from the page's own scripts --------------------------------------------
def _load_fonts():
    app = (WEB / "app.js").read_text(encoding="utf-8")
    block = app[app.index("const FONT = {"):]
    block = block[:block.index("};")]
    small = {m.group(1) or m.group(2): m.group(3) for m in re.finditer(r"(?:'(.)'|([A-Z]))\s*:\s*'([01]{15})'", block)}
    art = (WEB / "pixelart.js").read_text(encoding="utf-8")
    block = art[art.index("const BIG = {"):]
    block = block[:block.index("};")]
    big = {}
    for m in re.finditer(r"'(.)'\s*:\s*\[([^\]]*)\]", block):
        big[m.group(1)] = re.findall(r"'([01]+)'", m.group(2))
    return small, big


SMALL, BIG = _load_fonts()


def _glyph(ch, big):
    if big:
        return BIG.get(ch, BIG[" "])
    g = SMALL.get(ch, SMALL[" "])
    return [g[r * 3:r * 3 + 3] for r in range(5)]


def glyph_mask(s, big, scale):
    s = str(s) if big else str(s).upper()
    h = (7 if big else 5) * scale
    w = max(0, sum((len(_glyph(ch, big)[0]) + 1) * scale for ch in s) - scale)
    m = bytearray(w * h)
    x0 = 0
    for ch in s:
        g = _glyph(ch, big)
        for ry, row in enumerate(g):
            for rx, v in enumerate(row):
                if v != "1":
                    continue
                for dy in range(scale):
                    for dx in range(scale):
                        m[(ry * scale + dy) * w + x0 + rx * scale + dx] = 1
        x0 += (len(g[0]) + 1) * scale
    return m, w, h


def fancy_width(s, big=True, scale=1):
    return glyph_mask(s, big, scale)[1]


class Canvas:
    def __init__(self):
        self.buf = bytearray(S * S * 3)

    def put(self, x, y, col, alpha=1.0):
        x, y = int(x), int(y)
        if 0 <= x < S and 0 <= y < S:
            k = (y * S + x) * 3
            if alpha >= 1:
                self.buf[k:k + 3] = bytes(col)
            else:
                self.buf[k:k + 3] = bytes(_rnd(self.buf[k + i] * (1 - alpha) + col[i] * alpha) for i in range(3))

    def rect(self, x, y, w, h, col, alpha=1.0):
        for j in range(int(y), int(y + h)):
            for i in range(int(x), int(x + w)):
                self.put(i, j, col, alpha)

    def vgrad(self, y0, y1, top, bottom, span=None):
        """Vertical gradient like a canvas linear gradient from y0 to y0+span (default y1)."""
        t0, t1 = hexrgb(top), hexrgb(bottom)
        span = span or (y1 - y0)
        for y in range(y0, y1):
            col = mix(t0, t1, min(1, max(0, (y - y0 + .5) / span)))
            for x in range(S):
                self.put(x, y, col)

    def lit_oval(self, cx, cy, rx, ry, base, light=.5, dark=.45, bands=4):
        b = hexrgb(base)
        hi, lo = mix(b, (255, 255, 255), light), mix(b, (0, 0, 0), dark)
        for y in range(-ry, ry + 1):
            span = _rnd(rx * math.sqrt(max(0, 1 - (y * y) / ((ry + .5) * (ry + .5)))))
            for x in range(-span, span + 1):
                nx, ny = x / (rx + .5), y / (ry + .5)
                v = max(0, min(1, .5 - .55 * nx - .6 * ny))
                v = _rnd(v * (bands - 1)) / (bands - 1)
                col = mix(b, hi, (v - .5) * 2) if v >= .5 else mix(lo, b, v * 2)
                self.put(_rnd(cx + x), _rnd(cy + y), col)

    def lit_disc(self, cx, cy, r, base, **o):
        self.lit_oval(cx, cy, r, r, base, **o)

    def fancy(self, s, x, y, big=True, scale=1, top="#FFFFFF", bottom="#FFC94A", outline="#1A1030",
              shadow=.55, bevel=True, align="left"):
        m, w, h = glyph_mask(s, big, scale)
        if align == "center":
            x = _rnd(x - w / 2)
        elif align == "right":
            x = x - w

        def at(i, j):
            return 0 <= i < w and 0 <= j < h and m[j * w + i]

        if shadow:
            for j in range(-1, h + 1):
                for i in range(-1, w + 1):
                    if at(i, j) or at(i - 1, j) or at(i + 1, j) or at(i, j - 1) or at(i, j + 1):
                        self.put(x + i + 1, y + j + 1, (0, 0, 0), shadow)
        if outline:
            oc = hexrgb(outline)
            for j in range(-1, h + 1):
                for i in range(-1, w + 1):
                    if not at(i, j) and any(at(i + di, j + dj) for di in (-1, 0, 1) for dj in (-1, 0, 1)):
                        self.put(x + i, y + j, oc)
        t0, t1 = hexrgb(top), hexrgb(bottom)
        for j in range(h):
            base = mix(t0, t1, j / (h - 1) if h > 1 else 0)
            for i in range(w):
                if not at(i, j):
                    continue
                col = base
                if bevel and (scale > 1 or big):
                    if not at(i, j - 1) or not at(i - 1, j):
                        col = mix(base, (255, 255, 255), .45)
                    elif not at(i, j + 1) or not at(i + 1, j):
                        col = mix(base, (0, 0, 0), .35)
                self.put(x + i, y + j, col)
        return w

    def b64(self):
        return base64.b64encode(bytes(self.buf)).decode()


# ---- pieces of the info screens (ports of app.js) ---------------------------------------
def sky_background(c, now):
    h = now.hour + now.minute / 60
    sky = (("#070B24", "#1A0F33") if h < 6 or h >= 21 else ("#2B2160", "#B0507A") if h < 8
           else ("#0E3A7A", "#2C6FB8") if h < 18 else ("#2A1B5C", "#C25A4A"))
    c.vgrad(0, S, *sky)
    if h < 6 or h >= 21:
        for x, y in ((5, 4), (58, 7), (12, 30), (52, 28), (33, 2), (3, 58), (60, 55)):
            c.put(x, y, hexrgb("#C9D2FF"))


def draw_icon(c, kind, x, y):
    def cloud(ox, oy, base):
        c.lit_disc(x + ox + 6, y + oy + 8, 5, base)
        c.lit_disc(x + ox + 12, y + oy + 6, 6, base)
        c.lit_disc(x + ox + 16, y + oy + 9, 4, base)
        c.lit_oval(x + ox + 11, y + oy + 11, 8, 2, base)
    if kind == "sun":
        for a, b in ((10, 0), (10, 17), (1, 9), (19, 9), (4, 3), (16, 3), (4, 15), (16, 15)):
            c.rect(x + a - 1, y + b - 1, 2, 2, hexrgb("#FFB000"))
        c.lit_disc(x + 10, y + 9, 6, "#FFC83D", light=.6)
        return
    if kind == "cloud":
        c.lit_disc(x + 6, y + 5, 4, "#FFC83D")
        cloud(0, 2, "#E4E9F5")
        return
    cloud(0, 0, "#9AA3B8" if kind == "storm" else "#D5DCEB")
    drops = ((5, 15), (10, 17), (15, 15))
    if kind == "rain":
        for a, b in drops:
            c.rect(x + a, y + b, 1, 2, hexrgb("#4FB3FF"))
            c.rect(x + a, y + b, 1, 1, hexrgb("#B5E2FF"))
    if kind == "snow":
        for a, b in drops:
            c.rect(x + a - 1, y + b, 3, 1, (255, 255, 255))
            c.rect(x + a, y + b - 1, 1, 3, (255, 255, 255))
    if kind == "storm":
        for a, b, w in ((11, 13, 3), (10, 14, 3), (9, 15, 3), (11, 16, 2), (10, 17, 2)):
            c.rect(x + a, y + b, w, 1, hexrgb("#FFD36B"))
    if kind == "fog":
        c.rect(x + 1, y + 15, 18, 1, hexrgb("#8A93A6"))
        c.rect(x + 4, y + 17, 13, 1, hexrgb("#8A93A6"))


def mini_icon(c, kind, x, y):
    def P(a, b, col):
        c.put(x + a, y + b, hexrgb(col))

    def cloud(col):
        c.lit_disc(x + 3, y + 3, 2, col, bands=3)
        c.lit_disc(x + 5, y + 2, 2, col, bands=3)
        c.rect(x + 1, y + 4, 7, 1, hexrgb(col))
    if kind == "sun":
        c.lit_disc(x + 4, y + 3, 2, "#FFC83D", light=.6, bands=3)
        for a, b in ((4, 0), (4, 6), (1, 3), (7, 3)):
            P(a, b, "#FFB000")
        return
    if kind == "cloud":
        c.lit_disc(x + 2, y + 2, 2, "#FFC83D", bands=3)
        cloud("#E4E9F5")
        return
    if kind == "fog":
        for a, b, w in ((0, 2, 8), (1, 4, 7), (0, 6, 6)):
            c.rect(x + a, y + b, w, 1, hexrgb("#9AA3B8"))
        return
    cloud("#9AA3B8" if kind == "storm" else "#D5DCEB")
    if kind == "rain":
        P(2, 6, "#4FB3FF"); P(5, 6, "#4FB3FF")
    if kind == "snow":
        P(2, 6, "#FFFFFF"); P(4, 6, "#FFFFFF"); P(6, 6, "#FFFFFF")
    if kind == "storm":
        P(4, 5, "#FFD36B"); P(3, 6, "#FFD36B")


def _warm(t):
    return ("#FFE29A", "#FF7A3D") if t >= 25 else ("#E6F6FF", "#5FB4FF") if t <= 5 else ("#FFFFFF", "#7CF0C5")


DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]  # Python's weekday() order


def _lo_hi(c, w, cx, y):
    lo, hi, sep = f"{w['lo']}°", f"{w['hi']}°", 5
    lw, hw = fancy_width(lo, big=False), fancy_width(hi, big=False)
    x0 = cx - _rnd((lw + sep + hw) / 2)
    c.fancy(lo, x0, y, big=False, top="#BFE6FF", bottom="#5FB4FF")
    c.put(x0 + lw + 2, y + 2, (255, 255, 255), .6)
    c.fancy(hi, x0 + lw + sep, y, big=False, top="#FFE29A", bottom="#FF9A3D")


def _no_weather(c, has_place, y, what="WEATHER"):
    c.fancy(f"NO {what}" if has_place else "SET LOCATION", 32, y, big=False, top="#FFB3B3", bottom="#FF6B6B", align="center")


def render(kind, now, w, f, has_place):
    """One 64x64 frame for an info display. w: current weather, f: list of 7 forecast days."""
    c = Canvas()
    hhmm = now.strftime("%H:%M")
    if kind == "forecast":
        c.vgrad(0, S, "#0B1033", "#1D1444")
        if not f:
            _no_weather(c, has_place, 29, "FORECAST")
            return c
        lo_all, hi_all = min(d["lo"] for d in f), max(d["hi"] for d in f)
        span = max(1, hi_all - lo_all)
        bar0, barw = 36, 13

        def temp_col(t):
            if t <= 5:
                return (95, 180, 255)
            if t >= 25:
                return (255, 122, 61)
            if t <= 15:
                return mix((95, 180, 255), (124, 240, 197), (t - 5) / 10)
            return mix((124, 240, 197), (255, 200, 74), (t - 15) / 10)
        for i, d in enumerate(f[:7]):
            y = 1 + i * 9
            if i % 2:
                c.rect(0, y - 1, S, 9, (255, 255, 255), .05)
            name = "TOD" if i == 0 else DAYS[date.fromisoformat(d["day"]).weekday()]
            style = dict(top="#FFE29A", bottom="#FFB000") if i == 0 else dict(top="#FFFFFF", bottom="#BFC9E6")
            c.fancy(name, 1, y + 1, big=False, **style)
            mini_icon(c, d["kind"], 13, y)
            c.fancy(str(d["lo"]), 33, y + 1, big=False, top="#BFE6FF", bottom="#5FB4FF", align="right")
            c.rect(bar0, y + 3, barw, 1, (255, 255, 255), .14)
            a = bar0 + _rnd((d["lo"] - lo_all) / span * (barw - 1))
            b = bar0 + _rnd((d["hi"] - lo_all) / span * (barw - 1))
            for x in range(a, b + 1):
                col = temp_col(d["lo"] + (d["hi"] - d["lo"]) * ((x - a) / (b - a) if b > a else 1))
                c.put(x, y + 2, col)
                c.put(x, y + 3, mix(col, (0, 0, 0), .3))
            c.fancy(str(d["hi"]), 51, y + 1, big=False, top="#FFE29A", bottom="#FF9A3D")
        return c

    sky_background(c, now)
    time_style = dict(big=True, scale=2, top="#FFFFFF", bottom="#FFC94A", align="center")
    if kind == "today":
        c.fancy(hhmm, 32, 1, **time_style)
        if not w:
            _no_weather(c, has_place, 30)
            return c
        draw_icon(c, w["kind"], 2, 18)
        warm = _warm(w["t"])
        c.fancy(f"{w['t']}°", 44, 18, big=True, scale=2, top=warm[0], bottom=warm[1], align="center")
        _lo_hi(c, w, 44, 35)
        if not f:
            return c
        c.rect(0, 42, S, 22, (5, 4, 20), .45)
        c.rect(0, 42, S, 1, (255, 255, 255), .2)
        for i, d in enumerate(f[1:7]):
            cx = 6 + i * 10 + (1 if i > 2 else 0)
            c.fancy(DAYS[date.fromisoformat(d["day"]).weekday()][:2], cx, 44, big=False, top="#FFFFFF", bottom="#BFC9E6", align="center")
            mini_icon(c, d["kind"], cx - 4, 50)
            wd = _warm(d["hi"])
            c.fancy(str(d["hi"]), cx, 58, big=False, top=wd[0], bottom=wd[1], align="center")
        return c

    date_txt = f"{DAYS[now.weekday()]} {now.day:02d}-{now.month:02d}"
    if kind == "clock":
        c.fancy(hhmm, 32, 16, **time_style)
        c.fancy(date_txt, 32, 39, big=False, top="#BFE6FF", bottom="#7FB8FF", align="center")
        return c
    # clock and weather
    c.fancy(hhmm, 32, 3, **time_style)
    c.fancy(date_txt, 32, 21, big=False, top="#BFE6FF", bottom="#7FB8FF", align="center")
    c.rect(6, 29, 52, 1, (255, 255, 255), .18)
    if w:
        draw_icon(c, w["kind"], 3, 33)
        warm = _warm(w["t"])
        c.fancy(f"{w['t']}°", 44, 33, big=True, scale=2, top=warm[0], bottom=warm[1], align="center")
        _lo_hi(c, w, 44, 55)
    else:
        _no_weather(c, has_place, 42)
    return c


# ---- weather ---------------------------------------------------------------------------
def wmo(code):
    return ("sun" if code == 0 else "cloud" if code <= 3 else "fog" if code <= 48
            else "rain" if code <= 67 or 80 <= code <= 82 else "snow" if code <= 77 or code in (85, 86) else "storm")


def fetch_weather(lat, lon):
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
           "&current=temperature_2m,relative_humidity_2m,weather_code"
           "&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7" % (lat, lon))
    with urllib.request.urlopen(url, timeout=10) as r:
        j = json.load(r)
    cur, d = j["current"], j["daily"]
    days = [{"day": day, "kind": wmo(d["weather_code"][i]), "hi": _rnd(d["temperature_2m_max"][i]),
             "lo": _rnd(d["temperature_2m_min"][i])} for i, day in enumerate(d["time"])]
    now = {"t": _rnd(cur["temperature_2m"]), "h": cur["relative_humidity_2m"], "kind": wmo(cur["weather_code"]),
           "hi": days[0]["hi"], "lo": days[0]["lo"]}
    return now, days


# ---- the player ------------------------------------------------------------------------
KINDS = ("clock", "weather", "forecast", "today")


class InfoPlayer:
    """Keeps one info display on the Pixoo, redrawn just after every minute."""

    def __init__(self, pixoo, data_dir, location):
        self.pixoo, self.location = pixoo, location
        self.state_file = Path(data_dir) / "info_state.json"
        self.config = {}
        self.weather = self.forecast = None
        self.weather_at, self.weather_key, self.weather_error = 0.0, None, None
        self.error = None
        self.updated = None
        self._stop = threading.Event()
        self._thread = None
        try:
            st = json.loads(self.state_file.read_text())
            if st.get("running") and st.get("config", {}).get("kind") in KINDS:
                self.start(st["config"])  # resume after a restart
        except (OSError, ValueError):
            pass

    @property
    def running(self):
        return bool(self._thread and self._thread.is_alive())

    def _save(self, running):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps({"running": running, "config": self.config}))

    def start(self, config):
        kind = config.get("kind")
        if kind not in KINDS:
            raise ValueError(f"unknown display {kind!r}")
        self.stop(save=False)
        self.config = {"kind": kind}
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(self._stop,), daemon=True)
        self._thread.start()
        self._save(True)

    def stop(self, save=True):
        self._stop.set()
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=10)
        self._thread = None
        if save:
            self._save(False)

    def status(self):
        return {"running": self.running, "kind": self.config.get("kind"), "updated": self.updated,
                "weather": self.weather, "weather_error": self.weather_error, "error": self.error}

    def _refresh_weather(self):
        loc = self.location() or {}
        lat, lon = loc.get("lat"), loc.get("lon")
        if not lat or not lon:
            self.weather = self.forecast = None
            return False
        key = (lat, lon)
        if key == self.weather_key and time.time() - self.weather_at < 900:
            return True
        self.weather_at, self.weather_key = time.time(), key
        try:
            self.weather, self.forecast = fetch_weather(lat, lon)
            self.weather_error = None
        except (OSError, ValueError, KeyError, IndexError) as e:
            self.weather_error = str(e)
        return True

    def frame(self, kind=None, now=None):
        kind = kind or self.config.get("kind", "clock")
        has_place = self._refresh_weather() if kind != "clock" else True
        return render(kind, now or datetime.now(), self.weather, self.forecast, has_place)

    def _push(self):
        self.pixoo.play([self.frame().b64()], 1000)
        self.updated = datetime.now().strftime("%H:%M")

    def _run(self, stop):
        while not stop.is_set():
            try:
                self._push()
                self.error = None
            except OSError as e:
                self.error = f"Pixoo unreachable: {e}"
            except Exception as e:  # keep going whatever happens
                self.error = str(e)
            # wake just after the next minute starts
            stop.wait(60 - datetime.now().second - datetime.now().microsecond / 1e6 + .3)
