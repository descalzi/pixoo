#!/usr/bin/env python3
"""Pixoo Studio home server.

Serves the web app and forwards commands to the Pixoo, so any phone or laptop on your wifi
can use it at http://<this-server>:8080 without browser network restrictions.
Only needs Python 3 (standard library).

    python3 server.py                      # Pixoo at 192.168.4.192, web on port 8080
    python3 server.py --pixoo 192.168.4.192 --port 8080
"""
import argparse
import json
import threading
import time
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Original firmware: port 80 /post. Newer units ("Pixoo-64 II"): port 9000 /divoom_api.
ENDPOINTS = (":80/post", ":9000/divoom_api")


class Pixoo:
    def __init__(self, ip):
        self.ip, self.url = ip, None
        self.lock = threading.Lock()  # the device handles one request at a time
        self.last = 0.0

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
            try:
                if not self.url:
                    self.detect()
                try:
                    return self._post(self.url, body)
                except OSError:
                    self.detect()  # device may have rebooted or changed firmware
                    return self._post(self.url, body)
            finally:
                self.last = time.monotonic()


class Handler(SimpleHTTPRequestHandler):
    pixoo: Pixoo = None

    def do_GET(self):
        if self.path == "/api/health":
            return self._json(200, {"ok": True, "pixoo": self.pixoo.ip, "endpoint": self.pixoo.url})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api":
            return self._json(404, {"error": "not found"})
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            json.loads(body)
        except ValueError:
            return self._json(400, {"error": "body must be JSON"})
        try:
            reply = self.pixoo.send(body)
        except OSError as e:
            return self._json(502, {"error": f"Pixoo unreachable: {e}"})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(reply)))
        self.end_headers()
        self.wfile.write(reply)

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
    web = Path(__file__).resolve().parent / "web"
    server = ThreadingHTTPServer(("0.0.0.0", args.port), partial(Handler, directory=str(web)))
    print(f"Pixoo Studio running: open http://<this-server-ip>:{args.port} on any device on your wifi")
    server.serve_forever()


if __name__ == "__main__":
    main()
