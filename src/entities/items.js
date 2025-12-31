import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { isCollidingWithObstacles } from "../core/collision.js";

/**
 * Spawn quest items into the world for a specific NPC.
 * @param {NPC} npc - The NPC that owns the quest.
 * @param {Array} itemsArray - The global items array to push new items into.
 */

export function spawnQuestItems(npc, itemsArray) {
  if (!npc.quest) return;

  const itemId = npc.quest.params?.item || npc.quest.item;
  const amount = npc.quest.params?.amount || npc.quest.amount || 1;

  for (let i = 0; i < amount; i++) {
    let attempts = 0;
    while (attempts < 500) {
      // Random position in the world
      const x = Math.random() * (WORLD_WIDTH - 8);
      const y = Math.random() * (WORLD_HEIGHT - 8);

      // Check collisions: roads, buildings, trees, other items
      const safe =
        !isCollidingWithObstacles(x, y, 8, 8) &&
        !itemsArray.some(
          (it) =>
            it.x < x + 8 &&
            it.x + it.size > x &&
            it.y < y + 8 &&
            it.y + it.size > y
        );

      if (safe) {
        itemsArray.push({
          id: itemId,
          x,
          y,
          size: 8,
          collected: false,
        });
        break;
      }

      attempts++;
    }

    if (attempts >= 500) {
      console.warn(`Could not place item ${itemId} in the world safely.`);
    }
  }
}
