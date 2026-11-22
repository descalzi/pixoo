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
from tilly_player import TillyPlayer

# Original firmware: port 80 /post. Newer units ("Pixoo-64 II"): port 9000 /divoom_api.
ENDPOINTS = (":80/post", ":9000/divoom_api")


class Pixoo:
    def __init__(self, ip):
        self.ip, self.url = ip, None
        self.lock = threading.Lock()  # the device handles one request at a time
        self.last = 0.0
        self.frame_ms = None  # how long the device takes to accept one animation frame (moving average)

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


class Handler(SimpleHTTPRequestHandler):
    pixoo: Pixoo = None
    tilly: TillyPlayer = None
    gifs = {}  # recent animations the Pixoo can download, by file name
    gif_ids = itertools.count(1)
    gif_fetched = set()  # names the Pixoo has actually downloaded

    def do_GET(self):
        if self.path == "/api/health":
            fm = self.pixoo.frame_ms
            return self._json(200, {"ok": True, "pixoo": self.pixoo.ip, "endpoint": self.pixoo.url, "tilly": True,
                                    "frame_ms": round(fm) if fm else None})
        if self.path == "/api/tilly/status":
            return self._json(200, self.tilly.status())
        if self.path.startswith("/gif/") and self.path[5:] in self.gifs:
            data = self.gifs[self.path[5:]]
            self.gif_fetched.add(self.path[5:])
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
        if self.path == "/api/gif":
            return self._gif(msg)
        if self.path != "/api":
            return self._json(404, {"error": "not found"})
        # anything the page draws takes over the screen from Living Tilly
        if self.tilly.running and str(msg.get("Command", "")).startswith("Draw/"):
            self.tilly.stop()
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
        name = f"anim{next(self.gif_ids)}.gif"
        self.gifs[name] = data
        for old in list(self.gifs)[:-6]:
            del self.gifs[old]
        # the Pixoo must reach this server by the address the page used, unless that was localhost
        host = self.headers.get("Host", "")
        if not host or host.split(":")[0] in ("localhost", "127.0.0.1"):
            host = f"{lan_ip()}:{self.server.server_address[1]}"
        url = f"http://{host}/gif/{name}"
        if self.tilly.running:
            self.tilly.stop()
        try:
            reply = self.pixoo.send(json.dumps({"Command": "Device/PlayTFGif", "FileType": 2, "FileName": url}).encode())
        except OSError as e:
            return self._json(502, {"error": f"Pixoo unreachable: {e}"})
        try:
            reply = json.loads(reply)
        except ValueError:
            reply = None
        # did the Pixoo come and fetch it? that's the real sign this method works on this unit
        deadline = time.monotonic() + 8
        while name not in self.gif_fetched and time.monotonic() < deadline:
            time.sleep(.1)
        return self._json(200, {"ok": True, "url": url, "bytes": len(data), "frames": len(frames),
                                "fetched": name in self.gif_fetched, "reply": reply})

    def _tilly(self, action, msg):
        try:
            if action == "scenes":
                return self._json(200, {"ok": True, "scenes": self.tilly.upload(msg.get("scenes", []))})
            if action == "start":
                self.tilly.start(msg)
            elif action == "stop":
                self.tilly.stop()
            else:
                return self._json(404, {"error": "not found"})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": str(e)})
        return self._json(200, self.tilly.status())

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
    Handler.tilly = TillyPlayer(Handler.pixoo, here / "data")  # resumes Living Tilly if it was on
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
    print(f"Pixoo Studio running: open http://{lan_ip()}:{port} on any device on your wifi")
    server.serve_forever()


if __name__ == "__main__":
    main()
