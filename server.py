#!/usr/bin/env python3
"""Pixoo Studio home server.

Serves the web app and forwards commands to the Pixoo, so any phone or laptop on your wifi
can use it at http://<this-server>:8080 without browser network restrictions.
Only needs Python 3 (standard library).

    python3 server.py                      # Pixoo at 192.168.4.192, web on port 8080
    python3 server.py --pixoo 192.168.4.192 --port 8080
"""
import argparse
import base64
import itertools
import json
import threading
import time
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import gifenc
from flights import FlightTracker
from live_info import InfoPlayer
from tilly_player import TillyPlayer

# Original firmware: port 80 /post. Newer units ("Pixoo-64 II"): port 9000 /divoom_api.
ENDPOINTS = (":80/post", ":9000/divoom_api")


class Pixoo:
    def __init__(self, ip):
        self.ip, self.url = ip, None
        self.lock = threading.Lock()  # the device handles one request at a time
        self.last = 0.0
        self.frame_ms = None  # how long the device takes to accept one animation frame (moving average)
        self.gifs = None      # GifHost, once the web server is up
        self.gif_ok = None    # does this Pixoo download GIFs from us? None until tried

    def _post(self, url, body, timeout=5):
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()

    def detect(self):
        for suffix in ENDPOINTS:
            url = f"http://{self.ip}{suffix}"
            try:
                self._post(url, b'{"Command":"Channel/GetIndex"}', timeout=3)
                self.url = url
                print(f"Pixoo found at {url}")
                return
            except OSError:
                pass
        raise ConnectionError(f"Pixoo not answering at {self.ip} on port 80 or 9000")

    def send(self, body):
        with self.lock:
            wait = 0.03 - (time.monotonic() - self.last)
            if wait > 0:
                time.sleep(wait)
            t0 = time.monotonic()
            try:
                if not self.url:
                    self.detect()
                try:
                    reply = self._post(self.url, body)
                except OSError:
                    self.detect()  # device may have rebooted or changed firmware
                    reply = self._post(self.url, body)
                if b"Draw/SendHttpGif" in body[:80]:
                    ms = (time.monotonic() - t0) * 1000
                    self.frame_ms = ms if self.frame_ms is None else self.frame_ms * .8 + ms * .2
                return reply
            finally:
                self.last = time.monotonic()


    def play(self, frames, speed, stop=None):
        """Show an animation (base64 RGB frames). Uses one GIF the Pixoo downloads when this unit
        supports that (tried once, then remembered), otherwise one request per frame."""
        if self.gifs and self.gif_ok is not False and len(frames) > 1:
            if self.gifs.play(self, frames, speed):
                return True
        send = lambda body: self.send(json.dumps(body).encode())
        send({"Command": "Draw/ResetHttpGifId"})
        for i, f in enumerate(frames):
            if stop is not None and stop.is_set():
                return False
            send({"Command": "Draw/SendHttpGif", "PicNum": len(frames), "PicWidth": 64, "PicOffset": i,
                  "PicID": 1, "PicSpeed": speed, "PicData": f})
        return True


class GifHost:
    """Keeps the last few GIFs for the Pixoo to download and notices when it does."""

    def __init__(self, base_url, state_file):
        self.base_url, self.state_file = base_url, state_file
        self.files, self.fetched, self.ids = {}, set(), itertools.count(1)

    def publish(self, data, base_url=None):
        name = f"anim{next(self.ids)}.gif"
        self.files[name] = data
        for old in list(self.files)[:-6]:
            del self.files[old]
        return name, f"{base_url or self.base_url}/gif/{name}"

    def wait_fetched(self, name, seconds=8):
        deadline = time.monotonic() + seconds
        while name not in self.fetched and time.monotonic() < deadline:
            time.sleep(.1)
        return name in self.fetched

    def remember(self, pixoo, ok):
        if pixoo.gif_ok != ok:
            pixoo.gif_ok = ok
            try:
                self.state_file.parent.mkdir(parents=True, exist_ok=True)
                self.state_file.write_text(json.dumps({"gif_ok": ok}))
            except OSError:
                pass

    def play(self, pixoo, frames, speed):
        data = gifenc.encode([base64.b64decode(f) for f in frames], speed)
        name, url = self.publish(data)
        pixoo.send(json.dumps({"Command": "Device/PlayTFGif", "FileType": 2, "FileName": url}).encode())
        ok = self.wait_fetched(name, 8 if pixoo.gif_ok is None else 5)
        self.remember(pixoo, ok)
        return ok


class Shows:
    """The things the home server keeps on the Pixoo by itself: a character (TillyPlayer) or an info
    display (InfoPlayer). Only one plays at a time. Flights talks to this as if it were one player,
    so it can pause whatever is on and hand back to it afterwards."""

    def __init__(self, tilly, info):
        self.tilly, self.info = tilly, info
        self.last = None  # what was playing before the last stop, so Flights can hand it back

    @property
    def running(self):
        return self.tilly.running or self.info.running

    @property
    def config(self):
        if self.info.running:
            return {"_show": "info", **self.info.config}
        if self.tilly.running or not self.last:
            return {"_show": "character", **self.tilly.config}
        return self.last

    def start(self, config):
        config = dict(config)
        which = config.pop("_show", "character")
        self.stop(save=False)
        (self.info if which == "info" else self.tilly).start(config)

    def stop(self, save=True):
        if self.running:
            self.last = self.config
        if self.tilly.running:
            self.tilly.stop(save=save)
        if self.info.running:
            self.info.stop(save=save)

    def status(self):
        st = {"running": self.running, "show": "info" if self.info.running else "character" if self.tilly.running else None}
        st["info"], st["character"] = self.info.status(), self.tilly.status()
        return st


class Handler(SimpleHTTPRequestHandler):
    pixoo: Pixoo = None
    tilly: TillyPlayer = None
    info: InfoPlayer = None
    shows: Shows = None
    flights: FlightTracker = None
    gif_host: "GifHost" = None  # GIFs the Pixoo can download
    config_file: Path = None  # settings shared by every device that opens the page (weather location)

    def _config(self):
        try:
            return json.loads(self.config_file.read_text())
        except (OSError, ValueError):
            return {}

    def do_GET(self):
        if self.path == "/api/health":
            fm = self.pixoo.frame_ms
            return self._json(200, {"ok": True, "pixoo": self.pixoo.ip, "endpoint": self.pixoo.url, "tilly": True,
                                    "frame_ms": round(fm) if fm else None})
        if self.path == "/api/tilly/status":
            return self._json(200, self.tilly.status())
        if self.path in ("/api/info/status", "/api/live/status"):
            return self._json(200, self.shows.status())
        if self.path.startswith("/api/info/preview"):
            from urllib.parse import parse_qs, urlparse
            kind = parse_qs(urlparse(self.path).query).get("kind", ["clock"])[0]
            try:
                return self._json(200, {"frame": self.info.frame(kind).b64()})
            except Exception as e:
                return self._json(400, {"error": str(e)})
        if self.path == "/api/config":
            return self._json(200, self._config())
        if self.path == "/api/flights/status":
            return self._json(200, self.flights.status())
        if self.path.startswith("/gif/") and self.path[5:] in self.gif_host.files:
            data = self.gif_host.files[self.path[5:]]
            self.gif_host.fetched.add(self.path[5:])
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            msg = json.loads(body or b"{}")
        except ValueError:
            return self._json(400, {"error": "body must be JSON"})
        if self.path.startswith("/api/tilly/"):
            return self._tilly(self.path[len("/api/tilly/"):], msg)
        if self.path.startswith("/api/flights/"):
            return self._flights(self.path[len("/api/flights/"):], msg)
        if self.path.startswith("/api/info/"):
            try:
                action = self.path[len("/api/info/"):]
                if action == "start":
                    self.flights.stop()  # the info display takes the display
                    self.shows.stop(save=True)
                    self.info.start(msg)
                elif action == "stop":
                    self.info.stop()
                else:
                    return self._json(404, {"error": "not found"})
            except (ValueError, KeyError, TypeError) as e:
                return self._json(400, {"error": str(e)})
            return self._json(200, self.shows.status())
        if self.path == "/api/gif":
            self.flights.page_drew()
            return self._gif(msg)
        if self.path == "/api/config":
            cfg = self._config()
            for k in ("lat", "lon", "place"):
                if k in msg:
                    cfg[k] = str(msg[k])[:120]
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            self.config_file.write_text(json.dumps(cfg))
            self.tilly.set_location(cfg)
            self.flights.updated = None  # look around the new home on the next poll
            self.flights.wake.set()
            return self._json(200, cfg)
        if self.path != "/api":
            return self._json(404, {"error": "not found"})
        # anything the page draws takes over the screen from the server's shows and Flights
        if str(msg.get("Command", "")).startswith("Draw/"):
            self.shows.stop()
            self.flights.page_drew()
        try:
            reply = self.pixoo.send(body)
        except OSError as e:
            return self._json(502, {"error": f"Pixoo unreachable: {e}"})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

    def _gif(self, msg):
        """Experimental: turn the frames into one GIF file and ask the Pixoo to download and play
        it (Device/PlayTFGif with a web link), instead of sending one request per frame."""
        try:
            frames = [base64.b64decode(f) for f in msg["frames"][:60]]
            if not frames or any(len(f) != 64 * 64 * 3 for f in frames):
                raise ValueError("frames must be 64x64 RGB")
            data = gifenc.encode(frames, int(msg.get("speed", 100)))
        except (KeyError, TypeError, ValueError) as e:
            return self._json(400, {"error": str(e)})
        # the Pixoo must reach this server by the address the page used, unless that was localhost
        host = self.headers.get("Host", "")
        if not host or host.split(":")[0] in ("localhost", "127.0.0.1"):
            host = f"{lan_ip()}:{self.server.server_address[1]}"
        name, url = self.gif_host.publish(data, f"http://{host}")
        self.shows.stop()
        try:
            reply = self.pixoo.send(json.dumps({"Command": "Device/PlayTFGif", "FileType": 2, "FileName": url}).encode())
        except OSError as e:
            return self._json(502, {"error": f"Pixoo unreachable: {e}"})
        try:
            reply = json.loads(reply)
        except ValueError:
            reply = None
        fetched = self.gif_host.wait_fetched(name)
        self.gif_host.remember(self.pixoo, fetched)
        return self._json(200, {"ok": True, "url": url, "bytes": len(data), "frames": len(frames),
                                "fetched": fetched, "reply": reply})

    def _tilly(self, action, msg):
        try:
            if action == "scenes":
                meta = {k: msg[k] for k in ("character", "version") if k in msg}
                return self._json(200, {"ok": True, "scenes": self.tilly.upload(msg.get("scenes", []), meta),
                                        "packs": self.tilly.packs})
            if action == "start":
                self.flights.stop()  # the character takes the display
                self.shows.stop()
                cfg = self._config()  # fall back to the shared weather location from Settings
                self.tilly.start({"lat": cfg.get("lat"), "lon": cfg.get("lon"), **{k: v for k, v in msg.items() if v}})
            elif action == "stop":
                self.tilly.stop()
            else:
                return self._json(404, {"error": "not found"})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": str(e)})
        return self._json(200, self.tilly.status())

    def _flights(self, action, msg):
        try:
            if action == "config":
                self.flights.configure(msg)
            elif action == "show":
                self.flights.show(msg)
            elif action == "stop":
                self.flights.stop()
            else:
                return self._json(404, {"error": "not found"})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": str(e)})
        return self._json(200, self.flights.status())

    def end_headers(self):
        # make browsers check for a newer page/script every time, so an update shows up after a
        # plain reload instead of mixing a new page with old cached scripts
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if "/api" not in self.path:  # keep the log quiet during animations
            super().log_message(fmt, *args)


def lan_ip():
    """Best guess at this machine's address on the home network, for the startup message."""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.168.0.1", 9))  # no packet is sent; this just picks the outgoing interface
            return s.getsockname()[0]
    except OSError:
        return "<this-server-ip>"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pixoo", default="192.168.4.192", help="Pixoo IP address")
    ap.add_argument("--port", type=int, default=8080, help="port for the web app")
    args = ap.parse_args()
    Handler.pixoo = Pixoo(args.pixoo)
    try:
        Handler.pixoo.detect()
    except ConnectionError as e:
        print(f"Warning: {e}. Will retry when the page sends something.")
    here = Path(__file__).resolve().parent
    web = here / "web"
    Handler.config_file = here / "data" / "config.json"
    try:
        Handler.pixoo.gif_ok = json.loads((here / "data" / "device.json").read_text()).get("gif_ok")
    except (OSError, ValueError):
        pass
    Handler.tilly = TillyPlayer(Handler.pixoo, here / "data")  # resumes a character if one was on
    Handler.info = InfoPlayer(Handler.pixoo, here / "data", location=lambda: Handler._config(Handler))
    Handler.shows = Shows(Handler.tilly, Handler.info)
    Handler.flights = FlightTracker(Handler.pixoo, Handler.shows, here / "data",
                                    location=lambda: Handler._config(Handler))  # resumes Flights if it was on
    handler = partial(Handler, directory=str(web))
    # If the port is taken (8080 often is), try the next ones instead of failing.
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("0.0.0.0", port), handler)
            break
        except OSError:
            print(f"Port {port} is in use, trying {port + 1}")
    else:
        raise SystemExit(f"No free port between {args.port} and {args.port + 19}. Pick one with --port.")
    Handler.pixoo.gifs = GifHost(f"http://{lan_ip()}:{port}", here / "data" / "device.json")
    Handler.gif_host = Handler.pixoo.gifs
    print(f"Pixoo Studio running: open http://{lan_ip()}:{port} on any device on your wifi")
    server.serve_forever()


if __name__ == "__main__":
    main()
