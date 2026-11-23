'use strict';
// More original characters: Pip the cactus, Bolt the robot, Mochi the cat and Frosty the snowman.
// Each draw(t, n, { scene, live }) works like drawSanta: `live` leaves the 12px band at the top for
// the time and temperature (drawn by the home server), and everything stays below y=13 so the band
// never covers a character. Uses the helpers in characters.js and pixelart.js.

const CAST_BAND = 12;
function castFinish(c, L, { live, label, t, outline = '#0A0716' }) {
  if (live) { vgrad(c, 0, CAST_BAND, '#05040F', '#100C26'); c.fillStyle = '#3A2F75'; c.fillRect(0, CAST_BAND, CS, 1); }
  stampWithOutline(c, L, outline);
  if (!live && label) fancyText(c, label, 32, 1, { big: false, align: 'center', top: '#FFF2B8', bottom: '#FFB03A' });
  return c.getImageData(0, 0, CS, CS);
}
const wave01 = (t, n, k = 1) => (Math.sin(Math.PI * 2 * t / n * k) + 1) / 2;

// ---------------------------------------------------------------------------
// Pip the cactus: waters itself, sunbathes, and blooms.
// ---------------------------------------------------------------------------
const PIP_SCENES = ['water', 'sunbathe', 'bloom'];
function drawPip(t, n, opts = {}) {
  const scene = opts.scene || 'water', live = !!opts.live;
  const c = canvas64(), { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  vgrad(c, 0, 54, scene === 'sunbathe' ? '#FF9F5A' : '#5FB0F0', scene === 'sunbathe' ? '#FFE3A0' : '#CDEBFF');
  vgrad(c, 54, 64, '#C99A6A', '#8A6038'); R(0, 54, CS, 1, '#E8C08E');           // windowsill
  if (scene === 'sunbathe') {
    litDisc(c, 10, 22, 5, '#FFD23D', { light: .6, dark: .2 });
    c.fillStyle = '#FFF4B0'; [[0, -8], [8, 0], [0, 8], [-8, 0], [6, -6], [6, 6], [-6, 6], [-6, -6]].forEach(([x, y]) => c.fillRect(10 + x, 22 + y, 1, 1));
  }
  const L = canvas64(), d = pix(L);
  const sway = scene === 'sunbathe' ? Math.round(Math.sin(a * 2)) : 0;
  const cx = 32 + sway;
  // pot
  litOval(L, 32, 49, 10, 7, '#D9733F', { light: .35, dark: .4 }); d.R(21, 41, 22, 3, '#E88A55'); d.R(21, 43, 22, 1, '#A8522A');
  d.R(23, 41, 18, 1, '#6B4A2A');                                                  // soil
  // body and arms
  const GREEN = '#3FAE5A';
  const armUp = scene === 'sunbathe' ? -6 : 0;
  litOval(L, cx - 9, 30 + armUp, 3, 5, GREEN, { light: .4 }); d.R(cx - 9, 33, 4, 3, GREEN);
  litOval(L, cx + 9, 27 + armUp, 3, 5, GREEN, { light: .4 }); d.R(cx + 6, 30, 4, 3, GREEN);
  litOval(L, cx, 30, 8, 12, GREEN, { light: .45, dark: .45, bands: 5 });
  // ribs and spines
  [-4, 0, 4].forEach(x => { for (let y = 20; y < 41; y += 2) if (Math.abs(x) < 8) d.P(cx + x, y, '#2F8A47'); });
  [[-7, 24], [7, 26], [-6, 36], [6, 34], [-12, 26 + armUp], [12, 23 + armUp], [0, 18]].forEach(([x, y]) => d.P(cx + x, y, '#E8FFD8'));
  // face
  const happy = scene === 'water' ? t % 20 >= 8 && t % 20 < 16 : scene === 'bloom' ? t >= 24 : false;
  if (scene === 'sunbathe') {
    d.R(cx - 6, 27, 12, 1, '#111'); d.R(cx - 6, 27, 5, 3, '#111'); d.R(cx + 1, 27, 5, 3, '#111'); d.P(cx - 5, 28, '#7FD3FF'); d.P(cx + 2, 28, '#7FD3FF');
  } else if (happy) {
    [[-4, 29], [-3, 28], [-2, 29], [2, 29], [3, 28], [4, 29]].forEach(([x, y]) => d.P(cx + x, y, '#1A2A1A'));
  } else {
    d.oval(cx - 3, 28, 1, 2, '#1A2A1A'); d.oval(cx + 3, 28, 1, 2, '#1A2A1A'); d.P(cx - 3, 27, '#FFFFFF'); d.P(cx + 3, 27, '#FFFFFF');
  }
  d.R(cx - 6, 31, 2, 1, '#FF9AA8'); d.R(cx + 5, 31, 2, 1, '#FF9AA8');
  for (let i = -2; i <= 2; i++) d.P(cx + i, 33 + (Math.abs(i) === 2 ? 0 : 1), '#1A2A1A');
  // scene props
  if (scene === 'water') {
    // a watering can floats over and tips; drops land on Pip's head
    const tip = t % 20 < 4 ? (t % 20) / 4 : t % 20 < 16 ? 1 : (20 - t % 20) / 4;
    const kx = 46, ky = 18;
    litOval(L, kx, ky, 6, 4, '#7FA8D8', { light: .5 }); d.R(kx - 2, ky - 6, 5, 1, '#5A7FB0'); d.R(kx - 3, ky - 5, 1, 2, '#5A7FB0'); d.R(kx + 3, ky - 5, 1, 2, '#5A7FB0');
    d.line(kx - 5, ky + 1, kx - 10, ky - 2 + Math.round(tip * 4), '#5A7FB0', 2);
    if (tip > .9) for (let k = 0; k < 3; k++) {
      const y = 18 + ((t * 2 + k * 5) % 12); d.P(kx - 11 - k, y, '#4FB3FF'); d.P(kx - 11 - k, y + 1, '#B5E2FF');
    }
  }
  if (scene === 'bloom') {
    const g = Math.min(1, t / 20), open = Math.max(0, Math.min(1, (t - 18) / 8));
    d.R(cx, 18 - Math.round(g * 3), 1, Math.round(g * 3) + 1, '#2F8A47');
    const fy = 15 - Math.round(g * 3);
    if (open > 0) {
      const r = 1 + Math.round(open * 2);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([x, y]) => litDisc(L, cx + x * r, fy + y * r, 1 + Math.round(open), '#FF6FA8', { light: .5, bands: 3 }));
      litDisc(L, cx, fy, 1, '#FFD36B', { bands: 2 });
    } else if (g > .3) litOval(L, cx, fy, 1, 2, '#FF8FBF', { bands: 2 });
    if (t >= 28) [[-14, 22], [14, 18]].forEach(([x, y], i) => { const k = (t + i * 3) % 8; d.P(cx + x, y - k, '#FF6FA8'); d.P(cx + x + 1, y - k, '#FF6FA8'); d.P(cx + x - 1, y - k + 1 - 1, '#FF6FA8'); d.P(cx + x, y - k + 1, '#FF6FA8'); });
  }
  return castFinish(c, L, { live, label: { water: 'GLUG', sunbathe: 'AHHH', bloom: 'TA-DA' }[scene], t });
}

// ---------------------------------------------------------------------------
// Bolt the robot: sweeps up, recharges, and glitches into a dance.
// ---------------------------------------------------------------------------
const BOLT_SCENES = ['sweep', 'recharge', 'glitch'];
function drawBolt(t, n, opts = {}) {
  const scene = opts.scene || 'sweep', live = !!opts.live;
  const c = canvas64(), { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  vgrad(c, 0, 56, '#1B2340', '#2E3D66');
  for (let x = 0; x < CS; x += 8) R(x, 20, 1, 36, 'rgba(255,255,255,.04)');           // wall panels
  vgrad(c, 56, 64, '#59647F', '#363E55'); R(0, 56, CS, 1, '#8D98B5');
  const L = canvas64(), d = pix(L);
  const sitting = scene === 'recharge';
  const bob = scene === 'glitch' ? Math.round(Math.abs(Math.sin(a * 4)) * -2) : scene === 'sweep' ? (t % 4 < 2 ? 0 : -1) : 0;
  const cx = 32 + (scene === 'sweep' ? Math.round(Math.sin(a) * 4) : 0), top = (sitting ? 22 : 17) + bob;
  const METAL = '#AEB8CC', DARK = '#5E6982';
  // legs / tracks
  if (sitting) { litOval(L, cx, 52, 12, 3, DARK, { light: .3 }); }
  else {
    const kick = scene === 'glitch' ? Math.round(Math.sin(a * 4) * 2) : 0;
    d.R(cx - 7, 46 + bob, 4, 7 + kick, DARK); d.R(cx + 3, 46 + bob, 4, 7 - kick, DARK);
    litOval(L, cx - 5, 54, 4, 2, '#3E4659', { light: .3 }); litOval(L, cx + 5, 54, 4, 2, '#3E4659', { light: .3 });
  }
  // body with a chest panel
  litOval(L, cx, top + 22, 11, 9, METAL, { light: .5, dark: .45, bands: 4 });
  d.R(cx - 5, top + 19, 10, 7, '#2A3148'); d.R(cx - 5, top + 19, 10, 1, '#3B4566');
  if (scene === 'recharge') {
    const lvl = Math.min(4, Math.floor(t / 8));
    for (let i = 0; i < 4; i++) d.R(cx - 4 + i * 2, top + 21, 1, 4, i < lvl ? (lvl === 4 ? '#7CF0C5' : '#FFD36B') : '#3B4566');
    d.R(cx + 5, top + 22, 1, 2, '#3B4566');
  } else {
    for (let i = 0; i < 3; i++) d.P(cx - 3 + i * 3, top + 22, (t + i) % 6 < 3 ? '#FF5C7A' : '#7CF0C5');
  }
  // arms
  const hand = (x, y) => litDisc(L, x, y, 2, METAL, { light: .5 });
  if (scene === 'sweep') {
    const sw = Math.round(Math.sin(a * 2) * 5);
    d.line(cx - 10, top + 20, cx - 6 + sw, top + 28, DARK, 2); hand(cx - 6 + sw, top + 28);
    d.line(cx + 10, top + 20, cx - 2 + sw, top + 30, DARK, 2); hand(cx - 2 + sw, top + 30);
    d.line(cx - 4 + sw, top + 24, cx - 12 + sw * 2, 53, '#B07A3E', 1);            // broom handle
    litOval(L, cx - 12 + sw * 2, 53, 4, 2, '#E8C25A', { light: .4, bands: 3 });
    if (Math.abs(sw) > 3) [[-18, 50], [-20, 48], [-16, 47]].forEach(([x, y], i) => d.P(cx + sw * 2 + x + i, y - (t % 3), '#C9C2B0'));
  } else if (scene === 'recharge') {
    d.line(cx - 10, top + 20, cx - 12, top + 27, DARK, 2); hand(cx - 12, top + 27);
    d.line(cx + 10, top + 20, cx + 12, top + 27, DARK, 2); hand(cx + 12, top + 27);
    d.line(cx + 11, top + 26, 60, 50, '#222833', 1); d.R(59, 46, 4, 6, '#E8ECF5');       // plug in the wall
    if (t % 8 < 4) d.P(cx + 15 + (t % 4) * 3, top + 28 + (t % 4) * 2, '#FFD36B');
  } else {
    const up = Math.sin(a * 4) > 0;
    d.line(cx - 10, top + 20, cx - 16, top + (up ? 10 : 30), DARK, 2); hand(cx - 16, top + (up ? 10 : 30));
    d.line(cx + 10, top + 20, cx + 16, top + (up ? 30 : 10), DARK, 2); hand(cx + 16, top + (up ? 30 : 10));
  }
  // head: screen face, antenna with a blinking light
  litOval(L, cx, top + 6, 10, 7, METAL, { light: .55, dark: .4, bands: 4 });
  d.R(cx - 7, top + 2, 14, 8, '#121826'); d.R(cx - 7, top + 2, 14, 1, '#1F2740');
  d.line(cx, top - 1, cx, top - 4, DARK, 1); litDisc(L, cx, top - 5, 1, t % 10 < 5 ? '#FF5C7A' : '#7A2A3A', { bands: 2 });
  const EYE = '#7FE8FF';
  if (scene === 'recharge') { d.R(cx - 5, top + 6, 3, 1, EYE); d.R(cx + 2, top + 6, 3, 1, EYE); }
  else if (scene === 'glitch' && t % 8 < 4) { [[-5, 5], [-4, 4], [-3, 5], [3, 5], [4, 4], [5, 5]].forEach(([x, y]) => d.P(cx + x, top + y, '#FF8FC7')); }
  else { d.R(cx - 5, top + 4, 3, 3, EYE); d.R(cx + 2, top + 4, 3, 3, EYE); d.P(cx - 5, top + 4, '#FFFFFF'); d.P(cx + 2, top + 4, '#FFFFFF'); }
  d.R(cx - 2, top + 8, 4, 1, scene === 'glitch' ? '#FF8FC7' : EYE);
  if (scene === 'recharge' && t >= 8) { const k = t % 12; fancyText(L, 'Z', cx + 12, top - 2 - Math.floor(k / 3), { big: false, top: '#E6EEFF', bottom: '#8FA8FF', shadow: null }); }
  let out = castFinish(c, L, { live, label: { sweep: 'TIDY', recharge: 'CHARGING', glitch: 'BEEP BOOP' }[scene], t });
  if (scene === 'glitch' && t % 10 >= 7) {
    // a little RGB glitch: shift a few rows sideways
    const img = out, src = new Uint8ClampedArray(img.data);
    for (let y = (live ? 14 : 8); y < 56; y++) if ((y + t) % 7 === 0) for (let x = 0; x < CS; x++) {
      const s = ((y * CS + Math.min(CS - 1, Math.max(0, x - 2))) * 4), o = (y * CS + x) * 4;
      img.data[o] = src[s]; img.data[o + 2] = src[(y * CS + Math.min(CS - 1, x + 2)) * 4 + 2];
    }
    out = img;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mochi the cat: stretches and yawns, chases a moth, naps.
// ---------------------------------------------------------------------------
const MOCHI_SCENES = ['stretch', 'moth', 'nap'];
function drawMochi(t, n, opts = {}) {
  const scene = opts.scene || 'moth', live = !!opts.live;
  const c = canvas64(), { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  vgrad(c, 0, 52, scene === 'nap' ? '#22183F' : '#3A2A5C', scene === 'nap' ? '#3A2A5C' : '#7A5A9A');
  vgrad(c, 52, 64, '#B04A5A', '#7A2E3E'); R(0, 52, CS, 1, '#D86A7A');          // rug
  for (let x = 4; x < CS; x += 10) R(x, 58, 4, 1, '#E89AA6');
  const L = canvas64(), d = pix(L);
  const FUR = '#F2B66B', FUR_D = '#C47E3A', CREAM = '#FFE8C8';
  const ear = (x, y, s) => { for (let i = 0; i < 5; i++) d.R(x + (s > 0 ? 0 : -i + 4 - 4), y + i, s > 0 ? i + 1 : i + 1, 1, FUR); d.P(x + (s > 0 ? 1 : 2), y + 3, '#FF9AA8'); };
  if (scene === 'nap') {
    // curled up loaf, tail wrapped round, breathing
    const br = t % 20 < 10 ? 0 : 1;
    litOval(L, 32, 46 - br, 15, 7 + br, FUR, { light: .4, dark: .35 });
    for (let i = -10; i <= 10; i += 5) d.R(32 + i, 41 - br, 2, 3, FUR_D);
    litDisc(L, 22, 44, 6, FUR, { light: .45 }); litOval(L, 21, 47, 3, 2, CREAM, { bands: 2 });
    ear(16, 36, 1); ear(24, 36, -1);
    d.R(19, 44, 3, 1, '#3A2418'); d.R(23, 44, 3, 1, '#3A2418'); d.P(22, 46, '#FF8FA0');
    const flick = Math.round(Math.sin(a * 2) * 1.5);
    d.line(46, 46, 50, 50 + flick, FUR, 3); d.line(50, 50 + flick, 44, 52, FUR, 3); d.P(43, 52, CREAM);
    const k = t % 14; fancyText(L, 'z', 28 + Math.floor(k / 3), 32 - k, { big: false, top: '#E6EEFF', bottom: '#8FA8FF', shadow: null });
    return castFinish(c, L, { live, label: 'PURR', t });
  }
  // sitting cat, front view
  const stretchK = scene === 'stretch' ? Math.max(0, Math.sin(Math.PI * Math.min(1, t / 30))) : 0;
  const jump = scene === 'moth' && t % 20 >= 12 && t % 20 < 16 ? -3 : 0;
  const cx = 32, hy = 29 + Math.round(stretchK * 2) + jump, by = 45 + jump;
  // tail
  const sw = Math.round(Math.sin(a * 2) * 3);
  d.line(cx + 9, by + 4, cx + 15, by - 4 + sw, FUR_D, 3); d.line(cx + 15, by - 4 + sw, cx + 13, by - 10 + sw, FUR_D, 3);
  // body
  litOval(L, cx, by, 10 + Math.round(stretchK * 2), 8 - Math.round(stretchK), FUR, { light: .4, dark: .4 });
  litOval(L, cx, by + 2, 5, 5, CREAM, { light: .2, bands: 3 });
  // paws (one swipes at the moth)
  const swipe = scene === 'moth' && t % 20 >= 12 && t % 20 < 16;
  litOval(L, cx - 4, by + 7, 2, 1, CREAM, { bands: 2 });
  if (swipe) { d.line(cx + 6, by - 2, cx + 14, hy - 8, FUR, 3); litDisc(L, cx + 14, hy - 9, 2, CREAM, { bands: 2 }); }
  else litOval(L, cx + 4, by + 7, 2, 1, CREAM, { bands: 2 });
  if (stretchK > .3) { d.line(cx - 8, by - 2, cx - 14, hy - 6, FUR, 3); litDisc(L, cx - 14, hy - 7, 2, CREAM, { bands: 2 }); d.line(cx + 8, by - 2, cx + 14, hy - 6, FUR, 3); litDisc(L, cx + 14, hy - 7, 2, CREAM, { bands: 2 }); }
  // head
  ear(cx - 9, hy - 10, 1); ear(cx + 5, hy - 10, -1);
  litOval(L, cx, hy, 9, 8, FUR, { light: .45, dark: .35 });
  d.R(cx - 3, hy - 7, 1, 3, FUR_D); d.R(cx, hy - 8, 1, 3, FUR_D); d.R(cx + 3, hy - 7, 1, 3, FUR_D);   // stripes
  litOval(L, cx, hy + 4, 5, 3, CREAM, { light: .2, bands: 2 });
  // moth flight path, and eyes that follow it
  const mx = Math.round(32 + Math.cos(a * 2) * 20), my = Math.round(24 + Math.sin(a * 3) * 6);
  const yawn = scene === 'stretch' && t >= 10 && t < 26;
  if (yawn) { [[-5, 0], [-4, -1], [-3, 0], [3, 0], [4, -1], [5, 0]].forEach(([x, y]) => d.P(cx + x, hy + y, '#3A2418')); }
  else {
    const lx = scene === 'moth' ? Math.sign(mx - cx) : 0, ly = scene === 'moth' ? Math.sign(my - hy) : 0;
    [-4, 4].forEach(x => { d.oval(cx + x, hy - 1, 2, 2, '#9BE36B'); d.R(cx + x + lx, hy - 2 + ly, 1, 3, '#1A1A1A'); d.P(cx + x - 1, hy - 2, '#FFFFFF'); });
  }
  d.P(cx, hy + 3, '#FF8FA0'); d.P(cx - 1, hy + 2, '#FF8FA0'); d.P(cx + 1, hy + 2, '#FF8FA0');
  if (yawn) { litOval(L, cx, hy + 6, 2, 2, '#7A1E2C', { light: .15, bands: 2 }); d.P(cx, hy + 7, '#FF8FA0'); }
  else { d.P(cx - 1, hy + 5, '#3A2418'); d.P(cx + 1, hy + 5, '#3A2418'); }
  [[-11, 3], [-11, 5], [11, 3], [11, 5]].forEach(([x, y]) => d.R(cx + (x < 0 ? x : x - 3), hy + y, 4, 1, '#FFF4E0'));
  if (scene === 'moth') {
    const fl = t % 2;
    litDisc(L, mx, my, 1, '#E8E0C8', { bands: 2 }); d.R(mx - 2, my - 1 - fl, 2, 2, '#FFF6D8'); d.R(mx + 1, my - 1 - fl, 2, 2, '#FFF6D8');
  }
  return castFinish(c, L, { live, label: scene === 'moth' ? 'MEOW?' : 'MRRAWR', t });
}

// ---------------------------------------------------------------------------
// Frosty the snowman: loses his nose, builds a mini snowman, melts and refreezes.
// ---------------------------------------------------------------------------
const FROSTY_SCENES = ['nose', 'build', 'melt'];
function drawFrosty(t, n, opts = {}) {
  const scene = opts.scene || 'build', live = !!opts.live;
  const c = canvas64(), { R, P } = pix(c);
  const a = Math.PI * 2 * t / n;
  const warm = scene === 'melt';
  vgrad(c, 0, 54, warm ? '#4F8FE0' : '#1A2A5C', warm ? '#BFE3FF' : '#4A5F9A');
  if (warm) { litDisc(c, 54, 22, 5, '#FFD23D', { light: .6, dark: .2 }); }
  else for (let i = 0; i < 18; i++) { const x = (i * 29 + 7) % CS, y = 13 + Math.floor((i * 17 + t * 41 / n * (1 + i % 2)) % 41); P(x, y, '#FFFFFF'); }
  vgrad(c, 54, 64, '#FFFFFF', '#C9D6EE'); R(0, 54, CS, 1, '#FFFFFF');
  const L = canvas64(), d = pix(L);
  const SNOW = '#F4F8FF';
  // melting: he sags over the loop, then a cold puff refreezes him
  const melt = warm ? (t < 30 ? t / 30 : 1 - (t - 30) / 10) : 0;
  const sag = Math.round(melt * 4);
  const cx = scene === 'build' ? 26 : 32;
  if (warm) litOval(L, cx, 55, 10 + Math.round(melt * 6), 1, '#9FD0FF', { light: .3, bands: 2 });   // puddle
  litDisc(L, cx, 47, 9, SNOW, { light: .2, dark: .2, bands: 3 });
  litOval(L, cx, 34 + sag, 7, 6 - Math.round(melt * 2), SNOW, { light: .2, dark: .2, bands: 3 });
  const hy = 24 + sag * 2;
  litDisc(L, cx, hy, 6, SNOW, { light: .2, dark: .2, bands: 3 });
  // buttons, scarf
  [36, 40, 46].forEach((y, i) => d.P(cx, y + (i < 2 ? sag : 0), '#2A2A33'));
  d.R(cx - 6, hy + 5, 12, 2, '#3FAE5A'); d.R(cx + 3, hy + 6, 2, 5 + Math.round(Math.sin(a * 3)), '#3FAE5A'); d.R(cx - 6, hy + 6, 12, 1, '#2F8A47');
  // hat
  d.R(cx - 6, hy - 6, 12, 1, '#22222C'); d.R(cx - 4, hy - 12, 8, 6, '#2A2A36'); d.R(cx - 4, hy - 8, 8, 1, '#C2354A'); d.R(cx - 4, hy - 12, 1, 6, '#3E3E4C');
  // arms (twigs)
  const BR = '#7A5230';
  let reach = false;
  if (scene === 'nose') reach = t >= 22 && t < 32;
  if (scene === 'build') { const sw = Math.round(Math.sin(a * 4) * 2); d.line(cx + 7, 33, cx + 14, 26 + sw, BR, 1); d.line(cx + 14, 26 + sw, cx + 16, 24 + sw, BR, 1); }
  else if (reach) { d.line(cx + 7, 34, cx + 12, 50, BR, 1); }
  else { d.line(cx + 7, 33 + sag, cx + 14, 28 + sag, BR, 1); d.line(cx + 12, 29 + sag, cx + 14, 26 + sag, BR, 1); }
  d.line(cx - 7, 33 + sag, cx - 14, 28 + sag + (warm ? sag : 0), BR, 1); d.line(cx - 12, 29 + sag, cx - 14, 26 + sag, BR, 1);
  // face
  const surprised = scene === 'nose' && t >= 10 && t < 22;
  if (surprised) { d.R(cx - 3, hy - 3, 2, 2, '#1A1A1A'); d.R(cx + 1, hy - 3, 2, 2, '#1A1A1A'); d.oval(cx, hy + 3, 1, 1, '#2A2A33'); }
  else { d.P(cx - 2, hy - 2, '#1A1A1A'); d.P(cx + 2, hy - 2, '#1A1A1A'); [-2, -1, 0, 1, 2].forEach(i => d.P(cx + i, hy + 3 + (Math.abs(i) === 2 ? -1 : 0), '#2A2A33')); }
  if (warm && melt > .3) { d.P(cx - 4, hy + 1 + (t % 4), '#7FD3FF'); d.P(cx + 5, 33 + (t % 5), '#7FD3FF'); }
  // the carrot nose: on his face, or falling, or on the ground being picked up
  const carrot = (x, y, dir) => { for (let i = 0; i < 4; i++) d.P(x + i * dir, y, i < 2 ? '#FF8A3D' : '#E8661F'); d.P(x, y - 1, '#3FAE5A'); };
  if (scene !== 'nose' || t < 10 || t >= 32) carrot(cx + 1, hy, 1);
  else if (t < 16) carrot(cx + 2 + (t - 10), hy + Math.round((t - 10) ** 2 * .7), 1);
  else if (t < 32) carrot(cx + 8, 53 - (reach && t >= 28 ? 3 : 0), 1);
  // the mini snowman grows next to him
  if (scene === 'build') {
    const k = Math.min(3, Math.floor(t / 9));
    if (k >= 1) litDisc(L, 47, 50, 4, SNOW, { light: .2, dark: .25, bands: 3 });
    if (k >= 2) litDisc(L, 47, 44, 3, SNOW, { light: .2, dark: .25, bands: 3 });
    if (k >= 3) { litDisc(L, 47, 39, 2, SNOW, { light: .2, dark: .25, bands: 3 }); d.P(46, 39, '#1A1A1A'); d.P(48, 39, '#1A1A1A'); d.P(49, 40, '#FF8A3D'); d.R(45, 36, 5, 1, '#C2354A'); }
    if (t >= 30 && t % 4 < 2) [[40, 33], [54, 35]].forEach(([x, y]) => { d.P(x, y, '#FFE29A'); d.P(x - 1, y, '#FFE29A'); d.P(x + 1, y, '#FFE29A'); d.P(x, y - 1, '#FFE29A'); d.P(x, y + 1, '#FFE29A'); });
  }
  if (warm && t >= 30) { const k = t - 30; for (let i = 0; i < 3; i++) d.P(6 + k * 3 + i * 2, 30 + i * 3, '#E6F6FF'); }   // cold puff
  return castFinish(c, L, { live, label: { nose: 'OOPS', build: 'MINI ME', melt: 'PHEW' }[scene], t, outline: '#1A2340' });
}

// Register them in the Characters gallery (CHARACTERS lives in characters.js).
{
  const items = CHARACTERS['Tilly Tock'].live.items;
  const liveAbout = who => `Live face: the Pixoo shows the real time and temperature above ${who} and keeps them updated on its own.`;
  Object.assign(CHARACTERS, {
    'Pip the Cactus': { about: 'A tiny potted cactus who waters himself, soaks up the sun and bursts into bloom.', frames: 40, speed: 140, draw: drawPip, live: { about: liveAbout('him'), items } },
    'Bolt the Robot': { about: 'A busy little robot who sweeps up, plugs in to recharge and does a glitchy dance.', frames: 40, speed: 130, draw: drawBolt, live: { about: liveAbout('him'), items } },
    'Mochi the Cat': { about: 'A round orange cat who stretches, chases a moth and curls up for a nap.', frames: 40, speed: 150, draw: drawMochi, live: { about: liveAbout('her'), items } },
    'Frosty the Snowman': { about: 'A cheerful snowman who loses his carrot nose, builds a mini snowman and melts a little.', frames: 40, speed: 140, draw: drawFrosty, live: { about: liveAbout('him'), items } },
  });
}
