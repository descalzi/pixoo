'use strict';
// Arcade games for the 64x64 panel, drawn with the shaded "3D" pixel look from pixelart.js.
// Each game is { about, help, fire, tick, make() } and make() returns a game object:
//   step()            advance one tick
//   frame()           -> ImageData of the current state
//   press(action)     a tap or key press: 'up' | 'down' | 'left' | 'right' | 'fire'
//   hold(action, on)  a key or button held down (only the shooter cares)
//   autopilot()       steer itself, for the live tile previews
//   score, lives, over
// Every tick is one HTTP push to the Pixoo, which manages only a few frames a second, so the
// app runs games in lockstep with the device and the games are paced for that: big moves,
// few objects, nothing that needs 30 fps to read.

const GW = 64;
const gameCanvas = () => new OffscreenCanvas(GW, GW).getContext('2d');
const rnd = n => Math.floor(Math.random() * n);
const toRgb = v => v.startsWith('#') ? hexRgb(v) : v.match(/\d+/g).slice(0, 3).map(Number);
const tone = (col, t) => rgbStr(t >= 0 ? mixRgb(toRgb(col), [255, 255, 255], t) : mixRgb(toRgb(col), [0, 0, 0], -t));
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OUTLINE = '#0A0716';

// A raised block: lit top and left edges, shaded bottom and right edges, a bright corner.
function bevelBlock(c, x, y, w, h, base) {
  c.fillStyle = base; c.fillRect(x, y, w, h);
  c.fillStyle = tone(base, .55); c.fillRect(x, y, w, 1); c.fillRect(x, y, 1, h);
  c.fillStyle = tone(base, -.55); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y, 1, h);
  c.fillStyle = tone(base, .85); c.fillRect(x, y, 1, 1);
}
// Shade a pixel mask the same way: edges facing up/left are lit, edges facing down/right are dark.
function bevelMask(c, mask, w, h, x0, y0, base, extra = {}) {
  const at = (i, j) => i >= 0 && j >= 0 && i < w && j < h && mask[j * w + i];
  const hi = tone(base, .45), lo = tone(base, -.45);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = at(i, j); if (!v) continue;
    let col = extra[v] || base;
    if (v === 1) col = !at(i, j - 1) || !at(i - 1, j) ? hi : !at(i, j + 1) || !at(i + 1, j) ? lo : base;
    c.fillStyle = col; c.fillRect(x0 + i, y0 + j, 1, 1);
  }
}
function hudScore(c, n, x = 1, y = 1) {
  fancyText(c, String(n), x, y, { big: false, top: '#FFF3C4', bottom: '#FFC94A', shadow: false });
}
function gameOverCard(c, score) {
  c.fillStyle = 'rgba(8,6,20,.72)'; c.fillRect(0, 0, GW, GW);
  fancyText(c, 'GAME', 32, 9, { big: false, scale: 2, top: '#FFFFFF', bottom: '#FF8FC7', align: 'center' });
  fancyText(c, 'OVER', 32, 23, { big: false, scale: 2, top: '#FFFFFF', bottom: '#FF8FC7', align: 'center' });
  fancyText(c, String(score), 32, 43, { top: '#FFF3C4', bottom: '#FFC94A', align: 'center' });
}

// ---------------------------------------------------------------------------
// Snake: a bevelled block snake on a checkered board. Walls wrap.
// ---------------------------------------------------------------------------
function makeSnake() {
  const N = 16, C = 4;
  let body = [[6, 8], [5, 8], [4, 8]], dir = [1, 0], next = [1, 0], food = null, t = 0;
  const g = { score: 0, lives: null, over: false };
  const on = (x, y) => body.some(p => p[0] === x && p[1] === y);
  const place = () => { do food = [rnd(N), rnd(N)]; while (on(food[0], food[1])); };
  place();
  const wrap = v => (v + N) % N;
  g.press = a => { const d = STEP[a]; if (d && !(d[0] === -dir[0] && d[1] === -dir[1])) next = d; };
  g.hold = () => {};
  g.step = () => {
    if (g.over) return;
    t++; dir = next;
    const head = [wrap(body[0][0] + dir[0]), wrap(body[0][1] + dir[1])];
    if (on(head[0], head[1])) { g.over = true; return; }
    body.unshift(head);
    if (head[0] === food[0] && head[1] === food[1]) { g.score++; place(); } else body.pop();
  };
  g.autopilot = () => {
    const opts = Object.values(STEP).filter(d => !(d[0] === -dir[0] && d[1] === -dir[1]))
      .map(d => [d, [wrap(body[0][0] + d[0]), wrap(body[0][1] + d[1])]]).filter(([, p]) => !on(p[0], p[1]));
    if (!opts.length) return;
    const dist = p => { const dx = Math.abs(p[0] - food[0]), dy = Math.abs(p[1] - food[1]); return Math.min(dx, N - dx) + Math.min(dy, N - dy); };
    opts.sort((a, b) => dist(a[1]) - dist(b[1]));
    next = opts[0][0];
  };
  g.frame = () => {
    const c = gameCanvas();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { c.fillStyle = (x + y) % 2 ? '#0E1128' : '#0A0C1E'; c.fillRect(x * C, y * C, C, C); }
    // cast shadows first, so every block sits above the board
    c.fillStyle = 'rgba(0,0,0,.6)';
    for (const [x, y] of body) c.fillRect(x * C + 1, y * C + 1, C, C);
    c.fillRect(food[0] * C + 1, food[1] * C + 1, C, C);
    // berry with a leaf
    litDisc(c, food[0] * C + 2, food[1] * C + 2, 2, '#FF4D7A');
    c.fillStyle = '#7CF0C5'; c.fillRect(food[0] * C + 3, food[1] * C - 1, 1, 1);
    // body, tail to head, fading from bright mint to deep green
    const head = '#5FE8B0', tail = '#13784F';
    for (let i = body.length - 1; i >= 0; i--) {
      const k = body.length > 1 ? i / (body.length - 1) : 0;
      bevelBlock(c, body[i][0] * C, body[i][1] * C, C, C, rgbStr(mixRgb(hexRgb(head), hexRgb(tail), Math.min(1, k * 1.4))));
    }
    const [hx, hy] = body[0], eyes = { '1,0': [[2, 1], [2, 2]], '-1,0': [[1, 1], [1, 2]], '0,-1': [[1, 1], [2, 1]], '0,1': [[1, 2], [2, 2]] }[dir.join()];
    c.fillStyle = OUTLINE; for (const [ex, ey] of eyes) c.fillRect(hx * C + ex, hy * C + ey, 1, 1);
    if (g.over) gameOverCard(c, g.score);
    return c.getImageData(0, 0, GW, GW);
  };
  return g;
}

// ---------------------------------------------------------------------------
// Rock Patrol: steer a little patrol ship through a drifting rock field and break the
// rocks into smaller ones. Eight headings, so each tap is a clear quarter-turn of a corner.
// ---------------------------------------------------------------------------
const SHIP_MASKS = (() => {
  // ship pointing along angle a: nose, two swept wings, a notch at the back; 2 marks the cockpit
  const masks = [];
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 - Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
    const pt = (r, da) => [Math.cos(a + da) * r, Math.sin(a + da) * r];
    const poly = [pt(4.9, 0), pt(4.6, 2.35), pt(1.2, Math.PI), pt(4.6, -2.35)];
    const inside = (x, y) => {
      let s = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s;
      }
      return s;
    };
    const m = new Uint8Array(81);
    for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (inside(i - 4, j - 4)) m[j * 9 + i] = 1;
    m[Math.round(4 + dy * 1.2) * 9 + Math.round(4 + dx * 1.2)] = 2;
    masks.push({ m, dx, dy });
  }
  return masks;
})();
function makeRocks() {
  const W = GW, wrapF = v => ((v % W) + W) % W;
  const g = { score: 0, lives: 3, over: false };
  const held = {}, taps = {};
  let ship, rocks = [], shots = [], bits = [], wave = 0, t = 0, cool = 0, thrustLeft = 0, safe = 0, dead = 0;
  const STARS = Array.from({ length: 34 }, () => [rnd(W), rnd(W), Math.random()]);
  const SIZE_R = [0, 2, 4, 7], SIZE_PTS = [0, 100, 50, 20], STONE = ['#A99CCB', '#C7A27F', '#8FB2CC'];
  const resetShip = () => { ship = { x: 32, y: 34, vx: 0, vy: 0, h: 0 }; safe = 14; };
  const rock = (x, y, size, speed) => {
    const a = Math.random() * Math.PI * 2;
    return { x, y, size, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, seed: Math.random() * 6, col: STONE[rnd(3)],
      pits: Array.from({ length: size }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1]) };
  };
  const newWave = () => {
    wave++;
    for (let i = 0; i < 2 + wave; i++) {
      let x, y; do { x = rnd(W); y = rnd(W); } while (Math.hypot(x - ship.x, y - ship.y) < 22);
      rocks.push(rock(x, y, 3, .45 + Math.random() * .35 + wave * .06));
    }
  };
  const burst = (x, y, n, cols) => { for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, s = .8 + Math.random() * 1.6; bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 3 + rnd(3), col: cols[rnd(cols.length)] }); } };
  // shortest wrapped distance
  const gap = (a, b) => { const d = Math.abs(a - b); return Math.min(d, W - d); };
  const near = (a, b, r) => Math.hypot(gap(a.x, b.x), gap(a.y, b.y)) < r;
  resetShip(); newWave();

  g.press = a => { taps[a] = true; if (a === 'up') thrustLeft = 3; };
  g.hold = (a, on) => { held[a] = on; };
  g.step = () => {
    if (g.over) return;
    t++;
    if (dead) { if (--dead === 0) resetShip(); }
    else {
      if (held.left || taps.left) ship.h = (ship.h + 7) % 8;
      if (held.right || taps.right) ship.h = (ship.h + 1) % 8;
      const sm = SHIP_MASKS[ship.h];
      ship.thrust = held.up || thrustLeft > 0;
      if (ship.thrust) { ship.vx += sm.dx * .55; ship.vy += sm.dy * .55; thrustLeft--; }
      ship.vx *= .9; ship.vy *= .9;
      const sp = Math.hypot(ship.vx, ship.vy); if (sp > 2.6) { ship.vx *= 2.6 / sp; ship.vy *= 2.6 / sp; }
      ship.x = wrapF(ship.x + ship.vx); ship.y = wrapF(ship.y + ship.vy);
      if (cool > 0) cool--;
      if ((held.fire || held.down || taps.fire || taps.down) && cool === 0 && shots.length < 5) {
        shots.push({ x: ship.x + sm.dx * 4, y: ship.y + sm.dy * 4, vx: sm.dx * 3.6 + ship.vx, vy: sm.dy * 3.6 + ship.vy, life: 11 });
        cool = 1;
      }
      if (safe > 0) safe--;
    }
    for (const k in taps) delete taps[k];
    for (const r of rocks) { r.x = wrapF(r.x + r.vx); r.y = wrapF(r.y + r.vy); }
    for (const b of bits) { b.x += b.vx; b.y += b.vy; b.life--; }
    bits = bits.filter(b => b.life > 0);
    // move shots in two half-steps so they can't skip over a small rock
    for (const s of shots) {
      for (let h = 0; h < 2 && s.life > 0; h++) {
        s.x = wrapF(s.x + s.vx / 2); s.y = wrapF(s.y + s.vy / 2);
        const hit = rocks.find(r => near(s, r, SIZE_R[r.size] + 1));
        if (hit) {
          s.life = 0; g.score += SIZE_PTS[hit.size];
          rocks.splice(rocks.indexOf(hit), 1);
          burst(hit.x, hit.y, 3 + hit.size * 2, [hit.col, '#FFD36B', '#FFFFFF']);
          if (hit.size > 1) for (let i = 0; i < 2; i++) rocks.push(rock(hit.x, hit.y, hit.size - 1, Math.hypot(hit.vx, hit.vy) + .35));
        }
      }
      s.life--;
    }
    shots = shots.filter(s => s.life > 0);
    if (!dead && !safe && rocks.some(r => near(ship, r, SIZE_R[r.size] + 2.5))) {
      burst(ship.x, ship.y, 12, ['#7CF0C5', '#FFD36B', '#FF8FC7', '#FFFFFF']);
      g.lives--; dead = 6;
      if (g.lives <= 0) { g.over = true; dead = 0; }
    }
    if (!rocks.length) newWave();
  };
  g.autopilot = () => {
    if (dead || !rocks.length) return;
    const r = rocks.reduce((a, b) => (Math.hypot(gap(a.x, ship.x), gap(a.y, ship.y)) < Math.hypot(gap(b.x, ship.x), gap(b.y, ship.y)) ? a : b));
    let dx = r.x - ship.x, dy = r.y - ship.y;
    if (Math.abs(dx) > W / 2) dx -= Math.sign(dx) * W; if (Math.abs(dy) > W / 2) dy -= Math.sign(dy) * W;
    const want = ((Math.round((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
    const diff = (want - ship.h + 8) % 8;
    if (diff === 0) taps.fire = true; else taps[diff <= 4 ? 'right' : 'left'] = true;
  };
  const drawRock = (c, r, ox, oy) => {
    const R = SIZE_R[r.size], base = hexRgb(r.col), hi = mixRgb(base, [255, 255, 255], .45), lo = mixRgb(base, [0, 0, 0], .5);
    const cx = Math.round(r.x + ox), cy = Math.round(r.y + oy);
    for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
      const a = Math.atan2(y, x), lim = R * (1 + .16 * Math.sin(3 * a + r.seed) + .09 * Math.sin(5 * a + r.seed * 2)) + .3;
      const d = Math.hypot(x, y); if (d > lim) continue;
      let l = .5 - .5 * x / (R + .5) - .55 * y / (R + .5);
      for (const [px, py] of r.pits) {                         // a crater: dark rim up-left, lit rim down-right
        const qx = x - px * R * .5, qy = y - py * R * .5, q = Math.hypot(qx, qy);
        if (q < R * .3 + .3) l -= .35; else if (q < R * .3 + 1.2 && qx + qy > 0) l += .2;
      }
      l = Math.round(Math.max(0, Math.min(1, l)) * 3) / 3;
      const col = l >= .5 ? mixRgb(base, hi, (l - .5) * 2) : mixRgb(lo, base, l * 2);
      c.fillStyle = rgbStr(col); c.fillRect(cx + x, cy + y, 1, 1);
    }
  };
  const wrapped = (x, y, r, fn) => {
    for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) {
      if (x + ox + r < 0 || x + ox - r >= W || y + oy + r < 0 || y + oy - r >= W) continue;
      fn(ox, oy);
    }
  };
  g.frame = () => {
    const c = gameCanvas();
    c.fillStyle = '#070616'; c.fillRect(0, 0, W, W);
    for (const [x, y, b] of STARS) { c.fillStyle = b > .85 && (t + x) % 6 < 3 ? '#FFF3C4' : b > .5 ? '#4A4380' : '#2A2550'; c.fillRect(x, y, 1, 1); }
    const L = gameCanvas();
    for (const r of rocks) wrapped(r.x, r.y, SIZE_R[r.size] + 2, (ox, oy) => drawRock(L, r, ox, oy));
    for (const s of shots) {
      L.fillStyle = '#FFC94A'; L.fillRect(Math.round(s.x - s.vx / 4), Math.round(s.y - s.vy / 4), 1, 1);
      L.fillStyle = '#FFFBEA'; L.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    if (!dead && !g.over && !(safe && t % 2)) {
      const sm = SHIP_MASKS[ship.h];
      wrapped(ship.x, ship.y, 6, (ox, oy) => {
        const x0 = Math.round(ship.x + ox) - 4, y0 = Math.round(ship.y + oy) - 4;
        if (ship.thrust) {                                       // flame out of the notch
          L.fillStyle = t % 2 ? '#FFD36B' : '#FF8F4A';
          L.fillRect(Math.round(ship.x + ox - sm.dx * 3), Math.round(ship.y + oy - sm.dy * 3), 1, 1);
          L.fillStyle = '#FF5C7A'; L.fillRect(Math.round(ship.x + ox - sm.dx * 4.2), Math.round(ship.y + oy - sm.dy * 4.2), 1, 1);
        }
        bevelMask(L, sm.m, 9, 9, x0, y0, '#7CF0C5', { 2: '#FF8FC7' });
      });
    }
    stampWithOutline(c, L, OUTLINE);
    for (const b of bits) { c.fillStyle = b.col; c.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }
    hudScore(c, g.score);
    for (let i = 0; i < g.lives; i++) {                          // lives as tiny ships, top right
      const x = 59 - i * 5; c.fillStyle = '#7CF0C5'; c.fillRect(x + 1, 1, 1, 1); c.fillRect(x, 2, 3, 2); c.fillStyle = '#2C8A68'; c.fillRect(x + 2, 3, 1, 1);
    }
    if (g.over) gameOverCard(c, g.score);
    return c.getImageData(0, 0, W, W);
  };
  return g;
}

// ---------------------------------------------------------------------------
// Lantern Maze: Lumi gathers the sparks in a raised-wall maze while three horned Glooms
// hunt her. A sun orb turns the tables for a while. The middle row is a tunnel.
// ---------------------------------------------------------------------------
const LANTERN_MAP = [
  '################',
  '#o.....##.....o#',
  '#.##.#....#.##.#',
  '#.#..#.##.#..#.#',
  '#.#.##.##.##.#.#',
  '#..............#',
  '##.#.##..##.#.##',
  '...#.#....#.#...',
  '##.#.#.##.#.#.##',
  '#......##......#',
  '#.##.#....#.##.#',
  '#o.#.#.##.#.#.o#',
  '#....#....#....#',
  '################',
];
function makeLantern() {
  const COLS = 16, ROWS = LANTERN_MAP.length, C = 4, TOP = 8;
  const wall = (x, y) => y < 0 || y >= ROWS ? true : (x < 0 || x >= COLS) ? false : LANTERN_MAP[y][x] === '#';
  const wrapX = x => (x + COLS) % COLS;
  const open = (x, y) => !wall(wrapX(x), y);
  const g = { score: 0, lives: 3, over: false };
  let dots, level = 0, t = 0, fright = 0, ready = 0, lumi, glooms;
  const HOME = [[7, 7], [8, 7], [6, 7]], COL = ['#FF6B8B', '#8FD3FF', '#FF9F43'];
  const fill = () => { dots = LANTERN_MAP.map(r => [...r].map(ch => ch === '.' ? 1 : ch === 'o' ? 2 : 0)); };
  const place = () => {
    lumi = { x: 7, y: 12, d: [-1, 0], want: [-1, 0] };
    glooms = HOME.map(([x, y], i) => ({ x, y, d: [0, -1], px: x, py: y, out: i * 4, col: COL[i] }));
    fright = 0; ready = 4;
  };
  fill(); place();
  const dotsLeft = () => dots.reduce((n, r) => n + r.filter(Boolean).length, 0);
  const can = (o, d) => open(o.x + d[0], o.y + d[1]);
  const move = (o, d) => { o.x = wrapX(o.x + d[0]); o.y += d[1]; };
  const catchCheck = () => {
    for (const gl of glooms) {
      if (gl.out > 0) continue;
      const same = gl.x === lumi.x && gl.y === lumi.y;
      const swapped = gl.px === lumi.x && gl.py === lumi.y && gl.x === lumi.px && gl.y === lumi.py;
      if (!same && !swapped) continue;
      if (fright) { g.score += 200; gl.out = 10; [gl.x, gl.y] = HOME[glooms.indexOf(gl)]; continue; }
      g.lives--;
      if (g.lives <= 0) { g.over = true; return; }
      place(); return;
    }
  };
  g.press = a => { if (STEP[a]) lumi.want = STEP[a]; };
  g.hold = () => {};
  g.step = () => {
    if (g.over) return;
    t++;
    if (ready > 0) { ready--; return; }
    lumi.px = lumi.x; lumi.py = lumi.y;
    if (can(lumi, lumi.want)) lumi.d = lumi.want;
    if (can(lumi, lumi.d)) move(lumi, lumi.d);
    const v = dots[lumi.y][lumi.x];
    if (v) { dots[lumi.y][lumi.x] = 0; g.score += v === 2 ? 50 : 10; if (v === 2) fright = 26; }
    for (const gl of glooms) { gl.px = gl.x; gl.py = gl.y; }
    catchCheck(); if (ready || g.over) return;
    // Glooms are a little slower than Lumi, and slower still while frightened
    const slow = fright ? t % 2 === 0 : t % (level >= 2 ? 7 : 4) === 0;
    if (!slow) glooms.forEach((gl, i) => {
      if (gl.out > 0) { gl.out--; return; }
      let opts = Object.values(STEP).filter(d => can(gl, d) && !(d[0] === -gl.d[0] && d[1] === -gl.d[1]));
      if (!opts.length) opts = [[-gl.d[0], -gl.d[1]]];
      let target = [lumi.x, lumi.y];
      if (i === 1) target = [lumi.x + lumi.d[0] * 3, lumi.y + lumi.d[1] * 3];
      const dist = d => Math.hypot(gl.x + d[0] - target[0], gl.y + d[1] - target[1]);
      let pick;
      if (fright || (i === 2 && Math.random() < .5) || Math.random() < .15) pick = opts[rnd(opts.length)];
      else pick = opts.reduce((a, b) => dist(a) <= dist(b) ? a : b);
      gl.d = pick; move(gl, pick);
    });
    catchCheck(); if (ready || g.over) return;
    if (fright > 0) fright--;
    if (!dotsLeft()) { level++; fill(); place(); }
  };
  g.autopilot = () => {
    // head for the nearest spark, and turn away from a Gloom that is right in the way
    const seen = new Map([[`${lumi.x},${lumi.y}`, null]]), q = [[lumi.x, lumi.y]];
    while (q.length) {
      const [x, y] = q.shift();
      if (dots[y][x] && (x !== lumi.x || y !== lumi.y)) {
        let k = `${x},${y}`, first = null;
        while (seen.get(k)) { first = seen.get(k); k = first.from; }
        if (first) lumi.want = first.d; return;
      }
      for (const d of Object.values(STEP)) {
        const nx = wrapX(x + d[0]), ny = y + d[1], k = `${nx},${ny}`;
        if (!open(nx, ny) || seen.has(k) || glooms.some(gl => !fright && gl.out <= 0 && gl.x === nx && gl.y === ny)) continue;
        seen.set(k, { from: `${x},${y}`, d }); q.push([nx, ny]);
      }
    }
  };
  g.frame = () => {
    const c = gameCanvas();
    c.fillStyle = '#0B0A1C'; c.fillRect(0, 0, GW, GW);
    c.fillStyle = '#141130'; c.fillRect(0, 0, GW, TOP);
    const WALL = '#5B4BD6', HI = tone(WALL, .45), LO = tone(WALL, -.5), SHADOW = '#050410';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const X = x * C, Y = TOP + y * C;
      const isW = LANTERN_MAP[y][x] === '#', w = (i, j) => j >= 0 && j < ROWS && i >= 0 && i < COLS && LANTERN_MAP[j][i] === '#';
      if (isW) {
        // walls read as one raised slab: bevel only the edges that face open floor
        c.fillStyle = WALL; c.fillRect(X, Y, C, C);
        if (!w(x, y - 1)) { c.fillStyle = HI; c.fillRect(X, Y, C, 1); }
        if (!w(x - 1, y)) { c.fillStyle = HI; c.fillRect(X, Y, 1, C); }
        if (!w(x, y + 1)) { c.fillStyle = LO; c.fillRect(X, Y + C - 1, C, 1); }
        if (!w(x + 1, y)) { c.fillStyle = LO; c.fillRect(X + C - 1, Y, 1, C); }
        if (!w(x, y - 1) && !w(x - 1, y)) { c.fillStyle = tone(WALL, .75); c.fillRect(X, Y, 1, 1); }
      } else {
        // floor next to a wall catches its shadow
        c.fillStyle = SHADOW;
        if (w(x - 1, y)) c.fillRect(X, Y, 1, C);
        if (w(x, y - 1)) c.fillRect(X, Y, C, 1);
        const v = dots[y][x];
        if (v === 1) { c.fillStyle = '#8A6A1E'; c.fillRect(X + 2, Y + 2, 1, 1); c.fillStyle = '#FFE08A'; c.fillRect(X + 1, Y + 1, 1, 1); }
        if (v === 2) litDisc(c, X + 2, Y + 2, t % 4 < 2 ? 2 : 1, '#FF8FC7');
      }
    }
    const sprite = (x, y, rows, pal) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x * C + i, TOP + y * C + j, 1, 1); } }));
    for (const gl of glooms) {
      if (gl.out > 0) { sprite(gl.x, gl.y, ['....', '.ww.', '....', '....'], { w: '#BFB7FF' }); continue; } // waiting at home
      const scared = fright > 0, blink = scared && fright < 8 && t % 2;
      const base = scared ? (blink ? '#E6E1FF' : '#3B3FA8') : gl.col;
      sprite(gl.x, gl.y, ['l..d', 'lwwd', 'bbbd', '.dd.'],
        { l: tone(base, .45), b: base, d: tone(base, -.45), w: scared ? '#FFD36B' : '#FFFFFF' });
    }
    if (!(ready && t % 2)) {
      const eye = { '1,0': 'r', '-1,0': 'l', '0,-1': 'u', '0,1': 'n' }[lumi.d.join()];
      const rows = { r: ['.ll.', 'lbeb', 'lbbd', '.dd.'], l: ['.ll.', 'lebd', 'lbbd', '.dd.'], u: ['.le.', 'lbbd', 'lbbd', '.dd.'], n: ['.ll.', 'lbbd', 'lebd', '.dd.'] }[eye];
      sprite(lumi.x, lumi.y, rows, { l: '#E9FFF6', b: '#7CF0C5', d: '#2C8A68', e: OUTLINE });
    }
    hudScore(c, g.score, 1, 1);
    for (let i = 0; i < g.lives; i++) litDisc(c, 60 - i * 6, 3, 1, '#7CF0C5');
    if (g.over) gameOverCard(c, g.score);
    return c.getImageData(0, 0, GW, GW);
  };
  return g;
}

const GAMES = {
  Snake: {
    about: 'Eat the berries and keep growing. The edges wrap around.',
    help: 'Steer with the arrow keys, by swiping on the stage, or with the pad below.',
    fire: false, tick: 170, make: makeSnake,
  },
  'Rock Patrol': {
    about: 'Break up the drifting rocks before they hit your ship. Big rocks split in two.',
    help: 'Left and right turn the ship, up fires the engine, Space or the Fire button shoots. On a phone, hold a button to keep turning or thrusting.',
    fire: true, tick: 140, make: makeRocks,
  },
  'Lantern Maze': {
    about: 'Gather every spark while the Glooms hunt you. A pink sun orb makes them flee, and you can catch them.',
    help: 'Steer with the arrow keys, by swiping, or with the pad. Your turn is remembered until the next corner.',
    fire: false, tick: 190, make: makeLantern,
  },
};
