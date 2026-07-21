import { PLAYER_WIDTH, PLAYER_HEIGHT } from "../core/constants.js";

export class Player {
  constructor(sprite) {
    this.x = 50;
    this.y = 300;
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
    this.speed = 5;
    this.direction = 0;
    this.displayAngle = 0; // eases toward direction so turns lean, not snap

    this.invulnerableTimer = 0;
    this.onCrash = null;

    this.sprite = sprite;
    this.spriteLoaded = false;
    this.baked = null; // sprite + drop shadow, rendered once
    this.bakePad = 16;

    const bake = () => {
      this.spriteLoaded = true;
      const pad = this.bakePad;
      const c = document.createElement("canvas");
      c.width = this.width + pad * 2;
      c.height = this.height + pad * 2;
      const bctx = c.getContext("2d");
      bctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      bctx.shadowBlur = 10;
      bctx.drawImage(sprite, pad, pad, this.width, this.height);
      this.baked = c;
    };

    if (sprite.complete && sprite.naturalWidth) {
      bake();
    } else {
      sprite.onload = bake;
    }

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
    const shrinkX = 12;
    const shrinkY = 15;
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
    // Blink while invulnerable so the grace period is visible
    if (this.invulnerableTimer > 0) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(performance.now() / 60);
    }
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    ctx.rotate((this.displayAngle * Math.PI) / 180);
    ctx.drawImage(
      this.baked,
      -this.width / 2 - this.bakePad,
      -this.height / 2 - this.bakePad
    );
    ctx.restore();
  }

  setInvulnerable(frames) {
    this.invulnerableTimer = frames;
  }

  update(deltaTime = 1) {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - deltaTime);
    }

    // Ease the sprite toward the travel direction along the shortest arc
    const diff = ((this.direction - this.displayAngle + 540) % 360) - 180;
    this.displayAngle += diff * Math.min(1, 0.22 * deltaTime);
  }

  canCrash() {
    return this.invulnerableTimer <= 0;
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
