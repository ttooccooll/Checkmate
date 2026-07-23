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

// Where each item belongs, so the world agrees with the quest text:
// bell fragments wash up along the shoreline and forest edge, the
// keeper's things lie around the lighthouse, route markers head toward
// the point, signs and street lights live at roadsides, litter and
// notices collect around buildings.
const PLACEMENT = {
  fragment: "shoreline",
  clue: "lighthouse",
  bell: "lighthouse",
  marker: "verge-sw",
  sign: "verge",
  light: "verge",
  litter: "yard",
  notice: "yard",
};

function candidateFor(strategy, world) {
  const { roads = [], trees = [], buildings = [], lighthouse, bay } = world;
  const rnd = Math.random;
  switch (strategy) {
    case "verge":
    case "verge-sw": {
      if (!roads.length) return null;
      const r = roads[Math.floor(rnd() * roads.length)];
      const horiz = r.width > r.height;
      const off = 16 + rnd() * 34;
      const side = rnd() < 0.5 ? -1 : 1;
      const x = horiz
        ? r.x + 60 + rnd() * (r.width - 120)
        : side < 0
          ? r.x - off
          : r.x + r.width + off;
      const y = horiz
        ? side < 0
          ? r.y - off
          : r.y + r.height + off
        : r.y + 60 + rnd() * (r.height - 120);
      // the old routes all lead toward the point
      if (
        strategy === "verge-sw" &&
        !(x < WORLD_WIDTH * 0.6 && y > WORLD_HEIGHT * 0.4)
      ) {
        return null;
      }
      return { x, y };
    }
    case "lighthouse": {
      if (!lighthouse) return null;
      const ang = rnd() * Math.PI * 2;
      const rad = 170 + rnd() * 260;
      return {
        x: lighthouse.x + Math.cos(ang) * rad,
        y: lighthouse.y + Math.sin(ang) * rad,
      };
    }
    case "shoreline": {
      // washed up on the beach, or lost along the forest edge
      if (bay && bay.enabled && rnd() < 0.55) {
        const a = rnd() * (Math.PI / 2);
        const t = 1.12 + rnd() * 0.5;
        return {
          x: Math.sin(a) * bay.rx * t,
          y: WORLD_HEIGHT - Math.cos(a) * bay.ry * t,
        };
      }
      if (trees.length) {
        const tr = trees[Math.floor(rnd() * trees.length)];
        const ang = rnd() * Math.PI * 2;
        const d = 48 + rnd() * 55;
        return {
          x: tr.x + tr.size + Math.cos(ang) * d,
          y: tr.y + tr.size + Math.sin(ang) * d,
        };
      }
      return null;
    }
    case "yard": {
      if (!buildings.length) return null;
      const b = buildings[Math.floor(rnd() * buildings.length)];
      const bw = b.width || 40;
      const bh = b.height || 40;
      const ang = rnd() * Math.PI * 2;
      // offset clears the pickup clearance so candidates aren't rejected
      const d = 42 + rnd() * 45;
      return {
        x: b.x + bw / 2 + Math.cos(ang) * (bw / 2 + d),
        y: b.y + bh / 2 + Math.sin(ang) * (bh / 2 + d),
      };
    }
    default:
      return null;
  }
}

export function spawnQuestItems(npc, itemsArray, world = {}) {
  if (!npc.quest) return;
  const { solid = [], trees = [], bay } = world;

  const itemId = npc.quest.params?.item || npc.quest.item;
  const amount = npc.quest.params?.amount || npc.quest.amount || 1;
  const visual = ITEM_VISUALS[itemId] || { color: "#4CA3AF", size: 9 };
  const size = visual.size;

  const isSafe = (x, y) => {
    if (
      x < 40 ||
      y < 40 ||
      x > WORLD_WIDTH - size - 40 ||
      y > WORLD_HEIGHT - size - 40
    ) {
      return false;
    }
    // never in the bay (nor on the foam line)
    if (bay && bay.enabled) {
      const nx = (x + size / 2) / bay.rx;
      const ny = (WORLD_HEIGHT - (y + size / 2)) / bay.ry;
      if (nx * nx + ny * ny < 1.05 * 1.05) return false;
    }
    const pad = PICKUP_CLEARANCE;
    return (
      !isCollidingWithObstacles(
        x - pad,
        y - pad,
        size + pad * 2,
        size + pad * 2,
        solid,
        trees
      ) &&
      !itemsArray.some(
        (it) =>
          it.x < x + size &&
          it.x + it.size > x &&
          it.y < y + size &&
          it.y + it.size > y
      )
    );
  };

  const push = (x, y) => {
    itemsArray.push({
      id: itemId,
      x,
      y,
      size,
      color: visual.color,
      collected: false,
    });
  };

  for (let i = 0; i < amount; i++) {
    let placed = false;

    // Themed placement first: the world should agree with the quest text
    const strategy = PLACEMENT[itemId];
    if (strategy) {
      for (let t = 0; t < 400 && !placed; t++) {
        const c = candidateFor(strategy, world);
        if (c && isSafe(c.x, c.y)) {
          push(c.x, c.y);
          placed = true;
        }
      }
    }

    // Fallback: anywhere safe, so a crowded map never breaks a quest
    for (let t = 0; t < 5000 && !placed; t++) {
      const x = 40 + Math.random() * (WORLD_WIDTH - size - 80);
      const y = 40 + Math.random() * (WORLD_HEIGHT - size - 80);
      if (isSafe(x, y)) {
        push(x, y);
        placed = true;
      }
    }

    if (!placed) {
      console.warn(`Could not place item ${itemId} in the world safely.`);
    }
  }
}
