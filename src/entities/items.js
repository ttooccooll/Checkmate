import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { isCollidingWithObstacles } from "../core/collision.js";

/**
 * Spawn quest items into the world for a specific NPC.
 * @param {NPC} npc - The NPC that owns the quest.
 * @param {Array} itemsArray - The global items array to push new items into.
 */

const ITEM_VISUALS = {
  clue: { color: "#F4D03F", size: 9 }, // warm yellow
  marker: { color: "#5DADE2", size: 10 }, // blue
  fragment: { color: "#AF7AC5", size: 9 }, // purple (mystery)
  sign: { color: "#58D68D", size: 11 }, // green
  litter: { color: "#AAB7B8", size: 9 }, // gray
  light: { color: "#F7DC6F", size: 10 }, // pale gold
  ball: { color: "#EC7063", size: 8 }, // red
  notice: { color: "#F5B041", size: 9 }, // orange
  bell: { color: "#FAD7A0", size: 11 }, // antique brass
  photo: { color: "#E8ECEF", size: 10 }, // camera-flash white
};

// The bike must be able to touch an item without crashing into whatever
// it landed beside — keep this much clearance around every spawn
const PICKUP_CLEARANCE = 34;

export function spawnQuestItems(npc, itemsArray, { buildings = [], trees = [] } = {}) {
  if (!npc.quest) return;

  const itemId = npc.quest.params?.item || npc.quest.item;
  const amount = npc.quest.params?.amount || npc.quest.amount || 1;
  const visual = ITEM_VISUALS[itemId] || { color: "#4CA3AF", size: 9 };
  const size = visual.size;

  for (let i = 0; i < amount; i++) {
    let attempts = 0;
    let placed = false;

    while (attempts < 5000) {
      // Random position in the world, clear of the edges
      const x = 40 + Math.random() * (WORLD_WIDTH - size - 80);
      const y = 40 + Math.random() * (WORLD_HEIGHT - size - 80);

      // Check collisions with full pickup clearance so nothing spawns
      // wedged against an obstacle the bike would crash into
      const pad = PICKUP_CLEARANCE;
      const safe =
        !isCollidingWithObstacles(
          x - pad,
          y - pad,
          size + pad * 2,
          size + pad * 2,
          buildings,
          trees
        ) &&
        !itemsArray.some(
          (it) =>
            it.x < x + size &&
            it.x + it.size > x &&
            it.y < y + size &&
            it.y + it.size > y
        );

      if (safe) {
        itemsArray.push({
          id: itemId,
          x,
          y,
          size,
          color: visual.color,
          collected: false,
        });
        placed = true;
        break;
      }

      attempts++;
    }

    if (!placed) {
      console.warn(`Could not place item ${itemId} in the world safely.`);
    }
  }
}
