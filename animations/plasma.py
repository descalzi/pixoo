"""Looping plasma / aurora color wave."""
import math
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pixoo import Pixoo, SIZE, save_preview

FRAMES = 40


def frame(t):
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    a = 2 * math.pi * t / FRAMES  # one full cycle over the loop, so it repeats seamlessly
    for y in range(SIZE):
        for x in range(SIZE):
            v = (math.sin(x / 7 + a)
                 + math.sin(y / 10 + a)
                 + math.sin((x + y) / 9 + a)
                 + math.sin(math.hypot(x - 32 + 12 * math.cos(a), y - 32 + 12 * math.sin(a)) / 6))
            px[x, y] = (
                int(128 + 127 * math.sin(v * math.pi / 2)),
                int(128 + 127 * math.sin(v * math.pi / 2 + 2 * math.pi / 3)),
                int(128 + 127 * math.sin(v * math.pi / 2 + 4 * math.pi / 3)),
            )
    return img


if __name__ == "__main__":
    frames = [frame(t) for t in range(FRAMES)]
    if "--preview" in sys.argv:
        out = Path(__file__).with_name("plasma_preview.gif")
        save_preview(frames, out, speed_ms=80)
        print("saved", out)
    else:
        Pixoo().push_frames(frames, speed_ms=80)
        print("sent to Pixoo")
