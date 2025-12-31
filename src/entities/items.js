// items.js
import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { isCollidingWithObstacles } from "../main.js"; // or wherever your collision logic is

export class Item {
  constructor(id, x, y, size = 20, sprite = null) {
    this.id = id;         // unique item id, e.g., "fragment", "marker", "sign"
    this.x = x;
    this.y = y;
    this.size = size;
    this.sprite = sprite; // optional image
    this.collected = false;
  }

  draw(ctx) {
    if (this.collected) return;

    if (this.sprite && this.sprite.complete) {
      ctx.drawImage(this.sprite, this.x, this.y, this.size, this.size);
    } else {
      // fallback placeholder
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// --- Utility function to spawn random items ---
export function generateItems(itemId, count) {
  const items = [];
  let attempts = 0;
  const size = 20;

  while (items.length < count && attempts < count * 20) {
    const x = Math.random() * (WORLD_WIDTH - size);
    const y = Math.random() * (WORLD_HEIGHT - size);

    if (!isCollidingWithObstacles(x, y, size, size)) {
      items.push(new Item(itemId, x, y, size));
    }

    attempts++;
  }

  return items;
}
