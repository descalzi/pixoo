"""Flights: the home server finds the aircraft flying closest to home and shows it as a flight card.

Positions come from free community ADS-B feeds that need no account or key (airplanes.live, with
adsb.lol and adsb.fi as fallbacks). The route and airline come from adsbdb.com, looked up once per
callsign, and the airline logo from pics.avs.io (by IATA code) or a public logo set (by ICAO code).
Everything is drawn here, so the card stays on the Pixoo with the page closed. It can also take over
the display by itself when a plane comes close and low, then hand back to Living Tilly.
Standard library only.
"""
import base64
import json
import math
import struct
import threading
import time
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

S = 64
POLL_S = 10          # the feeds allow about one request a second; every 10 s is plenty
RELEASE_S = 40       # hand the display back after this long without a close plane
PAGE_PAUSE_S = 300   # after the page sends something, don't take over for this long
UA = {"User-Agent": "pixoo-studio-flights/1.0"}

FEEDS = (
    ("airplanes.live", "https://api.airplanes.live/v2/point/{lat}/{lon}/{r}"),
    ("adsb.lol", "https://api.adsb.lol/v2/point/{lat}/{lon}/{r}"),
    ("adsb.fi", "https://opendata.adsb.fi/api/v2/lat/{lat}/lon/{lon}/dist/{r}"),
)

# ---- fonts ------------------------------------------------------------------------------
# 3x5, the same as FONT in web/js/app.js
SMALL = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
    '8': '111101111101111', '9': '111101111001111', ':': '000010000010000', '-': '000000111000000',
    '.': '000000000000010', ' ': '000000000000000', '/': '001001010100100', "'": '010010000000000',
    'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110',
    'E': '111100110100111', 'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101',
    'I': '111010010010111', 'J': '001001001101010', 'K': '101101110101101', 'L': '100100100100111',
    'M': '101111111101101', 'N': '110101101101101', 'O': '010101101101010', 'P': '110101110100100',
    'Q': '010101101110011', 'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010',
    'U': '101101101101111', 'V': '101101101101010', 'W': '101101111111101', 'X': '101101010101101',
    'Y': '101101010010010', 'Z': '111001010100111',
}
# 5x7: the digits match BIG in web/js/pixelart.js; letters added for callsigns and airports
BIG = {
    '0': '01110 10001 10001 10001 10001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00110 01000 10000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', 'H': '10001 10001 10001 11111 10001 10001 10001',
    'I': '111 010 010 010 010 010 111', 'J': '00111 00010 00010 00010 00010 10010 01100',
    'K': '10001 10010 10100 11000 10100 10010 10001', 'L': '10000 10000 10000 10000 10000 10000 11111',
    'M': '10001 11011 10101 10101 10001 10001 10001', 'N': '10001 10001 11001 10101 10011 10001 10001',
    'O': '01110 10001 10001 10001 10001 10001 01110', 'P': '11110 10001 10001 11110 10000 10000 10000',
    'Q': '01110 10001 10001 10001 10101 10010 01101', 'R': '11110 10001 10001 11110 10100 10010 10001',
    'S': '01111 10000 10000 01110 00001 00001 11110', 'T': '11111 00100 00100 00100 00100 00100 00100',
    'U': '10001 10001 10001 10001 10001 10001 01110', 'V': '10001 10001 10001 10001 10001 01010 00100',
    'W': '10001 10001 10001 10101 10101 10101 01010', 'X': '10001 10001 01010 00100 01010 10001 10001',
    'Y': '10001 10001 01010 00100 00100 00100 00100', 'Z': '11111 00001 00010 00100 01000 10000 11111',
    '-': '000 000 000 111 000 000 000', '.': '0 0 0 0 0 0 1', ' ': '00 00 00 00 00 00 00',
    '>': '00000 00100 00010 11111 00010 00100 00000',
}
BIG = {k: v.split() for k, v in BIG.items()}

PLANE = [
    '000000100000', '000001110000', '000001110000', '000001110000', '000011111000', '001111111110',
    '111111111111', '110001110001', '000001110000', '000001110000', '000011111000', '000110101100',
]
PLANE = [r + '0' for r in PLANE] + ['0' * 13]

BG = (14, 12, 30)
FG = (241, 238, 255)
MUTED = (173, 166, 214)
DIM = (47, 42, 85)
OUTLINE = (26, 16, 48)


def _hex(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def _mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Canvas:
    def __init__(self, bg=BG):
        self.buf = bytearray(bytes(bg) * (S * S))

    def put(self, x, y, col):
        if 0 <= x < S and 0 <= y < S:
            k = (y * S + x) * 3
            self.buf[k:k + 3] = bytes(col)

    def get(self, x, y):
        k = (y * S + x) * 3
        return tuple(self.buf[k:k + 3])

    def rect(self, x, y, w, h, col):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.put(i, j, col)

    def line(self, x0, y0, x1, y1, col):
        x0, y0, x1, y1 = round(x0), round(y0), round(x1), round(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.put(x0, y0, col)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def ring(self, cx, cy, r, col):
        for a in range(0, 360, 3):
            self.put(round(cx + r * math.cos(math.radians(a))), round(cy + r * math.sin(math.radians(a))), col)

    # -- text
    def small(self, s, x, y, col, align='left'):
        s = str(s).upper()
        if align == 'right':
            x -= small_width(s)
        elif align == 'center':
            x -= small_width(s) // 2
        for ch in s:
            g = SMALL.get(ch, SMALL[' '])
            for i, v in enumerate(g):
                if v == '1':
                    self.put(x + i % 3, y + i // 3, col)
            x += 4
        return x

    def fancy(self, s, x, y, top, bottom, align='left'):
        """Gradient, bevel, outline and drop shadow, like fancyText in web/js/pixelart.js."""
        s = str(s).upper()
        w, h = big_width(s), 7
        if align == 'right':
            x -= w
        elif align == 'center':
            x -= w // 2
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

        for j in range(-1, h + 1):
            for i in range(-1, w + 1):
                if at(i, j) or at(i - 1, j) or at(i + 1, j) or at(i, j - 1) or at(i, j + 1):
                    px, py = x + i + 1, y + j + 1
                    if 0 <= px < S and 0 <= py < S:
                        self.put(px, py, _mix(self.get(px, py), (0, 0, 0), .55))
        for j in range(-1, h + 1):
            for i in range(-1, w + 1):
                if not at(i, j) and any(at(i + di, j + dj) for di in (-1, 0, 1) for dj in (-1, 0, 1)):
                    self.put(x + i, y + j, OUTLINE)
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
                self.put(x + i, y + j, col)
        return x + w

    def b64(self):
        return base64.b64encode(bytes(self.buf)).decode()


def small_width(s):
    return max(0, len(str(s)) * 4 - 1)


def big_width(s):
    return max(0, sum(len(BIG.get(ch, BIG[' '])[0]) + 1 for ch in str(s).upper()) - 1)


def fit_words(s, max_px):
    """As many whole words as fit, else the first word cut short."""
    words, out = str(s or '').upper().split(), ''
    for w in words:
        trial = (out + ' ' + w).strip()
        if small_width(trial) > max_px:
            break
        out = trial
    return out or (words[0][:max(1, (max_px + 1) // 4)] if words else '')


def cut(s, max_px):
    s = str(s or '').upper()
    while s and small_width(s) > max_px:
        s = s[:-1]
    return s.strip()


# ---- PNG decoding (logos), standard library only -------------------------------------------
def decode_png(data):
    """Returns (w, h, rgba bytes) for 8-bit, non-interlaced PNGs (grey, RGB, palette, with alpha)."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError("not a PNG")
    pos, idat, plte, trns = 8, b'', None, None
    while pos < len(data):
        n, kind = struct.unpack('>I4s', data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if kind == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', chunk)
        elif kind == b'PLTE':
            plte = chunk
        elif kind == b'tRNS':
            trns = chunk
        elif kind == b'IDAT':
            idat += chunk
        elif kind == b'IEND':
            break
    if interlace or (depth != 8 and not (ctype == 3 and depth in (1, 2, 4))):
        raise ValueError("unsupported PNG")
    raw = zlib.decompress(idat)
    chans = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    bpp = max(1, chans * depth // 8)
    stride = (w * chans * depth + 7) // 8
    out, prev, i = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f, line = raw[i], bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if ctype == 3:
            per = 8 // depth
            for x in range(w):
                v = (line[x // per] >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1) if depth < 8 else line[x]
                alpha = trns[v] if trns and v < len(trns) else 255
                out += plte[v * 3:v * 3 + 3] + bytes([alpha])
        elif ctype == 6:
            out += line
        elif ctype == 2:
            for x in range(w):
                out += line[x * 3:x * 3 + 3] + b'\xff'
        elif ctype == 0:
            for v in line:
                out += bytes((v, v, v, 255))
        else:  # grey + alpha
            for x in range(w):
                v = line[x * 2]
                out += bytes((v, v, v, line[x * 2 + 1]))
    return w, h, bytes(out)


def logo_tile(png, size=15, tile=(244, 242, 255)):
    """Crop the logo to what's drawn, fit it in size x size on a light tile. Returns (pixels, brand colour)."""
    w, h, px = decode_png(png)

    def a(x, y):
        return px[(y * w + x) * 4 + 3]
    xs = [x for x in range(w) for y in range(0, h, 2) if a(x, y) > 24]
    ys = [y for y in range(h) for x in range(0, w, 2) if a(x, y) > 24]
    if not xs:
        raise ValueError("empty logo")
    x0, x1, y0, y1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1
    # logos on an opaque white background: trim the near-white border too
    if all(a(x, y) > 250 for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))):
        def ink(x, y):
            k = (y * w + x) * 4
            return min(px[k:k + 3]) < 225
        xs = [x for x in range(w) for y in range(0, h, 2) if ink(x, y)]
        ys = [y for y in range(h) for x in range(0, w, 2) if ink(x, y)]
        if xs:
            x0, x1, y0, y1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1
    cw, ch = x1 - x0, y1 - y0
    scale = max(cw, ch) / size
    ow, oh = max(1, round(cw / scale)), max(1, round(ch / scale))
    ox, oy = (size - ow) // 2, (size - oh) // 2
    grid = [[tile] * size for _ in range(size)]
    bins = {}
    for ty in range(oh):
        for tx in range(ow):
            sx0, sx1 = x0 + int(tx * scale), max(x0 + int(tx * scale) + 1, x0 + int((tx + 1) * scale))
            sy0, sy1 = y0 + int(ty * scale), max(y0 + int(ty * scale) + 1, y0 + int((ty + 1) * scale))
            r = g = b = al = 0
            for yy in range(sy0, min(sy1, h)):
                for xx in range(sx0, min(sx1, w)):
                    k = (yy * w + xx) * 4
                    aa = px[k + 3]
                    r += px[k] * aa
                    g += px[k + 1] * aa
                    b += px[k + 2] * aa
                    al += aa
            n = (min(sy1, h) - sy0) * (min(sx1, w) - sx0) or 1
            if al:
                col = (r / al, g / al, b / al)
                cov = al / (255 * n)
                grid[oy + ty][ox + tx] = tuple(round(tile[i] + (col[i] - tile[i]) * cov) for i in range(3))
                mx, mn = max(col), min(col)
                if cov > .5 and mx - mn > 60:  # saturated: a vote for the brand colour
                    b = bins.setdefault(tuple(int(v) // 64 for v in col), [0, 0, 0, 0])
                    b[0] += col[0]; b[1] += col[1]; b[2] += col[2]; b[3] += 1
    top = max(bins.values(), key=lambda b: b[3]) if bins else None
    colour = tuple(round(v / top[3]) for v in top[:3]) if top else None
    return grid, colour


# ---- geography ------------------------------------------------------------------------------
def distance_nm(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 3440.065 * 2 * math.asin(math.sqrt(a))


def bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def closest(aircraft, lat, lon):
    best = None
    for ac in aircraft:
        if ac.get("lat") is None or ac.get("lon") is None or ac.get("alt_baro") == "ground":
            continue
        if (ac.get("seen_pos") or 0) > 60:
            continue
        d = distance_nm(lat, lon, ac["lat"], ac["lon"])
        if best is None or d < best[0]:
            best = (d, ac)
    if not best:
        return None
    d, ac = best
    alt = ac.get("alt_baro") if isinstance(ac.get("alt_baro"), (int, float)) else ac.get("alt_geom")
    callsign = (ac.get("flight") or "").strip()
    return {
        "hex": ac.get("hex"), "callsign": callsign, "reg": ac.get("r"), "type": ac.get("t"),
        "desc": ac.get("desc"), "alt": round(alt) if isinstance(alt, (int, float)) else None,
        "speed": round(ac["gs"]) if isinstance(ac.get("gs"), (int, float)) else None,
        "track": ac.get("track"), "vrate": ac.get("baro_rate") or ac.get("geom_rate"),
        "squawk": ac.get("squawk"), "lat": ac["lat"], "lon": ac["lon"],
        "dist": round(d, 1), "bearing": round(bearing(lat, lon, ac["lat"], ac["lon"])),
    }


def _get_json(url, timeout=10):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return json.load(r)


# ---- the flight card ------------------------------------------------------------------------
def _alt_text(alt):
    if alt is None:
        return "--"
    return f"{alt / 1000:.1f}K" if alt >= 10000 else str(alt)


def _dist_text(d):
    return f"{d:.1f}" if d < 10 else str(round(d))


def draw_arrow(c, cx, cy, deg, col):
    """A small arrow pointing to where the plane is, as seen from home (up = north)."""
    dx, dy = math.sin(math.radians(deg)), -math.cos(math.radians(deg))
    tx, ty = cx + dx * 3, cy + dy * 3
    c.line(cx - dx * 3, cy - dy * 3, tx, ty, col)
    for side in (150, -150):
        a = math.radians(deg + side)
        c.line(tx, ty, tx + math.sin(a) * 2.6, ty - math.cos(a) * 2.6, col)


def render_card(p, route, logo):
    """p: closest() result; route: adsbdb-style dict or None; logo: (grid, colour) or None."""
    airline = (route or {}).get("airline") or {}
    brand = (logo[1] if logo and logo[1] else None) or _hash_colour(airline.get("icao") or p["callsign"][:3])
    c = Canvas()
    # header band in the airline's colour
    band = _mix(BG, brand, .45)
    c.rect(0, 0, S, 19, band)
    c.rect(0, 19, S, 1, _mix(BG, brand, .8))
    # logo tile (corners rounded off)
    tile = (244, 242, 255)
    c.rect(1, 1, 17, 17, tile)
    for x, y in ((1, 1), (17, 1), (1, 17), (17, 17)):
        c.put(x, y, band)
    if logo:
        for y, row in enumerate(logo[0]):
            for x, col in enumerate(row):
                c.put(2 + x, 2 + y, col)
    elif airline.get("iata") or airline.get("icao"):
        c.small((airline.get("iata") or airline["icao"])[:3], 10, 7, _mix(brand, (0, 0, 0), .35), align='center')
    else:  # no airline: a little plane
        for y, row in enumerate(PLANE):
            for x, v in enumerate(row):
                if v == '1':
                    c.put(3 + x, 3 + y, _mix(brand, (0, 0, 0), .35))
    name = p["callsign"] or p["reg"] or (p["hex"] or "").upper()
    if big_width(name) <= 43:
        c.fancy(name, 21, 2, '#FFFFFF', '#FFD36B')
    else:
        c.small(name, 21, 3, FG)
    c.small(fit_words(airline.get("name") or p.get("desc") or "", 42), 21, 12, _mix(FG, band, .25))

    # route
    o, d = (route or {}).get("origin") or {}, (route or {}).get("destination") or {}
    if o.get("iata_code") and d.get("iata_code"):
        txt = f"{o['iata_code']} > {d['iata_code']}"
        c.fancy(txt, 32, 23, '#FFFFFF', '#8FD3FF', align='center')
        left, right = (str(a.get("municipality") or a.get("name") or "").upper() for a in (o, d))
        if small_width(left) + small_width(right) > 58:
            left, right = cut(left, 29), cut(right, 29)
        c.small(left, 1, 33, MUTED)
        c.small(right, 63, 33, MUTED, align='right')
    else:
        reg = p["reg"] or ""
        if reg and big_width(reg) <= 62:
            c.fancy(reg, 32, 23, '#FFFFFF', '#8FD3FF', align='center')
        c.small("ROUTE UNKNOWN", 32, 33, MUTED, align='center')

    c.rect(2, 40, 60, 1, DIM)
    # altitude and aircraft type
    x = c.fancy(_alt_text(p["alt"]), 1, 43, '#E9FFF6', '#7CF0C5')
    c.small("FT", x + 2, 45, MUTED)
    vr = p.get("vrate") or 0
    if abs(vr) > 300:  # climbing or descending
        cx = x + 5  # a small up or down triangle under "FT"
        for k in range(3):
            y = 50 + (k if vr > 0 else 2 - k)
            c.rect(cx - k, y, 1 + 2 * k, 1, (124, 240, 197) if vr > 0 else (255, 143, 199))
    if p["type"]:
        c.fancy(p["type"], 63, 43, '#FFFFFF', '#FFD36B', align='right')
    # where it is and how fast
    draw_arrow(c, 4, 58, p["bearing"], (255, 143, 199))
    x = c.fancy(_dist_text(p["dist"]), 10, 55, '#FFE9F4', '#FF8FC7')
    c.small("NM", x + 2, 57, MUTED)
    if p["speed"] is not None:
        c.small("KT", 63, 57, MUTED, align='right')
        c.fancy(str(p["speed"]), 63 - 9, 55, '#FFFFFF', '#8FD3FF', align='right')
    return c.b64()


def render_empty(radius, message=None):
    c = Canvas()
    for r, col in ((8, DIM), (15, DIM), (22, (38, 34, 70))):
        c.ring(32, 26, r, col)
    c.rect(31, 25, 2, 2, (255, 143, 199))
    c.line(32, 26, 32 + 15 * math.cos(math.radians(-40)), 26 + 15 * math.sin(math.radians(-40)), (124, 240, 197))
    if message:
        c.small(cut(message, 62), 32, 52, (255, 122, 114), align='center')
        c.small("RETRYING", 32, 58, MUTED, align='center')
    else:
        c.small("NO FLIGHTS", 32, 52, FG, align='center')
        c.small(f"WITHIN {radius} NM", 32, 58, MUTED, align='center')
    return c.b64()


def _hash_colour(s):
    palette = [(139, 123, 255), (255, 143, 199), (124, 240, 197), (255, 211, 107), (143, 211, 255), (255, 158, 122)]
    return palette[sum(map(ord, s or "?")) % len(palette)]


# ---- the tracker ----------------------------------------------------------------------------
DEFAULTS = {"radius": 15, "auto": False, "auto_nm": 5, "auto_ft": 10000, "showing": False}


class FlightTracker:
    def __init__(self, pixoo, tilly, data_dir, location):
        """location() returns the shared home location from Settings as {"lat", "lon", "place"}."""
        self.pixoo, self.tilly, self.location = pixoo, tilly, location
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / "logos").mkdir(exist_ok=True)
        self.file = self.dir / "flights.json"
        self.config = dict(DEFAULTS)
        try:
            self.config.update(json.loads(self.file.read_text()))
        except (OSError, ValueError):
            pass
        self.plane = self.route = None
        self.frame = None
        self.feed, self.error, self.updated, self.count = None, None, None, 0
        self.routes, self.logos = {}, {}
        self.pushed = None
        self.takeover, self.resume_tilly, self.last_close = False, False, 0.0
        self.page_at = 0.0
        self.watch_at = 0.0
        self.lock = threading.Lock()
        self.wake = threading.Event()
        threading.Thread(target=self._run, daemon=True).start()

    # -- control (called from the web server)
    def save(self):
        self.file.write_text(json.dumps(self.config))

    def configure(self, msg):
        c = self.config
        if "radius" in msg:
            c["radius"] = max(1, min(100, int(msg["radius"])))
        if "auto" in msg:
            c["auto"] = bool(msg["auto"])
        if "auto_nm" in msg:
            c["auto_nm"] = max(.5, min(50, float(msg["auto_nm"])))
        if "auto_ft" in msg:
            c["auto_ft"] = max(500, min(60000, int(msg["auto_ft"])))
        if not c["auto"] and self.takeover:
            self._release()
        self.save()
        self.updated = None  # fetch again with the new settings
        self.wake.set()

    def show(self, msg):
        if msg:
            self.configure(msg)
        if not self.home():
            raise ValueError("Set your location in Settings first")
        if self.tilly.running:
            self.tilly.stop()
        self.takeover = False
        self.config["showing"] = True
        self.pushed = None
        self.save()
        self.wake.set()

    def stop(self):
        """Stop showing flights (the page or Tilly is taking the display)."""
        self.config["showing"] = False
        self.takeover = self.resume_tilly = False
        self.save()

    def page_drew(self):
        self.page_at = time.time()
        if self.config["showing"] or self.takeover:
            self.stop()

    def status(self):
        self.watch_at = time.time()  # someone has the page open: keep the preview fresh
        if self.updated is None or time.time() - self.updated > POLL_S:
            self.wake.set()
        r = self.route or {}
        return {
            "config": self.config, "home": self.location() if self.home() else None, "showing": self.config["showing"], "takeover": self.takeover,
            "plane": self.plane, "route": {
                "airline": (r.get("airline") or {}).get("name"),
                "origin": _airport(r.get("origin")), "destination": _airport(r.get("destination")),
            } if r else None,
            "count": self.count, "feed": self.feed, "error": self.error, "updated": self.updated,
            "frame": self.frame,
        }

    def home(self):
        try:
            loc = self.location() or {}
            return float(loc["lat"]), float(loc["lon"])
        except (KeyError, TypeError, ValueError):
            return None

    # -- lookups
    def _fetch(self, lat, lon):
        c = self.config
        last_err = None
        order = sorted(FEEDS, key=lambda f: f[0] != self.feed)  # stick with the one that worked
        for name, url in order:
            try:
                data = _get_json(url.format(lat=round(lat, 4), lon=round(lon, 4), r=int(c["radius"])))
                self.feed = name
                return data.get("ac") or data.get("aircraft") or []
            except (OSError, ValueError) as e:
                last_err = f"{name}: {e}"
        raise OSError(last_err or "no feed")

    def _route(self, callsign):
        if not callsign:
            return None
        hit = self.routes.get(callsign)
        if hit and time.time() - hit[0] < 6 * 3600:
            return hit[1]
        route = None
        try:
            data = _get_json("https://api.adsbdb.com/v0/callsign/" + urllib.parse.quote(callsign))
            resp = data.get("response")
            if isinstance(resp, dict):
                route = resp.get("flightroute")
        except (OSError, ValueError):
            if hit:
                return hit[1]
            # leave it uncached so the next poll tries again
            return None
        self.routes[callsign] = (time.time(), route)
        if len(self.routes) > 500:
            self.routes.pop(next(iter(self.routes)))
        return route

    def _logo(self, airline):
        icao, iata = (airline or {}).get("icao"), (airline or {}).get("iata")
        if not icao and not iata:
            return None
        key = icao or iata
        if key in self.logos:
            return self.logos[key]
        cache = self.dir / "logos" / f"{key}.png"
        png = None
        try:
            png = cache.read_bytes() or None
        except OSError:
            urls = []
            if iata:
                urls.append(f"https://pics.avs.io/64/64/{iata}.png")
            if icao:
                urls.append(f"https://raw.githubusercontent.com/Jxck-S/airline-logos/main/flightaware_logos/{icao}.png")
            for u in urls:
                try:
                    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=10) as r:
                        png = r.read()
                    decode_png(png)
                    break
                except (OSError, ValueError, zlib.error, struct.error, KeyError):
                    png = None
            try:
                cache.write_bytes(png or b"")  # empty file = no logo, don't ask again
            except OSError:
                pass
        logo = None
        if png:
            try:
                logo = logo_tile(png)
            except (ValueError, zlib.error, struct.error, KeyError, IndexError, ZeroDivisionError):
                logo = None
        self.logos[key] = logo
        return logo

    # -- the loop
    def _wanted(self):
        c = self.config
        return self.home() is not None and (c["showing"] or c["auto"] or time.time() - self.watch_at < 90)

    def _update(self):
        c = self.config
        lat, lon = self.home()
        try:
            ac = self._fetch(lat, lon)
            self.error = None
        except OSError as e:
            self.error = str(e)
            self.frame = render_empty(c["radius"], "FEED OFFLINE")
            return
        self.count = len(ac)
        plane = closest(ac, lat, lon)
        if plane and plane["dist"] > c["radius"] * 1.05:
            plane = None
        self.plane = plane
        if not plane:
            self.route = None
            self.frame = render_empty(c["radius"])
        else:
            route = self._route(plane["callsign"])
            self.route = route
            logo = self._logo((route or {}).get("airline") or _guess_airline(plane["callsign"]))
            self.frame = render_card(plane, route, logo)
        self.updated = time.time()

    def _push(self):
        if self.frame == self.pushed or not self.frame:
            return
        send = lambda body: self.pixoo.send(json.dumps(body).encode())
        if self.pushed is None:  # first card: clear any clock or temperature text the device draws on top
            send({"Command": "Draw/ClearHttpText"})
        send({"Command": "Draw/ResetHttpGifId"})
        send({"Command": "Draw/SendHttpGif", "PicNum": 1, "PicWidth": S, "PicOffset": 0, "PicID": 1,
              "PicSpeed": 1000, "PicData": self.frame})
        self.pushed = self.frame

    def _close_enough(self):
        p, c = self.plane, self.config
        return bool(p and p["dist"] <= c["auto_nm"] and p["alt"] is not None and p["alt"] <= c["auto_ft"])

    def _release(self):
        self.takeover = False
        if self.resume_tilly:
            self.resume_tilly = False
            try:
                self.tilly.start(self.tilly.config)
                return
            except (ValueError, OSError):
                pass
        try:  # nothing of ours was playing before: back to the Pixoo's own clock face
            self.pixoo.send(b'{"Command":"Channel/SetIndex","SelectIndex":0}')
        except OSError:
            pass

    def _run(self):
        while True:
            self.wake.wait(POLL_S)
            self.wake.clear()
            try:
                with self.lock:
                    if not self._wanted():
                        continue
                    self._update()
                    c = self.config
                    if c["showing"]:
                        self._push()
                    elif c["auto"] and time.time() - self.page_at > PAGE_PAUSE_S:
                        if self._close_enough():
                            self.last_close = time.time()
                            if not self.takeover:
                                self.resume_tilly = self.tilly.running
                                if self.resume_tilly:
                                    self.tilly.stop(save=False)
                                self.takeover, self.pushed = True, None
                            self._push()
                        elif self.takeover and time.time() - self.last_close > RELEASE_S:
                            self._release()
            except OSError as e:
                self.error = f"Pixoo unreachable: {e}"
            except Exception as e:  # keep tracking whatever happens
                self.error = str(e)


def _airport(a):
    if not a:
        return None
    return {"iata": a.get("iata_code"), "icao": a.get("icao_code"), "city": a.get("municipality"), "name": a.get("name")}


def _guess_airline(callsign):
    """Airline ICAO code from a callsign like BAW123 (three letters then a digit)."""
    if len(callsign) >= 4 and callsign[:3].isalpha() and callsign[3].isdigit():
        return {"icao": callsign[:3]}
    return None
