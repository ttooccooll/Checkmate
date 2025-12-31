import { PLAYER_WIDTH, PLAYER_HEIGHT } from "../core/constants.js";

export class Player {
  constructor(sprite) {
    this.x = 50;
    this.y = 300;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.speed = 5;
    this.direction = 0;

    this.invulnerableTimer = 0;
    this.onCrash = null;

    this.sprite = sprite;
    this.spriteLoaded = false;

    sprite.onload = () => {
      this.spriteLoaded = true;
    };

    this.clue = 0;       // For Thabo
    this.marker = 0;     // For Kagiso & Hlokomela
    this.fragment = 0;   // For Nandi
    this.light = 0;      // For Bongani
    this.ball = 0;       // For Keabetswe
    this.sign = 0;       // For Sibusiso & Samkelo
    this.notice = 0;     // For Mpho
    this.bell = 0;       // For lighthouse bell quest
    this.coin = 0;

    // 🧩 Puzzle tracking (already in quests)
    this.solvedPuzzles = [];
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
    this.lastDx = dx;
    this.lastDy = dy;

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

  setInvulnerable(frames) {
    this.invulnerableTimer = frames;
  }

  update() {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer--;
    }
  }

  canCrash() {
    return this.invulnerableTimer === 0;
  }

  crash(reason = "obstacle") {
    if (!this.canCrash()) return;

    if (this.onCrash) {
      this.onCrash(reason);
    }
  }

  checkBuildingCollisions(buildings, rectCollision) {
    if (!this.canCrash()) return;

    const hitbox = this.getHitbox();
    for (let b of buildings) {
      if (rectCollision(hitbox, b)) {
        this.crash("building");
        return;
      }
    }
  }

  checkTreeCollisions(trees, circleRectCollision, isVisible) {
    if (!this.canCrash()) return;

    const hitbox = this.getHitbox();

    for (let t of trees) {
      if (!isVisible(t.x, t.y, t.size * 2, t.size * 2)) continue;

      const circle = {
        x: t.x + t.size,
        y: t.y + t.size,
        radius: t.size * 0.3,
      };

      if (circleRectCollision(circle, hitbox)) {
        this.crash("tree");
        return;
      }
    }
  }
}
