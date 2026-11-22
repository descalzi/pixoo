'use strict';
// Living Tilly: scenes for Tilly Tock that react to the time of day and the weather.
// Each scene is rendered here (in the browser) with a 12px band left at the top; the home
// server (server.py) plays them on a schedule and draws the live time and temperature in
// that band. Uses pix/canvas64/vgrad from characters.js and the pixelart.js helpers.

const BAND = 12;
const TEAL = '#2FBFA8', TEAL_D = '#17675C', INK = '#22183A';

// ---- backgrounds ----------------------------------------------------------------
function sceneBackdrop(c, sky, t, n) {
  const { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  if (sky === 'night') {
    vgrad(c, 0, 58, '#0B0920', '#241A4D');
    [[6, 18], [57, 30], [9, 48], [44, 16], [50, 40], [4, 32], [26, 20]].forEach(([x, y], i) => {
      if (Math.sin(a * 2 + i * 1.7) > 0) P(x, y, i % 2 ? '#FFD36B' : '#BFB7FF');
    });
    litDisc(c, 54, 21, 4, '#FFF1B8', { light: .4, dark: .25 }); P(52, 20, '#E8D592'); P(55, 23, '#E8D592');
    vgrad(c, 58, 64, '#3A2F75', '#1C1640'); R(0, 58, CS, 1, '#5A4CA8');
  } else if (sky === 'day') {
    vgrad(c, 0, 58, '#2F7FDB', '#A8DBFF');
    const cx = Math.round(((t / n) * 84) - 10);                  // a cloud drifting across
    litOval(c, cx, 22, 6, 3, '#FFFFFF', { dark: .12 }); litOval(c, cx + 6, 20, 5, 4, '#FFFFFF', { dark: .12 });
    vgrad(c, 58, 64, '#5FCB6A', '#2E8A45'); R(0, 58, CS, 1, '#9BEA8F');
  } else if (sky === 'rain') {
    vgrad(c, 0, 58, '#2A3450', '#56657F');
    for (let i = 0; i < 22; i++) {
      const x = (i * 29 + 5) % CS, y = Math.floor((i * 17 + t * CS * 2 / n) % 60);
      c.fillStyle = '#9FC4FF'; c.fillRect(x, y, 1, 2); c.fillStyle = '#D6E6FF'; c.fillRect(x, y + 2, 1, 1);
    }
    vgrad(c, 58, 64, '#3C4B66', '#222C40'); R(0, 58, CS, 1, '#7F93B8');
    [[8, 59], [52, 60], [30, 61]].forEach(([x, y], i) => { if ((t + i * 3) % 6 < 2) { P(x - 1, y - 1, '#C9DCFF'); P(x + 1, y - 1, '#C9DCFF'); } });
  } else if (sky === 'cold') {
    vgrad(c, 0, 58, '#5E7FB8', '#C8DBF2');
    for (let i = 0; i < 24; i++) {
      const x = (i * 37 + 11 + Math.round(Math.sin(a + i) * 2)) % CS, y = Math.floor((i * 23 + t * CS / n) % 58);
      P(x, y, '#FFFFFF'); if (i % 3 === 0) { P(x - 1, y, '#E8F0FF'); P(x + 1, y, '#E8F0FF'); }
    }
    vgrad(c, 58, 64, '#FFFFFF', '#C9D6EE'); R(0, 58, CS, 1, '#FFFFFF');
  } else if (sky === 'hot') {
    vgrad(c, 0, 58, '#FF9A3D', '#FFE07A');
    const pulse = Math.round(Math.sin(a * 2));
    c.fillStyle = '#FFF4B0';
    [[0, -9], [0, 9], [-9, 0], [9, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(([dx, dy]) => c.fillRect(50 + dx + Math.sign(dx) * pulse, 24 + dy + Math.sign(dy) * pulse, 2, 2));
    litDisc(c, 51, 25, 5, '#FFD23D', { light: .6, dark: .2 });
    vgrad(c, 58, 64, '#F2C46B', '#C9913E'); R(0, 58, CS, 1, '#FFE2A0');
  }
}

// ---- Tilly herself, posable ---------------------------------------------------------
// p: { arms: [left, right], wave, eyes, mouth, legs: 'stand'|'walk'|'sit', step, extras: {...} }
function tillySprite(L, cx, cy, p, t, n) {
  const d = pix(L);
  const a = Math.PI * 2 * t / n;
  const ex = p.extras || {};
  // legs and shoes
  if (p.legs === 'sit') {
    litOval(L, cx - 9, 56, 3, 2, '#FF6B8B'); litOval(L, cx + 9, 56, 3, 2, '#FF6B8B');
    d.line(cx - 8, cy + 12, cx - 9, 54, TEAL_D, 2); d.line(cx + 8, cy + 12, cx + 9, 54, TEAL_D, 2);
  } else {
    const ph = p.step || 0;
    const lf = p.legs === 'walk' ? [Math.round(Math.sin(ph) * 3), Math.round(Math.max(0, Math.cos(ph)) * 2)] : [0, 0];
    const rf = p.legs === 'walk' ? [-lf[0], Math.round(Math.max(0, -Math.cos(ph)) * 2)] : [0, 0];
    d.line(cx - 5, cy + 15, cx - 6 + lf[0], 55 - lf[1], TEAL_D, 2); d.line(cx + 5, cy + 15, cx + 6 + rf[0], 55 - rf[1], TEAL_D, 2);
    litOval(L, cx - 8 + lf[0], 56 - lf[1], 3, 2, '#FF6B8B'); litOval(L, cx + 8 + rf[0], 56 - rf[1], 3, 2, '#FF6B8B');
  }
  // bells, hammer or nightcap
  litDisc(L, cx - 12, cy - 15, 5, '#E8B23A', { light: .65 }); litDisc(L, cx + 12, cy - 15, 5, '#E8B23A', { light: .65 });
  if (ex.nightcap) {
    litOval(L, cx, cy - 17, 7, 4, '#4C5BD4', { light: .4 });
    d.line(cx + 4, cy - 20, cx + 11, cy - 25, '#4C5BD4', 3); d.R(cx - 7, cy - 15, 14, 2, '#FFFFFF');
    litDisc(L, cx + 12, cy - 26, 2, '#FFFFFF', { dark: .25 });
  } else {
    const ring = p.ring && t % 10 < 2, hx = ring ? 2 : 0;
    d.line(cx, cy - 16, cx + hx, cy - 21, '#8C6A1E', 1); litDisc(L, cx + hx, cy - 21, 1, '#FFE08A');
  }
  // arms
  const glove = (x, y) => litDisc(L, x, y, 2, '#FFFFFF', { dark: .25 });
  const arm = (side, mode) => {
    const s = side === 'l' ? -1 : 1, sx = cx + 16 * s, sy = cy + 1;
    let hx, hy, ex2, ey2;
    if (mode === 'hip') { ex2 = cx + 21 * s; ey2 = cy + 7; hx = cx + 17 * s; hy = cy + 10; d.line(sx, sy, ex2, ey2, TEAL_D, 2); d.line(ex2, ey2, hx, hy, TEAL_D, 2); glove(hx, hy); return; }
    if (mode === 'down') { hx = cx + 20 * s; hy = cy + 13; }
    if (mode === 'up') { const sw = Math.round(Math.sin(a * 4 + (s > 0 ? 0 : Math.PI)) * 2); hx = cx + 21 * s; hy = cy - 13 + sw; }
    if (mode === 'wave') { const w = Math.sin(a * 4) * 0.5; hx = cx + 17 * s + Math.round(Math.cos(-1.1 + w) * 9) * s; hy = cy - 1 + Math.round(Math.sin(-1.1 + w) * 9); }
    if (mode === 'hug') { hx = cx + 5 * s; hy = cy + 11; }
    if (mode === 'umbrella') { hx = cx + 18; hy = cy - 3; }
    if (mode === 'fan') { const f = Math.round(Math.sin(a * 8) * 2); hx = cx + 18 * s; hy = cy - 8 + f; }
    if (mode === 'swing') { const f = Math.round(Math.sin((p.step || 0)) * 4) * s; hx = cx + 19 * s + f; hy = cy + 10; }
    d.line(sx, sy, hx, hy, TEAL_D, 2); glove(hx, hy);
  };
  // body and dial
  litDisc(L, cx, cy, 16, TEAL, { light: .55, dark: .55, bands: 5 });
  d.P(cx - 9, cy - 12, '#C8FFF4'); d.P(cx - 10, cy - 11, '#C8FFF4'); d.P(cx - 11, cy - 9, '#9AF2E2');
  litDisc(L, cx, cy, 13, '#FFF4DC', { light: .35, dark: .18, bands: 3 });
  [[0, -12], [0, 12], [-12, 0], [12, 0]].forEach(([x, y]) => d.P(cx + x, cy + y, '#9C8A6E'));
  // hands spin playfully (the real time is shown in the band above)
  const ma = a * (p.handSpeed ?? 1) - Math.PI / 2, ha = a / 12 + Math.PI / 6 - Math.PI / 2;
  d.line(cx, cy + 3, cx + Math.round(Math.cos(ha) * 6), cy + 3 + Math.round(Math.sin(ha) * 6), '#B9A68A', 1);
  d.line(cx, cy + 3, cx + Math.round(Math.cos(ma) * 9), cy + 3 + Math.round(Math.sin(ma) * 9), '#CDBEA4', 1);
  d.P(cx, cy + 3, '#E0A82E');
  // eyes
  const eye = (x, kind) => {
    if (kind === 'closed') { d.R(x - 1, cy - 4, 3, 1, INK); d.P(x - 2, cy - 5, INK); d.P(x + 2, cy - 5, INK); return; }   // sleepy curve
    if (kind === 'blink') { d.R(x - 1, cy - 4, 4, 1, INK); return; }
    if (kind === 'happy') { d.P(x - 2, cy - 3, INK); d.P(x - 1, cy - 4, INK); d.P(x, cy - 5, INK); d.P(x + 1, cy - 4, INK); d.P(x + 2, cy - 3, INK); return; }
    if (kind === 'sleepy') { d.oval(x, cy - 4, 2, 3, INK); d.R(x - 2, cy - 7, 5, 3, '#F2E6C8'); d.R(x - 2, cy - 4, 5, 1, '#D9C9A6'); return; }
    if (kind === 'wide') { d.oval(x, cy - 4, 2, 3, '#FFFFFF'); d.oval(x, cy - 4, 1, 2, INK); return; }
    d.oval(x, cy - 4, 2, 3, INK); d.P(x - 1, cy - 6, '#FFFFFF'); d.P(x + 1, cy - 2, '#4A3A78');
  };
  const [el, er] = p.eyes;
  eye(cx - 5, el); eye(cx + 5, er);
  // cheeks
  const cheek = ex.coldCheeks ? '#9CC8FF' : ex.hotCheeks ? '#FF7A7A' : '#FFB3C1';
  d.R(cx - 10, cy + 1, 3, 2, cheek); d.R(cx + 8, cy + 1, 3, 2, cheek);
  // mouth
  if (p.mouth === 'smile' || p.mouth === 'big') {
    const m = p.mouth === 'big' ? 4 : 3;
    for (let i = -m; i <= m; i++) d.P(cx + i, cy + 6 + Math.round((m * m - i * i) / (m * 3)), INK);
    if (p.mouth === 'big') d.R(cx - 1, cy + 8, 3, 1, '#FF6B8B');
  } else if (p.mouth === 'yawn') {
    litOval(L, cx, cy + 7, 2, 3, '#5A1E36', { light: .2 }); d.R(cx - 1, cy + 9, 3, 1, '#FF6B8B');
  } else if (p.mouth === 'o') {
    d.oval(cx, cy + 7, 1, 1, '#5A1E36');
  } else if (p.mouth === 'wobble') {
    for (let i = -3; i <= 3; i++) d.P(cx + i, cy + 7 + ((i + t) % 2 ? 1 : 0), INK);
  } else if (p.mouth === 'sleep') {
    d.R(cx - 1, cy + 7, 3, 1, INK);
  }
  // extras
  if (ex.sunglasses) {
    d.R(cx - 9, cy - 6, 18, 1, '#111111'); d.R(cx - 9, cy - 6, 7, 4, '#111111'); d.R(cx + 2, cy - 6, 7, 4, '#111111');
    d.P(cx - 8, cy - 5, '#7FD3FF'); d.P(cx + 3, cy - 5, '#7FD3FF');
  }
  if (ex.scarf) {
    d.R(cx - 14, cy + 9, 28, 3, '#E23B4A');
    for (let x = cx - 14; x < cx + 14; x += 4) d.R(x, cy + 9, 2, 3, '#FFFFFF');
    const flap = Math.round(Math.sin(a * 4));
    d.R(cx + 8, cy + 12, 3, 6 + flap, '#E23B4A'); d.R(cx + 8, cy + 14, 3, 1, '#FFFFFF');
  }
  // umbrella held off to the side and tilted over her head, so the pole never crosses her face
  if (p.arms.includes('umbrella')) d.line(cx + 18, cy - 3, cx + 7, cy - 21, '#6B4A2A', 1);
  // arms last so hands sit in front
  arm('l', p.arms[0]); arm('r', p.arms[1]);
  if (p.arms.includes('umbrella')) {
    // canopy: a lit dome with scalloped edge
    const ux = cx + 6, uy = cy - 22;
    for (let y = -6; y <= 0; y++) {
      const w = Math.round(17 * Math.sqrt(1 - (y * y) / 42));
      for (let x = -w; x <= w; x++) {
        const seg = Math.floor((x + 17) / 7) % 2;
        const l = .5 - .4 * (x / 17) - .5 * (y / 6);
        const base = seg ? '#FF5C7A' : '#FFD36B';
        d.P(ux + x, uy + y, l > .75 ? (seg ? '#FF9AAE' : '#FFF0B0') : l < .3 ? (seg ? '#B8304B' : '#C99A2E') : base);
      }
    }
    for (let x = -17; x <= 17; x += 7) d.P(ux + x, uy + 1, seg2(x));
    d.R(ux, uy - 8, 1, 2, '#6B4A2A');
  }
  function seg2(x) { return Math.floor((x + 17) / 7) % 2 ? '#B8304B' : '#C99A2E'; }
}

// ---- scenes -----------------------------------------------------------------------
// Each scene: { frames, speed, loop, sky?, draw(t, n, sky) }. `loop: false` scenes play once
// (walking off or back on); the server waits for them to finish before moving on.
const TILLY_SCENES = {
  idle: {
    frames: 40, speed: 110, skies: ['day', 'night'],
    pose: (t, n) => {
      const a = Math.PI * 2 * t / n, hop = Math.round(Math.abs(Math.sin(a * 2)) * -3);
      return { cy: 36 + hop + (hop === 0 ? 1 : 0), p: { arms: ['hip', 'wave'], ring: true, legs: 'stand', mouth: t >= 30 && t <= 34 ? 'big' : 'smile',
        eyes: t % 20 >= 17 && t % 20 <= 18 ? ['blink', 'blink'] : t >= 30 && t <= 34 ? ['open', 'blink'] : ['open', 'open'] } };
    },
  },
  dance: {
    frames: 40, speed: 100, skies: ['day', 'night'],
    pose: (t, n) => {
      const a = Math.PI * 2 * t / n;
      return { cx: 32 + Math.round(Math.sin(a * 2) * 4), cy: 37 - Math.round(Math.abs(Math.sin(a * 4)) * 2),
        p: { arms: ['up', 'up'], legs: 'walk', step: a * 4, mouth: 'big', eyes: ['happy', 'happy'], handSpeed: 3 }, notes: true };
    },
  },
  walk_out: {
    frames: 24, speed: 90, loop: false, skies: ['day', 'night'],
    pose: (t, n) => ({ cx: 32 + Math.round(t / (n - 1) * 52), cy: 37 - (t % 4 < 2 ? 1 : 0),
      p: { arms: ['swing', 'swing'], legs: 'walk', step: t * 1.2, mouth: 'smile', eyes: ['open', 'open'] } }),
  },
  away: {
    frames: 20, speed: 200, skies: ['day', 'night'], empty: true,
  },
  walk_in: {
    frames: 24, speed: 90, loop: false, skies: ['day', 'night'],
    pose: (t, n) => ({ cx: -20 + Math.round(t / (n - 1) * 52), cy: 37 - (t % 4 < 2 ? 1 : 0),
      p: { arms: ['swing', 'swing'], legs: 'walk', step: t * 1.2, mouth: 'smile', eyes: ['open', 'open'] } }),
  },
  yawn: {
    frames: 40, speed: 120, skies: ['night'],
    pose: (t) => {
      const yawning = t >= 8 && t < 26;
      return { cy: 37, p: { arms: yawning ? ['up', 'up'] : ['down', 'down'], legs: 'stand', mouth: yawning ? 'yawn' : 'o',
        eyes: yawning ? ['blink', 'blink'] : ['sleepy', 'sleepy'], handSpeed: 0.3, extras: { nightcap: true } } };
    },
  },
  sleep: {
    frames: 40, speed: 150, skies: ['night'],
    pose: (t, n) => ({ cy: 42 + (Math.sin(Math.PI * 2 * t / n) > 0 ? 0 : 1),
      p: { arms: ['hug', 'hug'], legs: 'sit', mouth: 'sleep', eyes: ['closed', 'closed'], handSpeed: 0, extras: { nightcap: true } }, zzz: true }),
  },
  rain: {
    frames: 40, speed: 110, skies: ['rain'],
    pose: (t) => ({ cy: 40, p: { arms: ['hip', 'umbrella'], legs: 'stand', mouth: t % 20 < 10 ? 'smile' : 'o',
      eyes: t % 20 >= 17 ? ['blink', 'blink'] : ['open', 'open'] } }),
  },
  cold: {
    frames: 40, speed: 90, skies: ['cold'],
    pose: (t) => ({ cx: 32 + (t % 2 ? 1 : -1), cy: 37, p: { arms: ['hug', 'hug'], legs: 'stand', mouth: 'wobble', eyes: ['wide', 'wide'],
      extras: { scarf: true, coldCheeks: true } }, breath: true }),
  },
  hot: {
    frames: 40, speed: 110, skies: ['hot'],
    pose: (t, n) => ({ cy: 37, p: { arms: ['hip', 'fan'], legs: 'stand', mouth: 'smile', eyes: ['open', 'open'],
      extras: { sunglasses: true, hotCheeks: true } }, sweat: true }),
  },
};

function drawTillyScene(name, sky, t, n) {
  const sc = TILLY_SCENES[name];
  const c = canvas64(), { R, P } = pix(c);
  sceneBackdrop(c, sky, t, n);
  if (!sc.empty) {
    const { cx = 32, cy = 36, p, notes, zzz, breath, sweat } = sc.pose(t, n);
    // shadow on the ground
    c.fillStyle = 'rgba(10,6,30,.35)'; c.fillRect(cx - 10, 58, 20, 1);
    const L = canvas64();
    tillySprite(L, cx, cy, p, t, n);
    stampWithOutline(c, L, '#06040F');
    const a = Math.PI * 2 * t / n;
    if (notes) [[0, '#FF8FC7'], [1, '#FFD36B']].forEach(([i, col]) => {
      const nx = cx + (i ? 20 : -22), ny = 30 - ((t * 2 + i * 20) % 18);
      c.fillStyle = col; c.fillRect(nx, ny, 2, 2); c.fillRect(nx + 1, ny - 4, 1, 4); c.fillRect(nx + 2, ny - 4, 2, 1);
    });
    if (zzz) for (let i = 0; i < 3; i++) {
      const k = (t + i * 13) % 40, zx = cx + 12 + Math.round(k / 4), zy = 36 - k;
      if (zy > BAND + 1) fancyText(c, 'Z', zx, zy, { big: false, top: '#E6EEFF', bottom: '#8FA8FF', shadow: null });
    }
    if (breath && t % 10 < 5) { const k = t % 10; litDisc(c, cx - 8 - k * 2, cy + 6 - k, 1 + (k > 2 ? 1 : 0), '#FFFFFF', { dark: .15 }); }
    if (sweat) { const k = t % 16; litOval(c, cx - 15, cy - 6 + k, 1, 2, '#7FD3FF', { light: .6 }); }
  } else {
    // nobody home: a little sign stuck in the ground
    const L = canvas64(), d = pix(L);
    d.R(31, 44, 2, 14, '#8A5A2B'); litOval(L, 32, 40, 13, 5, '#E8C38A', { light: .3, dark: .3, bands: 3 });
    stampWithOutline(c, L, '#2A1A0E');
    fancyText(c, 'BACK', 32, 36, { big: false, align: 'center', top: '#6B3E1A', bottom: '#3E2210', outline: null, shadow: null });
    fancyText(c, 'SOON', 32, 42, { big: false, align: 'center', top: '#6B3E1A', bottom: '#3E2210', outline: null, shadow: null });
  }
  // band for the server's time and temperature
  vgrad(c, 0, BAND, '#05040F', '#120E2C'); R(0, BAND, CS, 1, '#3A2F75');
  return c.getImageData(0, 0, CS, CS);
}

// Every scene/sky combination the server may play, as raw RGB frames in base64.
async function tillyScenePack(onProgress) {
  const scenes = [];
  const jobs = [];
  for (const [name, sc] of Object.entries(TILLY_SCENES)) for (const sky of sc.skies) jobs.push([name, sky, sc]);
  for (const [j, [name, sky, sc]] of jobs.entries()) {
    const frames = [];
    for (let t = 0; t < sc.frames; t++) frames.push(frameToB64(drawTillyScene(name, sky, t, sc.frames)));
    scenes.push({ name, sky, speed: sc.speed, loop: sc.loop !== false, frames });
    onProgress && onProgress((j + 1) / jobs.length);
    await new Promise(r => setTimeout(r));  // let the progress bar paint
  }
  return scenes;
}
