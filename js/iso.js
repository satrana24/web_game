// iso.js
export const ISO = {
  tileW: 96,
  tileH: 48,
  originX: 0,
  originY: 0,
  camX: 0,   // мировой центр камеры
  camY: 0,
};

export function worldToScreen(wx, wy) {
  const dx = wx - ISO.camX;
  const dy = wy - ISO.camY;
  const sx = (dx - dy) * (ISO.tileW / 2) + ISO.originX;
  const sy = (dx + dy) * (ISO.tileH / 2) + ISO.originY;
  return { x: sx, y: sy };
}

export function screenToWorld(sx, sy) {
  const x = sx - ISO.originX;
  const y = sy - ISO.originY;
  const wx = (x / (ISO.tileW / 2) + y / (ISO.tileH / 2)) / 2 + ISO.camX;
  const wy = (y / (ISO.tileH / 2) - x / (ISO.tileW / 2)) / 2 + ISO.camY;
  return { wx, wy };
}