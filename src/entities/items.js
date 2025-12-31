import { rectCollision } from "../core/collision.js";

export class Coin {
  constructor(x, y, size = 20) {
    this.x = x;
    this.y = y;
    this.size = size;
  }

  draw(ctx) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  collect(player) {
    const hitbox = player.getHitbox();
    const coinBox = { x: this.x, y: this.y, width: this.size, height: this.size };
    if (rectCollision(hitbox, coinBox)) {
      player.coins = (player.coins || 0) + 1;
      return true; // Coin collected
    }
    return false;
  }
}

export function generateCoins(count, obstacles = []) {
  const coins = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 2000;

  while (coins.length < count && attempts < MAX_ATTEMPTS) {
    const x = Math.random() * (window.WORLD_WIDTH - 20);
    const y = Math.random() * (window.WORLD_HEIGHT - 20);

    const coinBox = { x, y, width: 20, height: 20 };

    const collision = obstacles.some((obj) =>
      rectCollision(coinBox, { x: obj.x, y: obj.y, width: obj.width || 40, height: obj.height || 40 })
    );

    if (!collision) coins.push(new Coin(x, y));

    attempts++;
  }

  return coins;
}
