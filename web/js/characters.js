'use strict';
// Animated characters for the 64x64 panel. Each character is { about, frames, speed, draw(t, n, opts) -> ImageData }.
// Characters are drawn on their own layer with lit (shaded) shapes, then stamped onto the
// background with a dark 1px outline so they pop like sprites. Uses pixelart.js helpers.

const CS = 64;
function pix(c) {
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const P = (x, y, col) => R(x, y, 1, 1, col);
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
function canvas64() { return new OffscreenCanvas(CS, CS).getContext('2d', { willReadFrequently: true }); }
function vgrad(c, y0, y1, top, bottom) {
  const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, y0, CS, y1 - y0);
}

// ---------------------------------------------------------------------------
// Tilly Tock: an original alarm-clock mascot. Teal body, brass bells, a real
// clock face that shows the time when you send her, a wave and a wink.
// opts.live:   leave a band at the top for the time and temperature
// ---------------------------------------------------------------------------
function drawTilly(t, n, opts = {}) {
  const c = canvas64(), { R, P, oval } = pix(c);
  const a = Math.PI * 2 * t / n;
  const band = opts.live ? 12 : 0;

  // background: night sky gradient, twinkles, a soft floor
  vgrad(c, 0, 58, '#0B0920', '#241A4D');
  [[6, 16], [57, 14], [9, 48], [55, 44], [50, 26], [4, 30], [26, 18]].forEach(([x, y], i) => {
    const tw = Math.sin(a * 2 + i * 1.7);
    if (tw > 0.2) P(x, y, i % 2 ? '#FFD36B' : '#BFB7FF');
    if (tw > 0.8) { P(x - 1, y, '#5E54A8'); P(x + 1, y, '#5E54A8'); P(x, y - 1, '#5E54A8'); P(x, y + 1, '#5E54A8'); }
  });
  vgrad(c, 58, 64, '#3A2F75', '#1C1640'); R(0, 58, CS, 1, '#5A4CA8');

  const hop = Math.round(Math.abs(Math.sin(a * 2)) * -3);      // two little hops per loop
  const squash = hop === 0 ? 1 : 0;
  const cx = 32, cy = 34 + hop + squash;
  oval(32, 59, 11 - Math.abs(hop), 1, '#120D2E');               // shadow on the floor

  const L = canvas64(), d = pix(L);
  const TEAL = '#2FBFA8', TEAL_D = '#17675C';
  // legs and shoes
  d.line(27, cy + 15, 26, 55 - squash, TEAL_D, 2); d.line(37, cy + 15, 38, 55 - squash, TEAL_D, 2);
  litOval(L, 24, 56, 3, 2, '#FF6B8B'); litOval(L, 40, 56, 3, 2, '#FF6B8B');
  // bells with a hammer that rattles now and then
  litDisc(L, cx - 12, cy - 15, 5, '#E8B23A', { light: .65 }); litDisc(L, cx + 12, cy - 15, 5, '#E8B23A', { light: .65 });
  const ring = t % 10 < 2, hxm = ring ? 2 : 0;
  d.line(cx, cy - 16, cx + hxm, cy - 21, '#8C6A1E', 1); litDisc(L, cx + hxm, cy - 21, 1, '#FFE08A');
  // arms: left on hip, right waving; gloves
  d.line(cx - 16, cy + 2, cx - 21, cy + 7, TEAL_D, 2); d.line(cx - 21, cy + 7, cx - 17, cy + 10, TEAL_D, 2);
  litDisc(L, cx - 17, cy + 10, 2, '#FFFFFF', { dark: .25 });
  const wave = Math.sin(a * 4) * 0.5;
  const hx = cx + 17 + Math.round(Math.cos(-1.1 + wave) * 9), hy = cy - 1 + Math.round(Math.sin(-1.1 + wave) * 9);
  d.line(cx + 16, cy + 1, hx, hy, TEAL_D, 2); litDisc(L, hx, hy, 2, '#FFFFFF', { dark: .25 });
  // body: a lit teal sphere with a rim highlight, then the cream dial
  litDisc(L, cx, cy, 16, TEAL, { light: .55, dark: .55, bands: 5 });
  d.P(cx - 9, cy - 12, '#C8FFF4'); d.P(cx - 10, cy - 11, '#C8FFF4'); d.P(cx - 11, cy - 9, '#9AF2E2');
  litDisc(L, cx, cy, 13, '#FFF4DC', { light: .35, dark: .18, bands: 3 });
  [[0, -12], [0, 12], [-12, 0], [12, 0]].forEach(([x, y]) => d.P(cx + x, cy + y, '#9C8A6E'));
  // clock hands: the time she was sent, or a playful spin when the real time is shown above her
  const now = new Date(), mins = now.getMinutes(), hrs = now.getHours() % 12 + mins / 60;
  const ma = opts.live ? a - Math.PI / 2 : (mins / 60) * Math.PI * 2 - Math.PI / 2;
  const ha = opts.live ? a / 12 + Math.PI / 6 - Math.PI / 2 : (hrs / 12) * Math.PI * 2 - Math.PI / 2;
  d.line(cx, cy + 3, cx + Math.round(Math.cos(ha) * 6), cy + 3 + Math.round(Math.sin(ha) * 6), '#B9A68A', 1);
  d.line(cx, cy + 3, cx + Math.round(Math.cos(ma) * 9), cy + 3 + Math.round(Math.sin(ma) * 9), '#CDBEA4', 1);
  d.P(cx, cy + 3, '#E0A82E');
  // face
  const blink = t % 20 >= 17 && t % 20 <= 18, wink = t >= 30 && t <= 34;
  const eye = (x, closed) => {
    if (closed) { d.R(x - 1, cy - 4, 4, 1, '#22183A'); return; }
    d.oval(x, cy - 4, 2, 3, '#22183A'); d.P(x - 1, cy - 6, '#FFFFFF'); d.P(x + 1, cy - 2, '#4A3A78');
  };
  eye(cx - 5, blink); eye(cx + 5, blink || wink);
  d.R(cx - 10, cy + 1, 3, 2, '#FFB3C1'); d.P(cx - 10, cy + 1, '#FFD6DE'); d.R(cx + 8, cy + 1, 3, 2, '#FFB3C1'); d.P(cx + 8, cy + 1, '#FFD6DE');
  const m = wink ? 4 : 3;
  for (let i = -m; i <= m; i++) d.P(cx + i, cy + 6 + Math.round((m * m - i * i) / (m * 3)), '#22183A');
  if (wink) d.R(cx - 1, cy + 8, 3, 1, '#FF6B8B');

  if (band) { vgrad(c, 0, band, '#05040F', '#100C26'); R(0, band, CS, 1, '#3A2F75'); }
  stampWithOutline(c, L, '#06040F');
  if (ring) [[-19, -19], [19, -19], [-21, -15], [21, -15]].forEach(([x, y]) => P(cx + x, cy + y, '#FFE08A'));

  if (!opts.live) {
    const word = Math.floor(t / 5) % 2 ? 'TOCK' : 'TICK';
    fancyText(c, word, word === 'TICK' ? 2 : 46, 2, { big: false, top: '#FFF2B8', bottom: '#FFB03A' });
  }
  return c.getImageData(0, 0, CS, CS);
}

// ---------------------------------------------------------------------------
// Cheeky Santa. Scenes (opts.scene):
//   trousers  waves "HO HO", his belt pops, trousers drop to candy-cane boxers, "OOPS!", hauls them up
//   hohoho    a big belly laugh, belly jiggling
//   juggle    juggles three presents over his head
// opts.live: leave a 12px band at the top for the time and temperature. Santa is drawn 5px lower
// (standing on a thinner strip of snow) so the band never covers his hat.
// ---------------------------------------------------------------------------
const SANTA_SCENES = ['trousers', 'hohoho', 'juggle'];
function drawSanta(t, n, opts = {}) {
  const scene = opts.scene || 'trousers', live = !!opts.live, dy = live ? 5 : 0, band = live ? 12 : 0;
  const c = canvas64(), { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  const ground = 58 + dy;
  vgrad(c, 0, ground, '#081032', '#24366E');
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + 11) % CS, y = Math.floor((i * 23 + t * CS / n * (1 + (i % 3))) % CS);
    P(x, y, i % 4 ? '#9FB2EA' : '#FFFFFF');
  }
  vgrad(c, ground, 64, '#F4F8FF', '#B8C6EC'); R(0, ground, CS, 1, '#FFFFFF');

  // pose for this frame
  let phase = scene, waist = 44, arms = 'wave', face = 'smile', jig = 0, shake = 0;
  if (scene === 'trousers') {
    phase = t < 12 ? 'wave' : t < 18 ? 'drop' : t < 32 ? 'oops' : 'up';
    if (phase === 'drop') waist = 44 + Math.round((t - 12) / 5 * 8);
    if (phase === 'oops') waist = 52;
    if (phase === 'up') waist = Math.max(44, 52 - (t - 32) * 3);
    waist = Math.min(52, waist);
    arms = phase === 'wave' ? 'wave' : phase === 'up' ? 'pull' : 'shock';
    face = phase === 'drop' || phase === 'oops' ? 'shocked' : 'smile';
    shake = phase === 'oops' && t % 2 ? 1 : 0;
  } else if (scene === 'hohoho') {
    arms = 'belly'; face = t % 20 < 16 ? 'laugh' : 'smile';
    jig = face === 'laugh' ? (t % 2 ? 1 : 0) : 0;
  } else if (scene === 'juggle') {
    arms = 'juggle'; face = 'lookup';
  }
  const cx = 32 + shake;
  c.fillStyle = 'rgba(70,90,150,.45)'; c.fillRect(cx - 12, ground, 24, 1);

  const L = canvas64(), d = pix(L);
  const RED = '#D42A3A', RED_L = '#F0505E', RED_D = '#8E1424';
  // boots, legs, candy-cane boxers, trousers
  litOval(L, cx - 6, 56, 5, 2, '#3A3A44', { light: .4 }); litOval(L, cx + 6, 56, 5, 2, '#3A3A44', { light: .4 });
  d.R(cx - 8, 44, 6, 11, '#F5C9A8'); d.R(cx + 2, 44, 6, 11, '#F5C9A8');
  d.R(cx - 8, 44, 1, 11, '#FFE2CC'); d.R(cx + 7, 44, 1, 11, '#D9A383');
  for (let y = 44; y < 50; y++) for (let x = cx - 9; x < cx + 9; x++) {
    if (x > cx - 2 && x < cx + 2 && y > 47) continue;
    const stripe = (x + y) % 4 < 2, edge = x === cx - 9 ? 1 : x === cx + 8 ? -1 : 0;
    d.P(x, y, stripe ? (edge > 0 ? '#FFFFFF' : edge < 0 ? '#D8D8E6' : '#F4F4FA') : (edge > 0 ? '#F0505E' : edge < 0 ? '#A8202E' : '#E23B4A'));
  }
  for (let y = waist; y < 55; y++) {
    const bunched = waist > 46, w = bunched && y > 50 ? 1 : 0, fold = y % 2 && bunched;
    for (const lx of [cx - 9 - w, cx + 1]) {
      d.R(lx, y, 8 + w, 1, fold ? '#B3202F' : RED);
      d.P(lx, y, RED_L); d.P(lx + 7 + w, y, RED_D);
    }
  }
  if (waist <= 45) d.R(cx - 9, 44, 18, 1, RED);

  // coat: belly jiggles when he laughs
  litOval(L, cx, 37 - jig, 13 + jig, 9, RED, { light: .35, dark: .45, bands: 4 });
  d.R(cx - 1, 29, 2, 15, '#FFFFFF'); d.P(cx + 1, 30, '#D8DCEB');
  d.R(cx - 13, 42, 26, 2, '#FFFFFF'); d.R(cx - 13, 43, 26, 1, '#D8DCEB');
  if (waist <= 45) {
    d.R(cx - 13, 39 - jig, 26, 2, '#22222C'); d.R(cx - 13, 39 - jig, 26, 1, '#3E3E4C');
    litOval(L, cx, 39 - jig, 3, 2, '#FFC83D', { light: .7 }); d.R(cx - 1, 39 - jig, 3, 1, '#22222C');
  }
  // arms
  const mitten = (x, y) => litDisc(L, x, y, 2, '#FFFFFF', { dark: .3 });
  const arm = (x0, y0, x1, y1) => { d.line(x0, y0 + 1, x1, y1, RED_D, 3); d.line(x0, y0, x1, y1, RED, 2); };
  if (arms === 'wave') {
    const wv = Math.round(Math.sin(a * 6) * 2);
    arm(cx + 12, 32, cx + 18 + wv, 24); mitten(cx + 19 + wv, 23);
    arm(cx - 13, 33, cx - 16, 40); mitten(cx - 15, 42);
  } else if (arms === 'shock') {
    arm(cx + 12, 32, cx + 11, 25); arm(cx - 12, 32, cx - 11, 25);
  } else if (arms === 'pull') {
    arm(cx + 12, 33, cx + 9, waist); mitten(cx + 9, waist);
    arm(cx - 12, 33, cx - 9, waist); mitten(cx - 9, waist);
  } else if (arms === 'belly') {
    arm(cx + 12, 32, cx + 10, 38 - jig); mitten(cx + 9, 38 - jig);
    arm(cx - 12, 32, cx - 10, 38 - jig); mitten(cx - 9, 38 - jig);
  } else if (arms === 'juggle') {
    // hands bob as they catch and throw, alternating
    const bl = Math.round(Math.max(0, Math.sin(a * 3)) * 2), br = Math.round(Math.max(0, -Math.sin(a * 3)) * 2);
    arm(cx - 12, 32, cx - 15, 29 + bl); mitten(cx - 15, 28 + bl);
    arm(cx + 12, 32, cx + 15, 29 + br); mitten(cx + 15, 28 + br);
  }
  // head, beard, face
  litOval(L, cx, 22, 7, 6, '#F5C9A8', { light: .3, dark: .2 });
  litOval(L, cx, 28 - jig, 9, 6, '#FFFFFF', { light: .2, dark: .22, bands: 3 });
  litOval(L, cx, 25, 8, 2, '#FFFFFF', { dark: .1 });
  d.R(cx - 4, 24, 3, 1, '#FFFFFF'); d.R(cx + 1, 24, 3, 1, '#FFFFFF');
  d.R(cx - 1, 22, 2, 2, '#F09A86'); d.P(cx - 1, 22, '#FFC2B4');
  if (face === 'shocked') {
    d.R(cx - 4, 18, 2, 3, '#1A1A1A'); d.R(cx + 2, 18, 2, 3, '#1A1A1A'); d.P(cx - 4, 18, '#FFFFFF'); d.P(cx + 2, 18, '#FFFFFF');
    d.R(cx - 7, 21, 3, 2, '#FF4F6A'); d.R(cx + 4, 21, 3, 2, '#FF4F6A');
    d.oval(cx, 27, 1, 1, '#7A1E2C');
    mitten(cx + 9, 23); mitten(cx - 9, 23);
  } else if (face === 'laugh') {
    [[-5, 19], [-4, 18], [-3, 19], [2, 19], [3, 18], [4, 19]].forEach(([x, y]) => d.P(cx + x, y, '#1A1A1A'));  // ^ ^
    d.R(cx - 7, 21, 3, 2, '#FF7A8C'); d.R(cx + 4, 21, 3, 2, '#FF7A8C');
    litOval(L, cx, 28 - jig, 3, 2, '#7A1E2C', { light: .15 }); d.R(cx - 1, 29 - jig, 3, 1, '#FF6B8B');
  } else if (face === 'lookup') {
    d.R(cx - 4, 18, 2, 2, '#1A1A1A'); d.R(cx + 2, 18, 2, 2, '#1A1A1A'); d.P(cx - 4, 19, '#FFFFFF'); d.P(cx + 2, 19, '#FFFFFF');
    d.R(cx - 7, 21, 2, 2, '#FF9AA8'); d.R(cx + 5, 21, 2, 2, '#FF9AA8');
    d.oval(cx, 27, 1, 0, '#7A1E2C');
  } else {
    d.R(cx - 4, 19, 2, 1, '#1A1A1A'); d.R(cx + 2, 19, 2, 1, '#1A1A1A');
    d.P(cx - 5, 18, '#1A1A1A'); d.P(cx + 4, 18, '#1A1A1A');
    d.R(cx - 7, 21, 2, 2, '#FF9AA8'); d.R(cx + 5, 21, 2, 2, '#FF9AA8');
    d.R(cx - 2, 27, 4, 1, '#7A1E2C');
  }
  // hat with a floppy pompom
  litOval(L, cx, 12, 7, 3, RED, { light: .35, dark: .4 });
  const flop = Math.round(Math.sin(a * 2) * 1.5) + (jig ? 1 : 0);
  d.line(cx + 4, 10, cx + 10 + flop, 7, RED, 3); d.line(cx + 4, 11, cx + 10 + flop, 8, RED_D, 1);
  d.R(cx - 8, 15, 16, 3, '#FFFFFF'); d.R(cx - 8, 17, 16, 1, '#D8DCEB');
  litDisc(L, cx + 12 + flop, 8 + (live ? 1 : 0), 2, '#FFFFFF', { dark: .3 });

  // juggled presents travel over his head from hand to hand; each one is hidden on the way back
  if (arms === 'juggle') {
    const cols = [['#4FB3FF', '#FFD36B'], ['#7CF0C5', '#FF5C7A'], ['#FF9A3D', '#FFFFFF']];
    for (let k = 0; k < 3; k++) {
      const u = ((t / n) * 3 + k / 3) % 1;      // 0..1 over the loop, three throws per loop
      if (u > 2 / 3) continue;
      const v = u * 1.5, dir = k % 2 ? 1 : -1;
      const bx = Math.round(cx + dir * (-15 + 30 * v)), by = Math.round(27 - 19 * Math.sin(Math.PI * v));
      const [box, rib] = cols[k];
      litOval(L, bx, by, 2, 2, box, { light: .5, bands: 3 }); d.R(bx, by - 2, 1, 5, rib); d.R(bx - 2, by, 5, 1, rib);
      d.P(bx - 1, by - 3, rib); d.P(bx + 1, by - 3, rib);
    }
  }

  // stamp the sprite (5px lower when the band is on)
  let S2 = L;
  if (dy) { S2 = canvas64(); S2.drawImage(L.canvas, 0, dy); }
  if (band) { vgrad(c, 0, band, '#05040F', '#100C26'); R(0, band, CS, 1, '#3A2F75'); }
  stampWithOutline(c, S2, '#0A0716');
  if (phase === 'drop') { const k = t - 12; litOval(c, cx + 10 + k * 4, 37 - k * 3 + dy, 2, 2, '#FFC83D', { light: .7 }); }

  // speech: across the top, or beside his head when the top band holds the time
  const say = phase === 'wave' ? (t % 6 < 3 ? 'HO HO' : 'HO HO HO') : phase === 'oops' ? 'OOPS!' : phase === 'up' ? 'AHEM'
    : scene === 'hohoho' && face === 'laugh' ? 'HO' : '';
  if (say) {
    const style = phase === 'oops' ? { top: '#FFE0F0', bottom: '#FF5FA8' } : { top: '#FFF2B8', bottom: '#FFB03A' };
    if (scene === 'hohoho') {
      const side = Math.floor(t / 4) % 2, k = t % 4;
      fancyText(c, say, side ? 52 : 4, 26 + dy - k * 2, { big: false, ...style });
    } else if (!live) fancyText(c, say, 32, 1, { big: false, align: 'center', ...style });
    else {
      // short words fit beside his hat
      const word = say.startsWith('HO') ? 'HO' : say === 'OOPS!' ? 'OOPS' : 'AHEM';
      fancyText(c, word, word === 'HO' ? 52 : 1, 17, { big: false, ...style });
    }
  }
  return c.getImageData(0, 0, CS, CS);
}

const CHARACTERS = {
  'Tilly Tock': {
    about: 'An alarm clock with a wave and a wink. Her hands show the time you send her.',
    frames: 40, speed: 110, draw: drawTilly,
    // Live face: the Pixoo draws the time/temperature on top of the loop itself
    // (Draw/SendHttpItemList; type 5 = hour:minute, 17 = temperature) and keeps them current.
    live: {
      about: 'Live face: the Pixoo shows the real time and temperature above her and keeps them updated on its own.',
      items: [
        { TextId: 1, type: 5, x: 2, y: 2, dir: 0, font: 18, TextWidth: 30, Textheight: 6, speed: 100, align: 1, color: '#FFD36B' },
        { TextId: 2, type: 17, x: 34, y: 2, dir: 0, font: 18, TextWidth: 28, Textheight: 6, speed: 100, align: 3, color: '#8FD3FF' },
      ],
    },
  },
  'Cheeky Santa': {
    about: 'Ho ho ho, until his belt gives way.', frames: 40, speed: 160, draw: drawSanta,
    live: {
      about: 'Live face: the Pixoo shows the real time and temperature above him and keeps them updated on its own.',
      items: [
        { TextId: 1, type: 5, x: 2, y: 2, dir: 0, font: 18, TextWidth: 30, Textheight: 6, speed: 100, align: 1, color: '#FFD36B' },
        { TextId: 2, type: 17, x: 34, y: 2, dir: 0, font: 18, TextWidth: 28, Textheight: 6, speed: 100, align: 3, color: '#8FD3FF' },
      ],
    },
  },
};
