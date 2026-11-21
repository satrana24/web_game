// main.js
import { Game } from './Game.js';
import { initInput } from './input.js';
import {
  INTRO_SCENE, ENDING_YES_SCENE, ENDING_NO_SCENE,
  NPC_DIALOG, GLITCH_DEATH_SCENE,
} from './story.js';

const screens = {
  menu: document.getElementById('screen-menu'),
  cutscene: document.getElementById('screen-cutscene'),
  game: document.getElementById('screen-game'),
};
function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ===== КАТ-СЦЕНА =====
class Cutscene {
  constructor(textEl, nextBtn) {
    this.textEl = textEl;
    this.nextBtn = nextBtn;
    this.lines = [];
    this.lineIdx = 0;
    this.charIdx = 0;
    this.typing = false;
    this.timer = null;
    this.onDone = null;
    this.onSkip = null;
    this.active = false;

    this.nextBtn.addEventListener('click', () => this._advance());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.active && this.onSkip) this.onSkip();
    });
  }

  play(lines, onDone, onSkip) {
    this.lines = lines;
    this.lineIdx = 0;
    this.charIdx = 0;
    this.onDone = onDone;
    this.onSkip = onSkip;
    this.active = true;
    this.nextBtn.classList.add('hidden');
    this._typeLine();
  }

  stop() {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.typing = false;
  }

  _typeLine() {
    if (this.lineIdx >= this.lines.length) {
      this.typing = false;
      this.nextBtn.classList.remove('hidden');
      return;
    }
    const line = this.lines[this.lineIdx];
    this.charIdx = 0;
    this.textEl.textContent = '';
    this.typing = true;
    this.timer = setInterval(() => {
      if (this.charIdx >= line.length) {
        clearInterval(this.timer);
        this.typing = false;
        this.nextBtn.classList.remove('hidden');
        return;
      }
      this.textEl.textContent += line[this.charIdx++];
    }, 22);
  }

  _advance() {
    if (this.typing) {
      clearInterval(this.timer);
      this.textEl.textContent = this.lines[this.lineIdx];
      this.typing = false;
      this.nextBtn.classList.remove('hidden');
      return;
    }
    this.lineIdx++;
    this.nextBtn.classList.add('hidden');
    if (this.lineIdx >= this.lines.length) {
      this.active = false;
      this.onDone?.();
      return;
    }
    this._typeLine();
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
let game = null;
const canvas = document.getElementById('game-canvas');
const bugCountEl = document.getElementById('bug-count');
const recordEl = document.getElementById('record-val');

const cutscene = new Cutscene(
  document.getElementById('cutscene-text'),
  document.getElementById('btn-cutscene-next')
);

// VN-элементы
const vnDialogEl = document.getElementById('vn-dialog');
const vnNameEl = document.getElementById('vn-name');
const vnTextEl = document.getElementById('vn-text');
const vnChoices = document.getElementById('vn-choices');
const vnHint = document.getElementById('vn-hint');
const vnYes = document.getElementById('vn-yes');
const vnNo = document.getElementById('vn-no');

function showNPCVN() {
  vnNameEl.textContent = 'НЕЗНАКОМЕЦ';
  vnTextEl.textContent = NPC_DIALOG;
  vnHint.classList.add('hidden');
  vnChoices.classList.remove('hidden');
  vnDialogEl.classList.remove('hidden');
}
function hideNPCVN() {
  vnChoices.classList.add('hidden');
  vnHint.classList.remove('hidden');
  vnDialogEl.classList.add('hidden');
  vnNameEl.textContent = 'АЛЕКС';
}

vnYes.addEventListener('click', () => {
  hideNPCVN();
  if (game) game.closeDialog?.();
  saveWinRecordAndFinish(
    ENDING_YES_SCENE,
    'ПРОБУЖДЕНИЕ',
    'Алекс вышел. Но реальность оказалась хуже симуляции.',
    true
  );
});
vnNo.addEventListener('click', () => {
  hideNPCVN();
  if (game) game.closeDialog?.();
  saveWinRecordAndFinish(
    ENDING_NO_SCENE,
    'СИМУЛЯЦИЯ',
    'Алекс выбрал покой. Мир снова стал идеальным.',
    false
  );
});

// ===== СТАРТ ИГРЫ =====
function startGame() {
  show('game');
  if (!game) {
    game = new Game(canvas, {
      onBugFound: (n) => { bugCountEl.textContent = String(n); },
      onQuestUpdate: () => {},
      onDialogOpen: () => { showNPCVN(); },
      onGlitchDeath: () => {
        if (game) game.closeDialog?.();
        endGameWithCutscene(
          GLITCH_DEATH_SCENE,
          'СИСТЕМА НЕСТАБИЛЬНА',
          'Помехи разрушили симуляцию вокруг Алекса.'
        );
      },
    });
  }
  bugCountEl.textContent = '0';
  const rec = game._loadRecord();
  recordEl.textContent = rec !== null ? formatTime(rec) : '—';
  document.getElementById('end-overlay').classList.add('hidden');
  document.getElementById('glitch-count').textContent = '0';
  game.start();
}

function endGameWithCutscene(lines, title, desc) {
  if (game) game.closeDialog?.();
  document.getElementById('pause-overlay').classList.add('hidden');
  show('cutscene');
  cutscene.play(lines, () => {
    show('game');
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-desc').textContent = desc;
    document.getElementById('end-overlay').classList.remove('hidden');
  }, () => {
    show('game');
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-desc').textContent = desc;
    document.getElementById('end-overlay').classList.remove('hidden');
  });
}

function saveWinRecordAndFinish(endingLines, title, desc, isRealWin) {
  if (isRealWin && game) {
    const rec = game._saveRecord(game.elapsed);
    recordEl.textContent = formatTime(rec);
  }
  endGameWithCutscene(endingLines, title, desc);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ===== МЕНЮ =====
document.getElementById('btn-start').addEventListener('click', () => {
  show('cutscene');
  cutscene.play(INTRO_SCENE, () => {
    startGame();
  }, () => {
    startGame();
  });
});

// ===== ПАУЗА / РЕСТАРТ / МЕНЮ =====
document.getElementById('btn-pause').addEventListener('click', () => game?.pause());
document.getElementById('btn-resume').addEventListener('click', () => game?.resume());
document.getElementById('btn-restart').addEventListener('click', restart);
document.getElementById('btn-pause-restart').addEventListener('click', restart);
document.getElementById('btn-end-restart').addEventListener('click', restart);
document.getElementById('btn-pause-menu').addEventListener('click', goToMenu);
document.getElementById('btn-end-menu').addEventListener('click', goToMenu);

function restart() {
  if (game) game.destroy();
  game = null;
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('end-overlay').classList.add('hidden');
  document.getElementById('glitch-indicator').classList.add('hidden');
  hideNPCVN();
  bugCountEl.textContent = '0';
  startGame();
}

function goToMenu() {
  if (game) { game.destroy(); game = null; }
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('end-overlay').classList.add('hidden');
  document.getElementById('glitch-indicator').classList.add('hidden');
  hideNPCVN();
  bugCountEl.textContent = '0';
  show('menu');
}

// ===== ВВОД =====
initInput(canvas, () => {
  if (game?.state === 'playing') game.pause();
}, () => {
  if (screens.game.classList.contains('active') && game?.state === 'playing') {
    game.pause();
  }
});

// мобилки
if (matchMedia('(pointer: coarse)').matches) {
  document.getElementById('touch-controls').classList.remove('hidden');
}

show('menu');