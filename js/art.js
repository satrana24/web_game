// art.js — вся графика рисуется кодом при старте (никаких картинок не нужно).
// Каждый спрайт собирается в «сетке пикселей», получает тёмный контур и кладётся в кэш-canvas.
export const TILE = 16;

// ---------- утилиты ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
// f < 1 — темнее, f > 1 — светлее
export function shade(h, f) {
  const [r, g, b] = hex(h);
  return f < 1 ? toHex(r * f, g * f, b * f) : toHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y) {
  return (Math.imul(x + 1013, 73856093) ^ Math.imul(y + 7919, 19349663)) >>> 0;
}
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}
const fr = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };

// сетка пикселей
const grid = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
function P(g, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (j >= 0 && j < g.length && i >= 0 && i < g[0].length) g[j][i] = c;
  }
}
function E(g, cx, cy, rx, ry, c) {
  for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
    for (let i = Math.floor(cx - rx); i <= Math.ceil(cx + rx); i++) {
      const dx = (i + 0.5 - cx) / rx, dy = (j + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && j >= 0 && j < g.length && i >= 0 && i < g[0].length) {
        g[j][i] = typeof c === 'function' ? c(i, j) : c;
      }
    }
  }
}
function outline(g, c) {
  const h = g.length, w = g[0].length, add = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (g[j][i]) continue;
    if ((g[j - 1] && g[j - 1][i]) || (g[j + 1] && g[j + 1][i]) || g[j][i - 1] || g[j][i + 1]) add.push([i, j]);
  }
  for (const [i, j] of add) g[j][i] = c;
}
function toCanvas(g) {
  const h = g.length, w = g[0].length, c = mk(w, h), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (g[j][i]) fr(x, i, j, 1, 1, g[j][i]);
  return c;
}
const mirror = (g) => g.map((r) => r.slice().reverse());

const OUT = '#2a1a14';

// ---------- ТАЙЛЫ 16x16 ----------
function grassTile(seed, frame, flowers) {
  const c = mk(16, 16), g = c.getContext('2d'), r = rng(seed);
  fr(g, 0, 0, 16, 16, '#64aa3d');
  for (let i = 0; i < 9; i++) fr(g, (r() * 14) | 0, (r() * 15) | 0, 2 + ((r() * 3) | 0), 1, r() < 0.55 ? '#5a9f36' : '#74b948');
  for (let i = 0; i < 5; i++) fr(g, (r() * 15) | 0, (r() * 15) | 0, 1, 1, '#4c8f30');
  const n = 2 + ((r() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const x = 2 + ((r() * 11) | 0), y = 4 + ((r() * 10) | 0);
    fr(g, x, y, 1, 2, '#3f8a2c');
    fr(g, x - 1 + frame, y - 1, 1, 1, '#8fd25a');
    fr(g, x + 1 + frame, y - 1, 1, 1, '#6fbf45');
  }
  if (flowers) {
    const cols = ['#ffffff', '#ffd84a', '#ff8ab0', '#b99cff'];
    const m = 2 + ((r() * 2) | 0);
    for (let i = 0; i < m; i++) {
      const x = 2 + ((r() * 11) | 0), y = 3 + ((r() * 9) | 0), col = cols[(r() * cols.length) | 0];
      fr(g, x, y + 1, 1, 3, '#3f8a2c');
      const s = frame;
      fr(g, x - 1 + s, y, 3, 1, col); fr(g, x + s, y - 1, 1, 3, col);
      fr(g, x + s, y, 1, 1, '#ffe36a');
    }
  }
  return c;
}

function cobbleTile(seed) {
  const c = mk(16, 16), g = c.getContext('2d'), r = rng(seed);
  fr(g, 0, 0, 16, 16, '#6f695f');
  const rows = [[0, 5, [0, 7, 16]], [5, 5, [0, 4, 11, 16]], [10, 6, [0, 9, 16]]];
  const shift = seed % 3;
  const cols = ['#bdb7aa', '#aea89b', '#c8c2b5', '#a39d90'];
  rows.forEach(([y, h, b], ri) => {
    const bb = ri === 1 ? b : b.map((v, i) => (i === 0 || i === b.length - 1 ? v : Math.max(3, Math.min(13, v + shift - 1))));
    for (let i = 0; i < bb.length - 1; i++) {
      const x0 = bb[i], x1 = bb[i + 1];
      const col = cols[(r() * cols.length) | 0];
      fr(g, x0, y, x1 - x0 - 1, h - 1, col);
      fr(g, x0, y, x1 - x0 - 1, 1, shade(col, 1.18));
      fr(g, x0, y + h - 2, x1 - x0 - 1, 1, shade(col, 0.88));
      if (r() < 0.5) fr(g, x0 + 1 + ((r() * Math.max(1, x1 - x0 - 4)) | 0), y + 1 + ((r() * Math.max(1, h - 3)) | 0), 1, 1, shade(col, 0.8));
    }
  });
  return c;
}

function dirtTile(seed) {
  const c = mk(16, 16), g = c.getContext('2d'), r = rng(seed);
  fr(g, 0, 0, 16, 16, '#a9824f');
  for (let i = 0; i < 12; i++) fr(g, (r() * 14) | 0, (r() * 15) | 0, 2, 1, r() < 0.5 ? '#946d3e' : '#bd9660');
  for (let i = 0; i < 3; i++) { const x = (r() * 14) | 0, y = (r() * 14) | 0; fr(g, x, y, 2, 1, '#9a948a'); fr(g, x, y + 1, 2, 1, '#6f6a60'); }
  return c;
}

function waterTile(seed, frame) {
  const c = mk(16, 16), g = c.getContext('2d'), r = rng(seed);
  fr(g, 0, 0, 16, 16, '#3d93d0');
  for (let i = 0; i < 4; i++) fr(g, (r() * 14) | 0, (r() * 15) | 0, 3, 1, '#3484c2');
  for (let i = 0; i < 4; i++) {
    const x = (((r() * 13) | 0) + frame * 2) % 14, y = (r() * 15) | 0;
    fr(g, x, y, 3, 1, '#86cef2');
  }
  fr(g, (((r() * 14) | 0) + frame * 5) % 15, (r() * 15) | 0, 1, 1, '#ffffff');
  return c;
}

// кромка тайла со стороны side ('n','s','w','e')
function rimTile(side, dark, light, grassLip, seed, thick = 2) {
  const c = mk(16, 16), g = c.getContext('2d'), r = rng(seed);
  const pos = (i, k) => (side === 'n' ? [i, k] : side === 's' ? [i, 15 - k] : side === 'w' ? [k, i] : [15 - k, i]);
  for (let i = 0; i < 16; i++) {
    const t = thick - 1 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < t; k++) { const [x, y] = pos(i, k); fr(g, x, y, 1, 1, dark); }
    const [lx, ly] = pos(i, t);
    if (r() < 0.55) fr(g, lx, ly, 1, 1, light);
    if (grassLip && r() < 0.4) { const [x, y] = pos(i, 0); fr(g, x, y, 1, 1, grassLip); }
  }
  return c;
}

// ---------- ДОМА ----------
const ROOFS = {
  thatch: { m: '#d9b64f', l: '#efd479', d: '#b08a2e', rd: '#8a6a22', e: '#4a2f18', kind: 'thatch' },
  red:    { m: '#c0553c', l: '#dd7a58', d: '#8e3a2a', rd: '#6e2a1e', e: '#3a1c14', kind: 'tile' },
  blue:   { m: '#5b7aa8', l: '#7f9fcc', d: '#41597f', rd: '#2f4160', e: '#1e2a3f', kind: 'tile' },
};

function houseSprite(style, seed) {
  const R = ROOFS[style], r = rng(seed);
  const W = 56, H = 57, g = grid(W, H);
  // стена
  P(g, 4, 42, 48, 14, '#9a6a38');
  for (let x = 7; x < 52; x += 6) P(g, x, 42, 1, 14, '#7a5028');
  for (let x = 5; x < 52; x += 6) P(g, x, 44, 1, 8, '#ad7c46');
  P(g, 4, 42, 48, 2, '#5e3c1c');
  P(g, 4, 53, 48, 3, '#8a8478'); P(g, 4, 53, 48, 1, '#a9a396');
  for (let x = 6; x < 52; x += 6) P(g, x, 54, 1, 2, '#6a655b');
  // дверь
  P(g, 23, 45, 10, 11, '#2a1a0e'); P(g, 24, 46, 8, 10, '#5a381c');
  P(g, 24, 46, 8, 1, '#3a2412'); P(g, 28, 47, 1, 9, '#3a2412'); P(g, 30, 51, 1, 1, '#ffd35a');
  P(g, 22, 55, 12, 1, '#c9c3b6'); // порог
  // окна + цветочные ящики
  const fc = ['#ff8ab0', '#ffd84a', '#ffffff', '#b99cff'];
  for (const wx of [10, 38]) {
    P(g, wx, 45, 8, 7, '#3a2412'); P(g, wx + 1, 46, 6, 5, '#8fd0ea');
    P(g, wx + 3, 46, 1, 5, '#3a2412'); P(g, wx + 1, 48, 6, 1, '#3a2412'); P(g, wx + 1, 46, 2, 1, '#d8f4ff');
    P(g, wx - 1, 52, 10, 2, '#6a4222'); P(g, wx - 1, 52, 10, 1, '#8a5a30');
    for (let i = 0; i < 5; i++) { P(g, wx + i * 2, 51, 1, 1, fc[(r() * fc.length) | 0]); P(g, wx + i * 2, 50, 1, 1, '#4aa03a'); }
  }
  // крыша
  P(g, 1, 6, 54, 36, R.m);
  if (R.kind === 'thatch') {
    for (let y = 9; y < 41; y += 4) {
      for (let x = 1; x < 55; x++) if (r() < 0.82) g[y + 2][x] = R.d;
      for (let k = 0; k < 9; k++) P(g, 1 + ((r() * 50) | 0), y, 3, 1, R.l);
      for (let k = 0; k < 8; k++) P(g, 1 + ((r() * 52) | 0), y + 1, 1, 2, R.d);
    }
  } else {
    for (let b = 0; b < 8; b++) {
      const y = 9 + b * 4;
      for (let x = 1; x < 55; x++) {
        g[y + 3][x] = R.d;
        if ((x + (b % 2) * 3) % 6 === 0) P(g, x, y, 1, 3, R.d);
        if ((x + (b % 2) * 3) % 6 === 1) g[y][x] = R.l;
      }
    }
  }
  P(g, 1, 6, 2, 36, shade(R.m, 1.12)); P(g, 53, 6, 2, 36, R.d);
  P(g, 1, 6, 54, 3, R.rd); P(g, 1, 6, 54, 1, R.l);
  P(g, 1, 40, 54, 2, R.d);
  g[6][1] = null; g[6][54] = null; g[41][1] = null; g[41][54] = null;
  // дымоход
  P(g, 40, 1, 6, 12, '#8d877b'); P(g, 40, 1, 1, 12, '#a9a396'); P(g, 45, 1, 1, 12, '#6d675d');
  for (let y = 4; y < 13; y += 3) P(g, 40, y, 6, 1, '#6d675d');
  P(g, 39, 0, 8, 2, '#5e5a52'); P(g, 41, 0, 4, 1, '#2a2622');
  // перекрещённые брёвна на коньке
  for (const cx of [4, 51]) {
    for (let k = 0; k < 5; k++) { g[1 + k][cx - 2 + k] = '#6a4424'; g[1 + k][cx + 2 - k] = '#6a4424'; }
  }
  outline(g, R.e);
  return toCanvas(g);
}

// ---------- ДЕРЕВЬЯ ----------
const TREE_PAL = {
  oak:    { hi: '#93de5c', mid: '#6cbb44', lo: '#4d9a37', dk: '#367a2c', ol: '#1d3a14' },
  autumn: { hi: '#f2c84a', mid: '#e0922f', lo: '#bf6a26', dk: '#8f4a1f', ol: '#3a1d10' },
};
function treeSprite(kind, seed) {
  const T = TREE_PAL[kind], r = rng(seed);
  const W = 38, H = 46, g = grid(W, H);
  // ствол
  P(g, 16, 32, 6, 12, '#7a4d27'); P(g, 20, 32, 2, 12, '#5d3a1c'); P(g, 14, 42, 10, 2, '#7a4d27'); P(g, 21, 42, 3, 2, '#5d3a1c');
  const tone = (i, j) => {
    const d = ((i - 15) * 0.55 + (j - 12) * 0.85) / 16 + (r() - 0.5) * 0.22;
    return d < -0.38 ? T.hi : d < 0.05 ? T.mid : d < 0.48 ? T.lo : T.dk;
  };
  for (const [cx, cy, rx, ry] of [[19, 17, 16.5, 15], [9, 22, 9, 8], [29, 22, 9, 8], [19, 8, 11, 8], [12, 12, 9, 8], [26, 12, 9, 8]]) E(g, cx, cy, rx, ry, tone);
  for (let n = 0; n < 40; n++) {
    const i = 3 + ((r() * 32) | 0), j = 3 + ((r() * 28) | 0);
    if (g[j][i] && g[j][i] !== '#7a4d27') {
      P(g, i, j + 1, 3, 1, T.dk); P(g, i, j, 2, 1, T.lo); P(g, i + 1, j - 1, 2, 1, T.hi);
    }
  }
  if (kind === 'oak') for (let n = 0; n < 5; n++) {
    const i = 6 + ((r() * 26) | 0), j = 8 + ((r() * 20) | 0);
    if (g[j][i]) { P(g, i, j, 2, 2, '#d8453a'); g[j][i] = '#ff8a7a'; }
  }
  outline(g, T.ol);
  return toCanvas(g);
}

function pineSprite(seed) {
  const r = rng(seed), g = grid(18, 32);
  P(g, 8, 26, 2, 5, '#5d3a1c');
  const tiers = [[1, 11, 3], [8, 18, 4], [15, 25, 5]];
  for (const [y0, y1, hw0] of tiers) {
    for (let y = y0; y <= y1; y++) {
      const hw = 1 + ((y - y0) / (y1 - y0)) * hw0 + (y1 - y0 > 9 ? 1 : 0);
      for (let x = Math.round(9 - hw); x <= Math.round(9 + hw - 1); x++) {
        const d = (x - 9 + 0.5) / hw;
        g[y][x] = d < -0.35 ? '#3f8f3c' : d < 0.25 ? '#2f7a33' : '#24602a';
        if (r() < 0.07) g[y][x] = '#4aa046';
      }
    }
  }
  outline(g, '#12301a');
  return toCanvas(g);
}

// ---------- ПРЕДМЕТЫ ----------
function barrel() {
  const g = grid(14, 17);
  E(g, 7, 4.5, 5.5, 2.6, '#c9a068'); E(g, 7, 4.5, 4, 1.6, '#a9783f');
  for (let y = 5; y <= 14; y++) {
    const hw = 5.3 + 0.9 * Math.sin(((y - 5) / 9) * Math.PI);
    for (let x = Math.round(7 - hw); x < Math.round(7 + hw); x++) {
      const d = (x - 7 + 0.5) / hw;
      g[y][x] = d < -0.4 ? '#b27a42' : d < 0.3 ? '#9a6a38' : '#7a5028';
    }
  }
  for (const y of [6, 13]) for (let x = 1; x < 13; x++) if (g[y][x]) g[y][x] = x < 5 ? '#6a6f7a' : '#3b3f4a';
  for (const x of [4, 7, 10]) for (let y = 7; y < 13; y++) if (g[y][x]) g[y][x] = shade(g[y][x], 0.85);
  outline(g, OUT);
  return toCanvas(g);
}
function crate() {
  const g = grid(14, 14);
  P(g, 1, 1, 12, 12, '#a8743a'); P(g, 1, 1, 12, 2, '#c9965a');
  P(g, 1, 1, 2, 12, '#7a5028'); P(g, 11, 1, 2, 12, '#7a5028'); P(g, 1, 11, 12, 2, '#7a5028');
  for (let k = 0; k < 8; k++) { g[3 + k][3 + k] = '#7a5028'; g[3 + k][10 - k] = '#7a5028'; }
  outline(g, OUT);
  return toCanvas(g);
}
function bush(seed) {
  const r = rng(seed), g = grid(18, 14);
  E(g, 9, 7.5, 8, 6, (i, j) => { const d = ((i - 7) * 0.6 + (j - 5) * 0.8) / 7; return d < -0.25 ? '#6fc047' : d < 0.3 ? '#4fa03a' : '#2f7a2c'; });
  for (let n = 0; n < 7; n++) { const i = 3 + ((r() * 12) | 0), j = 3 + ((r() * 8) | 0); if (g[j][i]) { P(g, i, j, 2, 1, '#8fdc5a'); } }
  for (let n = 0; n < 4; n++) { const i = 3 + ((r() * 12) | 0), j = 3 + ((r() * 8) | 0); if (g[j][i]) { g[j][i] = '#e0453a'; g[j][i + 1] = '#ff8a7a'; } }
  outline(g, '#1d3a14');
  return toCanvas(g);
}
function rock(seed) {
  const g = grid(14, 11);
  E(g, 7, 6, 5.5, 4, (i, j) => (j < 5 ? '#b5b0a5' : ((i - 7) > 1 ? '#6f6a60' : '#8f8a80')));
  P(g, 4, 3, 3, 1, '#d6d1c6');
  outline(g, OUT);
  return toCanvas(g);
}
function lamp() {
  const g = grid(10, 30);
  P(g, 4, 10, 2, 18, '#3a3f4a'); P(g, 2, 27, 6, 2, '#2a2e38'); P(g, 3, 26, 4, 1, '#4a505c');
  P(g, 2, 3, 6, 8, '#2a2e38'); P(g, 3, 4, 4, 6, '#ffe48a'); P(g, 4, 5, 2, 3, '#fffbe0');
  P(g, 1, 2, 8, 2, '#2a2e38'); P(g, 3, 0, 4, 2, '#3a3f4a');
  outline(g, OUT);
  return toCanvas(g);
}
function well() {
  const g = grid(24, 30);
  // каменный сруб
  E(g, 12, 21, 9.5, 4.5, '#6a655b');
  P(g, 3, 15, 18, 9, '#a8a296'); E(g, 12, 15, 9, 4, '#c3bdb0'); E(g, 12, 15, 6.5, 2.7, '#1f4f78'); E(g, 12, 15.4, 5, 1.6, '#3d93d0');
  P(g, 3, 24, 18, 1, '#6a655b'); E(g, 12, 24, 9, 2, '#a8a296');
  for (let y = 17; y < 24; y += 3) for (let x = 3 + ((y / 3) % 2) * 2; x < 21; x += 5) P(g, x, y, 1, 3, '#7a746a');
  // стойки и крыша
  P(g, 4, 6, 2, 12, '#7a4d27'); P(g, 18, 6, 2, 12, '#7a4d27');
  for (let y = 0; y < 7; y++) P(g, 2 + y, y, 20 - y * 2, 1, y < 2 ? '#d9b64f' : y < 5 ? '#b08a2e' : '#8a6a22');
  P(g, 11, 7, 2, 6, '#5d3a1c'); P(g, 10, 12, 4, 2, '#8a8478');
  outline(g, OUT);
  return toCanvas(g);
}
function bench() {
  const g = grid(34, 14);
  P(g, 2, 8, 3, 5, '#5d3a1c'); P(g, 29, 8, 3, 5, '#5d3a1c');
  P(g, 1, 3, 32, 5, '#b2793c'); P(g, 1, 3, 32, 1, '#d1975a'); P(g, 1, 7, 32, 1, '#7a5028');
  for (const x of [9, 17, 25]) P(g, x, 4, 1, 3, '#7a5028');
  P(g, 1, 0, 32, 2, '#8a5a30'); P(g, 1, 0, 32, 1, '#a8743a');
  outline(g, OUT);
  return toCanvas(g);
}
function haystack() {
  const g = grid(22, 20);
  E(g, 11, 12, 9.5, 7.5, (i, j) => (((i + j) % 5 === 0) ? '#b8902a' : ((i - 11) < -2 ? '#f0cf62' : (i - 11) > 3 ? '#c9a23c' : '#e0bc4c')));
  P(g, 3, 15, 16, 4, '#d4b048'); P(g, 3, 18, 16, 1, '#a8842c');
  for (let k = 0; k < 6; k++) { g[5 + k][8 + k % 3] = '#b8902a'; }
  outline(g, '#4a2f18');
  return toCanvas(g);
}
function signpost() {
  const g = grid(20, 26);
  P(g, 9, 6, 2, 19, '#5d3a1c');
  P(g, 2, 3, 15, 6, '#b2793c'); P(g, 2, 3, 15, 1, '#d1975a'); P(g, 17, 4, 2, 4, '#b2793c');
  P(g, 4, 5, 9, 1, '#5d3a1c'); P(g, 4, 7, 6, 1, '#5d3a1c');
  P(g, 4, 11, 12, 5, '#9a6a38'); P(g, 4, 11, 12, 1, '#c28a50'); P(g, 6, 13, 7, 1, '#5d3a1c');
  outline(g, OUT);
  return toCanvas(g);
}
function chicken(peck, flip) {
  const g = grid(12, 11);
  E(g, 6, 6.5, 3.8, 3, '#f5f5f0'); P(g, 8, 4, 2, 2, '#e0e0d8');
  P(g, 1, 3, 3, 3, '#f5f5f0');
  P(g, 2, 2, 1, 1, '#d8352a'); P(g, 3, 2, 1, 1, '#d8352a');
  g[4][2] = '#2a1a14'; P(g, 0, 4, 1, 1, '#f0a020');
  if (peck) { P(g, 0, 6, 3, 3, '#f5f5f0'); g[5][1] = null; }
  P(g, 5, 9, 1, 2, '#f0a020'); P(g, 7, 9, 1, 2, '#f0a020');
  outline(g, OUT);
  return toCanvas(flip ? mirror(g) : g);
}

// ---------- ЛЮДИ ----------
const PEOPLE = {
  alex:     { skin: '#f1c9a0', hair: '#3b2a20', shirt: '#2fb3d6', pants: '#2b3558', boots: '#e8e8ee', hood: true },
  man:      { skin: '#e0b080', hair: '#5a3a22', shirt: '#8b5a3a', pants: '#4a4038', boots: '#2a1c14' },
  woman:    { skin: '#f1c9a0', hair: '#b8452a', shirt: '#e07a9a', pants: '#e07a9a', boots: '#5a2a2a', long: true, dress: true },
  kid:      { skin: '#f1c9a0', hair: '#d9a441', shirt: '#6ac16a', pants: '#3a5a8a', boots: '#5a3a22', kid: true },
  old:      { skin: '#e8c8a8', hair: '#e8e8ea', shirt: '#8a8f98', pants: '#5a5a62', boots: '#3a2a20', beard: '#e8e8ea' },
  worker:   { skin: '#d9a878', hair: '#3a2a20', shirt: '#e8962a', pants: '#4a5a78', boots: '#3a2a20', hat: '#f5c431' },
  merchant: { skin: '#e8c09a', hair: '#2a2a30', shirt: '#7a4fa8', pants: '#3a3040', boots: '#2a1c14', hat: '#2f8a5a' },
  girl:     { skin: '#c89268', hair: '#2a1a14', shirt: '#4a7fd8', pants: '#4a7fd8', boots: '#f2f2f2', long: true, dress: true, kid: true },
};

function personGrid(dir, f, o) {
  const W = 14, H = 20, g = grid(W, H);
  const tH = o.kid ? 3 : 5, lH = o.kid ? 3 : 4, total = 7 + tH + lH + 1, y0 = H - 1 - total;
  const hy = y0, ty = y0 + 7, ly = ty + tH, by = ly + lH;
  const skin = o.skin, skinS = shade(skin, 0.84), hair = o.hair, hairL = shade(hair, 1.35);
  const sh = o.shirt, shS = shade(sh, 0.78), pa = o.pants, paS = shade(pa, 0.74), bo = o.boots;
  const side = dir === 'left';

  // ноги / юбка
  if (o.dress) {
    P(g, 4, ly, 6, lH, pa); P(g, 3, ly + lH - 1, 8, 1, pa); P(g, 9, ly, 1, lH, paS); P(g, 10, ly + lH - 1, 1, 1, paS);
    P(g, 3, ly + lH - 1, 8, 1, shade(pa, 1.15));
    if (side) { P(g, 4, by, 3, 1, bo); if (f === 0) P(g, 7, by, 3, 1, bo); }
    else { if (f !== 1) P(g, 4, by, 3, 1, bo); if (f !== 2) P(g, 7, by, 3, 1, bo); }
  } else if (side) {
    if (f === 0) { P(g, 5, ly, 5, lH, pa); P(g, 8, ly, 2, lH, paS); P(g, 4, by, 6, 1, bo); }
    else if (f === 1) { P(g, 4, ly, 3, lH, pa); P(g, 3, by, 4, 1, bo); P(g, 7, ly, 3, lH - 1, paS); P(g, 7, by - 1, 3, 1, bo); }
    else { P(g, 4, ly, 3, lH - 1, pa); P(g, 3, by - 1, 4, 1, bo); P(g, 7, ly, 3, lH, paS); P(g, 7, by, 3, 1, bo); }
  } else {
    const ll = f === 1 ? lH - 1 : lH, rl = f === 2 ? lH - 1 : lH;
    P(g, 4, ly, 3, ll, pa); P(g, 7, ly, 3, rl, pa); P(g, 6, ly, 1, ll, paS); P(g, 7, ly, 1, rl, paS);
    P(g, 4, ly + ll, 3, 1, bo); P(g, 7, ly + rl, 3, 1, bo);
  }

  // торс и руки
  if (side) {
    P(g, 4, ty, 6, tH, sh); P(g, 8, ty, 2, tH, shS);
    const ax = 5 + (f === 1 ? 1 : f === 2 ? -1 : 0);
    P(g, ax, ty, 3, tH - 1, shade(sh, 1.12)); P(g, ax, ty + tH - 1, 3, 1, skin);
  } else {
    P(g, 3, ty, 8, tH, sh); P(g, 10, ty, 1, tH, shS);
    P(g, 2, ty, 1, tH - 1, sh); P(g, 11, ty, 1, tH - 1, shS);
    P(g, 2, ty + tH - 1, 1, 1, skin); P(g, 11, ty + tH - 1, 1, 1, skin);
    P(g, 3, ty + tH - 1, 8, 1, shade(sh, 0.88));
    if (o.hood) {
      if (dir === 'down') { P(g, 4, ty, 6, 1, shS); P(g, 5, ty + 1, 1, 2, '#ffffff'); P(g, 8, ty + 1, 1, 2, '#ffffff'); }
      else { P(g, 4, ty, 6, 2, shS); }
    }
    if (o.dress && !o.kid) P(g, 3, ty + 2, 8, 1, shade(sh, 0.88));
  }

  // голова
  P(g, 3, hy + 1, 8, 6, skin); P(g, 3, hy + 6, 8, 1, skinS);
  if (dir === 'down') {
    P(g, 3, hy, 8, 2, hair); P(g, 5, hy, 3, 1, hairL);
    P(g, 3, hy + 2, 1, 2, hair); P(g, 10, hy + 2, 1, 2, hair);
    P(g, 4, hy + 2, 2, 1, hair); P(g, 8, hy + 2, 1, 1, hair);
    P(g, 5, hy + 4, 1, 1, '#2a1a14'); P(g, 8, hy + 4, 1, 1, '#2a1a14');
    P(g, 4, hy + 5, 1, 1, shade(skin, 0.95)); P(g, 9, hy + 5, 1, 1, shade('#ff8a7a', 1));
    if (o.beard) P(g, 4, hy + 5, 6, 2, o.beard);
    if (o.long) { P(g, 3, hy + 2, 1, tH + 3, hair); P(g, 10, hy + 2, 1, tH + 3, hair); }
  } else if (dir === 'up') {
    P(g, 3, hy, 8, 6, hair); P(g, 5, hy, 3, 1, hairL); P(g, 3, hy + 6, 8, 1, skinS);
    if (o.long) P(g, 3, hy + 5, 8, tH + 1, hair);
  } else {
    P(g, 3, hy, 8, 2, hair); P(g, 5, hy, 3, 1, hairL); P(g, 7, hy + 2, 4, 4, hair); P(g, 3, hy + 2, 2, 1, hair);
    P(g, 4, hy + 4, 1, 1, '#2a1a14'); P(g, 3, hy + 5, 1, 1, skinS);
    if (o.beard) P(g, 3, hy + 5, 5, 2, o.beard);
    if (o.long) P(g, 7, hy + 5, 4, tH + 2, hair);
  }
  if (o.hat) {
    P(g, 3, hy - 1, 8, 3, o.hat); P(g, 2, hy + 1, 10, 1, shade(o.hat, 0.8)); P(g, 4, hy - 1, 3, 1, shade(o.hat, 1.3));
  }
  outline(g, OUT);
  return g;
}

function personFrames(o) {
  const mk3 = (dir) => [0, 1, 2].map((f) => toCanvas(personGrid(dir, f, o)));
  const left = [0, 1, 2].map((f) => personGrid('left', f, o));
  return {
    down: mk3('down'), up: mk3('up'),
    left: left.map(toCanvas), right: left.map((g) => toCanvas(mirror(g))),
  };
}

// ---------- СБОРКА ----------
export function buildArt() {
  const A = { grass: [], flower: [], cobble: [], dirt: [], water: [], rim: {}, people: {}, trees: {}, houses: {}, decor: {} };
  for (let v = 0; v < 6; v++) A.grass.push([grassTile(100 + v, 0, false), grassTile(100 + v, 1, false)]);
  for (let v = 0; v < 3; v++) A.flower.push([grassTile(200 + v, 0, true), grassTile(200 + v, 1, true)]);
  for (let v = 0; v < 4; v++) A.cobble.push(cobbleTile(300 + v));
  for (let v = 0; v < 3; v++) A.dirt.push(dirtTile(400 + v));
  for (let f = 0; f < 3; f++) A.water.push(waterTile(500, f));
  for (const s of ['n', 's', 'w', 'e']) {
    A.rim['cobble' + s] = rimTile(s, '#5f594f', '#d4cec1', '#4f9a33', 600 + s.charCodeAt(0));
    A.rim['dirt' + s] = rimTile(s, '#7a5a33', '#c9a46a', '#4f9a33', 700 + s.charCodeAt(0));
    A.rim['water' + s] = rimTile(s, '#7a746a', '#c3bdb0', null, 800 + s.charCodeAt(0), 3);
  }
  for (const k of Object.keys(PEOPLE)) A.people[k] = personFrames(PEOPLE[k]);
  A.trees.oak = [treeSprite('oak', 11), treeSprite('oak', 12), treeSprite('oak', 13)];
  A.trees.autumn = [treeSprite('autumn', 21)];
  A.pine = [pineSprite(31), pineSprite(32), pineSprite(33)];
  A.houses.thatch = [houseSprite('thatch', 41), houseSprite('thatch', 42)];
  A.houses.red = [houseSprite('red', 43)];
  A.houses.blue = [houseSprite('blue', 44)];
  A.decor = {
    barrel: barrel(), crate: crate(), bush: [bush(51), bush(52), bush(53)], rock: [rock(1), rock(2)],
    lamp: lamp(), well: well(), bench: bench(), haystack: haystack(), sign: signpost(),
  };
  A.chicken = [[chicken(false, false), chicken(true, false)], [chicken(false, true), chicken(true, true)]];
  return A;
}
