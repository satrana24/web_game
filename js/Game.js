// Game.js
import { ISO, TILE, worldToScreen } from './iso.js';
import { Player } from './Player.js';
import { getInput, consumeInteract, consumeDodge, resetInput } from './input.js';
import { dist2, canMoveTo } from './collision.js';
import { BUG_DIALOGS } from './story.js';
import { buildArt, hash2, rng } from './art.js';

// ===== КАРТА 40x40 =====
const MAP_W = 40, MAP_H = 40;
// Коды клеток (для столкновений):
// 0 брусчатка, 1 дом, 3 дерево, 4 трава, 5 предмет / кусты / граница, 6 вода, 7 тропинка
const HOUSE_ANCHORS = [
  [5, 5], [14, 5], [24, 5], [32, 6],
  [5, 14], [15, 14], [26, 14], [33, 15],
  [6, 24], [16, 24], [25, 25], [32, 26],
  [7, 33], [17, 33], [26, 34],
];
const SPECIAL_HOUSE = [14, 5];                        // дом незнакомца
const BUG_TREES = [[2, 2], [36, 12], [10, 37]];       // деревья, где «застряли» баги
const TREE_ANCHORS = [
  [12, 2], [22, 2], [35, 3], [2, 11], [20, 10], [3, 20], [13, 19], [23, 19],
  [35, 20], [2, 30], [12, 29], [22, 29], [35, 30], [20, 36], [30, 37],
];

function buildWorld() {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(4));
  const ground = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(4)); // 4 трава, 0 брусчатка, 7 тропинка, 6 вода
  const inb = (x, y) => x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
  const houses = [], trees = [], decor = [];
  const R = rng(2024);

  // дома
  const styles = ['thatch', 'red', 'thatch', 'thatch', 'red'];
  HOUSE_ANCHORS.forEach(([bx, by], i) => {
    for (let y = by; y < by + 3; y++) for (let x = bx; x < bx + 3; x++) if (inb(x, y)) m[y][x] = 1;
    const special = bx === SPECIAL_HOUSE[0] && by === SPECIAL_HOUSE[1];
    houses.push({ tx: bx, ty: by, special, style: special ? 'blue' : styles[i % styles.length], v: i % 2 });
  });

  // деревья с багами (всегда на месте)
  for (const [tx, ty] of BUG_TREES) {
    for (let y = ty; y < ty + 2; y++) for (let x = tx; x < tx + 2; x++) m[y][x] = 3;
    trees.push({ tx, ty, kind: 'oak', v: (tx + ty) % 3 });
  }

  // дороги (только по свободной траве)
  const road = (x0, y0, x1, y1, t) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (inb(x, y) && m[y][x] === 4 && ground[y][x] === 4) { m[y][x] = t; ground[y][x] = t; }
    }
  };
  road(17, 17, 23, 23, 0);   // площадь
  road(4, 9, 35, 10, 0);     // северная улица
  road(3, 19, 37, 20, 0);    // центральная
  road(4, 30, 37, 31, 0);    // южная
  road(19, 9, 20, 31, 0);    // главная вертикаль
  road(10, 9, 11, 31, 7);    // западная тропа
  road(30, 9, 31, 31, 7);    // восточная тропа
  // дорожки от дверей
  for (const h of houses) {
    const x = h.tx + 1;
    for (let k = 0; k < 4; k++) {
      const y = h.ty + 3 + k;
      if (!inb(x, y) || m[y][x] !== 4) break;
      m[y][x] = 7; ground[y][x] = 7;
    }
  }
  // пруд
  for (const [x, y] of [[3, 23], [4, 23], [2, 24], [3, 24], [4, 24], [2, 25], [3, 25], [4, 25], [3, 26], [4, 26]]) {
    m[y][x] = 6; ground[y][x] = 6;
  }

  const solidOk = (x, y) => inb(x, y) && (m[y][x] === 1 || m[y][x] === 3 || m[y][x] === 5 || m[y][x] === 6);
  // деревья
  const canTree = (x, y) => {
    if (x < 2 || y < 2 || x + 1 > MAP_W - 3 || y + 1 > MAP_H - 3) return false;
    for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
      const core = i >= 0 && i <= 1 && j >= 0 && j <= 1;
      if (core ? m[y + j][x + i] !== 4 : solidOk(x + i, y + j)) return false;
    }
    return dist2(x + 0.5, y + 0.5, 20.5, 20.5) > 25;
  };
  const addTree = (x, y) => {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) m[y + j][x + i] = 3;
    const autumn = R() < 0.22;
    trees.push({ tx: x, ty: y, kind: autumn ? 'autumn' : 'oak', v: (R() * 3) | 0 });
  };
  for (const [x, y] of TREE_ANCHORS) if (canTree(x, y)) addTree(x, y);
  for (let n = 0, placed = 0; n < 400 && placed < 13; n++) {
    const x = 2 + ((R() * (MAP_W - 5)) | 0), y = 2 + ((R() * (MAP_H - 5)) | 0);
    if (canTree(x, y)) { addTree(x, y); placed++; }
  }

  // предметы
  const put = (kind, tx, ty, w = 1, allowPath = false, v = 0) => {
    for (let i = 0; i < w; i++) {
      if (!inb(tx + i, ty)) return false;
      const t = m[ty][tx + i];
      if (!(t === 4 || (allowPath && t === 0))) return false;
    }
    for (let i = 0; i < w; i++) m[ty][tx + i] = 5;
    decor.push({ kind, tx, ty, w, v });
    return true;
  };
  for (const [x, y] of [[17, 17], [23, 17], [17, 23], [23, 23]]) put('lamp', x, y, 1, true);
  put('lamp', 18, 8); put('lamp', 21, 8); put('lamp', 12, 11); put('lamp', 28, 11);
  put('well', 18, 18, 1, true);
  put('bench', 21, 23, 2, true); put('bench', 21, 17, 2, true);
  put('sign', 21, 16);
  for (const h of houses) {
    const hv = hash2(h.tx, h.ty);
    put('barrel', h.tx, h.ty + 3);
    put(hv % 3 === 0 ? 'crate' : 'barrel', h.tx + 2, h.ty + 3);
    if (hv % 4 === 0) put('haystack', h.tx + 3, h.ty + 2);
    if (hv % 3 !== 1) put('bush', h.tx - 1, h.ty + 1, 1, false, hv % 3);
    if (hv % 5 !== 0) put('bush', h.tx + 3, h.ty + 1, 1, false, (hv >> 3) % 3);
  }
  for (const [x, y] of [[1, 25], [5, 23], [4, 27], [1, 22]]) put('rock', x, y, 1, false, x % 2);
  for (let n = 0, placed = 0; n < 500 && placed < 46; n++) {
    const x = 2 + ((R() * (MAP_W - 4)) | 0), y = 2 + ((R() * (MAP_H - 4)) | 0);
    if (dist2(x, y, 20.5, 20.5) < 16) continue;
    const kind = R() < 0.72 ? 'bush' : 'rock';
    if (put(kind, x, y, 1, false, (R() * 3) | 0)) placed++;
  }
  // граница мира — стена из сосен
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) m[y][x] = 5;
  }
  return { map: m, ground, houses, trees, decor };
}

const WORLD = buildWorld();
const MAP = WORLD.map;
let ART = null;

const PLAYER_START = { wx: 20.5, wy: 20.5 };
// дверь дома незнакомца (мир): низ дома + центр
const NPC_HOUSE = { wx: SPECIAL_HOUSE[0] + 1, wy: SPECIAL_HOUSE[1] + 2.6 };

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

// NPC — ходят по улицам туда-обратно и останавливаются поболтать
const NPC_DEFS = [
  { start: { wx: 8,    wy: 9.5 },  a: { wx: 6,    wy: 9.5 },  b: { wx: 34,   wy: 9.5 },  speed: 1.4, type: 'man' },
  { start: { wx: 19.5, wy: 12 },   a: { wx: 19.5, wy: 11 },   b: { wx: 19.5, wy: 29 },   speed: 1.2, type: 'woman' },
  { start: { wx: 12,   wy: 19.5 }, a: { wx: 4,    wy: 19.5 }, b: { wx: 36,   wy: 19.5 }, speed: 1.9, type: 'kid' },
  { start: { wx: 10.5, wy: 14 },   a: { wx: 10.5, wy: 11 },   b: { wx: 10.5, wy: 29 },   speed: 0.9, type: 'old' },
  { start: { wx: 18,   wy: 30.5 }, a: { wx: 5,    wy: 30.5 }, b: { wx: 36,   wy: 30.5 }, speed: 1.5, type: 'worker' },
  { start: { wx: 30.5, wy: 15 },   a: { wx: 30.5, wy: 11 },   b: { wx: 30.5, wy: 29 },   speed: 1.3, type: 'girl' },
  { start: { wx: 19,   wy: 22.3 }, a: { wx: 18.5, wy: 22.3 }, b: { wx: 22.5, wy: 22.3 }, speed: 0.8, type: 'merchant' },
];


// ===== мелкие помощники отрисовки =====
// пиксельный эллипс (для теней и света): без сглаживания, только fillRect
function fillEll(ctx, cx, cy, rx, ry) {
  for (let j = -ry; j <= ry; j++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry + 0.0001))));
    ctx.fillRect(cx - w, cy + j, w * 2, 1);
  }
}
// форма тени от облака (в арт-пикселях)
const CLOUD_SHAPE = [[34, 24, 34, 12], [32, 22, 24, 22], [70, 26, 30, 14], [52, 40, 32, 12]];  // эллипсы: центр x,y и радиусы

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
      target: 'b', walkTimer: 0, walkFrame: 0, dir: 'down', moving: false, pause: 0, bubble: null,
    }));

    this.hintEl = document.getElementById('interact-hint');
    this.hintLabel = document.getElementById('interact-label');
    this.glitchInd = document.getElementById('glitch-indicator');
    this.glitchCountEl = document.getElementById('glitch-count');
    this.questValEl = document.getElementById('quest-val');
    this.gameScreenEl = document.getElementById('screen-game');

    this.art = ART || (ART = buildArt());
    this._buildStatics();
    this.vw = 480; this.vh = 270; this.time = 0;

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
    // Внутреннее «арт-разрешение» ~ 480x270, на экран растягивается ЦЕЛЫМ числом раз —
    // поэтому пиксели всегда чёткие и одинакового размера.
    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(cw * dpr));
    this.canvas.height = Math.max(1, Math.floor(ch * dpr));
    this.scale = Math.max(2, Math.round(Math.min(this.canvas.height / 260, this.canvas.width / 380)));
    this.vw = Math.ceil(this.canvas.width / this.scale);
    this.vh = Math.ceil(this.canvas.height / this.scale);
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    ISO.originX = Math.floor(this.vw / 2);
    ISO.originY = Math.floor(this.vh / 2);
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
      target: 'b', walkTimer: 0, walkFrame: 0, dir: 'down', moving: false, pause: 0, bubble: null,
    }));

    this._initAmbient();
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
          if (t === 1 || t === 3 || t === 5 || t === 6) { nearBlock = true; break; }
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
      this._updateAmbient(dt);
      this._updateParticles(dt);
      return;
    }

    const input = getInput();
    this.player.update(dt, input, MAP);
    if (consumeDodge() && this.player.dodge()) this._burstDust(this.player.wx, this.player.wy, 8);

    const camSpeed = 6;
    ISO.camX += (this.player.wx - ISO.camX) * Math.min(1, camSpeed * dt);
    ISO.camY += (this.player.wy - ISO.camY) * Math.min(1, camSpeed * dt);

    this._updateGlitches(dt);
    this._updateNPCs(dt);
      this._updateAmbient(dt);

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
        size: 1 + Math.floor(Math.random() * 2),
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

  // ===== ВИЗУАЛЬНАЯ ЧАСТЬ: статические объекты =====
  _buildStatics() {
    const A = this.art, S = [];
    const pick = (arr, v) => arr[v % arr.length];
    for (const h of WORLD.houses) {
      const spr = pick(A.houses[h.style], h.v);
      const left = (h.tx - 0.5) * TILE, bottom = (h.ty + 2.5) * TILE;
      S.push({ kind: 'house', spr, px: left - 4, py: bottom - 56, w: 56, h: 57, depth: h.ty + 2.5, house: h,
        shadow: { type: 'house', l: left, r: left + 48, t: bottom - 48, b: bottom } });
    }
    for (const t of WORLD.trees) {
      const spr = pick(A.trees[t.kind], t.v);
      const left = (t.tx - 0.5) * TILE, bottom = (t.ty + 1.5) * TILE;
      S.push({ kind: 'tree', spr, px: left - 3, py: bottom - 44, w: 38, h: 46, depth: t.ty + 1.5,
        shadow: { type: 'ell', x: left + 16, y: bottom - 2, rx: 17, ry: 5 } });
    }
    for (const d of WORLD.decor) {
      let spr = A.decor[d.kind];
      if (Array.isArray(spr)) spr = pick(spr, d.v);
      const cx = d.tx * TILE + (d.w - 1) * (TILE / 2);
      const bottom = (d.ty + 0.5) * TILE;
      S.push({ kind: 'decor', dk: d.kind, spr, px: Math.floor(cx - spr.width / 2), py: bottom - spr.height + 1,
        w: spr.width, h: spr.height, depth: d.ty + 0.5,
        shadow: { type: 'ell', x: cx, y: bottom - 1, rx: Math.max(5, spr.width * 0.42), ry: 3 } });
    }
    // лес: граница мира и всё, что за ней
    for (let ty = -14; ty < MAP_H + 14; ty++) for (let tx = -14; tx < MAP_W + 14; tx++) {
      const inb = tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H;
      const ring = tx === 0 || ty === 0 || tx === MAP_W - 1 || ty === MAP_H - 1;
      if (inb && !ring) continue;
      const hh = hash2(tx, ty);
      const oob = !inb;
      if (oob && hh % 100 > 62) continue;
      const jx = oob ? (hh % 7) - 3 : (hh % 5) - 2;
      const spr = A.pine[hh % A.pine.length];
      S.push({ kind: 'pine', spr, px: tx * TILE - 9 + jx, py: (ty + 0.5) * TILE - 31, w: 18, h: 32, depth: ty + 0.5 + (hh % 10) * 0.001,
        shadow: { type: 'ell', x: tx * TILE + jx, y: (ty + 0.5) * TILE - 1, rx: 7, ry: 2 } });
    }
    this.statics = S;
  }

  // ===== ЖИВОЙ МИР =====
  _initAmbient() {
    const r = rng(1234);
    this.time = 0;
    this.smoke = []; this.smokeT = 0; this.stepT = 0;
    this.leaves = Array.from({ length: 44 }, () => ({
      wx: r() * MAP_W, wy: r() * MAP_H, ph: r() * 6.28, c: ['#6fbf45', '#e0922f', '#f2c84a', '#8fd25a'][(r() * 4) | 0],
    }));
    const wingCols = [['#ffd84a', '#ffb02a'], ['#ff8ab0', '#e0527a'], ['#8fd0ff', '#4a90d8'], ['#ffffff', '#c8c8d8']];
    this.flies = [];
    for (let i = 0; i < 12; i++) {
      const wx = 3 + r() * 34, wy = 3 + r() * 34;
      this.flies.push({ wx, wy, a: r() * 6.28, ph: r() * 6.28, col: wingCols[(r() * 4) | 0] });
    }
    this.chickens = [];
    for (let tries = 0; tries < 300 && this.chickens.length < 8; tries++) {
      const h = WORLD.houses[(r() * WORLD.houses.length) | 0];
      const wx = h.tx + 1 + (r() - 0.5) * 7, wy = h.ty + 3.5 + r() * 3;
      if (!canMoveTo(MAP, wx, wy, 0.3)) continue;
      this.chickens.push({ wx, wy, dir: r() < 0.5 ? 'left' : 'right', st: 'idle', t: 0.5 + r() * 2, vx: 0, vy: 0, fr: 0, ft: 0 });
    }
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ wx: -10 + i * 14 + r() * 6, wy: 2 + r() * 36, sp: 0.35 + r() * 0.25 }));
  }

  _burstDust(wx, wy, n = 6, col = '#e8e4cc') {
    for (let i = 0; i < n; i++) {
      this.smoke.push({ kind: 'dust', wx: wx + (Math.random() - 0.5) * 0.5, wy: wy + 0.1, z: 1 + Math.random() * 2,
        vz: 6 + Math.random() * 8, vx: (Math.random() - 0.5) * 1.6, life: 0.4 + Math.random() * 0.2, max: 0.55, size: 2, col });
    }
  }

  _updateAmbient(dt) {
    this.time += dt;
    const p = this.player;

    // дым из труб
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.5;
      for (const s of this.statics) {
        if (s.kind !== 'house' || dist2(s.house.tx, s.house.ty, p.wx, p.wy) > 28 * 28) continue;
        if (Math.random() < 0.75) {
          this.smoke.push({ kind: 'smoke', wx: (s.px + 42.5) / TILE, wy: (s.py + 3) / TILE, z: 0, vz: 7 + Math.random() * 3,
            vx: 0.25 + Math.random() * 0.2, life: 2.6, max: 2.6, size: 3, col: '#e9e5dc' });
        }
      }
    }
    // следы при ходьбе
    if (p.moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = p.dodgeTimer > 0 ? 0.07 : 0.2;
        this._burstDust(p.wx, p.wy + 0.1, 1, '#d9e8c4');
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const q = this.smoke[i];
      q.life -= dt; q.z += q.vz * dt; q.wx += (q.vx + (q.kind === 'smoke' ? Math.sin(this.time + q.z * 0.1) * 0.15 : 0)) * dt;
      if (q.life <= 0) this.smoke.splice(i, 1);
    }

    // листья на ветру
    for (const l of this.leaves) {
      l.wx += (1.3 + Math.sin(this.time * 0.7 + l.ph) * 0.5) * dt;
      l.wy += (0.45 + Math.cos(this.time * 1.3 + l.ph) * 0.35) * dt;
      if (l.wx > MAP_W) l.wx -= MAP_W; if (l.wy > MAP_H) l.wy -= MAP_H;
    }
    // бабочки
    for (const f of this.flies) {
      f.a += (Math.random() - 0.5) * 7 * dt;
      f.wx += Math.cos(f.a) * 0.9 * dt; f.wy += Math.sin(f.a) * 0.9 * dt;
      if (f.wx < 2 || f.wx > MAP_W - 2 || f.wy < 2 || f.wy > MAP_H - 2) f.a += Math.PI * 0.9;
    }
    // облака
    for (const c of this.clouds) { c.wx += c.sp * dt; if (c.wx > MAP_W + 14) c.wx = -14; }

    // куры
    for (const c of this.chickens) {
      c.t -= dt; c.ft += dt;
      const dp = dist2(c.wx, c.wy, p.wx, p.wy);
      if (dp < 2.1 * 2.1 && c.st !== 'flee') {
        const d = Math.hypot(c.wx - p.wx, c.wy - p.wy) || 1;
        c.vx = (c.wx - p.wx) / d * 2.7; c.vy = (c.wy - p.wy) / d * 2.7; c.st = 'flee'; c.t = 0.7;
      }
      if (c.t <= 0) {
        if (Math.random() < 0.5) { c.st = 'idle'; c.t = 1 + Math.random() * 2.5; c.vx = c.vy = 0; }
        else { const a = Math.random() * 6.28; c.st = 'walk'; c.t = 0.6 + Math.random() * 1.2; c.vx = Math.cos(a) * 0.8; c.vy = Math.sin(a) * 0.8; }
      }
      if (c.st === 'walk' || c.st === 'flee') {
        const nx = c.wx + c.vx * dt, ny = c.wy + c.vy * dt;
        if (canMoveTo(MAP, nx, c.wy, 0.28)) c.wx = nx; else c.vx = -c.vx;
        if (canMoveTo(MAP, c.wx, ny, 0.28)) c.wy = ny; else c.vy = -c.vy;
        if (Math.abs(c.vx) > 0.05) c.dir = c.vx < 0 ? 'left' : 'right';
        c.fr = Math.floor(c.ft * 10) % 2;
      } else {
        c.fr = Math.floor(c.ft * 3 + c.wx) % 3 === 0 ? 1 : 0;   // клюёт
      }
    }
  }

  _updateNPCs(dt) {
    for (const n of this.npcs) {
      if (n.pause > 0) {
        n.pause -= dt; n.moving = false;
        if (n.bubble) { n.bubble.t -= dt; if (n.bubble.t <= 0) n.bubble = null; }
        continue;
      }
      const tgt = n.target === 'a' ? n.a : n.b;
      const dx = tgt.wx - n.wx, dy = tgt.wy - n.wy;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1) {
        n.target = n.target === 'a' ? 'b' : 'a';
        n.moving = false;
        n.pause = 0.8 + Math.random() * 2.4;
        n.dir = 'down';
        n.bubble = Math.random() < 0.65 ? { kind: ['dots', 'excl', 'note', 'heart'][(Math.random() * 4) | 0], t: n.pause } : null;
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

  // ===== РЕНДЕР =====
  render() {
    const ctx = this.ctx, A = this.art, vw = this.vw, vh = this.vh, t = this.time || 0;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1d4220';
    ctx.fillRect(0, 0, vw, vh);

    const camPx = Math.round(ISO.camX * TILE), camPy = Math.round(ISO.camY * TILE);
    const ox = ISO.originX - camPx, oy = ISO.originY - camPy;      // мир(px) -> экран(px)
    const tx0 = Math.floor((camPx - ISO.originX) / TILE) - 1, tx1 = Math.ceil((camPx + vw - ISO.originX) / TILE) + 1;
    const ty0 = Math.floor((camPy - ISO.originY) / TILE) - 1, ty1 = Math.ceil((camPy + vh - ISO.originY) / TILE) + 1;

    // --- 1. земля ---
    const sides = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]];
    const gAt = (x, y) => (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H ? WORLD.ground[y][x] : 4);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const sx = tx * TILE - 8 + ox, sy = ty * TILE - 8 + oy;
        const g = gAt(tx, ty), hh = hash2(tx, ty);
        if (g === 0) ctx.drawImage(A.cobble[hh % 4], sx, sy);
        else if (g === 7) ctx.drawImage(A.dirt[hh % 3], sx, sy);
        else if (g === 6) ctx.drawImage(A.water[Math.floor(t * 2.2 + (hh % 3)) % 3], sx, sy);
        else {
          const forest = tx <= 0 || ty <= 0 || tx >= MAP_W - 1 || ty >= MAP_H - 1;
          const fm = Math.floor(t * 2 + (hh % 4) * 0.25) % 2;
          const img = (!forest && hh % 100 < 12) ? A.flower[hh % 3][fm] : A.grass[hh % 6][fm];
          ctx.drawImage(img, sx, sy);
          if (forest) { ctx.globalAlpha = 0.42; ctx.fillStyle = '#06200c'; ctx.fillRect(sx, sy, TILE, TILE); ctx.globalAlpha = 1; }
        }
        if (g === 0 || g === 7 || g === 6) {
          const key = g === 0 ? 'cobble' : g === 7 ? 'dirt' : 'water';
          for (const [s, dx, dy] of sides) {
            const ng = gAt(tx + dx, ty + dy);
            const need = g === 6 ? ng !== 6 : (ng === 4 || ng === 6);
            if (need) ctx.drawImage(A.rim[key + s], sx, sy);
          }
        }
      }
    }

    // --- 2. тени и плоские эффекты на земле ---
    const vis = [];
    for (const s of this.statics) {
      const sx = s.px + ox, sy = s.py + oy;
      if (sx > vw + 8 || sy > vh + 8 || sx + s.w < -8 || sy + s.h < -8) continue;
      vis.push(s);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    for (const s of vis) {
      const sh = s.shadow; if (!sh) continue;
      if (sh.type === 'house') {
        ctx.fillRect(sh.l + 4 + ox, sh.b - 1 + oy, 52, 4);
        ctx.fillRect(sh.r + ox, sh.t + 8 + oy, 6, 44);
      } else fillEll(ctx, Math.round(sh.x + ox), Math.round(sh.y + oy), Math.round(sh.rx), sh.ry);
    }
    for (const g of this.glitches) if (g.state !== 'gone') this._drawGlitch(g);

    // --- 3. объекты по глубине ---
    const objs = vis.slice();
    for (const n of this.npcs) objs.push({ kind: 'npc', n, depth: n.wy });
    for (const c of this.chickens) objs.push({ kind: 'chicken', c, depth: c.wy });
    objs.push({ kind: 'player', depth: this.player.wy });
    objs.sort((a, b) => a.depth - b.depth);

    // тени персонажей — прямо под ними
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const o of objs) {
      if (o.kind === 'npc' || o.kind === 'player') {
        const e = o.kind === 'npc' ? o.n : this.player;
        const { x, y } = worldToScreen(e.wx, e.wy);
        fillEll(ctx, x, y - 1, 5, 2);
      } else if (o.kind === 'chicken') {
        const { x, y } = worldToScreen(o.c.wx, o.c.wy);
        fillEll(ctx, x, y - 1, 4, 1);
      }
    }

    for (const o of objs) {
      if (o.spr) {
        const sx = o.px + ox, sy = o.py + oy;
        ctx.drawImage(o.spr, sx, sy);
        if (o.kind === 'house' && o.house.special && this.allBugsFound) this._drawDoorGlow(sx, sy);
      } else if (o.kind === 'player') this._drawPlayer();
      else if (o.kind === 'npc') this._drawNPC(o.n);
      else if (o.kind === 'chicken') {
        const { x, y } = worldToScreen(o.c.wx, o.c.wy);
        ctx.drawImage(A.chicken[o.c.dir === 'left' ? 0 : 1][o.c.fr], x - 6, y - 10);
      }
    }

    // --- 4. баги (поверх деревьев) ---
    for (const b of this.bugs) if (!b.found) this._drawBug(b);

    // --- 5. верхний слой ---
    // свет фонарей
    for (const s of vis) {
      if (s.dk !== 'lamp') continue;
      const cx = s.px + 5 + ox, cy = s.py + 6 + oy;
      const fl = 0.07 + 0.03 * Math.sin(t * 5 + s.px);
      ctx.fillStyle = '#ffd35a';
      ctx.globalAlpha = fl; fillEll(ctx, cx, cy + 14, 30, 16);
      ctx.globalAlpha = fl * 1.2; fillEll(ctx, cx, cy + 14, 18, 10);
      ctx.globalAlpha = 1;
    }
    // дым и пыль
    for (const q of this.smoke) {
      const { x, y } = worldToScreen(q.wx, q.wy);
      const k = 1 - q.life / q.max;
      const sz = Math.round(q.size + k * (q.kind === 'smoke' ? 4 : 1));
      ctx.globalAlpha = Math.max(0, (1 - k) * (q.kind === 'smoke' ? 0.7 : 0.8));
      ctx.fillStyle = q.col;
      const px = x - (sz >> 1), py = Math.round(y - q.z) - (sz >> 1);
      if (sz >= 3) { ctx.fillRect(px + 1, py, sz - 2, sz); ctx.fillRect(px, py + 1, sz, sz - 2); } else ctx.fillRect(px, py, sz, sz);
    }
    ctx.globalAlpha = 1;
    // листья
    for (const l of this.leaves) {
      const { x, y } = worldToScreen(l.wx, l.wy);
      if (x < -4 || y < -20 || x > vw + 4 || y > vh + 20) continue;
      const yy = y - 12 + Math.round(Math.sin(t * 3 + l.ph) * 3);
      ctx.fillStyle = l.c; ctx.fillRect(x, yy, 2, 1); ctx.fillRect(x + 1, yy + 1, 1, 1);
    }
    // бабочки
    for (const f of this.flies) {
      const { x, y } = worldToScreen(f.wx, f.wy);
      if (x < -6 || y < -20 || x > vw + 6 || y > vh + 20) continue;
      const yy = y - 9 + Math.round(Math.sin(t * 4 + f.ph) * 2);
      const open = Math.floor(t * 9 + f.ph) % 2 === 0;
      ctx.fillStyle = f.col[0];
      if (open) { ctx.fillRect(x - 2, yy - 1, 2, 2); ctx.fillRect(x + 1, yy - 1, 2, 2); ctx.fillStyle = f.col[1]; ctx.fillRect(x - 2, yy + 1, 1, 1); ctx.fillRect(x + 2, yy + 1, 1, 1); }
      else { ctx.fillRect(x - 1, yy - 2, 1, 3); ctx.fillRect(x + 1, yy - 2, 1, 3); }
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(x, yy - 1, 1, 3);
    }
    this._drawParticles();
    // пузыри над NPC
    for (const n of this.npcs) if (n.bubble) this._drawBubble(n);
    // стрелка над домом незнакомца
    if (this.allBugsFound) this._drawHouseMarker(ox, oy);
    // тени облаков
    ctx.globalAlpha = 0.11; ctx.fillStyle = '#06122a';
    for (const c of this.clouds) {
      for (const [rx, ry, ew, eh] of CLOUD_SHAPE) fillEll(ctx, Math.round(c.wx * TILE + rx + ox), Math.round(c.wy * TILE + ry + oy), ew, eh);
    }
    ctx.globalAlpha = 1;
  }

  _drawDoorGlow(sx, sy) {
    const ctx = this.ctx, p = 0.22 + 0.16 * Math.sin(this.time * 4);
    ctx.globalAlpha = p; ctx.fillStyle = '#ffe48a';
    ctx.fillRect(sx + 24, sy + 46, 8, 10);
    ctx.globalAlpha = p * 0.6; fillEll(ctx, sx + 28, sy + 58, 14, 5);
    ctx.globalAlpha = 1;
  }

  _drawHouseMarker(ox, oy) {
    const ctx = this.ctx;
    const h = WORLD.houses.find((x) => x.special);
    const left = (h.tx - 0.5) * TILE + ox, top = (h.ty - 0.5) * TILE + oy;
    const bob = Math.round(Math.sin(this.time * 4) * 2);
    const x = Math.round(left + 24), y = Math.round(top - 14 + bob);
    ctx.fillStyle = '#2a1a14';
    for (let i = 0; i < 6; i++) ctx.fillRect(x - 6 + i, y + i - 1, 13 - i * 2, 3);
    ctx.fillRect(x - 3, y - 7, 7, 8);
    ctx.fillStyle = '#ffd35a';
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 5 + i, y + i, 11 - i * 2, 1);
    ctx.fillRect(x - 2, y - 6, 5, 6);
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(x - 2, y - 6, 1, 6);
  }

  _drawBubble(n) {
    const ctx = this.ctx, t = this.time;
    const { x, y } = worldToScreen(n.wx, n.wy);
    const by = y - (n.type === 'kid' || n.type === 'girl' ? 17 : 22);
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 7, by - 9, 15, 9); ctx.fillRect(x - 1, by, 3, 1); ctx.fillRect(x, by + 1, 1, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 6, by - 8, 13, 7); ctx.fillRect(x, by - 1, 1, 1);
    const k = n.bubble.kind;
    if (k === 'dots') {
      const ph = Math.floor(t * 3) % 3;
      ctx.fillStyle = '#2a1a14';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 3 + i * 3, by - 5 - (i === ph ? 1 : 0), 1, 1);
    } else if (k === 'excl') {
      ctx.fillStyle = '#d8352a'; ctx.fillRect(x, by - 7, 1, 4); ctx.fillRect(x, by - 2, 1, 1);
    } else if (k === 'note') {
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(x + 1, by - 7, 1, 5); ctx.fillRect(x - 1, by - 4, 2, 2); ctx.fillRect(x + 2, by - 7, 2, 1);
    } else {
      ctx.fillStyle = '#e0527a';
      ctx.fillRect(x - 3, by - 7, 2, 1); ctx.fillRect(x + 1, by - 7, 2, 1);
      ctx.fillRect(x - 3, by - 6, 7, 2); ctx.fillRect(x - 2, by - 4, 5, 1); ctx.fillRect(x - 1, by - 3, 3, 1);
    }
  }

  _drawGlitch(g) {
    const ctx = this.ctx;
    const { x, y } = worldToScreen(g.wx, g.wy);
    let alpha = 1;
    if (g.state === 'fadein') alpha = Math.min(1, g.age / GLITCH_FADE);
    else if (g.state === 'alive' && g.age > GLITCH_FADE + GLITCH_LIFE - GLITCH_FADE) {
      alpha = Math.max(0, (GLITCH_FADE + GLITCH_LIFE - g.age) / GLITCH_FADE);
    }
    const flick = 0.65 + 0.35 * Math.abs(Math.sin(performance.now() / 200 + g.wx));
    const r = rng(Math.floor(this.time * 12) + ((g.wx * 13) | 0));
    ctx.save();
    ctx.globalAlpha = alpha * flick;
    for (let j = -8; j < 8; j++) for (let i = -8; i < 8; i++) {
      if ((i + 0.5) * (i + 0.5) + (j + 0.5) * (j + 0.5) > 64) continue;
      const v = r();
      ctx.fillStyle = v < 0.34 ? '#ff5c7a' : v < 0.56 ? '#c8384f' : v < 0.74 ? '#6ee7ff' : v < 0.86 ? '#1a0a14' : '#ffffff';
      ctx.fillRect(x + i * 2, y + j * 2, 2, 2);
    }
    ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 18 + ((r() * 12) | 0), y - 16 + ((r() * 32) | 0), 10 + ((r() * 14) | 0), 1);
    ctx.restore();
  }

  _drawBug(b) {
    const ctx = this.ctx, t = this.time;
    const { x, y } = worldToScreen(b.wx, b.wy);
    const r = rng(Math.floor(t * 9) + ((b.wx * 7) | 0));
    const cols = ['#ff5c7a', '#6ee7ff', '#ffffff', '#1a1f2e'];
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.globalAlpha = 0.9;
    for (let n = 0; n < 24; n++) {
      ctx.fillStyle = cols[(r() * 4) | 0];
      ctx.fillRect(x - 8 + ((r() * 8) | 0) * 2, y - 14 + ((r() * 8) | 0) * 2, 2, 2);
    }
    for (let n = 0; n < 3; n++) {
      ctx.fillStyle = r() < 0.5 ? '#ff5c7a' : '#6ee7ff';
      ctx.fillRect(x - 12 + ((r() * 8) | 0), y - 14 + ((r() * 16) | 0), 8 + ((r() * 12) | 0), 1);
    }
    ctx.globalAlpha = 0.45 + 0.45 * pulse; ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 9, y - 15, 18, 1); ctx.fillRect(x - 9, y + 1, 18, 1); ctx.fillRect(x - 9, y - 15, 1, 17); ctx.fillRect(x + 8, y - 15, 1, 17);
    ctx.globalAlpha = 1;
    const bob = Math.round(Math.sin(t * 4) * 2);
    ctx.fillStyle = '#2a1a14'; ctx.fillRect(x - 2, y - 30 + bob, 4, 9); ctx.fillRect(x - 2, y - 19 + bob, 4, 3);
    ctx.fillStyle = '#ffd35a'; ctx.fillRect(x - 1, y - 29 + bob, 2, 7); ctx.fillRect(x - 1, y - 18 + bob, 2, 1);
  }

  _drawNPC(n) {
    const { x, y } = worldToScreen(n.wx, n.wy);
    const wf = n.moving ? (n.walkFrame ? 1 : 2) : 0;
    this.ctx.drawImage(this.art.people[n.type || 'man'][n.dir || 'down'][wf], x - 7, y - 19);
  }

  _drawPlayer() {
    const { x, y } = worldToScreen(this.player.wx, this.player.wy);
    const fr = this.art.people.alex[this.player.dir] || this.art.people.alex.down;
    const f = !this.player.moving ? 0 : (this.player.walkFrame ? 1 : 2);
    this.ctx.drawImage(fr[f], x - 7, y - 19);
  }

  _drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const { x, y } = worldToScreen(p.wx, p.wy);
      const py = y - p.z * TILE;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillRect(Math.floor(x), Math.floor(py), p.size, p.size);
    }
    ctx.globalAlpha = 1;
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