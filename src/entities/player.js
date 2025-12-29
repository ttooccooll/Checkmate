import { PLAYER_WIDTH, PLAYER_HEIGHT } from "../core/constants.js";

export class Player {
  constructor(sprite) {
    this.x = 50;
    this.y = 300;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.speed = 5;
    this.direction = 0;
    this.sprite = sprite;
    this.spriteLoaded = false;

    sprite.onload = () => {
      this.spriteLoaded = true;
    };
  }

  getHitbox() {
    const shrinkX = 10;
    const shrinkY = 14;
    return {
      x: this.x + shrinkX,
      y: this.y + shrinkY,
      width: this.width - shrinkX * 2,
      height: this.height - shrinkY * 2,
    };
  }

  clamp(worldWidth, worldHeight) {
    this.x = Math.max(0, Math.min(worldWidth - this.width, this.x));
    this.y = Math.max(0, Math.min(worldHeight - this.height, this.y));
  }

  move(dx, dy) {
    this.x += dx;
    this.y += dy;
  }

  draw(ctx) {
    if (!this.spriteLoaded) {
      ctx.fillStyle = "red";
      ctx.fillRect(this.x, this.y, this.width, this.height);
      return;
    }

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 10;
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate((this.direction * Math.PI) / 180);
    ctx.drawImage(
      this.sprite,
      -this.width / 2,
      -this.height / 2,
      this.width,
      this.height
    );
    ctx.restore();
  }
}
