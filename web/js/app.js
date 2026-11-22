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

// The device accepts one frame per request, and some units take up to a second each.
// Measure how long frames take, and send fewer of them when it's slow.
const SLOW_FRAME_MS = 400;
let frameMs = Number(store.get('frameMs', '0')) || 0;
function showUploadSpeed() {
  $('uploadSpeed').textContent = frameMs
    ? `Your Pixoo last took about ${(frameMs / 1000).toFixed(frameMs < 1000 ? 2 : 1)} s per frame, so 40 frames take about ${Math.round(frameMs * 40 / 1000)} s.`
    : 'Send an animation to measure how fast your Pixoo takes frames.';
}
const sameFrame = (a, b) => { const x = a.data, y = b.data; if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
const btn0 = () => $('send');
function lightenFrames(list, speed, { lossless = false } = {}) {
  // lossless: if every frame repeats k times in a row, send each once and play k times slower
  const runs = []; for (let i = 0; i < list.length;) { let j = i; while (j + 1 < list.length && sameFrame(list[j + 1], list[i])) j++; runs.push(j - i + 1); i = j + 1; }
  const gcd = (a, b) => b ? gcd(b, a % b) : a, k = runs.reduce(gcd, 0);
  if (k > 1) { list = list.filter((_, i) => i % k === 0); speed *= k; }
  const mode = $('uploadMode').value, quick = mode === 'quick' || (mode === 'auto' && frameMs > SLOW_FRAME_MS);
  if (!lossless && quick && list.length > 20) { list = list.filter((_, i) => i % 2 === 0); speed *= 2; }
  return [list, speed];
}
$('sendMethod').value = store.get('sendMethod', 'frames');
$('sendMethod').onchange = () => store.set('sendMethod', $('sendMethod').value);
hasServer().then(ok => { $('sendMethodField').hidden = !ok; });
// Experimental: the home server turns the frames into a GIF and the Pixoo downloads it.
// Returns true if the Pixoo fetched it, false to fall back to frame by frame.
async function sendAsGif(list, speed) {
  const r = await fetch('api/gif', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames: list.map(frameToB64), speed }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server error ' + r.status);
  return !!j.fetched;
}
$('uploadMode').value = store.get('uploadMode', 'auto');
$('uploadMode').onchange = () => store.set('uploadMode', $('uploadMode').value);
showUploadSpeed();

let sending = false, overlayOn = false;
async function sendFrames(list, speed, { quiet = false } = {}) {
  if (sending) return false; sending = true;
  const started = performance.now();
  if ($('sendMethod').value === 'gif' && list.length > 1 && await hasServer()) {
    btn0().disabled = true; btn0().setAttribute('aria-busy', 'true'); $('sendLabel').textContent = 'Sending GIF';
    try {
      if (overlayOn) { await pixoo('Draw/ClearHttpText'); overlayOn = false; }
      const [gl, gs] = lightenFrames(list.slice(0, 40), speed, { lossless: true });
      if (await sendAsGif(gl, gs)) {
        setConn('ok', 'Connected');
        if (!quiet) toast(`Sent ${gl.length} frames as one GIF in ${((performance.now() - started) / 1000).toFixed(1)} s`);
        sending = false;
        return true;
      }
      toast('The Pixoo didn\'t download the GIF, so sending frame by frame instead.', 'err');
    } catch (e) {
      toast('GIF sending failed (' + e.message + '), so sending frame by frame instead.', 'err');
    } finally {
      btn0().disabled = false; btn0().removeAttribute('aria-busy'); $('sendLabel').textContent = 'Send to Pixoo';
    }
  }
  [list, speed] = lightenFrames(list.slice(0, 40), speed);
  const btn = $('send'), bar = $('progress');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  bar.hidden = list.length < 2;
  try {
    setConn('busy', 'Sending');
    if (overlayOn) { await pixoo('Draw/ClearHttpText'); overlayOn = false; } // remove a live face's time/temperature
    await pixoo('Draw/ResetHttpGifId'); // prevents the device freezing after many pushes
    for (let i = 0; i < list.length; i++) {
      $('sendLabel').textContent = list.length > 1 ? `Sending ${i + 1} of ${list.length}` : 'Sending';
      const t0 = performance.now();
      await pixoo('Draw/SendHttpGif', { PicNum: list.length, PicWidth: S, PicOffset: i, PicID: 1, PicSpeed: speed, PicData: frameToB64(list[i]) });
      const ms = performance.now() - t0; frameMs = frameMs ? frameMs * .8 + ms * .2 : ms;
      const pct = Math.round((i + 1) / list.length * 100);
      bar.firstElementChild.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct);
      if (detected !== 'api') await pause(30); // the device's web server is single-threaded (the home server paces for us)
    }
    setConn('ok', 'Connected');
    store.set('frameMs', String(Math.round(frameMs))); showUploadSpeed();
    const secs = Math.round((performance.now() - started) / 1000);
    if (!quiet) toast(list.length > 1 ? `Sent ${list.length} frames to the Pixoo in ${secs} s` : 'Sent to the Pixoo');
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
  '.':'000000000000010','!':'010010010000010',
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
let stageOwner = 'effect';   // what's on the stage: effect | character | draw | info | play
const speed = () => Math.max(20, Math.min(1000, +$('speed').value || 80));
const frameCount = () => Math.max(1, Math.min(40, +$('frames').value || 40));

function setStage(title, meta) { $('stageTitle').textContent = title; $('stageMeta').textContent = meta; }
function renderEffect(name) {
  const n = frameCount();
  frames = Array.from({ length: n }, (_, t) => EFFECTS[name](t, n));
  frameIdx = 0; stageOwner = 'effect';
  setStage(name, `${n} frame${n > 1 ? 's' : ''} · ${speed()} ms`);
}
const stageSpeed = () => stageOwner === 'character' ? CHARACTERS[currentChar].speed : speed();
function loop(ts) {
  const animate = stageOwner !== 'draw' || drawPlaying;
  if (animate && frames.length && ts - lastTick > stageSpeed()) { lastTick = ts; frameIdx = (frameIdx + 1) % frames.length; }
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
// One live tile per option; draw(t, n) renders frame t of n.
function addTile(grid, kind, name, draw, n, onPick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'effect'; b.setAttribute('role', 'radio'); b.dataset[kind] = name;
  const c = document.createElement('canvas'); c.width = c.height = S; c.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = name;
  b.append(c, label);
  b.onclick = onPick;
  grid.append(b);
  thumbs.push({ ctx: c.getContext('2d'), frames: null, draw, n });
}
for (const name of Object.keys(EFFECTS)) {
  addTile($('effects'), 'effect', name, EFFECTS[name], 20,
    () => { stopLive(); stopGame(); currentEffect = name; store.set('effect', name); renderEffect(name); markEffect(); });
}
function drawThumbs() {
  thumbIdx++;
  for (const t of thumbs) {
    if (!t.frames) t.frames = Array.from({ length: t.n }, (_, i) => t.draw(i, t.n));
    t.ctx.putImageData(t.frames[thumbIdx % t.n], 0, 0);
  }
}
function markEffect() {
  $$('[data-effect]').forEach(b => b.setAttribute('aria-checked', String(stageOwner === 'effect' && b.dataset.effect === currentEffect)));
  $$('[data-character]').forEach(b => b.setAttribute('aria-checked', String(stageOwner === 'character' && b.dataset.character === currentChar)));
}

// ---------- characters ----------
let currentChar = store.get('character', 'Tilly Tock');
if (!CHARACTERS[currentChar]) currentChar = Object.keys(CHARACTERS)[0];
let charFrames = [];   // what gets sent; `frames` may add a preview of the live overlay on top
const liveFace = () => !!CHARACTERS[currentChar].live && $('liveFace').checked;
function overlayPreview(img, items) {
  // approximate the Pixoo's own overlay with our pixel font, for the stage only
  const c = new OffscreenCanvas(S, S).getContext('2d');
  c.putImageData(img, 0, 0);
  const now = new Date();
  for (const it of items) {
    const str = it.type === 5 ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      : it.type === 17 ? (weather ? `${weather.t}°C` : '--°C') : (it.TextString || '');
    const w = textWidth(str);
    const x = it.align === 3 ? it.x + it.TextWidth - w : it.align === 2 ? it.x + Math.round((it.TextWidth - w) / 2) : it.x;
    text(c, str, x, it.y, it.color);
  }
  return c.getImageData(0, 0, S, S);
}
function renderCharacter(name) {
  const ch = CHARACTERS[name], live = !!ch.live && $('liveFace').checked;
  charFrames = Array.from({ length: ch.frames }, (_, t) => ch.draw(t, ch.frames, { live }));
  frames = live ? charFrames.map(f => overlayPreview(f, ch.live.items)) : charFrames;
  frameIdx = 0; stageOwner = 'character';
  setStage(name, live ? 'Live face' : `${ch.frames} frames · ${ch.speed} ms`);
  $('charAbout').textContent = live ? ch.live.about : ch.about;
  $('liveFaceField').hidden = !ch.live;
  $('livingTilly').hidden = name !== 'Tilly Tock';
  if (name === 'Tilly Tock') tillyStatus();
  if (live && !weather) getWeather().then(w => { if (w && stageOwner === 'character') renderCharacter(currentChar); }).catch(() => {});
}
$('liveFace').checked = store.get('liveFace', '1') === '1';
$('liveFace').onchange = () => { store.set('liveFace', $('liveFace').checked ? '1' : '0'); renderCharacter(currentChar); markEffect(); };
async function sendCharacter() {
  renderCharacter(currentChar); // fresh render, so Tilly's hands show the current time
  const ch = CHARACTERS[currentChar];
  const ok = await sendFrames(charFrames, ch.speed, { quiet: liveFace() });
  if (!ok || !liveFace()) return;
  try {
    const lat = $('lat').value.trim(), lon = $('lon').value.trim();
    if (lat && lon) await pixoo('Sys/LogAndLat', { Latitude: lat, Longitude: lon }); // weather location for the Pixoo
    await pixoo('Draw/ClearHttpText');
    await pixoo('Draw/SendHttpItemList', { ItemList: ch.live.items });
    overlayOn = true;
    toast(`${currentChar} is on the Pixoo with live time and temperature`);
  } catch { toast('The animation was sent, but the live time and temperature could not be added.', 'err'); }
}
for (const name of Object.keys(CHARACTERS)) {
  const ch = CHARACTERS[name];
  addTile($('characters'), 'character', name, ch.draw, ch.frames,
    () => { stopLive(); stopGame(); currentChar = name; store.set('character', name); renderCharacter(name); markEffect(); });
}

// Living Tilly: the home server plays her scenes on a schedule (server.py + tilly_player.py)
let tillyPoll = null;
const MOODS = { asleep: 'asleep', sleepy: 'sleepy', rainy: 'sheltering from the rain', cold: 'shivering in the cold',
  hot: 'keeping cool in the heat', playful: 'out and about' };
async function tillyApi(path, body) {
  const r = await fetch('api/tilly/' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server error ' + r.status);
  return j;
}
function showTilly(st) {
  $('tillyStop').hidden = !st.running;
  $('tillyStart').querySelector('span').textContent = st.running ? 'Update scenes' : 'Start on home server';
  $('tillyBar').hidden = !st.running;
  if (st.running) {
    const w = st.weather ? ` · ${st.weather.t}°C` : '';
    $('tillyText').textContent = st.error ? 'Waiting for the Pixoo' : `Playing: ${MOODS[st.mood] || 'starting'}${w}`;
  }
  clearTimeout(tillyPoll);
  if (st.running && route === 'characters') tillyPoll = setTimeout(tillyStatus, 20000);
}
async function tillyStatus() {
  if (!(await hasServer())) {
    $('tillyStart').disabled = true;
    $('tillyHint').textContent = 'Living Tilly runs on your home server. Open this page from the server (python3 server.py) to use it.';
    return;
  }
  try { showTilly(await tillyApi('status')); } catch {}
}
$('tillyStart').onclick = async () => {
  const btn = $('tillyStart'), bar = $('tillyProgress');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); bar.hidden = false;
  try {
    // render every scene here (the server has no canvas), then hand them over
    const scenes = await tillyScenePack(p => {
      const pct = Math.round(p * 100);
      bar.firstElementChild.style.width = pct + '%'; bar.setAttribute('aria-valuenow', pct);
    });
    await tillyApi('scenes', { scenes });
    const st = await tillyApi('start', { lat: $('lat').value.trim(), lon: $('lon').value.trim() });
    overlayOn = false; stopLive();
    showTilly(st);
    toast($('lat').value.trim() ? 'Tilly is living on the Pixoo now' : 'Tilly is on. Set a weather location in Info so she can react to the weather.');
  } catch (e) {
    toast('Could not start Living Tilly: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy');
    setTimeout(() => { bar.hidden = true; bar.firstElementChild.style.width = '0'; }, 600);
  }
};
$('tillyStop').onclick = async () => {
  try { showTilly(await tillyApi('stop', {})); toast('Living Tilly stopped'); }
  catch (e) { toast('Could not stop Living Tilly: ' + e.message, 'err'); }
};

$('frames').onchange = () => { if (stageOwner === 'effect') renderEffect(currentEffect); };
$('speed').onchange = () => { if (stageOwner === 'effect') renderEffect(currentEffect); };

$('send').onclick = () => {
  if (stageOwner === 'info') return startLive(liveKind);
  if (stageOwner === 'character') return sendCharacter();
  const list = stageOwner === 'draw' ? drawFrames : frames;
  sendFrames(list, stageOwner === 'play' ? 1000 : stageSpeed());
};

// ---------- routing: every section has its own URL ----------
const ROUTES = ['effects', 'characters', 'draw', 'info', 'play', 'settings'];
function go() {
  const next = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'effects';
  if (next !== 'play') stopGame();
  route = next; document.body.dataset.route = next;
  $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== next);
  $$('.nav a, .topbar-settings').forEach(a => a.dataset.area === next ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (next === 'effects' && stageOwner !== 'effect' && !liveTimer) { renderEffect(currentEffect); }
  if (next === 'characters' && stageOwner !== 'character' && !liveTimer) { renderCharacter(currentChar); }
  if (next === 'draw' && !liveTimer) { stageOwner = 'draw'; setDrawPlaying(false); updateFrameLabel(); }
  if (next === 'play' && !liveTimer) showGame();
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
  // 20x18 weather icons, shaded with litDisc so they read as little 3D objects
  const cloud = (ox, oy, base) => {
    litDisc(c, x + ox + 6, y + oy + 8, 5, base); litDisc(c, x + ox + 12, y + oy + 6, 6, base);
    litDisc(c, x + ox + 16, y + oy + 9, 4, base); litOval(c, x + ox + 11, y + oy + 11, 8, 2, base);
  };
  if (kind === 'sun') {
    c.fillStyle = '#FFB000';
    [[10, 0], [10, 17], [1, 9], [19, 9], [4, 3], [16, 3], [4, 15], [16, 15]].forEach(([a, b]) => c.fillRect(x + a - 1, y + b - 1, 2, 2));
    litDisc(c, x + 10, y + 9, 6, '#FFC83D', { light: .6 });
    return;
  }
  if (kind === 'cloud') { litDisc(c, x + 6, y + 5, 4, '#FFC83D'); cloud(0, 2, '#E4E9F5'); return; }
  cloud(0, 0, kind === 'storm' ? '#9AA3B8' : '#D5DCEB');
  const drops = [[5, 15], [10, 17], [15, 15]];
  if (kind === 'rain') drops.forEach(([a, b]) => { c.fillStyle = '#4FB3FF'; c.fillRect(x + a, y + b, 1, 2); c.fillStyle = '#B5E2FF'; c.fillRect(x + a, y + b, 1, 1); });
  if (kind === 'snow') drops.forEach(([a, b]) => { c.fillStyle = '#FFFFFF'; c.fillRect(x + a - 1, y + b, 3, 1); c.fillRect(x + a, y + b - 1, 1, 3); });
  if (kind === 'storm') { c.fillStyle = '#FFD36B'; [[11, 13, 3], [10, 14, 3], [9, 15, 3], [11, 16, 2], [10, 17, 2]].forEach(([a, b, w]) => c.fillRect(x + a, y + b, w, 1)); }
  if (kind === 'fog') { c.fillStyle = '#8A93A6'; c.fillRect(x + 1, y + 15, 18, 1); c.fillRect(x + 4, y + 17, 13, 1); }
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
let forecast = null, forecastAt = 0;
async function getForecast() {
  const lat = $('lat').value.trim(), lon = $('lon').value.trim();
  if (!lat || !lon) return null;
  if (forecast && Date.now() - forecastAt < 30 * 60e3) return forecast;
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`);
  const d = (await r.json()).daily;
  forecast = d.time.map((day, i) => ({ day, kind: WMO(d.weather_code[i]), hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]) }));
  forecastAt = Date.now(); return forecast;
}
function miniIcon(c, kind, x, y) {
  // 8x7 versions of the weather icons for the forecast rows
  const P = (a, b, col) => { c.fillStyle = col; c.fillRect(x + a, y + b, 1, 1); };
  const cloud = col => { litDisc(c, x + 3, y + 3, 2, col, { bands: 3 }); litDisc(c, x + 5, y + 2, 2, col, { bands: 3 }); c.fillStyle = col; c.fillRect(x + 1, y + 4, 7, 1); };
  if (kind === 'sun') { litDisc(c, x + 4, y + 3, 2, '#FFC83D', { light: .6, bands: 3 }); [[4, 0], [4, 6], [1, 3], [7, 3]].forEach(([a, b]) => P(a, b, '#FFB000')); return; }
  if (kind === 'cloud') { litDisc(c, x + 2, y + 2, 2, '#FFC83D', { bands: 3 }); cloud('#E4E9F5'); return; }
  if (kind === 'fog') { c.fillStyle = '#9AA3B8'; c.fillRect(x, y + 2, 8, 1); c.fillRect(x + 1, y + 4, 7, 1); c.fillRect(x, y + 6, 6, 1); return; }
  cloud(kind === 'storm' ? '#9AA3B8' : '#D5DCEB');
  if (kind === 'rain') [[2, 6], [5, 6]].forEach(([a, b]) => P(a, b, '#4FB3FF'));
  if (kind === 'snow') [[2, 6], [4, 6], [6, 6]].forEach(([a, b]) => P(a, b, '#FFFFFF'));
  if (kind === 'storm') { P(4, 5, '#FFD36B'); P(3, 6, '#FFD36B'); }
}
async function forecastFrame() {
  const c = new OffscreenCanvas(S, S).getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#0B1033'); g.addColorStop(1, '#1D1444');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  let f = null; try { f = await getForecast(); } catch {}
  if (!f) {
    const m = $('lat').value.trim() ? 'NO FORECAST' : 'SET LOCATION';
    fancyText(c, m, 32, 29, { big: false, top: '#FFB3B3', bottom: '#FF6B6B', align: 'center' });
    return c.getImageData(0, 0, S, S);
  }
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const min = Math.min(...f.map(d => d.lo)), max = Math.max(...f.map(d => d.hi)), span = Math.max(1, max - min);
  const BAR0 = 36, BARW = 13;
  // colour along the bar follows the temperature: cold blue, mild green, warm orange
  const tempCol = t => t <= 5 ? [95, 180, 255] : t >= 25 ? [255, 122, 61] : t <= 15 ? mixRgb([95, 180, 255], [124, 240, 197], (t - 5) / 10) : mixRgb([124, 240, 197], [255, 200, 74], (t - 15) / 10);
  f.slice(0, 7).forEach((d, i) => {
    const y = 1 + i * 9;
    if (i % 2) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y - 1, S, 9); }
    const name = i === 0 ? 'TOD' : days[new Date(d.day + 'T12:00').getDay()];
    fancyText(c, name, 1, y + 1, i === 0 ? { big: false, top: '#FFE29A', bottom: '#FFB000' } : { big: false, top: '#FFFFFF', bottom: '#BFC9E6' });
    miniIcon(c, d.kind, 13, y);
    fancyText(c, String(d.lo), 33, y + 1, { big: false, top: '#BFE6FF', bottom: '#5FB4FF', align: 'right' });
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(BAR0, y + 3, BARW, 1);
    const a = BAR0 + Math.round((d.lo - min) / span * (BARW - 1)), b = BAR0 + Math.round((d.hi - min) / span * (BARW - 1));
    for (let x = a; x <= b; x++) {
      const col = tempCol(d.lo + (d.hi - d.lo) * (b > a ? (x - a) / (b - a) : 1));
      c.fillStyle = rgbStr(col); c.fillRect(x, y + 2, 1, 1); c.fillStyle = rgbStr(mixRgb(col, [0, 0, 0], .3)); c.fillRect(x, y + 3, 1, 1);
    }
    fancyText(c, String(d.hi), 51, y + 1, { big: false, top: '#FFE29A', bottom: '#FF9A3D' });
  });
  return c.getImageData(0, 0, S, S);
}
async function todayFrame() {
  // today in focus: time and current weather large, the next six days in one row at the bottom
  const c = new OffscreenCanvas(S, S).getContext('2d'), now = new Date();
  skyBackground(c, now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  fancyText(c, hhmm, 32, 1, { big: true, scale: 2, top: '#FFFFFF', bottom: '#FFC94A', align: 'center' });
  let w = null, f = null;
  try { [w, f] = await Promise.all([getWeather(), getForecast()]); } catch {}
  if (!w) {
    const m = $('lat').value.trim() ? 'NO WEATHER' : 'SET LOCATION';
    fancyText(c, m, 32, 30, { big: false, top: '#FFB3B3', bottom: '#FF6B6B', align: 'center' });
    return c.getImageData(0, 0, S, S);
  }
  drawIcon(c, w.kind, 2, 18);
  const warm = w.t >= 25 ? ['#FFE29A', '#FF7A3D'] : w.t <= 5 ? ['#E6F6FF', '#5FB4FF'] : ['#FFFFFF', '#7CF0C5'];
  fancyText(c, `${w.t}°`, 44, 18, { big: true, scale: 2, top: warm[0], bottom: warm[1], align: 'center' });
  const lo = `${w.lo}°`, hi = `${w.hi}°`, sep = 5;
  const lw = fancyWidth(lo, { big: false }), hw = fancyWidth(hi, { big: false });
  const x0 = 44 - Math.round((lw + sep + hw) / 2);
  fancyText(c, lo, x0, 35, { big: false, top: '#BFE6FF', bottom: '#5FB4FF' });
  c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x0 + lw + 2, 37, 1, 1);
  fancyText(c, hi, x0 + lw + sep, 35, { big: false, top: '#FFE29A', bottom: '#FF9A3D' });
  if (!f) return c.getImageData(0, 0, S, S);
  // the week strip
  c.fillStyle = 'rgba(5,4,20,.45)'; c.fillRect(0, 42, S, 22);
  c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(0, 42, S, 1);
  const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  f.slice(1, 7).forEach((d, i) => {
    const cx = 6 + i * 10 + (i > 2 ? 1 : 0);
    fancyText(c, days[new Date(d.day + 'T12:00').getDay()], cx, 44, { big: false, top: '#FFFFFF', bottom: '#BFC9E6', align: 'center' });
    miniIcon(c, d.kind, cx - 4, 50);
    const warmD = d.hi >= 25 ? ['#FFE29A', '#FF7A3D'] : d.hi <= 5 ? ['#E6F6FF', '#5FB4FF'] : ['#FFFFFF', '#7CF0C5'];
    fancyText(c, String(d.hi), cx, 58, { big: false, top: warmD[0], bottom: warmD[1], align: 'center' });
  });
  return c.getImageData(0, 0, S, S);
}
function skyBackground(c, now) {
  // the background follows the time of day: deep night, dawn, daytime blue, sunset
  const h = now.getHours() + now.getMinutes() / 60;
  const sky = h < 6 || h >= 21 ? ['#070B24', '#1A0F33'] : h < 8 ? ['#2B2160', '#B0507A'] : h < 18 ? ['#0E3A7A', '#2C6FB8'] : ['#2A1B5C', '#C25A4A'];
  const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, S, S);
  if (h < 6 || h >= 21) { c.fillStyle = '#C9D2FF'; [[5, 4], [58, 7], [12, 30], [52, 28], [33, 2], [3, 58], [60, 55]].forEach(([x, y]) => c.fillRect(x, y, 1, 1)); }
}
async function infoFrame(withWeather) {
  const c = new OffscreenCanvas(S, S).getContext('2d'), now = new Date();
  skyBackground(c, now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const date = `${days[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const timeStyle = { big: true, scale: 2, top: '#FFFFFF', bottom: '#FFC94A', align: 'center' };
  if (!withWeather) {
    fancyText(c, hhmm, 32, 16, timeStyle);
    fancyText(c, date, 32, 39, { big: false, top: '#BFE6FF', bottom: '#7FB8FF', align: 'center' });
    return c.getImageData(0, 0, S, S);
  }
  fancyText(c, hhmm, 32, 3, timeStyle);
  fancyText(c, date, 32, 21, { big: false, top: '#BFE6FF', bottom: '#7FB8FF', align: 'center' });
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(6, 29, 52, 1);
  let w = null; try { w = await getWeather(); } catch {}
  if (w) {
    drawIcon(c, w.kind, 3, 33);
    const warm = w.t >= 25 ? ['#FFE29A', '#FF7A3D'] : w.t <= 5 ? ['#E6F6FF', '#5FB4FF'] : ['#FFFFFF', '#7CF0C5'];
    fancyText(c, `${w.t}°`, 44, 33, { big: true, scale: 2, top: warm[0], bottom: warm[1], align: 'center' });
    // today's low and high, centred under the temperature: blue low, orange high
    const lo = `${w.lo}°`, hi = `${w.hi}°`, sep = 5;
    const lw = fancyWidth(lo, { big: false }), hw = fancyWidth(hi, { big: false });
    const x0 = 44 - Math.round((lw + sep + hw) / 2);
    fancyText(c, lo, x0, 55, { big: false, top: '#BFE6FF', bottom: '#5FB4FF' });
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x0 + lw + 2, 57, 1, 1);
    fancyText(c, hi, x0 + lw + sep, 55, { big: false, top: '#FFE29A', bottom: '#FF9A3D' });
  } else {
    const m = $('lat').value.trim() ? 'NO WEATHER' : 'SET LOCATION';
    fancyText(c, m, 32, 42, { big: false, top: '#FFB3B3', bottom: '#FF6B6B', align: 'center' });
  }
  return c.getImageData(0, 0, S, S);
}
async function startLive(kind) {
  stopLive(); stopGame();
  liveKind = kind; stageOwner = 'info';
  const withWeather = kind === 'weather';
  $$('[data-display]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.display === kind)));
  setStage(kind === 'today' ? 'Today and the week' : kind === 'forecast' ? 'Week forecast' : withWeather ? 'Clock and weather' : 'Clock', 'Updates every minute');
  $('liveBar').hidden = false; $('liveText').textContent = 'Updating the Pixoo every minute';
  const tick = async () => {
    const f = kind === 'today' ? await todayFrame() : kind === 'forecast' ? await forecastFrame() : await infoFrame(withWeather);
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

// ---------- play: arcade games ----------
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
// The games themselves live in games.js. A game runs in lockstep with the Pixoo: each tick waits
// for the previous frame to land, so the device never drops a move, however slow it is.
let currentGame = GAMES[store.get('game', '')] ? store.get('game') : 'Snake';
let game = null, gameRun = 0, gameRunning = false;
function setGameButton(label, icon) { $('gameBtn').querySelector('span').textContent = label; $('gameBtn').querySelector('use').setAttribute('href', icon); }
function gameStatus() {
  $('score').textContent = game ? game.score : 0;
  $('lives').textContent = game?.lives ?? '';
  setStage(currentGame, !game ? 'Press Start to play' : game.over ? `Game over · score ${game.score}` : gameRunning ? `Score ${game.score}` : `Paused · score ${game.score}`);
}
function showGame() {
  stageOwner = 'play';
  frames = [(game || GAMES[currentGame].make()).frame()]; frameIdx = 0;
  gameStatus();
}
async function runGame(id) {
  const spec = GAMES[currentGame];
  while (id === gameRun && game && !game.over) {
    const t0 = performance.now();
    game.step();
    const f = game.frame();
    if (stageOwner === 'play') { frames = [f]; frameIdx = 0; }
    gameStatus();
    if ($('mirror').checked) await Promise.race([pushLive(f), pause(1500)]);
    await pause(Math.max(0, spec.tick - (performance.now() - t0)));
  }
  if (id === gameRun && game?.over) {
    gameRunning = false; setGameButton('Play again', '#i-start'); gameStatus();
    toast(`Game over. Score ${game.score}.`);
  }
}
function resumeGame() {
  stopLive(); stageOwner = 'play'; gameRunning = true;
  setGameButton('Pause', '#i-pause'); $('restartBtn').hidden = false;
  runGame(++gameRun);
}
function startGame() {
  game = GAMES[currentGame].make(); liveSent = []; $('fps').textContent = 'Measuring';
  resumeGame();
}
function stopGame() {
  if (!gameRunning) return;
  gameRun++; gameRunning = false;
  setGameButton('Resume', '#i-start'); gameStatus();
}
function pickGame(name) {
  stopGame();
  currentGame = name; store.set('game', name); game = null;
  const spec = GAMES[name];
  $('gameHelp').textContent = `${spec.about} ${spec.help}`;
  $('fireBtn').hidden = !spec.fire;
  $('livesBox').hidden = spec.make().lives == null;
  $('restartBtn').hidden = true; setGameButton('Start', '#i-start');
  $$('[data-game]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.game === name)));
  if (route === 'play' && !liveTimer) showGame();
}
// live tiles: each game plays itself on autopilot
for (const name of Object.keys(GAMES)) {
  let demo = null;
  addTile($('games'), 'game', name, t => { if (t === 0) demo = GAMES[name].make(); demo.autopilot(); demo.step(); return demo.frame(); }, 48,
    () => { stopLive(); pickGame(name); showGame(); });
}
$('gameBtn').onclick = () => {
  if (gameRunning) return stopGame();
  if (game && !game.over) return resumeGame();
  startGame();
};
$('restartBtn').onclick = startGame;

// input: taps and key presses go to press(); held keys and buttons also go to hold()
const ACTION = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'fire',
  w: 'up', s: 'down', a: 'left', d: 'right' };
addEventListener('keydown', e => {
  const act = ACTION[e.key];
  if (!act || route !== 'play' || !gameRunning || e.target.closest?.('input, select, textarea')) return;
  e.preventDefault();
  if (!e.repeat) game.press(act);
  game.hold(act, true);
});
addEventListener('keyup', e => { const act = ACTION[e.key]; if (act && game) game.hold(act, false); });
$$('[data-dir]').forEach(b => {
  const act = b.dataset.dir;
  const release = () => game?.hold(act, false);
  b.addEventListener('pointerdown', e => { if (!game || !gameRunning) return; e.preventDefault(); game.press(act); game.hold(act, true); });
  b.addEventListener('pointerup', release); b.addEventListener('pointerleave', release); b.addEventListener('pointercancel', release);
  b.addEventListener('click', e => { if (e.detail === 0 && game && gameRunning) game.press(act); }); // keyboard activation
});
let swipe = null;
cv.addEventListener('pointerdown', e => { if (route === 'play') swipe = [e.clientX, e.clientY]; });
cv.addEventListener('pointerup', e => {
  if (!swipe || !game || !gameRunning) return; const dx = e.clientX - swipe[0], dy = e.clientY - swipe[1]; swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) game.press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  else if (GAMES[currentGame].fire) game.press('fire');   // a tap on the stage shoots
});

// ---------- start ----------
showBright();
setTool('pen');
renderEffect(currentEffect);
drawThumbs();
pickGame(currentGame);
go();
requestAnimationFrame(loop);
