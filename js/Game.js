// Game.js
import { ISO, worldToScreen } from './iso.js';
import { Player } from './Player.js';
import { getInput, consumeInteract, consumeDodge, resetInput } from './input.js';
import { dist2 } from './collision.js';
import { BUG_DIALOGS } from './story.js';

// ===== КАРТА 40x40 =====
const MAP_W = 40, MAP_H = 40;
const HOUSE_SIZE = 3;      // дом занимает 3x3 клетки
const TREE_SIZE = 2;       // дерево 2x2

// 0 = пол, 1 = дом, 3 = дерево, 4 = трава
function buildMap() {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(4)); // всё трава

  // Дома (3x3). Задаём левый верхний угол, дом занимает HOUSE_SIZE x HOUSE_SIZE
  const houseAnchors = [
    [5, 5], [14, 5], [24, 5], [32, 6],
    [5, 14], [15, 14], [26, 14], [33, 15],
    [6, 24], [16, 24], [25, 25], [32, 26],
    [7, 33], [17, 33], [26, 34],
  ];
  for (const [bx, by] of houseAnchors) {
    for (let y = by; y < by + HOUSE_SIZE; y++) {
      for (let x = bx; x < bx + HOUSE_SIZE; x++) {
        if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) m[y][x] = 1;
      }
    }
  }

  // Деревья (2x2) — по одному на угол, не пересекаясь с домами
  const treeAnchors = [
    [2, 2], [12, 2], [22, 2], [35, 3],
    [2, 11], [20, 10], [36, 12],
    [3, 20], [13, 19], [23, 19], [35, 20],
    [2, 30], [12, 29], [22, 29], [35, 30],
    [10, 37], [20, 36], [30, 37],
  ];
  for (const [tx, ty] of treeAnchors) {
    for (let y = ty; y < ty + TREE_SIZE; y++) {
      for (let x = tx; x < tx + TREE_SIZE; x++) {
        if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1 && m[y][x] === 4) {
          m[y][x] = 3;
        }
      }
    }
  }

  return m;
}

const MAP = buildMap();

const PLAYER_START = { wx: 20.5, wy: 20.5 };
const NPC_HOUSE = { wx: 15.5, wy: 5.5 }; // дом наверху по центру

const BUGS_DEF = [
  { wx: 2.5,  wy: 2.5,  label: 'непрогруженные обои', hint: 'E — присмотреться к стене' },
  { wx: 37.5, wy: 12.5, label: 'застывшая трава',     hint: 'E — потрогать траву' },
  { wx: 10.5, wy: 37.5, label: 'мерцающий пиксель',   hint: 'E — вглядеться в воздух' },
];

const MAX_GLITCHES = 4;
const GLITCH_LIFE = 10;          // секунд жизни до исчезновения
const GLITCH_FADE = 1.5;         // плавное появление/исчезновение
const GLITCH_GAP = 0.5;          // пауза между исчезновением и переездом
const GLITCH_HIT_INTERVAL = 1.3;
const MAX_GLITCH_HITS = 3;
const GLITCH_RADIUS = 1.0;

// NPC — маршруты туда-обратно
const NPC_DEFS = [
  { start: { wx: 10.5, wy: 9.5 },  a: { wx: 10.5, wy: 9.5 },  b: { wx: 10.5, wy: 17.5 }, speed: 1.4, type: 'man',   bodyColor: '#c89a6a', legColor: '#5a4a3a' },
  { start: { wx: 25.5, wy: 10.5 }, a: { wx: 25.5, wy: 10.5 }, b: { wx: 25.5, wy: 18.5 }, speed: 1.2, type: 'woman', bodyColor: '#e0a0b0', legColor: '#8a3a5a' },
  { start: { wx: 12.5, wy: 22.5 }, a: { wx: 12.5, wy: 22.5 }, b: { wx: 20.5, wy: 22.5 }, speed: 1.6, type: 'kid',   bodyColor: '#a0e0a0', legColor: '#2a6a2a' },
  { start: { wx: 28.5, wy: 27.5 }, a: { wx: 28.5, wy: 27.5 }, b: { wx: 28.5, wy: 35.5 }, speed: 1.3, type: 'old',   bodyColor: '#d0c8b8', legColor: '#5a5a4a' },
  { start: { wx: 18.5, wy: 31.5 }, a: { wx: 18.5, wy: 31.5 }, b: { wx: 25.5, wy: 31.5 }, speed: 1.5, type: 'worker',bodyColor: '#e0a040', legColor: '#5a3a1a' },
];

// ===== ПАЛИТРА =====
const PAL = {
  '.': null,
  'k': '#0a0a0a', 'd': '#1a1f2e', 'B': '#2a3550', 'b': '#3a4870',
  'W': '#4a5a80', 'w': '#2e3a5a', 'c': '#6ee7ff', 'C': '#3aa8c8',
  's': '#f0c8a0', 'S': '#c89870', 'r': '#ff5c7a', 'R': '#c8384f',
  'g': '#ffd77a', 'G': '#c8a84a', 'x': '#ffffff',
  'e': '#4aa04a', 'E': '#2e7a2e', 't': '#3a2a1a', 'T': '#5a3a2a',
  'l': '#4aa04a', 'L': '#2e7a2e', 'h': '#7a4a3a', 'H': '#4a2a1a',
  'q': '#c8b890', 'Q': '#a89870', 'p': '#e0c8a0', 'P': '#a89870',
};

// ===== СПРАЙТЫ АЛЕКСА =====
const ALEX_BASE = [
  '..kkkkkk..', '.kCCCCCCk.', '.kcccccck.', '.kcxccxck.',
  '.kcccccck.', '..kcccck..', '.kCCCCCCk.', 'kcCccccCck',
  'kcCccccCck', 'kcCccccCck', 'kcssssssck', '.kCCCCCCk.',
  '..kk..kk..', '..kk..kk..',
];
const LEGS_STAND = ['..kk..kk..', '..kk..kk..'];
const LEGS_WALK_A = ['..kkk.kk..', '..kk..kkk.'];
const LEGS_WALK_B = ['..kk.kkk..', '.kkk..kk..'];

function buildAlexFrame(dir, wf) {
  const spr = ALEX_BASE.map((r) => r.split(''));
  const legs = wf === 0 ? LEGS_STAND : (wf === 1 ? LEGS_WALK_A : LEGS_WALK_B);
  spr[12] = legs[0].split(''); spr[13] = legs[1].split('');
  if (dir === 'up') spr[3] = '.kcccccck.'.split('');
  else if (dir === 'left') spr[3] = '.kcxcccck.'.split('');
  else if (dir === 'right') spr[3] = '.kccccxck.'.split('');
  return spr.map((r) => r.join(''));
}
const SPRITE_ALEX = {
  down:  { idle: buildAlexFrame('down', 0),  a: buildAlexFrame('down', 1),  b: buildAlexFrame('down', 2) },
  up:    { idle: buildAlexFrame('up', 0),    a: buildAlexFrame('up', 1),    b: buildAlexFrame('up', 2) },
  left:  { idle: buildAlexFrame('left', 0),  a: buildAlexFrame('left', 1),  b: buildAlexFrame('left', 2) },
  right: { idle: buildAlexFrame('right', 0), a: buildAlexFrame('right', 1), b: buildAlexFrame('right', 2) },
};

// NPC-спрайт (простой, 10x14, цветной, 2 кадра ходьбы)
// ===== NPC (разные) =====
// type: 'man' | 'woman' | 'old' | 'kid' | 'worker'
const NPC_TYPES = {
  man: {
    body: ['..kkkkkk..', '.kssssssk.', '.ksxssxsk.', '.kssssssk.', '.kssssssk.', '..kssssk..',
           '.kPPPPPPk.', 'kPQPPPPQPk', 'kPQPPPPQPk', 'kPQPPPPQPk', '.kPPPPPPk.', '.kPPPPPPk.'],
    hair: 'h',
    height: 1.0,
  },
  woman: {
    body: ['..kkkkkk..', '.kHHHHHHk.', '.kHssssHk.', '.kHsxssHk.', '.kHssssHk.', '..ksssk...',
           '.kPPPPPPk.', 'kPQPPPPQPk', 'kPQPPPPQPk', 'kPQPPPPQPk', 'kPPPPPPPPk', 'kPPPPPPPPk'],
    hair: 'H',
    height: 1.0,
  },
  old: {
    body: ['..kkkkkk..', '.kWWWWWWk.', '.kWssssWk.', '.kWsxssWk.', '.kWssssWk.', '..ksssk...',
           '.kPPPPPPk.', 'kPQPPPPQPk', 'kPQPPPPQPk', 'kPQPPPPQPk', '.kPPPPPPk.', '.kPPPPPPk.'],
    hair: 'W',
    height: 0.95,
  },
  kid: {
    body: ['..kkkkkk..', '.kssssssk.', '.ksxssxsk.', '.kssssssk.', '..kssssk..',
           '.kPPPPPPk.', 'kPQPPPPQPk', 'kPQPPPPQPk', '.kPPPPPPk.'],
    hair: 'h',
    height: 0.75,
  },
  worker: {
    body: ['..kkkkkk..', '.kYYYYYYk.', '.kYssssYk.', '.kYsxssYk.', '.kYssssYk.', '..ksssk...',
           '.kPPPPPPk.', 'kPQPPPPQPk', 'kPQPPPPQPk', 'kPQPPPPQPk', '.kPPPPPPk.', '.kPPPPPPk.'],
    hair: 'Y',
    height: 1.0,
  },
};

function buildNPC(type, walkFrame, legColor = 'Q') {
  const cfg = NPC_TYPES[type] || NPC_TYPES.man;
  const legs = walkFrame === 0
    ? ['..kk..kk..', '..kk..kk..']
    : (walkFrame === 1
      ? ['..kkk.kk..', '..kk..kkk.']
      : ['..kk.kkk..', '.kkk..kk..']);
  const frame = [...cfg.body, ...legs];

  // заменяем цвет волос и ног
  const result = frame.map((row) => row
    .replace(/H/g, cfg.hair)
    .replace(/W/g, cfg.hair)
    .replace(/Y/g, cfg.hair)
    .replace(/Q/g, legColor)
  );
  return { sprite: result, height: cfg.height };
}

// ===== ДОМ (крупный, 3x3) =====
// ===== ДОМ (3x3, объёмный, один большой спрайт) =====
// Ширина 30, высота 30. Крыша сверху (трапеция), две стены по бокам.
// Левый скат светлее, правый темнее, крыша — самым светлым.
// ===== ДОМ (широкий, объёмный, на блок 3x3) =====
// Ширина 44, высота 32. Крыша сверху — плоская широкая трапеция.
// Стены: левая (светлее) и правая (темнее) — объём.
// ===== ДОМ (широкий + высокий + детали, блок 3x3) =====
const SPRITE_HOUSE_BIG = [
  '..................kkkkkkkkkkkkkkkkkkkk..................',
  '.................khhhhhhhhhhhhhhhhhhhhk.................',
  '................khhhhhhhhhhhhhhhhhhhhhhhhk..............',
  '...............khhhhhhhhhhhhhhhhhhhhhhhhhhk.............',
  '..............khhhhhhhhhhhhhhhhhhhhhhhhhhhhk............',
  '.............khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk...........',
  '............khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk..........',
  '...........khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk.........',
  '..........khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk........',
  '.........khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk.......',
  '........khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk......',
  '.......khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk.....',
  '......khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk....',
  '.....khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk...',
  '....khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk..',
  '...khhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhk.',
  '...kHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHk.',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  '.kqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk.',
  '.kqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqk.',
  '.kqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQkkkkQQQkkkkQQQqqqqqqqqqqqqqqQQkkkkQQQkkkkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkGGGkQQkGGGkQQQqqqqqqqqqqqqQQkGGGkQQkGGGkQQQQQQQQQk.',
  '.kqQQkkkkQQQkkkkQQQqqqqqqqqqqqqQQkkkkQQQkkkkQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQqqqqqqqqqqqqQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkkkkkkkkkkkkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkGGGGGGGGGGkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kqQQQQQQQQQQQQQQQQkkkkkkkkkkkkQQQQQQQQQQQQQQQQQQQQQQQQQk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  '.kpppppppppppppppppppppppppppppppppppppppppppppppppppppk.',
  '.kpppppppppppppppppppppppppppppppppppppppppppppppppppppk.',
  '.kpppppppppppppppppppppppppppppppppppppppppppppppppppppk.',
  '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
];

// ===== ДЕРЕВО (2x2, высокое, объёмное) =====
// Ширина 22, высота 34 — заведомо выше персонажа (10x14 * 3 = 30x42 пикселя у Алекса)
// Здесь спрайт выше: 34 * 2 = 68 пикселей, у Алекса 14 * 3 = 42. То есть дерево выше.
const SPRITE_TREE_BIG = [
  '.......kkkkkkkk.......',
  '.....kkllllllllkk.....',
  '....kllllllllllllk....',
  '...kllllllllllllllk...',
  '..kllllllllllllllllk..',
  '.kllllllllllllllllllk.',
  '.kllllllllllllllllllk.',
  'kllllllllllllllllllllk',
  'kllllllllllllllllllllk',
  'kllllllllllllllllllllk',
  'kllllllllllllllllllllk',
  '.kllllllllllllllllllk.',
  '.kllllllllllllllllllk.',
  '..kllllllllllllllllk..',
  '..kLLLlllllllllLLLkk..',
  '...kLLLllllllllLLLk...',
  '....kkLLLLLLLLLLkk....',
  '......kkkkkkkkkk......',
  '.......kTTttTTk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '.......kTtTtTtk.......',
  '......kkkkkkkkkk......',
  '.....kBBBBBBBBBBk.....',
  '.....kkkkkkkkkkkk.....',
];

const SPRITE_BUG = [
  '...rrrrrr...', '..rrRRRRrr..', '.rrRxxxxRrr.', '.rRxxxxxxRr.',
  '.rRxxxxxxRr.', '.rRxxxxxxRr.', '.rrRxxxxRrr.', '..rrRRRRrr..',
  '...rrrrrr...', '....r..r....', '....r..r....', '............',
];

const SPRITE_NPC_HOUSE = [
  '.......kkkkkk.......', '......kwwwwwwk......', '.....kwwwwwwwwk.....',
  '....kwwwwwwwwwwk....', '...kwwwwwwwwwwwwk...', '..kkkkkkkkkkkkkkkk..',
  '..kWwwwwwwwwwwwwWk..', '..kWwwwwwwwwwwwwWk..', '..kWwwwwggggwwwwWk..',
  '..kWwwwwgGGgwwwwWk..', '..kWwwwwggggwwwwWk..', '..kWwwwwwwwwwwwwWk..',
  '..kWwwwwkkkkwwwwWk..', '..kWwwwwkGGkwwwwWk..', '..kWwwwwkGGkwwwwWk..',
  '..kWwwwwkGGkwwwwWk..', '..kkkkkkkkkkkkkkkk..', '....................',
  '....................', '....................',
];

function drawSprite(ctx, sprite, pal, cx, cy, scale = 3) {
  const h = sprite.length, w = sprite[0].length;
  const offX = Math.floor(cx - (w * scale) / 2);
  const offY = Math.floor(cy - (h * scale));
  for (let py = 0; py < h; py++) {
    const row = sprite[py];
    for (let px = 0; px < w; px++) {
      const ch = row[px];
      const color = pal[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(offX + px * scale, offY + py * scale, scale, scale);
    }
  }
}

// ===== КЭШ ТАЙЛОВ =====
let TILE_CACHE = null;
function buildTileCache() {
  const mk = (w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').imageSmoothingEnabled = false; return c;
  };
  const tile = (f1, f2) => {
    const cv = mk(32, 16); const c = cv.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x - 15.5) / 16, dy = Math.abs(y - 7.5) / 8;
      if (dx + dy <= 1.0) { c.fillStyle = (dx + dy > 0.82) ? f2 : f1; c.fillRect(x, y, 1, 1); }
    }
    return cv;
  };
  TILE_CACHE = {
    grass: tile('#3a7a3a', '#2a5a2a'),
    glitch: tile('#ff5c7a', '#c8384f'),
  };
}

export class Game {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.cb = callbacks;
    this.player = new Player(PLAYER_START.wx, PLAYER_START.wy);
    this.state = 'idle';
    this.rafId = null;
    this.lastTs = 0;
    this.elapsed = 0;
    this.nearBug = null;
    this.bugs = BUGS_DEF.map((b) => ({ ...b, found: false }));
    this.glitchHits = 0;
    this.glitchTimer = 0;
    this.inGlitch = false;
    this.glitchFxTimer = 0;
    this.glitches = [];
    this.allBugsFound = false;
    this.nearHouse = false;
    this.dialogOpen = false;
    this.particles = [];
    this.vnVisible = false;
    this.vnTextEl = document.getElementById('vn-text');
    this.vnDialogEl = document.getElementById('vn-dialog');

    // NPC
    this.npcs = NPC_DEFS.map((def) => ({
      ...def, wx: def.start.wx, wy: def.start.wy,
      target: 'b', walkTimer: 0, walkFrame: 0, dir: 'down', moving: false,
    }));

    this.hintEl = document.getElementById('interact-hint');
    this.hintLabel = document.getElementById('interact-label');
    this.glitchInd = document.getElementById('glitch-indicator');
    this.glitchCountEl = document.getElementById('glitch-count');
    this.questValEl = document.getElementById('quest-val');
    this.gameScreenEl = document.getElementById('screen-game');

    if (!TILE_CACHE) buildTileCache();

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();

    this._onVisibility = () => { if (document.hidden && this.state === 'playing') this.pause(); };
    document.addEventListener('visibilitychange', this._onVisibility);

    this.vnDialogEl.addEventListener('click', (e) => {
      // клик по кнопкам не закрывает
      if (e.target.closest('button')) return;
      this._hideVN();
    });
  }

  _loadRecord() {
    try { const v = localStorage.getItem('ser_record_time'); return v ? parseFloat(v) : null; }
    catch { return null; }
  }
  _saveRecord(t) {
    try {
      const cur = this._loadRecord();
      if (cur === null || t < cur) { localStorage.setItem('ser_record_time', String(t)); return t; }
    } catch {}
    return this._loadRecord();
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    ISO.originX = w / 2; ISO.originY = h / 2.4;
  }

  start() {
    this.state = 'playing';
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTs = 0; this.elapsed = 0;
    this.glitchHits = 0; this.glitchTimer = 0;
    this.inGlitch = false; this.glitchFxTimer = 0;
    this.allBugsFound = false; this.nearHouse = false; this.dialogOpen = false;
    this.particles = [];
    this.bugs = BUGS_DEF.map((b) => ({ ...b, found: false }));
    this.player = new Player(PLAYER_START.wx, PLAYER_START.wy);
    ISO.camX = this.player.wx; ISO.camY = this.player.wy;
    this._updateQuest();
    this._updateGlitchUI();
    this._hideVN();
    this.npcs = NPC_DEFS.map((def) => ({
      ...def, wx: def.start.wx, wy: def.start.wy,
      target: 'b', walkTimer: 0, walkFrame: 0, dir: 'down', moving: false,
    }));

    // глитчи
    this.glitches = [];
    for (let i = 0; i < MAX_GLITCHES; i++) {
      const pos = this._randomFreePoint();
      this.glitches.push({
        wx: pos.wx, wy: pos.wy,
        age: 0, state: 'fadein',
      });
    }

    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  _randomFreePoint() {
    for (let tries = 0; tries < 300; tries++) {
      const wx = 1 + Math.random() * (MAP_W - 2);
      const wy = 1 + Math.random() * (MAP_H - 2);
      const cx = Math.round(wx), cy = Math.round(wy);
      if (MAP[cy]?.[cx] !== 4) continue;
      // не рядом с домом/деревом (2 клетки вокруг)
      let nearBlock = false;
      for (let dy = -2; dy <= 2 && !nearBlock; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const t = MAP[cy + dy]?.[cx + dx];
          if (t === 1 || t === 3) { nearBlock = true; break; }
        }
      }
      if (nearBlock) continue;
      if (dist2(wx, wy, PLAYER_START.wx, PLAYER_START.wy) < 9) continue;
      let tooClose = false;
      for (const g of this.glitches) {
        if (dist2(wx, wy, g.wx, g.wy) < 9) { tooClose = true; break; }
      }
      if (tooClose) continue;
      return { wx, wy };
    }
    return { wx: 5.5, wy: 5.5 };
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; resetInput();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    document.getElementById('pause-overlay').classList.remove('hidden');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.lastTs = 0;
    document.getElementById('pause-overlay').classList.add('hidden');
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  loop(ts) {
    if (this.state !== 'playing') return;
    if (!this.lastTs) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.1) dt = 0.1;
    this.update(dt);
    this.render();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.dialogOpen) return;
    this.elapsed += dt;
    document.getElementById('time-val').textContent = this._fmtTime(this.elapsed);

    // VN — только по клику / E
    if (this.vnVisible) {
      if (consumeInteract()) this._hideVN();
      // VN не блокирует движение, но мы не обрабатываем ввод, чтобы не было двойного E
      this._updateGlitches(dt);
      this._updateNPCs(dt);
      this._updateParticles(dt);
      return;
    }

    const input = getInput();
    this.player.update(dt, input, MAP);
    if (consumeDodge()) this.player.dodge();

    const camSpeed = 6;
    ISO.camX += (this.player.wx - ISO.camX) * Math.min(1, camSpeed * dt);
    ISO.camY += (this.player.wy - ISO.camY) * Math.min(1, camSpeed * dt);

    this._updateGlitches(dt);
    this._updateNPCs(dt);

    // баги
    this.nearBug = null;
    if (!this.allBugsFound) {
      for (const b of this.bugs) {
        if (b.found) continue;
        if (dist2(this.player.wx, this.player.wy, b.wx, b.wy) < 2.2 * 2.2) {
          this.nearBug = b; break;
        }
      }
    }
    this.nearHouse = this.allBugsFound &&
      dist2(this.player.wx, this.player.wy, NPC_HOUSE.wx, NPC_HOUSE.wy) < 2.5 * 2.5;

    if (this.nearBug) {
      this.hintEl.classList.remove('hidden');
      this.hintLabel.textContent = this.nearBug.hint;
    } else if (this.nearHouse) {
      this.hintEl.classList.remove('hidden');
      this.hintLabel.textContent = 'E — войти в дом';
    } else {
      this.hintEl.classList.add('hidden');
    }

    if (consumeInteract()) {
      if (this.nearBug) {
        const b = this.nearBug;
        this._spawnParticles(b.wx, b.wy, 'bug');
        this._showVN('АЛЕКС', BUG_DIALOGS[b.label] || 'Что-то здесь не так...');
        b.found = true;
        const n = this.bugs.filter((x) => x.found).length;
        this.cb.onBugFound?.(n);
        this._updateQuest();
        if (n === 3) { this.allBugsFound = true; this._updateQuest(); }
      } else if (this.nearHouse) {
        this._openDialog();
      }
    }

    this._updateParticles(dt);

    if (this.glitchFxTimer > 0) {
      this.glitchFxTimer -= dt;
      if (this.glitchFxTimer <= 0) this.gameScreenEl.classList.remove('glitching');
    }
  }

  _updateGlitches(dt) {
    this.inGlitch = false;
    for (const g of this.glitches) {
      if (g.state === 'gone') {
        g.gapTimer -= dt;
        if (g.gapTimer <= 0) {
          const pos = this._randomFreePoint();
          g.wx = pos.wx; g.wy = pos.wy;
          g.age = 0; g.state = 'fadein';
        }
        continue;
      }
      g.age += dt;
      if (g.state === 'fadein' && g.age >= GLITCH_FADE) g.state = 'alive';

      // проверка игрока
      if (dist2(this.player.wx, this.player.wy, g.wx, g.wy) < GLITCH_RADIUS * GLITCH_RADIUS) {
        this.inGlitch = true;
        this.glitchTimer -= dt;
        if (this.glitchTimer <= 0) {
          this.glitchTimer = GLITCH_HIT_INTERVAL;
          this._takeGlitchHit(g);
        }
        break;
      }

      // плавное исчезновение после GLITCH_LIFE
      if (g.state === 'alive' && g.age >= GLITCH_FADE + GLITCH_LIFE) {
        g.state = 'gone';
        g.gapTimer = GLITCH_GAP;
      }
    }
    if (!this.inGlitch) this.glitchTimer = GLITCH_HIT_INTERVAL;
  }

  _updateNPCs(dt) {
    for (const n of this.npcs) {
      const tgt = n.target === 'a' ? n.a : n.b;
      const dx = tgt.wx - n.wx, dy = tgt.wy - n.wy;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1) {
        n.target = n.target === 'a' ? 'b' : 'a';
        n.moving = false;
        continue;
      }
      n.moving = true;
      const step = n.speed * dt;
      const nx = dx / dist * step;
      const ny = dy / dist * step;
      n.wx += nx; n.wy += ny;
      n.dir = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
      n.walkTimer += dt;
      if (n.walkTimer > 0.2) { n.walkTimer = 0; n.walkFrame = 1 - n.walkFrame; }
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt; p.wx += p.vx * dt; p.wy += p.vy * dt;
      p.vz += p.g * dt; p.z += p.vz * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _showVN(name, text) {
    this.vnVisible = true;
    document.getElementById('vn-name').textContent = name;
    this.vnTextEl.textContent = text;
    document.getElementById('vn-choices').classList.add('hidden');
    document.getElementById('vn-hint').classList.remove('hidden');
    this.vnDialogEl.classList.remove('hidden');
    this.hintEl.classList.add('hidden');
  }

  _hideVN() {
    this.vnVisible = false;
    this.vnDialogEl.classList.add('hidden');
  }

  _spawnParticles(wx, wy, kind) {
    const n = kind === 'bug' ? 14 : 8;
    const colors = kind === 'bug'
      ? ['#ff5c7a', '#c8384f', '#ffd77a', '#ffffff']
      : ['#ff5c7a', '#c8384f'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.particles.push({
        wx, wy, z: 0.5,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        vz: 3 + Math.random() * 3, g: -9,
        life: 0.6 + Math.random() * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.floor(Math.random() * 3),
      });
    }
  }

  _takeGlitchHit(g) {
    this.glitchHits++;
    this.glitchCountEl.textContent = String(this.glitchHits);
    this.glitchInd.classList.remove('hidden');
    this._spawnParticles(this.player.wx, this.player.wy, 'glitch');
    this.gameScreenEl.classList.add('glitching');
    this.glitchFxTimer = 0.5;

    // глитч уезжает на новое место
    g.state = 'gone';
    g.gapTimer = GLITCH_GAP;

    this.player.wx = PLAYER_START.wx;
    this.player.wy = PLAYER_START.wy;

    if (this.glitchHits >= MAX_GLITCH_HITS) {
      this.state = 'over';
      this.cb.onGlitchDeath?.();
    }
  }

  _updateGlitchUI() {
    this.glitchCountEl.textContent = String(this.glitchHits);
    if (this.glitchHits > 0) this.glitchInd.classList.remove('hidden');
    else this.glitchInd.classList.add('hidden');
  }

  _updateQuest() {
    const n = this.bugs.filter((b) => b.found).length;
    if (this.allBugsFound) this.questValEl.textContent = 'найди дом с незнакомцем';
    else this.questValEl.textContent = `найди баги (${n}/3)`;
    this.cb.onQuestUpdate?.(this.allBugsFound);
  }

  _openDialog() {
    this.dialogOpen = true;
    this.state = 'dialog';
    resetInput();
    this.cb.onDialogOpen?.();
  }

  closeDialog() {
    this.dialogOpen = false;
    this.state = 'over';
  }

  // ===== РЕНДЕР =====
  render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, 0, w, h);

    const R = 20;
    const minX = Math.max(0, Math.floor(ISO.camX - R));
    const maxX = Math.min(MAP_W - 1, Math.ceil(ISO.camX + R));
    const minY = Math.max(0, Math.floor(ISO.camY - R));
    const maxY = Math.min(MAP_H - 1, Math.ceil(ISO.camY + R));

    // === СЛОЙ 1: плоские тайлы (трава/пол) ===
    for (let wy = minY; wy <= maxY; wy++) {
      for (let wx = minX; wx <= maxX; wx++) {
        const t = MAP[wy][wx];
        if (t === 4 || t === 1 || t === 3) this._drawGrassTile(wx, wy);
        else if (t === 0) this._drawFloorTile(wx, wy);
      }
    }

    // === СЛОЙ 2: крупные объекты — по глубине ===
    const envDrawables = [];
    for (let wy = minY; wy <= maxY; wy++) {
      for (let wx = minX; wx <= maxX; wx++) {
        if (MAP[wy][wx] === 1
            && MAP[wy]?.[wx + 1] !== 1
            && MAP[wy + 1]?.[wx] !== 1) {
          envDrawables.push({ type: 'house', wx, wy, depth: wx + wy });
        }
        if (MAP[wy][wx] === 3
            && MAP[wy]?.[wx + 1] !== 3
            && MAP[wy + 1]?.[wx] !== 3) {
          envDrawables.push({ type: 'tree', wx, wy, depth: wx + wy });
        }
      }
    }
    envDrawables.sort((a, b) => a.depth - b.depth);
    for (const d of envDrawables) {
      if (d.type === 'house') this._drawHouseTile(d.wx, d.wy);
      else this._drawTreeTile(d.wx, d.wy);
    }

    // === СЛОЙ 3: персонажи, баги, глитчи, частицы — ВСЕГДА поверх окружения ===
    const objDrawables = [];
    for (const b of this.bugs) {
      if (!b.found) objDrawables.push({ type: 'bug', data: b, depth: b.wx + b.wy });
    }
    for (const g of this.glitches) {
      if (g.state !== 'gone') objDrawables.push({ type: 'glitch', data: g, depth: g.wx + g.wy });
    }
    for (const n of this.npcs) {
      objDrawables.push({ type: 'npc', data: n, depth: n.wx + n.wy });
    }
    if (this.allBugsFound) {
      objDrawables.push({ type: 'npchouse', depth: NPC_HOUSE.wx + NPC_HOUSE.wy });
    }
    objDrawables.push({ type: 'player', depth: this.player.wx + this.player.wy });

    objDrawables.sort((a, b) => a.depth - b.depth);
    for (const d of objDrawables) {
      switch (d.type) {
        case 'bug': this._drawBug(d.data); break;
        case 'glitch': this._drawGlitch(d.data); break;
        case 'npc': this._drawNPC(d.data); break;
        case 'npchouse': this._drawHouseMarker(); break;
        case 'player': this._drawPlayer(); break;
      }
    }

    this._drawParticles();
  }

  _drawGrassTile(wx, wy) {
    const { x, y } = worldToScreen(wx, wy);
    this.ctx.drawImage(TILE_CACHE.grass, Math.floor(x - 48), Math.floor(y - 24), 96, 48);
    // пучки
    const seed = (wx * 73 + wy * 131) % 100;
    if (seed < 50) {
      this.ctx.fillStyle = '#5ac05a';
      this.ctx.fillRect(Math.floor(x - 4), Math.floor(y - 6), 2, 4);
      this.ctx.fillRect(Math.floor(x + 2), Math.floor(y - 5), 2, 3);
      this.ctx.fillRect(Math.floor(x - 1), Math.floor(y - 8), 2, 4);
    }
  }

  _drawFloorTile(wx, wy) {
    const { x, y } = worldToScreen(wx, wy);
    this.ctx.drawImage(TILE_CACHE.grass, Math.floor(x - 48), Math.floor(y - 24), 96, 48);
    this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
    this.ctx.fillRect(Math.floor(x - 40), Math.floor(y - 15), 80, 30);
  }

  _drawHouseTile(wx, wy) {
    const cx = wx - 1;
    const cy = wy - 1;
    const { x, y } = worldToScreen(cx, cy);
    drawSprite(this.ctx, SPRITE_HOUSE_BIG, PAL, x, y + 40, 4);
  }

  _drawTreeTile(wx, wy) {
    const isRightEdge = (MAP[wy]?.[wx + 1] !== 3);
    const isBottomEdge = (MAP[wy + 1]?.[wx] !== 3);
    if (!isRightEdge || !isBottomEdge) return;

    const cx = wx - 0.5;
    const cy = wy - 0.5;
    const { x, y } = worldToScreen(cx, cy);

    // трава под деревом (рисуется сама, если поле grass)
    // сам спрайт — очень крупный
    drawSprite(this.ctx, SPRITE_TREE_BIG, PAL, x, y + 10, 3);
  }

  _drawGlitch(g) {
    const { x, y } = worldToScreen(g.wx, g.wy);
    let alpha = 1;
    if (g.state === 'fadein') alpha = Math.min(1, g.age / GLITCH_FADE);
    else if (g.state === 'alive' && g.age > GLITCH_FADE + GLITCH_LIFE - GLITCH_FADE) {
      alpha = Math.max(0, (GLITCH_FADE + GLITCH_LIFE - g.age) / GLITCH_FADE);
    }
    const flick = 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 200 + g.wx));

    this.ctx.save();
    this.ctx.globalAlpha = alpha * flick;
    this.ctx.drawImage(TILE_CACHE.glitch, Math.floor(x - 48), Math.floor(y - 24), 96, 48);
    for (let i = 0; i < 4; i++) {
      const ox = (Math.random() - 0.5) * 70;
      const oy = (Math.random() - 0.5) * 30;
      this.ctx.fillStyle = i % 2 ? '#ff5c7a' : '#ffffff';
      this.ctx.fillRect(Math.floor(x + ox), Math.floor(y + oy), 3, 2);
    }
    this.ctx.restore();
  }

  _drawBug(b) {
    const { x, y } = worldToScreen(b.wx, b.wy);
    const t = performance.now() / 300;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    this.ctx.save();
    this.ctx.globalAlpha = 0.6 + 0.4 * pulse;
    drawSprite(this.ctx, SPRITE_BUG, PAL, x, y - 4 + Math.floor(pulse * 4), 2);
    this.ctx.restore();
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * 40;
      const oy = (Math.random() - 0.5) * 20;
      this.ctx.fillStyle = 'rgba(255,92,122,0.6)';
      this.ctx.fillRect(Math.floor(x + ox), Math.floor(y - 20 + oy), 6, 2);
    }
  }

  _drawNPC(n) {
    const { x, y } = worldToScreen(n.wx, n.wy);
    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.beginPath();
    this.ctx.ellipse(Math.floor(x), Math.floor(y) + 2, 14, 6, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const wf = n.moving ? (n.walkFrame ? 1 : 2) : 0;
    const { sprite, height } = buildNPC(n.type || 'man', wf, n.legColor || 'Q');
    const scale = Math.round(3 * height);
    drawSprite(this.ctx, sprite, PAL, x, y - 4, scale);
  }

  _drawHouseMarker() {
    const { x, y } = worldToScreen(NPC_HOUSE.wx, NPC_HOUSE.wy);
    drawSprite(this.ctx, SPRITE_NPC_HOUSE, PAL, x, y + 10, 4);
    const t = performance.now() / 400;
    const bob = Math.floor(Math.sin(t) * 6);
    const ax = Math.floor(x);
    const ay = Math.floor(y - 100 + bob);
    this.ctx.fillStyle = '#ffd77a';
    this.ctx.fillRect(ax - 9, ay, 18, 6);
    this.ctx.fillRect(ax - 6, ay + 6, 12, 4);
    this.ctx.fillRect(ax - 3, ay + 10, 6, 4);
    this.ctx.fillRect(ax - 1, ay + 14, 2, 3);
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(ax - 10, ay - 1, 20, 1);
  }

  _drawPlayer() {
    const { x, y } = worldToScreen(this.player.wx, this.player.wy);
    this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
    this.ctx.beginPath();
    this.ctx.ellipse(Math.floor(x), Math.floor(y) + 2, 18, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();
    const dirSprites = SPRITE_ALEX[this.player.dir] || SPRITE_ALEX.down;
    let frame;
    if (!this.player.moving) frame = dirSprites.idle;
    else frame = this.player.walkFrame ? dirSprites.a : dirSprites.b;
    drawSprite(this.ctx, frame, PAL, x, y - 4, 3);
  }

  _drawParticles() {
    for (const p of this.particles) {
      const { x, y } = worldToScreen(p.wx, p.wy);
      const py = y - p.z * 20;
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      this.ctx.fillRect(Math.floor(x), Math.floor(py), p.size, p.size);
    }
    this.ctx.globalAlpha = 1;
  }

  _fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  destroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._resize);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}