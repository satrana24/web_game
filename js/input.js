// input.js
const state = {
  up: false, down: false, left: false, right: false,
  interact: false,     // "нажатие" (одноразовый триггер)
  dodge: false,        // Space
  _interactPressed: false,
  _dodgePressed: false,
};

const keyMap = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyE: 'interact',
  Space: 'dodge',
};

export function initInput(canvas, onPauseToggle, onEsc) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { onEsc?.(); return; }
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    if (action === 'interact' && !state.interact) state._interactPressed = true;
    if (action === 'dodge' && !state.dodge) state._dodgePressed = true;
    state[action] = true;
  });

  window.addEventListener('keyup', (e) => {
    const action = keyMap[e.code];
    if (!action) return;
    e.preventDefault();
    state[action] = false;
  });

  // Тач
  document.querySelectorAll('.dpad .tbtn').forEach((btn) => {
    const dir = btn.dataset.dir;
    const on = (e) => { e.preventDefault(); state[dir] = true; };
    const off = (e) => { e.preventDefault(); state[dir] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });

  const eBtn = document.getElementById('touch-e');
  const sBtn = document.getElementById('touch-space');
  eBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!state.interact) state._interactPressed = true; state.interact = true; });
  eBtn.addEventListener('pointerup', () => { state.interact = false; });
  sBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!state.dodge) state._dodgePressed = true; state.dodge = true; });
  sBtn.addEventListener('pointerup', () => { state.dodge = false; });

  // Сброс клавиш при потере фокуса
  window.addEventListener('blur', () => resetInput());
}

export function resetInput() {
  state.up = state.down = state.left = state.right = false;
  state.interact = state.dodge = false;
  state._interactPressed = state._dodgePressed = false;
}

export function getInput() {
  return {
    up: state.up, down: state.down, left: state.left, right: state.right,
    interact: state.interact, dodge: state.dodge,
  };
}

// Одноразовые триггеры — возвращают true один раз на нажатие
export function consumeInteract() {
  if (state._interactPressed) { state._interactPressed = false; return true; }
  return false;
}
export function consumeDodge() {
  if (state._dodgePressed) { state._dodgePressed = false; return true; }
  return false;
}