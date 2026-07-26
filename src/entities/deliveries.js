// Delivery missions: an NPC flags a package, you ride over to collect it,
// then race it to the recipient before the timer runs out. Failing is
// gentle — no penalty, another offer comes along soon.
//
// Job types:
//   standard — the bread and butter
//   express  — 60% of the time, double the pay
//   fragile  — pays extra, but any crash while carrying destroys it
//   twostop  — two legs back to back, paid per leg plus a finish bonus

import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";

const ROAD_SPEED_PX_PER_SEC = 300; // player base speed at 60fps
const PICKUP_RANGE = 78;
const TWOSTOP_BONUS = 8;

const JOB_ICONS = {
  standard: "📦",
  express: "⚡",
  fragile: "🥚",
  twostop: "📦",
  taxiRun: "🚌",
};

// What the recipient says when the package lands in their hands
const RECEIPT_LINES = {
  standard: [
    "You made good time.",
    "Right where it needs to be. Thanks.",
    "My mother's been waiting on this.",
    "Put it down anywhere. Bless you.",
    "That's the one. I owe you a cooldrink.",
    "You ride like the taxis. Don't tell them I said so.",
  ],
  express: [
    "Already? That was quick.",
    "Hayibo, that was fast.",
    "You beat the kettle. I just put it on.",
    "Quickest wheels on the coast.",
  ],
  fragile: [
    "Not a scratch on it. Thank you.",
    "I heard the potholes from here. Well done.",
    "All in one piece. You're careful with the good stuff.",
  ],
  fog: [
    "In this fog? You earned it.",
    "I can't see my own gate. Respect.",
  ],
  twostopLeg: [
    "This one's mine. The rest keeps moving.",
    "That's for me. Ride on.",
  ],
};

function pickLine(npc, pool) {
  if (!pool.length) return null;
  let idx = Math.floor(Math.random() * pool.length);
  // don't hand the same person the same line twice running
  if (pool.length > 1 && idx === npc._lastLineIdx) {
    idx = (idx + 1) % pool.length;
  }
  npc._lastLineIdx = idx;
  return pool[idx];
}

function rollJobType() {
  const r = Math.random();
  if (r < 0.44) return "standard";
  if (r < 0.62) return "express";
  if (r < 0.75) return "fragile";
  if (r < 0.88) return "twostop";
  return "taxiRun";
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function npcCenter(npc) {
  return [npc.x + npc.width / 2, npc.y + npc.height / 2];
}

export class DeliveryManager {
  constructor({ showMessage, addScore, sfx, isFoggy, getTaxis }) {
    this.showMessage = showMessage;
    this.addScore = addScore;
    this.sfx = sfx;
    this.isFoggy = isFoggy;
    this.getTaxis = getTaxis; // live taxi list, for taxiRun deliveries
    this.reset();
  }

  reset() {
    this.state = "idle"; // idle -> pickup -> enroute -> idle
    this.cooldown = 9; // first offer arrives once the player has settled in
    this.jobType = "standard";
    this.legsRemaining = 1;
    this.pickupNpc = null;
    this.dropoffNpc = null;
    this.targetTaxi = null; // taxiRun: the taxi waiting at the verge
    this.taxiWaitStarted = false;
    this.chaseTimer = 0;
    this.timer = 0;
    this.timerMax = 0;
    this.reward = 0;
    this.completed = 0;
    this.failed = 0;
  }

  update(dtSec, player, npcs, dialogActive = false) {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    // Reading is never on the clock: while a conversation is open, no new
    // offers arrive, packages wait to be collected, and the timer holds.
    if (this.state === "idle") {
      if (dialogActive) return;
      this.cooldown -= dtSec;
      if (this.cooldown <= 0 && !this.offer(px, py, npcs)) {
        this.cooldown = 6;
      }
      return;
    }

    if (this.state === "pickup") {
      if (dialogActive) return;
      const [nx, ny] = npcCenter(this.pickupNpc);
      if (dist(px, py, nx, ny) < PICKUP_RANGE) {
        this.assignDropoff(npcs, this.pickupNpc);
      }
      return;
    }

    if (this.state === "enroute") {
      if (this.jobType === "taxiRun") {
        this.updateTaxiRun(dtSec, px, py, dialogActive);
        return;
      }
      if (!dialogActive) this.timer -= dtSec;
      const [nx, ny] = npcCenter(this.dropoffNpc);

      if (dist(px, py, nx, ny) < PICKUP_RANGE) {
        this.completeLeg(npcs);
      } else if (this.timer <= 0) {
        this.fail();
      }
    }
  }

  // The deadline is a vehicle: the taxi pulls over, waits with hazards
  // on, and leaves. Hand the parcel over while it's at the verge.
  updateTaxiRun(dtSec, px, py, dialogActive) {
    const t = this.targetTaxi;
    if (!t) {
      this.fail();
      return;
    }
    if (!dialogActive) this.chaseTimer += dtSec;

    if (t.pullPhase === "stopped") this.taxiWaitStarted = true;

    if (t.pullPhase && dist(px, py, t.x, t.y) < PICKUP_RANGE + 12) {
      this.completeTaxiRun();
      return;
    }

    // it waited, and then it left
    if (this.taxiWaitStarted && !t.pullPhase) {
      this.failed++;
      if (this.sfx) this.sfx.deliveryFailed();
      this.showMessage("🚌 The taxi pulled off without it. Eish.", 4000);
      this.clearRun(9 + Math.random() * 8);
      return;
    }

    // safety valve: if the taxi never manages to stop, let the job go
    if (this.chaseTimer > 80) {
      this.showMessage("🚌 The taxi never stopped. Another job will come.", 4000);
      this.clearRun(8);
    }
  }

  completeTaxiRun() {
    const t = this.targetTaxi;
    const foggy = this.isFoggy ? this.isFoggy() : false;
    const points = foggy ? this.reward * 2 : this.reward;
    this.addScore(points);
    this.completed++;
    if (this.sfx) this.sfx.delivered();
    this.showMessage(
      `🚌 Made it! The gaartjie grabs the parcel as they pull off. +${points} points${
        foggy ? " 🌫️ (fog bonus ×2!)" : ""
      }`,
      4500
    );
    // handoff done: the taxi finishes loading and goes
    if (t && t.pullPhase === "stopped") {
      t.stopTimer = Math.min(t.stopTimer, 45);
    }
    this.clearRun(12 + Math.random() * 12);
  }

  offer(px, py, npcs) {
    const candidates = npcs.filter((n) => {
      if (!n.visible) return false;
      const [nx, ny] = npcCenter(n);
      return dist(px, py, nx, ny) > 450;
    });
    if (!candidates.length) return false;

    this.pickupNpc = candidates[Math.floor(Math.random() * candidates.length)];
    this.jobType = rollJobType();
    this.legsRemaining = this.jobType === "twostop" ? 2 : 1;
    this.state = "pickup";

    const name = this.pickupNpc.name;
    const offers = {
      standard: `📦 ${name} has a package that needs delivering! Ride over to collect it.`,
      express: `⚡ Express job! ${name} needs a package moved fast. Double pay.`,
      fragile: `🥚 ${name} has a fragile package. One crash and it's history.`,
      twostop: `📦 ${name} has a two-stop run. Keep it moving.`,
      taxiRun: `🚌 ${name} has a parcel that must make the taxi. It won't wait long!`,
    };
    this.showMessage(offers[this.jobType], 5000);
    return true;
  }

  assignDropoff(npcs, originNpc) {
    const [sx, sy] = npcCenter(originNpc);

    // taxiRun: the destination is a taxi, not a person. Pick a cruising
    // one far enough away for a chase and tell it to pull over and hold.
    if (this.jobType === "taxiRun") {
      const taxis = (this.getTaxis ? this.getTaxis() : []).filter(
        (t) =>
          t.type === "taxi" &&
          !t.pullPhase &&
          dist(sx, sy, t.x, t.y) > 600 &&
          t.x > 150 &&
          t.x < WORLD_WIDTH - 150 &&
          t.y > 150 &&
          t.y < WORLD_HEIGHT - 150
      );
      if (!taxis.length) {
        // no taxi to catch: the parcel travels the ordinary way
        this.jobType = "standard";
      } else {
        const t = taxis[Math.floor(Math.random() * taxis.length)];
        this.targetTaxi = t;
        this.taxiWaitStarted = false;
        this.chaseTimer = 0;
        t.pullCooldown = 0; // stop at the next clear stretch
        t.holdFrames = 1500 + Math.random() * 240; // and wait ~25-29s
        this.reward = 16 + Math.round(dist(sx, sy, t.x, t.y) / 150);
        this.state = "enroute";
        if (this.sfx) this.sfx.pickup();
        this.showMessage(
          "🚌 Picked up! Catch the taxi before it pulls off. Watch for the hazards.",
          5000
        );
        return;
      }
    }

    const candidates = npcs.filter((n) => {
      if (!n.visible || n === originNpc || n === this.pickupNpc) return false;
      const [nx, ny] = npcCenter(n);
      return dist(sx, sy, nx, ny) > 650;
    });

    if (!candidates.length) {
      // Nowhere sensible to send it — quietly retry later
      this.clearRun(8);
      return;
    }

    this.dropoffNpc = candidates[Math.floor(Math.random() * candidates.length)];
    const [dx, dy] = npcCenter(this.dropoffNpc);
    const runDist = dist(sx, sy, dx, dy);

    // Straight-line distance × wiggle factor, at road speed, clamped sane
    let legTime = Math.max(
      22,
      Math.min(90, (runDist * 1.7) / ROAD_SPEED_PX_PER_SEC)
    );
    let legReward = 10 + Math.round(runDist / 180);

    if (this.jobType === "express") {
      legTime = Math.max(15, legTime * 0.6);
      legReward *= 2;
    } else if (this.jobType === "fragile") {
      legReward = Math.round(legReward * 1.75);
    }

    this.timerMax = legTime;
    this.timer = legTime;
    this.reward = legReward;
    this.state = "enroute";

    if (this.sfx) this.sfx.pickup();

    const secs = Math.round(legTime);
    const isSecondLeg =
      this.jobType === "twostop" && this.legsRemaining === 1;
    const tails = {
      standard: "",
      express: " Double pay on the line!",
      fragile: " Ride carefully. It won't survive a crash.",
      twostop: isSecondLeg ? " Last stop!" : " First of two stops.",
    };
    this.showMessage(
      `📦 Picked up! Deliver to ${this.dropoffNpc.name}, follow the orange arrow. ⏱️ ${secs}s.${tails[this.jobType]}`,
      5000
    );
  }

  completeLeg(npcs) {
    const foggy = this.isFoggy ? this.isFoggy() : false;
    const points = foggy ? this.reward * 2 : this.reward;
    this.addScore(points);

    if (this.jobType === "twostop" && this.legsRemaining > 1) {
      this.legsRemaining--;
      if (this.sfx) this.sfx.pickup();
      this.dropoffNpc.say(pickLine(this.dropoffNpc, RECEIPT_LINES.twostopLeg));
      this.showMessage(
        `📦 First stop done, +${points}${foggy ? " (fog ×2!)" : ""}. One more to go!`,
        4000
      );
      this.assignDropoff(npcs, this.dropoffNpc);
      return;
    }

    let bonusText = "";
    if (this.jobType === "twostop") {
      this.addScore(TWOSTOP_BONUS);
      bonusText = ` +${TWOSTOP_BONUS} run bonus!`;
    }

    this.completed++;
    if (this.sfx) this.sfx.delivered();

    // The person, not just the points: fog earns its own kind of respect,
    // otherwise the job type sets the tone
    const pool = foggy
      ? RECEIPT_LINES.fog
      : RECEIPT_LINES[this.jobType] || RECEIPT_LINES.standard;
    this.dropoffNpc.say(pickLine(this.dropoffNpc, pool));

    this.showMessage(
      `📦 Delivered to ${this.dropoffNpc.name}! +${points} points${
        foggy ? " 🌫️ (fog bonus ×2!)" : ""
      }${bonusText}`,
      4500
    );
    this.clearRun(12 + Math.random() * 12);
  }

  fail() {
    this.failed++;
    if (this.sfx) this.sfx.deliveryFailed();
    this.showMessage("📦 The package expired… another job will come along.", 4000);
    this.clearRun(9 + Math.random() * 8);
  }

  // Called by the crash handler — a fragile package doesn't care whether
  // the helmet saved *you*.
  onPlayerCrash() {
    if (this.state === "enroute" && this.jobType === "fragile") {
      this.failed++;
      if (this.sfx) this.sfx.deliveryFailed();
      this.showMessage("🥚 The package didn't survive the crash.", 4000);
      this.clearRun(10 + Math.random() * 8);
    }
  }

  clearRun(cooldown) {
    // release a held taxi so it doesn't wait out a cancelled job
    if (this.targetTaxi && this.targetTaxi.pullPhase === "stopped") {
      this.targetTaxi.stopTimer = Math.min(this.targetTaxi.stopTimer, 170);
    }
    if (this.targetTaxi) this.targetTaxi.holdFrames = 0;
    this.state = "idle";
    this.cooldown = cooldown;
    this.pickupNpc = null;
    this.dropoffNpc = null;
    this.targetTaxi = null;
    this.taxiWaitStarted = false;
    this.chaseTimer = 0;
    this.legsRemaining = 1;
  }

  // The NPC (or taxi) the compass should point at right now, if any
  getCompassTarget() {
    if (this.state === "pickup") return this.pickupNpc;
    if (this.state === "enroute") {
      if (this.jobType === "taxiRun" && this.targetTaxi) {
        const t = this.targetTaxi;
        // live-tracking proxy in NPC shape
        return {
          get x() {
            return t.x - 15;
          },
          get y() {
            return t.y - 15;
          },
          width: 30,
          height: 30,
        };
      }
      return this.dropoffNpc;
    }
    return null;
  }

  timerText() {
    const icon = JOB_ICONS[this.jobType] || "📦";
    if (this.state === "pickup") return `${icon} pickup!`;
    if (this.state !== "enroute") return null;
    if (this.jobType === "taxiRun") {
      const t = this.targetTaxi;
      if (!t) return null;
      if (t.pullPhase === "stopped") {
        const secs = Math.max(0, Math.ceil(t.stopTimer / 60));
        return `${icon} waiting ${secs}s${secs < 6 ? "❗" : ""}`;
      }
      return `${icon} catch it!`;
    }
    const s = Math.max(0, Math.ceil(this.timer));
    const urgent = this.timer < 10 ? "❗" : "";
    return `${icon} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}${urgent}`;
  }

  // World-space markers: a bobbing parcel at the pickup, a pulsing ring at
  // the destination.
  draw(ctx, now) {
    if (this.state === "pickup" && this.pickupNpc?.visible) {
      const [nx] = npcCenter(this.pickupNpc);
      const bob = Math.sin(now / 260) * 3;
      this.drawParcel(ctx, nx, this.pickupNpc.y - 16 + bob);
    }

    // taxiRun: the ring rides on the taxi itself, amber while you chase,
    // green once it's waiting at the verge
    if (this.state === "enroute" && this.jobType === "taxiRun" && this.targetTaxi) {
      const t = this.targetTaxi;
      const pulse = 1 + 0.18 * Math.sin(now / 220);
      const waiting = t.pullPhase === "stopped";
      const col = waiting ? "38, 200, 110" : "255, 176, 40";
      ctx.save();
      ctx.strokeStyle = `rgba(${col}, 0.85)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${col}, 0.35)`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 46 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (this.state === "enroute" && this.dropoffNpc?.visible) {
      const [nx, ny] = npcCenter(this.dropoffNpc);
      const pulse = 1 + 0.18 * Math.sin(now / 220);
      ctx.save();
      ctx.strokeStyle = "rgba(38, 200, 110, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(nx, ny, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(38, 200, 110, 0.35)";
      ctx.beginPath();
      ctx.arc(nx, ny, 36 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const bob = Math.sin(now / 260) * 3;
      this.drawParcel(ctx, nx, this.dropoffNpc.y - 18 + bob);
    }
  }

  drawParcel(ctx, cx, cy) {
    ctx.save();
    // box
    ctx.fillStyle = "#a9743f";
    ctx.strokeStyle = "#6e4622";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - 7, cy - 6, 14, 12, 2);
    ctx.fill();
    ctx.stroke();
    // tape cross
    ctx.strokeStyle = "rgba(240, 226, 198, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
    ctx.restore();
  }
}
