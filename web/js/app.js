'use strict';
const S = 64;
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const cv = $('screen'), ctx = cv.getContext('2d');
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- feedback: toasts and connection status ----------
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast'; t.dataset.kind = kind; t.textContent = msg;
  $('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3500);
}
function setConn(state, text) {
  $('conn').dataset.state = state;
  $('connText').textContent = text;
}

// ---------- settings ----------
$('ip').value = store.get('ip', $('ip').value);
$('api').value = store.get('api', 'auto');
$('lat').value = store.get('lat', '');
$('lon').value = store.get('lon', '');
const IP_RE = /^(\d{1,3})(\.\d{1,3}){3}$|^[a-z0-9.-]+$/i;
$('ip').addEventListener('blur', () => {
  const v = host();
  const ok = IP_RE.test(v);
  $('ip').setAttribute('aria-invalid', String(!ok));
  $('ipHelp').textContent = ok ? 'Find it in the Divoom app under device settings.' : 'That doesn\'t look like an IP address. It should look like 192.168.4.192.';
});
$('ip').onchange = () => { store.set('ip', host()); detected = null; setConn('unknown', 'Not checked'); };
$('api').onchange = () => { store.set('api', $('api').value); detected = null; setConn('unknown', 'Not checked'); };

function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'system') { delete root.dataset.theme; store.set('theme', ''); }
  else { root.dataset.theme = t; store.set('theme', t); }
  $$('[data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === t)));
}
$$('[data-theme-choice]').forEach(b => b.onclick = () => applyTheme(b.dataset.themeChoice));
applyTheme(store.get('theme', '') || 'system');

// ---------- Pixoo API ----------
// Original Pixoo 64 firmware answers on :80/post; newer units ("Pixoo-64 II") answer the same
// commands on :9000/divoom_api. When this page is served by server.py, commands go to its /api
// endpoint instead, which forwards them (phone browsers block direct calls to local devices).
// Direct calls are sent as text/plain + no-cors so they reach the device without CORS headers.
let detected = null;
const host = () => $('ip').value.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
const served = location.protocol.startsWith('http');
async function hasServer() {
  if (!served) return false;
  try { return (await fetch('api/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}
async function apiUrl() {
  const mode = $('api').value;
  if (mode === 'server') return 'api';
  if (mode !== 'auto') return `http://${host()}${mode}`;
  if (detected) return detected;
  if (await hasServer()) return detected = 'api';
  for (const suffix of [':80/post', ':9000/divoom_api']) {
    const url = `http://${host()}${suffix}`;
    try {
      await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ Command: 'Channel/GetIndex' }), signal: AbortSignal.timeout(3000) });
      return detected = url;
    } catch {}
  }
  throw new Error('no answer on port 80 or 9000');
}
const viaLabel = url => url === 'api' ? 'home server' : 'port ' + (new URL(url).port || 80);
const pause = ms => new Promise(r => setTimeout(r, ms));
async function pixoo(cmd, params = {}) {
  const url = await apiUrl();
  const r = await fetch(url, {
    method: 'POST', mode: url === 'api' ? 'same-origin' : 'no-cors', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ Command: cmd, ...params }),
  });
  if (url === 'api' && !r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'server error ' + r.status);
}
async function pixooRead(cmd, params = {}) {
  const r = await fetch(await apiUrl(), {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ Command: cmd, ...params }),
  });
  const j = await r.json();
  const code = j.error_code ?? j.ReturnCode ?? 0;  // newer firmware replies with ReturnCode/ReturnMessage
  if (code !== 0) throw new Error(j.ReturnMessage || 'error ' + code);
  return j;
}
function frameToB64(imgData) {
  const d = imgData.data, rgb = new Uint8Array(S * S * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { rgb[j++] = d[i]; rgb[j++] = d[i + 1]; rgb[j++] = d[i + 2]; }
  let s = ''; for (let i = 0; i < rgb.length; i++) s += String.fromCharCode(rgb[i]);
  return btoa(s);
}
const UNREACHABLE = 'Can\'t reach the Pixoo. Check the address in Settings and that you\'re on the same wifi.';

let sending = false;
async function sendFrames(list, speed, { quiet = false } = {}) {
  if (sending) return false; sending = true;
  list = list.slice(0, 40);
  const btn = $('send'), bar = $('progress');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  bar.hidden = list.length < 2;
  try {
    setConn('busy', 'Sending');
    await pixoo('Draw/ResetHttpGifId'); // prevents the device freezing after many pushes
    for (let i = 0; i < list.length; i++) {
      $('sendLabel').textContent = list.length > 1 ? `Sending ${i + 1} of ${list.length}` : 'Sending';
      await pixoo('Draw/SendHttpGif', { PicNum: list.length, PicWidth: S, PicOffset: i, PicID: 1, PicSpeed: speed, PicData: frameToB64(list[i]) });
      const pct = Math.round((i + 1) / list.length * 100);
      bar.firstElementChild.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct);
      await pause(30); // the device's web server is single-threaded; give it a breather
    }
    setConn('ok', 'Connected');
    if (!quiet) toast(list.length > 1 ? `Sent ${list.length} frames to the Pixoo` : 'Sent to the Pixoo');
    return true;
  } catch (e) {
    setConn('err', 'Not connected');
    toast(UNREACHABLE, 'err');
    return false;
  } finally {
    sending = false; btn.disabled = false; btn.removeAttribute('aria-busy');
    $('sendLabel').textContent = 'Send to Pixoo';
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.width = '0'; }, 600);
  }
}

$('test').onclick = async () => {
  const btn = $('test'), out = $('testResult');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.querySelector('span').textContent = 'Testing';
  out.textContent = ''; out.dataset.kind = '';
  detected = null;
  try {
    let msg;
    try {
      const conf = await pixooRead('Channel/GetAllConf');
      msg = `Connected through the ${viaLabel(await apiUrl())}. Brightness is ${conf.Brightness ?? 'unknown'}%.`;
      if (conf.Brightness != null) { $('bright').value = conf.Brightness; showBright(); }
    } catch {
      detected = null;
      await pixoo('Channel/GetAllConf');
      msg = `Reachable through ${viaLabel(await apiUrl())}. The browser hides the device's replies, but sending works.`;
    }
    out.textContent = msg; out.dataset.kind = 'ok'; setConn('ok', 'Connected');
  } catch {
    out.textContent = 'No answer. Check the IP address, that the Pixoo is on, and that this device is on the same wifi.';
    out.dataset.kind = 'err'; setConn('err', 'Not connected');
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy'); btn.querySelector('span').textContent = 'Test connection';
  }
};

const showBright = () => { $('brightOut').textContent = $('bright').value + '%'; };
$('bright').oninput = showBright;
$('bright').onchange = () => pixoo('Channel/SetBrightness', { Brightness: +$('bright').value })
  .then(() => setConn('ok', 'Connected'))
  .catch(() => { setConn('err', 'Not connected'); toast(UNREACHABLE, 'err'); });

// ---------- tiny 3x5 pixel font ----------
const FONT = {
  '0':'111101101101111','1':'010110010010111','2':'111001111100111','3':'111001111001111','4':'101101111001001',
  '5':'111100111001111','6':'111100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001111',
  ':':'000010000010000','-':'000000111000000','°':'010101010000000','%':'101001010100101',' ':'000000000000000',
  '.':'000000000000010',
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',
  G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',
  M:'101111111101101',N:'110101101101101',O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',
  S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',
  Y:'101101010010010',Z:'111001010100111',
};
function text(c, str, x, y, color, scale = 1) {
  c.fillStyle = color;
  for (const ch of String(str).toUpperCase()) {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(x + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    x += 4 * scale;
  }
}
const textWidth = (str, scale = 1) => String(str).length * 4 * scale - scale;

// ---------- effects ----------
function pixelEffect(fn) {
  return (t, n) => {
    const img = new ImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const [r, g, b] = fn(x, y, t, n); const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    return img;
  };
}
const TAU = Math.PI * 2;
const hsv = (h, s, v) => { const f = n => { const k = (n + h * 6) % 6; return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))); }; return [f(5), f(3), f(1)]; };
function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

const EFFECTS = {
  'Plasma': pixelEffect((x, y, t, n) => {
    const a = TAU * t / n;
    const v = Math.sin(x / 7 + a) + Math.sin(y / 10 + a) + Math.sin((x + y) / 9 + a)
      + Math.sin(Math.hypot(x - 32 + 12 * Math.cos(a), y - 32 + 12 * Math.sin(a)) / 6);
    return [0, 1, 2].map(k => 128 + 127 * Math.sin(v * Math.PI / 2 + k * TAU / 3));
  }),
  'Aurora': pixelEffect((x, y, t, n) => {
    const a = TAU * t / n;
    const band = Math.sin(x / 9 + a) * 8 + Math.sin(x / 4 - a * 2) * 3 + 26;
    const glow = Math.max(0, 1 - Math.abs(y - band) / 14);
    const star = ((x * 73 + y * 151) % 97 === 0) ? 160 * (0.5 + 0.5 * Math.sin(a * 3 + x)) : 0;
    return [20 * glow + star, 255 * glow * glow + star, 160 * glow + 40 * (y / S) + star];
  }),
  'Rainbow tunnel': pixelEffect((x, y, t, n) => {
    const dx = x - 31.5, dy = y - 31.5, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const v = (200 / (d + 1) + t / n * 8) % 1;
    return hsv(((ang / TAU + t / n) % 1 + 1) % 1, 0.9, Math.min(1, d / 10) * (v < 0.5 ? 1 : 0.35));
  }),
  'Fire': (() => {
    // simulate the fire then wrap it so the loop is seamless: blend the end into the start
    let cache = null;
    return (t, n) => {
      if (!cache || cache.n !== n) {
        const rnd = seeded(7), heat = new Float32Array(S * (S + 1)), frames = [];
        const total = n * 2;
        for (let f = 0; f < total; f++) {
          for (let x = 0; x < S; x++) heat[S * S + x] = rnd() > 0.45 ? 1 : 0.2;
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const b = (y + 1) * S;
            heat[y * S + x] = (heat[b + x] + heat[b + ((x + 1) % S)] + heat[b + ((x + S - 1) % S)] + heat[Math.min(S, y + 2) * S + x]) / 4.4;
          }
          if (f >= n) frames.push(heat.slice(0, S * S));
        }
        cache = { n, frames };
      }
      const h = cache.frames[t], img = new ImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const v = h[i];
        img.data.set([Math.min(255, v * 3 * 255), Math.min(255, Math.max(0, v * 3 - 1) * 255), Math.min(255, Math.max(0, v * 3 - 2) * 255), 255], i * 4);
      }
      return img;
    };
  })(),
  'Starfield': (() => {
    const rnd = seeded(3), stars = Array.from({ length: 90 }, () => [rnd() * 2 - 1, rnd() * 2 - 1, rnd()]);
    return (t, n) => {
      const c = new OffscreenCanvas(S, S).getContext('2d');
      c.fillStyle = '#000'; c.fillRect(0, 0, S, S);
      for (const [sx, sy, sz] of stars) {
        const z = 1 - ((sz + t / n) % 1);
        const x = 32 + sx * 24 / z, y = 32 + sy * 24 / z;
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        const b = Math.min(255, (1 - z) * 320); c.fillStyle = `rgb(${b},${b},${Math.min(255, b + 40)})`;
        c.fillRect(Math.floor(x), Math.floor(y), z < 0.3 ? 2 : 1, z < 0.3 ? 2 : 1);
      }
      return c.getImageData(0, 0, S, S);
    };
  })(),
  'Matrix rain': (() => {
    const rnd = seeded(11), cols = Array.from({ length: S }, () => [Math.floor(rnd() * S), 1 + Math.floor(rnd() * 2), 8 + Math.floor(rnd() * 16)]);
    return (t, n) => {
      const img = new ImageData(S, S);
      for (let x = 0; x < S; x++) {
        const [off, sp, len] = cols[x];
        // the head moves a whole multiple of 64 over the loop, so it repeats seamlessly
        const head = (off + Math.floor(t * S * sp / n)) % S;
        for (let k = 0; k < len; k++) {
          const y = (head - k + S) % S, i = (y * S + x) * 4, f = 1 - k / len;
          img.data.set(k === 0 ? [200, 255, 200, 255] : [0, 255 * f * f, 60 * f, 255], i);
        }
        for (let y = 0; y < S; y++) img.data[(y * S + x) * 4 + 3] = 255;
      }
      return img;
    };
  })(),
  'Bouncing heart': (t, n) => {
    const c = new OffscreenCanvas(S, S).getContext('2d');
    const a = TAU * t / n, beat = 1 + 0.12 * Math.max(0, Math.sin(a * 2)) ** 4;
    const g = c.createRadialGradient(32, 32, 4, 32, 32, 46); g.addColorStop(0, '#3a0b2a'); g.addColorStop(1, '#0b0414');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    const shape = ['01100110','11111111','11111111','11111111','01111110','00111100','00011000'];
    const px = Math.round(5 * beat), w = 8 * px, ox = Math.round(32 - w / 2), oy = Math.round(30 - 3.5 * px + Math.sin(a) * 4);
    shape.forEach((row, ry) => [...row].forEach((v, rx) => {
      if (v === '1') { c.fillStyle = (rx + ry) % 3 ? '#ff2d6f' : '#ff7aa5'; c.fillRect(ox + rx * px, oy + ry * px, px, px); }
    }));
    return c.getImageData(0, 0, S, S);
  },
};

// ---------- stage: preview loop ----------
let frames = [], frameIdx = 0, lastTick = 0;
let route = 'effects';
let stageOwner = 'effect';   // what's on the stage: effect | draw | info | play
const speed = () => Math.max(20, Math.min(1000, +$('speed').value || 80));
const frameCount = () => Math.max(1, Math.min(40, +$('frames').value || 40));

function setStage(title, meta) { $('stageTitle').textContent = title; $('stageMeta').textContent = meta; }
function renderEffect(name) {
  const n = frameCount();
  frames = Array.from({ length: n }, (_, t) => EFFECTS[name](t, n));
  frameIdx = 0; stageOwner = 'effect';
  setStage(name, `${n} frame${n > 1 ? 's' : ''} · ${speed()} ms`);
}
function loop(ts) {
  const animate = stageOwner !== 'draw' || drawPlaying;
  if (animate && frames.length && ts - lastTick > speed()) { lastTick = ts; frameIdx = (frameIdx + 1) % frames.length; }
  const img = stageOwner === 'draw' && !drawPlaying ? drawFrames[drawIdx] : frames[frameIdx];
  if (img) ctx.putImageData(img, 0, 0);
  if (ts - thumbTick > 90 && !reducedMotion.matches) { thumbTick = ts; drawThumbs(); }
  requestAnimationFrame(loop);
}

// ---------- effects: each option is a live miniature of itself ----------
let currentEffect = store.get('effect', 'Plasma');
if (!EFFECTS[currentEffect]) currentEffect = 'Plasma';
const thumbs = [];
let thumbTick = 0, thumbIdx = 0;
for (const name of Object.keys(EFFECTS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'effect'; b.setAttribute('role', 'radio'); b.dataset.effect = name;
  const c = document.createElement('canvas'); c.width = c.height = S; c.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = name;
  b.append(c, label);
  b.onclick = () => { stopLive(); stopSnake(); currentEffect = name; store.set('effect', name); renderEffect(name); markEffect(); };
  $('effects').append(b);
  thumbs.push({ ctx: c.getContext('2d'), frames: null, name });
}
function drawThumbs() {
  thumbIdx++;
  for (const t of thumbs) {
    if (!t.frames) t.frames = Array.from({ length: 20 }, (_, i) => EFFECTS[t.name](i, 20));
    t.ctx.putImageData(t.frames[thumbIdx % 20], 0, 0);
  }
}
function markEffect() {
  $$('.effect').forEach(b => b.setAttribute('aria-checked', String(stageOwner === 'effect' && b.dataset.effect === currentEffect)));
}
$('frames').onchange = () => { if (stageOwner === 'effect') renderEffect(currentEffect); };
$('speed').onchange = () => { if (stageOwner === 'effect') renderEffect(currentEffect); };

$('send').onclick = () => {
  if (stageOwner === 'info') return startLive(liveKind);
  const list = stageOwner === 'draw' ? drawFrames : frames;
  sendFrames(list, stageOwner === 'play' ? 1000 : speed());
};

// ---------- routing: every section has its own URL ----------
const ROUTES = ['effects', 'draw', 'info', 'play', 'settings'];
function go() {
  const next = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'effects';
  if (next !== 'play') stopSnake();
  route = next; document.body.dataset.route = next;
  $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== next);
  $$('.nav a').forEach(a => a.dataset.area === next ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (next === 'effects' && stageOwner !== 'effect' && !liveTimer) { renderEffect(currentEffect); }
  if (next === 'draw' && !liveTimer) { stageOwner = 'draw'; setDrawPlaying(false); updateFrameLabel(); }
  if (next === 'play' && snake && !liveTimer) { stageOwner = 'play'; frames = [snakeFrame()]; frameIdx = 0; setStage('Snake', `Score ${score}`); }
  markEffect();
}
addEventListener('hashchange', () => { go(); $('main').focus({ preventScroll: true }); });


// ---------- draw ----------
const blank = () => { const d = new ImageData(S, S); for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255; return d; };
let drawFrames = [blank()], drawIdx = 0, drawPlaying = false, tool = 'pen';
const PALETTE = [
  ['#000000', 'Black'], ['#ffffff', 'White'], ['#ff3366', 'Raspberry'], ['#ff8a00', 'Orange'], ['#ffd400', 'Yellow'], ['#3ccf8e', 'Green'],
  ['#00c2ff', 'Sky blue'], ['#3d5afe', 'Blue'], ['#a855f7', 'Violet'], ['#ff7aa5', 'Pink'], ['#8b5a2b', 'Brown'], ['#7f8c8d', 'Grey'],
];
PALETTE.forEach(([col, name]) => {
  const s = document.createElement('button');
  s.type = 'button'; s.className = 'swatch'; s.style.background = col; s.dataset.color = col; s.setAttribute('aria-label', name);
  s.onclick = () => { $('color').value = col; setTool('pen'); };
  $('palette').append(s);
});
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function setTool(t) {
  tool = t;
  $$('[data-tool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === t)));
  $$('.swatch').forEach(s => s.setAttribute('aria-pressed', String(t !== 'eraser' && s.dataset.color === $('color').value)));
}
$$('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('color').oninput = () => setTool(tool === 'eraser' ? 'pen' : tool);
function cellFromEvent(e) {
  const r = cv.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * S), Math.floor((e.clientY - r.top) / r.height * S)];
}
function paint(x, y) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const d = drawFrames[drawIdx].data, col = tool === 'eraser' ? [0, 0, 0] : hex($('color').value);
  if (tool === 'fill') {
    const i0 = (y * S + x) * 4, target = [d[i0], d[i0 + 1], d[i0 + 2]];
    if (target.every((v, k) => v === col[k])) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop(); if (cx < 0 || cy < 0 || cx >= S || cy >= S) continue;
      const i = (cy * S + cx) * 4; if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2]) continue;
      d.set(col, i); stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  } else d.set(col, (y * S + x) * 4);
}
let down = false, last = null;
cv.addEventListener('pointerdown', e => {
  if (route !== 'draw') return;
  stopLive(); stageOwner = 'draw'; setDrawPlaying(false);
  down = true; cv.setPointerCapture(e.pointerId);
  last = cellFromEvent(e); paint(...last); if (tool === 'fill') down = false;
});
cv.addEventListener('pointermove', e => {
  if (!down) return; const p = cellFromEvent(e);
  const steps = Math.max(Math.abs(p[0] - last[0]), Math.abs(p[1] - last[1]), 1);
  for (let s = 1; s <= steps; s++) paint(Math.round(last[0] + (p[0] - last[0]) * s / steps), Math.round(last[1] + (p[1] - last[1]) * s / steps));
  last = p;
});
cv.addEventListener('pointerup', () => down = false);
function updateFrameLabel() {
  $('frameLabel').textContent = `Frame ${drawIdx + 1} of ${drawFrames.length}`;
  frames = drawFrames;
  if (stageOwner === 'draw') setStage('Your drawing', `${drawFrames.length} frame${drawFrames.length > 1 ? 's' : ''} · ${speed()} ms`);
}
function setDrawPlaying(on) {
  drawPlaying = on;
  const b = $('playDraw');
  b.querySelector('use').setAttribute('href', on ? '#i-pause' : '#i-start');
  b.querySelector('span').textContent = on ? 'Pause' : 'Play';
}
$('prevFrame').onclick = () => { setDrawPlaying(false); drawIdx = (drawIdx - 1 + drawFrames.length) % drawFrames.length; updateFrameLabel(); };
$('nextFrame').onclick = () => { setDrawPlaying(false); drawIdx = (drawIdx + 1) % drawFrames.length; updateFrameLabel(); };
$('addFrame').onclick = () => {
  if (drawFrames.length >= 40) return toast('The Pixoo holds at most 40 frames.', 'err');
  drawFrames.splice(drawIdx + 1, 0, new ImageData(new Uint8ClampedArray(drawFrames[drawIdx].data), S, S));
  drawIdx++; setDrawPlaying(false); updateFrameLabel();
};
let undo = null;
function undoable(label, restore) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = label + ' ';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Undo';
  b.style.cssText = 'min-height:36px;color:inherit;margin-left:auto';
  b.onclick = () => { restore(); updateFrameLabel(); t.remove(); };
  t.append(b); $('toasts').append(t); setTimeout(() => t.remove(), 5000);
}
$('clear').onclick = () => {
  const before = drawFrames[drawIdx], at = drawIdx;
  drawFrames[drawIdx] = blank();
  undoable('Frame cleared.', () => { drawFrames[at] = before; });
};
$('delFrame').onclick = () => {
  const removed = drawFrames[drawIdx], at = drawIdx;
  if (drawFrames.length === 1) drawFrames[0] = blank();
  else { drawFrames.splice(drawIdx, 1); drawIdx = Math.min(drawIdx, drawFrames.length - 1); }
  updateFrameLabel();
  undoable('Frame deleted.', () => {
    if (drawFrames.length === 1 && at === 0) drawFrames[0] = removed; else drawFrames.splice(at, 0, removed);
    drawIdx = at;
  });
};
$('playDraw').onclick = () => { stageOwner = 'draw'; setDrawPlaying(!drawPlaying); };

// ---------- info displays ----------
let liveKind = null;
let liveTimer = null, weather = null, weatherAt = 0;
const WMO = code => code === 0 ? 'sun' : code <= 3 ? 'cloud' : code <= 48 ? 'fog' : code <= 67 || (code >= 80 && code <= 82) ? 'rain' : code <= 77 || code === 85 || code === 86 ? 'snow' : 'storm';
function drawIcon(c, kind, x, y) {
  const px = (col, pts) => { c.fillStyle = col; pts.forEach(([a, b, w = 1, h = 1]) => c.fillRect(x + a, y + b, w, h)); };
  if (kind === 'sun') { px('#ffd400', [[5, 3, 6, 10], [3, 5, 10, 6], [4, 4, 8, 8]]); px('#ffb000', [[7, 0, 2, 2], [7, 14, 2, 2], [0, 7, 2, 2], [14, 7, 2, 2], [2, 2], [13, 2], [2, 13], [13, 13]]); }
  else {
    px('#cfd6e4', [[3, 5, 8, 4], [1, 7, 14, 4], [9, 4, 4, 3]]);
    if (kind === 'rain') px('#00c2ff', [[3, 12, 1, 2], [7, 13, 1, 2], [11, 12, 1, 2]]);
    if (kind === 'snow') px('#ffffff', [[3, 13], [7, 14], [11, 13]]);
    if (kind === 'storm') px('#ffd400', [[7, 11, 2, 1], [6, 12, 2, 1], [7, 13, 1, 2]]);
    if (kind === 'fog') px('#8a93a6', [[1, 12, 14, 1], [3, 14, 10, 1]]);
  }
}
async function getWeather() {
  const lat = $('lat').value.trim(), lon = $('lon').value.trim();
  if (!lat || !lon) return null;
  if (weather && Date.now() - weatherAt < 10 * 60e3) return weather;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`);
  const j = await r.json();
  weather = { t: Math.round(j.current.temperature_2m), h: j.current.relative_humidity_2m, kind: WMO(j.current.weather_code), hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]) };
  weatherAt = Date.now(); return weather;
}
async function infoFrame(withWeather) {
  const c = new OffscreenCanvas(S, S).getContext('2d'), now = new Date();
  const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#1d0b2e');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const top = withWeather ? 4 : 16;
  text(c, hhmm, Math.round((S - textWidth(hhmm, 3)) / 2), top, '#ffffff', 3);
  const date = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  text(c, date, Math.round((S - textWidth(date)) / 2), top + 19, '#9aa1b2');
  if (withWeather) {
    let w = null; try { w = await getWeather(); } catch {}
    if (w) {
      drawIcon(c, w.kind, 4, 38);
      text(c, `${w.t}°`, 24, 37, '#ffd400', 2);
      text(c, `${w.lo}-${w.hi}°`, 24, 50, '#00c2ff');
      text(c, `${w.h}%`, 24, 57, '#9aa1b2');
    } else { const m = $('lat').value.trim() ? 'NO WEATHER' : 'SET LAT'; text(c, m, Math.round((S - textWidth(m)) / 2), 44, '#ff6b6b'); }
  }
  return c.getImageData(0, 0, S, S);
}
async function startLive(kind) {
  stopLive(); stopSnake();
  liveKind = kind; stageOwner = 'info';
  const withWeather = kind === 'weather';
  $$('[data-display]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.display === kind)));
  setStage(withWeather ? 'Clock and weather' : 'Clock', 'Updates every minute');
  $('liveBar').hidden = false; $('liveText').textContent = 'Updating the Pixoo every minute';
  const tick = async () => {
    const f = await infoFrame(withWeather);
    if (stageOwner === 'info') { frames = [f]; frameIdx = 0; }
    const ok = await sendFrames([f], 1000, { quiet: true });
    $('liveText').textContent = ok ? `Updated at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Last update failed, retrying next minute';
  };
  await tick();
  // re-send just after each minute changes
  liveTimer = setTimeout(function again() { tick(); liveTimer = setTimeout(again, 60e3 - (Date.now() % 60e3) + 300); }, 60e3 - (Date.now() % 60e3) + 300);
  markEffect();
}
function stopLive() {
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = null; liveKind = null; $('liveBar').hidden = true;
  $$('[data-display]').forEach(b => b.setAttribute('aria-checked', 'false'));
}
$$('[data-display]').forEach(b => b.onclick = () => startLive(b.dataset.display));
$('stopLive').onclick = () => { stopLive(); toast('Stopped updating the Pixoo.'); };
$('locate').onclick = () => {
  if (!navigator.geolocation) return toast('This browser can\'t share your location. Type latitude and longitude instead.', 'err');
  navigator.geolocation.getCurrentPosition(p => {
    $('lat').value = p.coords.latitude.toFixed(3); $('lon').value = p.coords.longitude.toFixed(3);
    store.set('lat', $('lat').value); store.set('lon', $('lon').value); weather = null;
    toast('Location set.');
  }, () => toast('Location isn\'t available here. Type latitude and longitude instead.', 'err'));
};
function checkCoord(el, max) {
  const v = el.value.trim(), n = Number(v);
  const ok = v === '' || (Number.isFinite(n) && Math.abs(n) <= max);
  el.setAttribute('aria-invalid', String(!ok));
  if (ok) { store.set(el.id, v); weather = null; }
}
$('lat').onblur = () => checkCoord($('lat'), 90);
$('lon').onblur = () => checkCoord($('lon'), 180);

// ---------- play: snake ----------
// Live frames use a rolling PicID that resets every 30 pushes, so the device never runs out of IDs.
let livePic = 1000, liveBusy = false, liveSent = [];
async function pushLive(img) {
  if (liveBusy) return;              // drop the frame if the last one is still in flight
  liveBusy = true;
  try {
    if (livePic > 30) { await pixoo('Draw/ResetHttpGifId'); livePic = 1; }
    await pixoo('Draw/SendHttpGif', { PicNum: 1, PicWidth: S, PicOffset: 0, PicID: livePic++, PicSpeed: 1000, PicData: frameToB64(img) });
    const now = performance.now(); liveSent.push(now); liveSent = liveSent.filter(t => now - t < 3000);
    $('fps').textContent = `${(liveSent.length / 3).toFixed(1)} per second`;
    setConn('ok', 'Connected');
  } catch { $('fps').textContent = 'Pixoo not reachable'; setConn('err', 'Not connected'); }
  finally { liveBusy = false; }
}
const G = 16, CELL = S / G;
let snake = null, snakeTimer = null, dir = [1, 0], nextDir = [1, 0], food = [10, 8], score = 0, over = false;
function placeFood() { do food = [Math.floor(Math.random() * G), Math.floor(Math.random() * G)]; while (snake.some(p => p[0] === food[0] && p[1] === food[1])); }
function snakeFrame() {
  const c = new OffscreenCanvas(S, S).getContext('2d');
  c.fillStyle = '#06080f'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#ff3366'; c.fillRect(food[0] * CELL, food[1] * CELL, CELL, CELL);
  snake.forEach(([x, y], i) => { c.fillStyle = i === 0 ? '#c8ffd0' : (i % 2 ? '#3ccf8e' : '#2fb07a'); c.fillRect(x * CELL, y * CELL, CELL, CELL); });
  if (over) { c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 20, S, 24); text(c, String(score), Math.round((S - textWidth(score, 2)) / 2), 27, '#ffd400', 2); }
  return c.getImageData(0, 0, S, S);
}
function setSnakeButton(label, icon) { $('snakeBtn').querySelector('span').textContent = label; $('snakeBtn').querySelector('use').setAttribute('href', icon); }
function snakeStep() {
  dir = nextDir;
  const head = [(snake[0][0] + dir[0] + G) % G, (snake[0][1] + dir[1] + G) % G];
  if (snake.some(p => p[0] === head[0] && p[1] === head[1])) {
    over = true; clearInterval(snakeTimer); snakeTimer = null; setSnakeButton('Play again', '#i-start');
    toast(`Game over. Score ${score}.`);
  } else {
    snake.unshift(head);
    if (head[0] === food[0] && head[1] === food[1]) { score++; placeFood(); } else snake.pop();
  }
  $('score').textContent = score; setStage('Snake', `Score ${score}`);
  const f = snakeFrame(); frames = [f]; frameIdx = 0;
  if ($('mirror').checked) pushLive(f);
}
function startSnake() {
  stopLive(); stageOwner = 'play'; over = false; score = 0; liveSent = [];
  snake = [[6, 8], [5, 8], [4, 8]]; dir = nextDir = [1, 0]; placeFood();
  clearInterval(snakeTimer); snakeTimer = setInterval(snakeStep, 160);
  setSnakeButton('Restart', '#i-start'); $('fps').textContent = 'Measuring';
}
function stopSnake() { if (snakeTimer) { clearInterval(snakeTimer); snakeTimer = null; setSnakeButton(snake ? 'Resume' : 'Start snake', '#i-start'); } }
$('snakeBtn').onclick = () => {
  if (snake && !over && !snakeTimer) { stageOwner = 'play'; snakeTimer = setInterval(snakeStep, 160); setSnakeButton('Restart', '#i-start'); return; }
  startSnake();
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function turn(d) { if (stageOwner === 'play' && !(d[0] === -dir[0] && d[1] === -dir[1])) nextDir = d; }
$$('[data-dir]').forEach(b => b.onclick = () => turn(DIRS[b.dataset.dir]));
addEventListener('keydown', e => {
  const d = { ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right }[e.key];
  if (d && route === 'play' && snakeTimer) { e.preventDefault(); turn(d); }
});
let swipe = null;
cv.addEventListener('pointerdown', e => { if (route === 'play') swipe = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', e => {
  if (!swipe) return; const dx = e.clientX - swipe[0], dy = e.clientY - swipe[1]; swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
});

// ---------- start ----------
showBright();
setTool('pen');
renderEffect(currentEffect);
drawThumbs();
go();
requestAnimationFrame(loop);
