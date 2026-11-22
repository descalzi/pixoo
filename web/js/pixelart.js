'use strict';
// Pixel-art finishing tools: a 5x7 display font, bevelled "3D" text with gradient,
// outline and drop shadow, lit (shaded) shapes, and outlining of a drawn sprite layer.

const BIG = {
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
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ' ': ['00', '00', '00', '00', '00', '00', '00'],
  '!': ['1', '1', '1', '1', '1', '0', '1'],
};
// small glyphs come from the 3x5 FONT in app.js, as 3-wide rows
const smallGlyph = ch => { const g = FONT[ch] || FONT[' ']; return [0, 1, 2, 3, 4].map(r => g.slice(r * 3, r * 3 + 3)); };
const glyphOf = (ch, big) => big ? (BIG[ch] || BIG[' ']) : smallGlyph(ch);

function glyphMask(str, big, scale) {
  str = String(big ? str : str.toUpperCase());
  const h = (big ? 7 : 5) * scale;
  let w = 0;
  for (const ch of str) w += (glyphOf(ch, big)[0].length + 1) * scale;
  w = Math.max(0, w - scale);
  const m = new Uint8Array(w * h); let x0 = 0;
  for (const ch of str) {
    const g = glyphOf(ch, big);
    g.forEach((row, ry) => [...row].forEach((v, rx) => {
      if (v !== '1') return;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) m[(ry * scale + dy) * w + x0 + rx * scale + dx] = 1;
    }));
    x0 += (g[0].length + 1) * scale;
  }
  return { m, w, h };
}
function fancyWidth(str, { big = true, scale = 1 } = {}) { return glyphMask(str, big, scale).w; }

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgbStr = c => `rgb(${c[0]},${c[1]},${c[2]})`;

// Text with a vertical gradient (top -> bottom), a light bevel on upper edges, a dark bevel on
// lower edges, a 1px outline and a drop shadow: the look of the Pixoo's own clock faces.
function fancyText(c, str, x, y, {
  big = true, scale = 1, top = '#FFFFFF', bottom = '#FFC94A',
  outline = '#1A1030', shadow = 'rgba(0,0,0,.55)', bevel = true, align = 'left',
} = {}) {
  const { m, w, h } = glyphMask(str, big, scale);
  if (align === 'center') x = Math.round(x - w / 2);
  if (align === 'right') x = x - w;
  const at = (i, j) => i >= 0 && j >= 0 && i < w && j < h && m[j * w + i];
  // shadow: one pixel down-right of the outline
  if (shadow) {
    c.fillStyle = shadow;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      const near = at(i, j) || at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1);
      if (near) c.fillRect(x + i + 1, y + j + 1, 1, 1);
    }
  }
  if (outline) {
    c.fillStyle = outline;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      if (at(i, j)) continue;
      if (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1) || at(i - 1, j - 1) || at(i + 1, j + 1) || at(i - 1, j + 1) || at(i + 1, j - 1)) c.fillRect(x + i, y + j, 1, 1);
    }
  }
  const t0 = hexRgb(top), t1 = hexRgb(bottom);
  for (let j = 0; j < h; j++) {
    const base = mixRgb(t0, t1, h > 1 ? j / (h - 1) : 0);
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue;
      let col = base;
      if (bevel && scale > 1 || bevel && big) {
        if (!at(i, j - 1) || !at(i - 1, j)) col = mixRgb(base, [255, 255, 255], .45);      // lit edge
        else if (!at(i, j + 1) || !at(i + 1, j)) col = mixRgb(base, [0, 0, 0], .35);  // shaded edge
      }
      c.fillStyle = rgbStr(col); c.fillRect(x + i, y + j, 1, 1);
    }
  }
  return w;
}

// Shapes lit from the top-left, quantised into a few bands for a pixel-art look.
function litOval(c, cx, cy, rx, ry, base, { light = .5, dark = .45, bands = 4 } = {}) {
  const b = hexRgb(base), hi = mixRgb(b, [255, 255, 255], light), lo = mixRgb(b, [0, 0, 0], dark);
  for (let y = -ry; y <= ry; y++) {
    const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + .5) * (ry + .5)))));
    for (let x = -span; x <= span; x++) {
      const nx = x / (rx + .5), ny = y / (ry + .5);
      let l = .5 - .55 * nx - .6 * ny;                      // light from upper left
      l = Math.max(0, Math.min(1, l));
      l = Math.round(l * (bands - 1)) / (bands - 1);
      const col = l >= .5 ? mixRgb(b, hi, (l - .5) * 2) : mixRgb(lo, b, l * 2);
      c.fillStyle = rgbStr(col); c.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  }
}
const litDisc = (c, cx, cy, r, base, o) => litOval(c, cx, cy, r, r, base, o);

// Draw a sprite layer onto c with a 1px outline around everything opaque on it.
function stampWithOutline(c, layer, outline = '#0A0716') {
  const src = layer.getImageData(0, 0, 64, 64).data;
  const a = (x, y) => x >= 0 && y >= 0 && x < 64 && y < 64 && src[(y * 64 + x) * 4 + 3] > 0;
  c.fillStyle = outline;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (a(x, y)) continue;
    if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) c.fillRect(x, y, 1, 1);
  }
  c.drawImage(layer.canvas, 0, 0);
}
