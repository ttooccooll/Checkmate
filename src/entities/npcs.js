// entities/npcs.js
import { rectCollision } from "../core/collision.js";

export class NPC {
  constructor(x, y, sprite, name) {
    this.x = x;
    this.y = y;
    this.width = sprite.width || 50;
    this.height = sprite.height || 50;
    this.sprite = sprite;
    this.name = name || "NPC";
    this.dialogQueue = [];
    this.currentQuest = null;
    this.completedQuests = [];
    this.speed = 0.5; // for basic wandering
    this.direction = Math.random() * 360; // degrees
  }

  draw(ctx) {
    if (!this.sprite.complete) return;
    ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
  }

  update(deltaTime) {
    // Basic wandering movement
    const rad = (this.direction * Math.PI) / 180;
    this.x += Math.cos(rad) * this.speed * deltaTime;
    this.y += Math.sin(rad) * this.speed * deltaTime;

    // Bounce off world edges
    if (this.x < 0 || this.x + this.width > 2000) this.direction = 180 - this.direction;
    if (this.y < 0 || this.y + this.height > 2000) this.direction = 360 - this.direction;
    this.direction = (this.direction + Math.random() * 2 - 1) % 360;
  }

  interact(player) {
    if (this.dialogQueue.length > 0) {
      const line = this.dialogQueue.shift();
      return `${this.name}: ${line}`;
    }

    if (this.currentQuest && !this.completedQuests.includes(this.currentQuest.id)) {
      return `${this.name}: Quest - ${this.currentQuest.description}`;
    }

    return `${this.name}: Hello there!`;
  }

  assignQuest(quest) {
    this.currentQuest = quest;
  }

  checkQuestCompletion(player) {
    if (!this.currentQuest) return false;

    const quest = this.currentQuest;
    if (quest.type === "collect" && player.score >= quest.goal) {
      this.completedQuests.push(quest.id);
      this.currentQuest = null;
      return true;
    }

    return false;
  }

  isPlayerNearby(player, range = 60) {
    return rectCollision(
      { x: this.x - range, y: this.y - range, width: this.width + range * 2, height: this.height + range * 2 },
      player.getHitbox()
    );
  }
}

export function createQuest(id, type, description, goal) {
  return { id, type, description, goal };
}