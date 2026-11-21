// collision.js
export function isWalkable(map, wx, wy) {
  const cx = Math.round(wx);
  const cy = Math.round(wy);
  if (cy < 0 || cy >= map.length) return false;
  if (cx < 0 || cx >= map[0].length) return false;
  const t = map[cy][cx];
  // 0 — брусчатка, 2 — глитч, 4 — трава, 7 — тропинка: проходимы
  // 1 дом, 3 дерево, 5 предмет/кусты, 6 вода — нет
  return t === 0 || t === 2 || t === 4 || t === 7;
}

export function canMoveTo(map, wx, wy, radius = 0.35) {
  const points = [
    [wx + radius, wy], [wx - radius, wy],
    [wx, wy + radius], [wx, wy - radius],
  ];
  for (const [px, py] of points) {
    if (!isWalkable(map, px, py)) return false;
  }
  return true;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}