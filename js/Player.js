// Player.js
import { canMoveTo } from './collision.js';

export class Player {
  constructor(wx, wy) {
    this.wx = wx;
    this.wy = wy;
    this.speed = 2.6;
    this.radius = 0.32;
    this.dir = 'down';       // 'down' | 'up' | 'left' | 'right'
    this.moving = false;
    this.walkFrame = 0;       // 0 или 1
    this.walkTimer = 0;
    this.dodgeTimer = 0;
  }

  update(dt, input, map) {
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    this.moving = (dx !== 0 || dy !== 0);

    if (this.moving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      this.dir = this._dirFromVec(dx, dy);

      // анимация ходьбы
      this.walkTimer += dt;
      if (this.walkTimer > 0.15) {
        this.walkTimer = 0;
        this.walkFrame = 1 - this.walkFrame;
      }
    } else {
      this.walkFrame = 0;
      this.walkTimer = 0;
    }

    let mult = 1;
    if (this.dodgeTimer > 0) { mult = 1.8; this.dodgeTimer -= dt; }

    const nx = this.wx + dx * this.speed * mult * dt;
    const ny = this.wy + dy * this.speed * mult * dt;

    if (canMoveTo(map, nx, this.wy, this.radius)) this.wx = nx;
    if (canMoveTo(map, this.wx, ny, this.radius)) this.wy = ny;
  }

  dodge() {
    if (this.dodgeTimer > 0) return false;
    this.dodgeTimer = 0.35;
    return true;
  }

  _dirFromVec(dx, dy) {
    // в изометрии экранные оси не совпадают с мировыми, но для простоты
    // берём доминирующую ось — направление "взгляда" так читается нормально
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }
}