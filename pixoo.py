"""Tiny client for the Divoom Pixoo 64 local HTTP API."""
import base64
import requests
from PIL import Image

SIZE = 64


class Pixoo:
    # Original firmware: port 80 /post. Newer units ("Pixoo-64 II"): port 9000 /divoom_api.
    ENDPOINTS = (":80/post", ":9000/divoom_api")

    def __init__(self, ip="192.168.4.192", endpoint=None, timeout=5):
        self.timeout = timeout
        self.url = f"http://{ip}{endpoint}" if endpoint else self._detect(ip)

    def _detect(self, ip):
        for suffix in self.ENDPOINTS:
            url = f"http://{ip}{suffix}"
            try:
                requests.post(url, json={"Command": "Channel/GetIndex"}, timeout=3).raise_for_status()
                return url
            except requests.RequestException:
                pass
        raise ConnectionError(f"Pixoo not answering at {ip} on port 80 or 9000")

    def command(self, name, **params):
        r = requests.post(self.url, json={"Command": name, **params}, timeout=self.timeout)
        r.raise_for_status()
        data = r.json()
        if data.get("error_code", data.get("ReturnCode", 0)) != 0:
            raise RuntimeError(f"{name} failed: {data}")
        return data

    # --- drawing -------------------------------------------------------
    def push_frames(self, frames, speed_ms=100):
        """Send a list of 64x64 PIL images as one looping animation (max ~40 frames)."""
        frames = frames[:40]
        self.command("Draw/ResetHttpGifId")  # avoids the device freezing after many pushes
        pic_id = self.command("Draw/GetHttpGifId").get("PicId", 1)
        for i, img in enumerate(frames):
            rgb = img.convert("RGB").resize((SIZE, SIZE), Image.NEAREST)
            self.command(
                "Draw/SendHttpGif",
                PicNum=len(frames), PicWidth=SIZE, PicOffset=i, PicID=pic_id,
                PicSpeed=speed_ms, PicData=base64.b64encode(rgb.tobytes()).decode(),
            )

    def push_image(self, img):
        self.push_frames([img])

    def text(self, text, x=0, y=0, color="#FFFFFF", text_id=1, font=2, speed=50, direction=0, width=64):
        self.command("Draw/SendHttpText", TextId=text_id, x=x, y=y, dir=direction, font=font,
                     TextWidth=width, speed=speed, TextString=text, color=color, align=1)

    def clear_text(self):
        self.command("Draw/ClearHttpText")

    # --- device --------------------------------------------------------
    def brightness(self, value):
        self.command("Channel/SetBrightness", Brightness=max(0, min(100, value)))

    def settings(self):
        return self.command("Channel/GetAllConf")


def save_preview(frames, path, speed_ms=100, scale=6):
    """Save frames as an enlarged GIF so animations can be designed without the device."""
    big = [f.convert("RGB").resize((SIZE * scale, SIZE * scale), Image.NEAREST) for f in frames]
    big[0].save(path, save_all=True, append_images=big[1:], duration=speed_ms, loop=0)
