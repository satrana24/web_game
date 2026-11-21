// iso.js — камера и проекция.
// Файл называется так же, чтобы не менять импорты, но теперь вид СВЕРХУ (top-down):
// 1 клетка мира = TILE пикселей «арта». Сам арт потом растягивается целым числом раз.
export const TILE = 16;

export const ISO = {
  tileW: TILE,
  tileH: TILE,
  originX: 0,   // экранная позиция центра камеры (в арт-пикселях)
  originY: 0,
  camX: 0,      // мировой центр камеры
  camY: 0,
};

// мир -> экран (целые арт-пиксели, чтобы ничего не «плыло»)
export function worldToScreen(wx, wy) {
  return {
    x: Math.round(wx * TILE) - Math.round(ISO.camX * TILE) + ISO.originX,
    y: Math.round(wy * TILE) - Math.round(ISO.camY * TILE) + ISO.originY,
  };
}

export function screenToWorld(sx, sy) {
  return {
    wx: (sx - ISO.originX) / TILE + ISO.camX,
    wy: (sy - ISO.originY) / TILE + ISO.camY,
  };
}
