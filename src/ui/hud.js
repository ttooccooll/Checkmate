// Screen-space overlays: the HUD panel (score, upgrades, status lines) and
// the objective compass arrow orbiting the player.

import { OFFROAD_MAX } from "../core/constants.js";

const upgradeLabels = {
  helmet: "🪖 Helmet",
  speedBoost: "⚡ Boost",
  offRoadTreads: "🛞 Treads",
  metalDetector: "🧲 Detector",
};

export function drawHUD(ctx, { score, upgrades, offRoadTimer, deliveryLine, fogLine }) {
  const hudX = 8;
  let hudY = 8;
  const padding = 5;
  const lineHeight = 18;

  // Compute height for background (score + upgrades + status lines)
  const numLines =
    1 +
    Object.values(upgrades).filter(Boolean).length +
    (deliveryLine ? 1 : 0) +
    (fogLine ? 1 : 0);
  const bgHeight = numLines * lineHeight + padding * 2;
  const bgWidth = 130;

  // Draw a light white background
  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 50;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(hudX - padding, hudY - padding, bgWidth, bgHeight);
  ctx.restore();

  // Draw text on top
  ctx.font = "16px monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#111";

  ctx.fillText(`Score: ${score}`, hudX, hudY);
  let textY = hudY + lineHeight;

  Object.keys(upgrades).forEach((key) => {
    if (upgrades[key]) {
      let label = upgradeLabels[key];
      if (key === "offRoadTreads") {
        const left = Math.max(
          0,
          Math.round(100 - (offRoadTimer / OFFROAD_MAX) * 100)
        );
        label = `🛞 Treads ${left}%`;
      }
      ctx.fillText(label, hudX, textY);
      textY += lineHeight;
    }
  });

  if (deliveryLine) {
    ctx.fillStyle = "#8a4b00";
    ctx.fillText(deliveryLine, hudX, textY);
    textY += lineHeight;
  }
  if (fogLine) {
    ctx.fillStyle = "#3a5f8a";
    ctx.fillText(fogLine, hudX, textY);
    textY += lineHeight;
  }
}

// Nearest objective worth pointing at: an active delivery outranks
// everything (there's a timer running), then uncollected items for accepted
// quests, then newly revealed story NPCs whose quest hasn't been picked up.
function findCompassTarget({ player, npcs, items, deliveryNpc }) {
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;

  if (deliveryNpc) {
    return {
      cx: deliveryNpc.x + deliveryNpc.width / 2,
      cy: deliveryNpc.y + deliveryNpc.height / 2,
      x: deliveryNpc.x,
      y: deliveryNpc.y,
      width: deliveryNpc.width,
      height: deliveryNpc.height,
      color: "#FF9F1C",
    };
  }

  const activeItemIds = new Set();
  npcs.forEach((npc) => {
    const q = npc.currentQuest;
    if (q?.active && q.type === "collect" && q.params?.item) {
      activeItemIds.add(q.params.item);
    }
  });

  let best = null;
  let bestDist = Infinity;

  items.forEach((item) => {
    if (item.collected || !activeItemIds.has(item.id)) return;
    const d = Math.hypot(item.x - px, item.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = {
        cx: item.x + item.size / 2,
        cy: item.y + item.size / 2,
        x: item.x,
        y: item.y,
        width: item.size,
        height: item.size,
        color: item.color,
      };
    }
  });

  if (best) return best;

  npcs.forEach((npc) => {
    const q = npc.currentQuest;
    if (!npc.visible || !npc.wasHidden || !q) return;
    if (q.active || npc.completedQuests.includes(q.id)) return;
    const d = Math.hypot(npc.x - px, npc.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = {
        cx: npc.x + npc.width / 2,
        cy: npc.y + npc.height / 2,
        x: npc.x,
        y: npc.y,
        width: npc.width,
        height: npc.height,
        color: "#FFD700",
      };
    }
  });

  return best;
}

// Small arrow orbiting the player, pointing toward the current objective.
// Hidden while the objective itself is on screen.
export function drawQuestCompass(ctx, { player, camera, npcs, items, deliveryNpc, isVisible }) {
  const target = findCompassTarget({ player, npcs, items, deliveryNpc });
  if (!target) return;
  if (
    isVisible(target.x - 8, target.y - 8, target.width + 16, target.height + 16)
  ) {
    return;
  }

  const px = player.x + player.width / 2 - camera.x;
  const py = player.y + player.height / 2 - camera.y;
  const ang = Math.atan2(
    target.cy - (player.y + player.height / 2),
    target.cx - (player.x + player.width / 2)
  );

  ctx.save();
  ctx.translate(px + Math.cos(ang) * 55, py + Math.sin(ang) * 55);
  ctx.rotate(ang);
  ctx.globalAlpha = 0.65 + 0.3 * Math.sin(performance.now() / 250);
  ctx.fillStyle = target.color;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-6, 6.5);
  ctx.lineTo(-6, -6.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
