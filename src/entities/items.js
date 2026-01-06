import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { isCollidingWithObstacles } from "../core/collision.js";

/**
 * Spawn quest items into the world for a specific NPC.
 * @param {NPC} npc - The NPC that owns the quest.
 * @param {Array} itemsArray - The global items array to push new items into.
 */

const ITEM_VISUALS = {
  clue: { color: "#F4D03F" }, // warm yellow
  marker: { color: "#5DADE2" }, // blue
  fragment: { color: "#AF7AC5" }, // purple (mystery)
  sign: { color: "#58D68D" }, // green
  litter: { color: "#AAB7B8" }, // gray
  light: { color: "#F7DC6F" }, // pale gold
  ball: { color: "#EC7063" }, // red
  notice: { color: "#F5B041" }, // orange
  bell: { color: "#FAD7A0" }, // antique brass
};

export function spawnQuestItems(npc, itemsArray) {
  if (!npc.quest) return;

  const itemId = npc.quest.params?.item || npc.quest.item;
  const amount = npc.quest.params?.amount || npc.quest.amount || 1;
  const visual = ITEM_VISUALS[itemId] || { color: "#4CA3AF" };

  for (let i = 0; i < amount; i++) {
    let attempts = 0;
    while (attempts < 5000) {
      // Random position in the world
      const x = Math.random() * (WORLD_WIDTH - 5);
      const y = Math.random() * (WORLD_HEIGHT - 5);

      // Check collisions: roads, buildings, trees, other items
      const safe =
        !isCollidingWithObstacles(x, y, 5, 5) &&
        !itemsArray.some(
          (it) =>
            it.x < x + 5 &&
            it.x + it.size > x &&
            it.y < y + 5 &&
            it.y + it.size > y
        );

      if (safe) {
        itemsArray.push({
          id: itemId,
          x,
          y,
          size: 5,
          color: visual.color,
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
