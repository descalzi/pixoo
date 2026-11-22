"""A tiny animated-GIF writer (standard library only) for 64x64 RGB frames.

Uses one shared 256-colour palette and standard LZW compression, so files stay small for the
Pixoo to download.
"""
import struct


def _palette(frames):
    """Index every frame against one shared palette of at most 256 colours. If the frames use
    more, drop low bits from each channel until they fit."""
    for mask in (0xFF, 0xFE, 0xFC, 0xF8, 0xF0, 0xE0):
        seen = {}
        for f in frames:
            for i in range(0, len(f), 3):
                seen.setdefault((f[i] & mask, f[i + 1] & mask, f[i + 2] & mask), len(seen))
                if len(seen) > 256:
                    break
            if len(seen) > 256:
                break
        if len(seen) <= 256:
            return mask, seen
    # 3-3-2 bits always fits
    seen = {}
    for f in frames:
        for i in range(0, len(f), 3):
            seen.setdefault((f[i] & 0xE0, f[i + 1] & 0xE0, f[i + 2] & 0xC0), len(seen))
    return None, seen


def _codes(indices):
    """Standard GIF LZW with 8-bit minimum code size and variable code width."""
    clear, eoi = 256, 257
    out, acc, nbits = bytearray(), 0, 0
    size = 9

    def put(code):
        nonlocal acc, nbits
        acc |= code << nbits
        nbits += size
        while nbits >= 8:
            out.append(acc & 0xFF)
            acc >>= 8
            nbits -= 8

    table, nxt = {}, 258
    put(clear)
    prefix = indices[0]
    for k in indices[1:]:
        key = (prefix << 8) | k
        code = table.get(key)
        if code is not None:
            prefix = code
            continue
        put(prefix)
        if nxt < 4096:
            table[key] = nxt
            nxt += 1
            if nxt > (1 << size) and size < 12:
                size += 1
        else:  # table full: start over
            put(clear)
            table, nxt, size = {}, 258, 9
        prefix = k
    put(prefix)
    put(eoi)
    if nbits:
        out.append(acc & 0xFF)
    blocks = bytearray([8])  # LZW minimum code size
    for i in range(0, len(out), 255):
        chunk = out[i:i + 255]
        blocks.append(len(chunk))
        blocks += chunk
    blocks.append(0)
    return bytes(blocks)


def encode(frames, speed_ms, width=64, height=64):
    """frames: list of bytes (width*height*3 RGB). Returns the bytes of a looping GIF."""
    mask, pal = _palette(frames)
    key = (lambda r, g, b: (r & mask, g & mask, b & mask)) if mask else (lambda r, g, b: (r & 0xE0, g & 0xE0, b & 0xC0))
    table = bytearray(768)
    for (r, g, b), i in pal.items():
        table[i * 3:i * 3 + 3] = bytes((r, g, b))
    gif = bytearray(b"GIF89a")
    gif += struct.pack("<HHBBB", width, height, 0xF7, 0, 0)  # global colour table of 256 entries
    gif += table
    gif += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever
    delay = max(2, round(speed_ms / 10))
    for f in frames:
        gif += b"\x21\xF9\x04\x04" + struct.pack("<H", delay) + b"\x00\x00"  # keep frame, delay
        gif += b"\x2C" + struct.pack("<HHHHB", 0, 0, width, height, 0)
        idx = [pal[key(f[i], f[i + 1], f[i + 2])] for i in range(0, len(f), 3)]
        gif += _codes(idx)
    gif += b"\x3B"
    return bytes(gif)
