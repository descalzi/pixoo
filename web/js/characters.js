'use strict';
// Animated characters for the 64x64 panel. Each character is { about, frames, speed, draw(t, n) -> ImageData }.
// Drawn by hand with pixel helpers so every frame is crisp at 64x64.

const CS = 64;
function pix(c) {
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const P = (x, y, col) => R(x, y, 1, 1, col);
  // filled ellipse, pixel-exact
  const oval = (cx, cy, rx, ry, col) => {
    c.fillStyle = col;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + .5) * (ry + .5)))));
      c.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  };
  const disc = (cx, cy, r, col) => oval(cx, cy, r, r, col);
  const line = (x0, y0, x1, y1, col, w = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) R(x0 + (x1 - x0) * i / n - (w - 1) / 2, y0 + (y1 - y0) * i / n - (w - 1) / 2, w, w, col);
  };
  return { R, P, oval, disc, line };
}
function canvas64() { return new OffscreenCanvas(CS, CS).getContext('2d'); }

// ---------------------------------------------------------------------------
// Tilly Tock: an original alarm-clock mascot. Teal body, brass bells, a real
// clock face that shows the time when you send her, a wave and a wink.
// ---------------------------------------------------------------------------
function drawTilly(t, n, opts = {}) {
  const c = canvas64(), { R, P, oval, disc, line } = pix(c);
  const a = Math.PI * 2 * t / n;
  // night-sky background with a few twinkles
  R(0, 0, CS, CS, '#110E26');
  [[6, 10], [57, 8], [9, 50], [55, 46], [50, 26], [4, 30]].forEach(([x, y], i) => {
    if (Math.sin(a * 2 + i * 1.7) > 0.2) P(x, y, i % 2 ? '#FFD36B' : '#BFB7FF');
  });

  const hop = Math.round(Math.abs(Math.sin(a * 2)) * -3);      // two little hops per loop
  const squash = hop === 0 ? 1 : 0;                              // squash on landing
  const cx = 32, cy = 33 + hop + squash;

  // legs and shoes
  const ly = cy + 15;
  line(27, ly, 26, 56 - squash, '#1B5E57', 2); line(37, ly, 38, 56 - squash, '#1B5E57', 2);
  oval(24, 57, 3, 1, '#FF6B8B'); oval(40, 57, 3, 1, '#FF6B8B');
  R(0, 59, CS, 5, '#1E1A3A');                                    // floor
  oval(32, 60, 12 - Math.abs(hop), 1, '#15122B');               // shadow

  // bells and hammer
  disc(cx - 12, cy - 15, 5, '#E0A82E'); disc(cx + 12, cy - 15, 5, '#E0A82E');
  R(cx - 14, cy - 18, 3, 2, '#FFE08A'); R(cx + 10, cy - 18, 3, 2, '#FFE08A');
  const ring = t % 10 < 2;                                       // hammer rattles now and then
  line(cx, cy - 16, cx + (ring ? 2 : 0), cy - 21, '#8C6A1E', 1); disc(cx + (ring ? 2 : 0), cy - 21, 1, '#FFE08A');
  if (ring) { P(cx - 19, cy - 19, '#FFE08A'); P(cx + 19, cy - 19, '#FFE08A'); P(cx - 20, cy - 15, '#FFE08A'); P(cx + 20, cy - 15, '#FFE08A'); }

  // arms: left on hip, right waving
  line(cx - 16, cy + 2, cx - 21, cy + 7, '#1B5E57', 2); line(cx - 21, cy + 7, cx - 17, cy + 10, '#1B5E57', 2);
  disc(cx - 17, cy + 10, 2, '#FFFFFF');
  const wave = Math.sin(a * 4) * 0.5;
  const hx = cx + 17 + Math.round(Math.cos(-1.1 + wave) * 9), hy = cy - 1 + Math.round(Math.sin(-1.1 + wave) * 9);
  line(cx + 16, cy + 1, hx, hy, '#1B5E57', 2); disc(hx, hy, 2, '#FFFFFF');

  // body
  disc(cx, cy, 17, '#1B5E57');
  disc(cx, cy, 16, '#2FBFA8');
  disc(cx - 4, cy - 6, 3, '#6FE3CF');                            // shine
  disc(cx, cy, 13, '#FFF7E6');
  // hour ticks
  P(cx, cy - 12, '#7A6A55'); P(cx, cy + 12, '#7A6A55'); P(cx - 12, cy, '#7A6A55'); P(cx + 12, cy, '#7A6A55');

  // clock hands: the time she was sent, or (as a live face, where the Pixoo shows the real
  // time above her) a playful spin once around per loop
  const now = new Date(), mins = now.getMinutes(), hrs = now.getHours() % 12 + mins / 60;
  const ma = opts.live ? a - Math.PI / 2 : (mins / 60) * Math.PI * 2 - Math.PI / 2;
  const ha = opts.live ? a / 12 + Math.PI / 6 - Math.PI / 2 : (hrs / 12) * Math.PI * 2 - Math.PI / 2;
  line(cx, cy + 3, cx + Math.round(Math.cos(ha) * 6), cy + 3 + Math.round(Math.sin(ha) * 6), '#C9B9A0', 1);
  line(cx, cy + 3, cx + Math.round(Math.cos(ma) * 9), cy + 3 + Math.round(Math.sin(ma) * 9), '#D8CBB5', 1);
  P(cx, cy + 3, '#E0A82E');

  // face: eyes, wink, cheeks, smile
  const blink = t % 20 >= 17 && t % 20 <= 18;
  const wink = t >= 30 && t <= 34;
  const eye = (x, closed) => {
    if (closed) { R(x - 1, cy - 4, 4, 1, '#22183A'); return; }
    oval(x, cy - 4, 2, 3, '#22183A'); P(x - 1, cy - 6, '#FFFFFF');
  };
  eye(cx - 5, blink); eye(cx + 5, blink || wink);
  R(cx - 10, cy + 1, 3, 2, '#FFB3C1'); R(cx + 8, cy + 1, 3, 2, '#FFB3C1');
  // smile, bigger while winking
  const m = wink ? 4 : 3;
  for (let i = -m; i <= m; i++) P(cx + i, cy + 6 + Math.round((m * m - i * i) / (m * 3)), '#22183A');
  if (wink) R(cx - 1, cy + 8, 3, 1, '#FF6B8B');

  if (opts.live) {
    // a calm band at the top for the Pixoo's own live time and temperature
    R(0, 0, CS, 10, '#0A0818'); R(0, 10, CS, 1, '#2F2A55');
  } else {
    // speech: TICK / TOCK above her
    const word = Math.floor(t / 5) % 2 ? 'TOCK' : 'TICK';
    text(c, word, word === 'TICK' ? 2 : 46, 2, '#FFD36B');
  }
  return c.getImageData(0, 0, CS, CS);
}

// ---------------------------------------------------------------------------
// Cheeky Santa: waves "HO HO", his belt pops, trousers drop to reveal
// candy-cane boxers, he blushes "OOPS!" and hauls them back up.
// ---------------------------------------------------------------------------
function drawSanta(t, n) {
  const c = canvas64(), { R, P, oval, disc, line } = pix(c);
  const a = Math.PI * 2 * t / n;
  // snowy night
  R(0, 0, CS, CS, '#0F1630');
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + 11) % CS, y = Math.floor((i * 23 + t * CS / n * (1 + (i % 3))) % CS);
    P(x, y, i % 4 ? '#C9D6FF' : '#FFFFFF');
  }
  R(0, 58, CS, 6, '#E8EEFF'); R(0, 58, CS, 1, '#FFFFFF');

  // story beats over 40 frames
  const phase = t < 12 ? 'wave' : t < 18 ? 'drop' : t < 32 ? 'oops' : 'up';
  // trouser waist height: 44 = on, 52 = bunched round the ankles
  let waist = 44;
  if (phase === 'drop') waist = 44 + Math.round((t - 12) / 5 * 8);
  if (phase === 'oops') waist = 52;
  if (phase === 'up') waist = Math.max(44, 52 - (t - 32) * 3);
  waist = Math.min(52, waist);
  const shake = phase === 'oops' && t % 2 ? 1 : 0;
  const cx = 32 + shake;

  // boots
  R(cx - 10, 55, 8, 3, '#1A1A1A'); R(cx + 2, 55, 8, 3, '#1A1A1A');
  R(cx - 11, 57, 9, 1, '#1A1A1A'); R(cx + 2, 57, 9, 1, '#1A1A1A');

  // legs: skin shows when trousers are down
  R(cx - 8, 44, 6, 11, '#F5C9A8'); R(cx + 2, 44, 6, 11, '#F5C9A8');
  // candy-cane boxers (shown when trousers are below the waist)
  for (let y = 44; y < 50; y++) for (let x = cx - 9; x < cx + 9; x++) {
    if (x > cx - 2 && x < cx + 2 && y > 47) continue;            // gap between the legs
    P(x, y, (x + y) % 4 < 2 ? '#FFFFFF' : '#E23B4A');
  }
  // trousers from the waist line down to the boots
  for (let y = waist; y < 55; y++) {
    const bunched = waist > 46;
    const w = bunched && y > 50 ? 1 : 0;                         // a little bulge at the ankles
    R(cx - 9 - w, y, 8 + w, 1, y % 2 && bunched ? '#B3202F' : '#D42A3A');
    R(cx + 1, y, 8 + w, 1, y % 2 && bunched ? '#B3202F' : '#D42A3A');
  }
  if (waist <= 45) R(cx - 9, 44, 18, 1, '#D42A3A');

  // coat
  oval(cx, 37, 13, 9, '#D42A3A');
  R(cx - 1, 29, 2, 15, '#FFFFFF');                               // fur trim
  R(cx - 13, 42, 26, 2, '#FFFFFF');
  // belt: on the coat normally, flies off when it pops
  if (phase === 'wave' || phase === 'up') { R(cx - 13, 39, 26, 2, '#1A1A1A'); R(cx - 2, 38, 5, 4, '#FFD36B'); R(cx - 1, 39, 3, 2, '#1A1A1A'); }
  if (phase === 'drop') { const k = t - 12; R(cx + 8 + k * 4, 36 - k * 3, 5, 4, '#FFD36B'); }

  // arms
  if (phase === 'wave') {
    const wv = Math.round(Math.sin(a * 6) * 2);
    line(cx + 12, 33, cx + 18 + wv, 25, '#D42A3A', 3); disc(cx + 19 + wv, 23, 2, '#FFFFFF');
    line(cx - 12, 33, cx - 15, 41, '#D42A3A', 3); disc(cx - 15, 42, 2, '#FFFFFF');
  } else if (phase === 'drop' || phase === 'oops') {
    // hands fly to his cheeks in embarrassment (mittens drawn after the head)
    line(cx + 12, 33, cx + 11, 25, '#D42A3A', 3);
    line(cx - 12, 33, cx - 11, 25, '#D42A3A', 3);
  } else {
    // hauling the trousers up
    line(cx + 12, 34, cx + 9, waist, '#D42A3A', 3); disc(cx + 9, waist, 2, '#FFFFFF');
    line(cx - 12, 34, cx - 9, waist, '#D42A3A', 3); disc(cx - 9, waist, 2, '#FFFFFF');
  }

  // head
  oval(cx, 22, 7, 6, '#F5C9A8');
  // beard
  oval(cx, 28, 9, 6, '#FFFFFF'); oval(cx, 25, 8, 2, '#FFFFFF');
  R(cx - 3, 26, 6, 1, '#E6E6F0');
  // moustache and nose
  R(cx - 4, 24, 3, 1, '#FFFFFF'); R(cx + 1, 24, 3, 1, '#FFFFFF');
  R(cx - 1, 22, 2, 2, '#F09A86');
  // eyes and cheeks
  const shocked = phase === 'drop' || phase === 'oops';
  if (shocked) {
    R(cx - 4, 18, 2, 3, '#1A1A1A'); R(cx + 2, 18, 2, 3, '#1A1A1A');
    R(cx - 7, 21, 3, 2, '#FF4F6A'); R(cx + 4, 21, 3, 2, '#FF4F6A');
    oval(cx, 27, 1, 1, '#7A1E2C');                               // little "o" mouth
  } else {
    R(cx - 4, 19, 2, 1, '#1A1A1A'); R(cx + 2, 19, 2, 1, '#1A1A1A');   // happy closed eyes
    P(cx - 5, 18, '#1A1A1A'); P(cx + 4, 18, '#1A1A1A');
    R(cx - 7, 21, 2, 2, '#FF9AA8'); R(cx + 5, 21, 2, 2, '#FF9AA8');
    R(cx - 2, 27, 4, 1, '#7A1E2C');
  }
  if (phase === 'drop' || phase === 'oops') { disc(cx + 9, 23, 2, '#FFFFFF'); disc(cx - 9, 23, 2, '#FFFFFF'); }
  // hat with a floppy tip
  R(cx - 8, 15, 16, 3, '#FFFFFF');
  oval(cx, 12, 7, 3, '#D42A3A');
  const flop = Math.round(Math.sin(a * 2) * 1.5);
  line(cx + 4, 10, cx + 10 + flop, 7, '#D42A3A', 3);
  disc(cx + 12 + flop, 8, 2, '#FFFFFF');

  // speech
  const say = phase === 'wave' ? (t % 6 < 3 ? 'HO HO' : 'HO HO HO') : phase === 'oops' ? 'OOPS!' : phase === 'up' ? 'AHEM' : '';
  if (say) {
    const w = say.length * 4 - 1;
    const x = Math.max(1, Math.min(CS - w - 1, 32 - Math.round(w / 2)));
    text(c, say, x, 1, phase === 'oops' ? '#FF8FC7' : '#FFD36B');
  }
  return c.getImageData(0, 0, CS, CS);
}

const CHARACTERS = {
  'Tilly Tock': {
    about: 'An alarm clock with a wave and a wink. Her hands show the time you send her.',
    frames: 40, speed: 110, draw: drawTilly,
    // Live face: the Pixoo itself draws these on top of the loop and keeps them current.
    // type 5 = hour:minute, 17 = current temperature (see Draw/SendHttpItemList).
    live: {
      about: 'Live face: the Pixoo shows the real time and temperature above her and keeps them updated on its own.',
      items: [
        { TextId: 1, type: 5, x: 2, y: 2, dir: 0, font: 18, TextWidth: 30, Textheight: 6, speed: 100, align: 1, color: '#FFD36B' },
        { TextId: 2, type: 17, x: 34, y: 2, dir: 0, font: 18, TextWidth: 28, Textheight: 6, speed: 100, align: 3, color: '#8FD3FF' },
      ],
    },
  },
  'Cheeky Santa': { about: 'Ho ho ho, until his belt gives way.', frames: 40, speed: 160, draw: drawSanta },
};
