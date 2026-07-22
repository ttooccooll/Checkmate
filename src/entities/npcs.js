import { sfx } from "../services/audio.js";

export class NPC {
  constructor(data, x, y, quest = null) {
    this.id = data.id;
    this.name = data.name;
    this.dialogQueue = data.dialog || [];

    this.hitCooldown = 0;
    this.collisionTime = 0;

    this.x = x;
    this.y = y;
    this.width = 30;
    this.height = 30;
    this.lastTalkTime = 0;

    const npcImages = [
      "/assets/npc1.webp",
      "/assets/npc2.webp",
      "/assets/npc3.webp",
      "/assets/npc4.webp",
      "/assets/npc5.webp",
      "/assets/npc6.webp",
      "/assets/npc7.webp",
      "/assets/npc8.webp",
      "/assets/npc9.webp",
    ];

    this.sprite = new Image();
    this.sprite.src = npcImages[Math.floor(Math.random() * npcImages.length)];

    this.currentQuest = quest;
    this.quest = quest;
    this.completedQuests = [];
    this.talking = false;
    this.hasTalked = false;
    this.postQuestDialog = data.postQuestDialog || [];
    this.epilogueDialog = data.epilogueDialog || null;
    this.stageDialog = data.stageDialog || null; // town gossip per story stage
    this.hasReactedToQuest = false;
    this.everTalked = false; // heard at least one full conversation this run

    // A short spoken line shown above their head (delivery handoffs)
    this.sayText = null;
    this.sayUntil = 0;
    this.sayDur = 0;

    this.visible = !data.hidden;
    this.wasHidden = !!data.hidden;
  }

  // Speak a quick line in-world, no dialog box, no clicking
  say(text, ms = 4200) {
    this.sayText = text;
    this.sayUntil = performance.now() + ms;
    this.sayDur = ms;
  }

  isPlayerNearby(player, range = 80) {
    const dx = player.x + player.width / 2 - (this.x + this.width / 2);
    const dy = player.y + player.height / 2 - (this.y + this.height / 2);
    return dx * dx + dy * dy <= range * range;
  }

  interact(player, dialogManager, { showMessage }) {
    if (!this.visible) return false;
    const now = performance.now();
    if (now - this.lastTalkTime < 500) return false;

    if (this.hasTalked) return false;
    this.hasTalked = true;

    let lines = [...this.dialogQueue];

    // 🎉 Post-quest reaction takes priority. It's only marked as heard if
    // the player reads it to the end — riding off mid-sentence (a delivery,
    // a taxi bearing down) means it plays again next visit.
    const isPostQuestReaction =
      this.currentQuest &&
      this.completedQuests.includes(this.currentQuest.id) &&
      this.postQuestDialog.length &&
      !this.hasReactedToQuest;
    if (isPostQuestReaction) {
      lines = [...this.postQuestDialog];
    }

    const choices = [];

    if (
      this.currentQuest &&
      !this.completedQuests.includes(this.currentQuest.id) &&
      !this.hasReactedToQuest
    ) {
      choices.push(
        {
          text: "Accept Quest",
          callback: () => {
            this.currentQuest.active = true;
            sfx.accept();

            if (showMessage) {
              showMessage(
                `Quest accepted: ${this.currentQuest.description}`,
                5000
              );
            }
          },
        },
        {
          text: "Decline Quest",
          callback: () => {
            if (showMessage) showMessage("Maybe next time!");
          },
        }
      );
    }

    // Show what's actually being offered before the player commits
    const questPrompt =
      choices.length && this.currentQuest
        ? `📜 ${this.currentQuest.description} · +${this.currentQuest.rewardScore} points`
        : "";

    dialogManager.startDialog(
      this.name,
      lines,
      choices,
      (finished) => {
        this.talking = false;
        this.lastTalkTime = performance.now();
        if (finished) {
          this.everTalked = true;
          if (isPostQuestReaction) this.hasReactedToQuest = true;
        }
      },
      questPrompt
    );

    this.talking = true;
    return true;
  }

  checkDangerCollision(player) {
    // Story-locked NPCs are invisible until unlocked — they must never be
    // a ghost you can run into
    if (!this.visible) return false;
    // Tiny 1×1 hitbox in the center of the NPC
    const npcCenterBox = {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
      width: 1,
      height: 1,
    };

    const playerBox = player.getHitbox();

    // Standard AABB collision
    return (
      playerBox.x < npcCenterBox.x + npcCenterBox.width &&
      playerBox.x + playerBox.width > npcCenterBox.x &&
      playerBox.y < npcCenterBox.y + npcCenterBox.height &&
      playerBox.y + playerBox.height > npcCenterBox.y
    );
  }

  checkQuestCompletion(player, npcs, { showMessage } = {}) {
    if (
      this.currentQuest?.active &&
      !this.completedQuests.includes(this.currentQuest.id)
    ) {
      if (this.currentQuest.check(player)) {
        this.completedQuests.push(this.currentQuest.id);
        this.currentQuest.active = false;
        this.currentQuest.completed = true;

        // 🔹 Unlock the next NPC in the chain, straight from quest data
        if (this.currentQuest.unlockId) {
          this.currentQuest.unlockNPC(this.currentQuest.unlockId, npcs, {
            showMessage,
          });
        }

        return this.currentQuest;
      }
    }
    return null;
  }

  draw(ctx, player) {
    if (!this.sprite.complete) return;
    if (!this.visible) return;

    const cx = this.x + this.width / 2;
    const d = player
      ? Math.hypot(
          player.x + player.width / 2 - cx,
          player.y + player.height / 2 - (this.y + this.height / 2)
        )
      : Infinity;

    // Someone with something you haven't heard: a first conversation,
    // fresh story lines, an unclaimed quest, or a thank-you still waiting
    const hasNews =
      !this.everTalked ||
      (this.currentQuest &&
        !this.currentQuest.active &&
        !this.completedQuests.includes(this.currentQuest.id)) ||
      (this.currentQuest &&
        this.completedQuests.includes(this.currentQuest.id) &&
        this.postQuestDialog.length &&
        !this.hasReactedToQuest);

    // Warm light pooled at their feet, breathing slowly: this person has
    // something to say. On the ground, where a top-down world keeps its
    // light — nothing floats over anyone's head.
    if (hasNews && d < 460 && !this.talking) {
      const a = 0.34 + 0.14 * Math.sin(performance.now() / 520 + this.x);
      const fy = this.y + this.height - 2;
      const glow = ctx.createRadialGradient(cx, fy, 2, cx, fy, 26);
      glow.addColorStop(0, `rgba(255, 213, 130, ${a.toFixed(2)})`);
      glow.addColorStop(0.55, `rgba(255, 205, 110, ${(a * 0.45).toFixed(2)})`);
      glow.addColorStop(1, "rgba(255, 205, 110, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(cx, fy, 26, 17, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Fake shadow (VERY cheap) ---
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(
      cx, // center X
      this.y + this.height - 2, // just under feet
      this.width * 0.35,
      this.height * 0.18,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // --- NPC sprite ---
    ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);

    // Name on a small dark plate, clear of the head, as you ride up
    const nameShown = d < 170;
    if (nameShown) {
      const alpha = Math.min(1, (170 - d) / 60);
      ctx.font = "600 10.5px 'Segoe UI', Arial, sans-serif";
      const tw = ctx.measureText(this.name).width;
      const padX = 6;
      const chipW = tw + padX * 2;
      const chipH = 16;
      const chipY = this.y - 10 - chipH;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(12, 18, 24, 0.72)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - chipW / 2, chipY, chipW, chipH, 8);
      } else {
        ctx.rect(cx - chipW / 2, chipY, chipW, chipH);
      }
      ctx.fill();
      ctx.fillStyle = "#f2ecdf";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.name, cx, chipY + chipH / 2 + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }

    // A spoken line, same plate language as the name, floating just above
    // it and fading with the moment
    if (this.sayText && this.sayUntil > performance.now()) {
      const remain = this.sayUntil - performance.now();
      const elapsed = this.sayDur - remain;
      const alpha = Math.min(1, elapsed / 250, remain / 600);

      ctx.font = "600 10.5px 'Segoe UI', Arial, sans-serif";
      // wrap into at most two lines around ~120px
      const words = this.sayText.split(" ");
      const lines = [""];
      for (const w of words) {
        const probe = lines[lines.length - 1]
          ? `${lines[lines.length - 1]} ${w}`
          : w;
        if (ctx.measureText(probe).width > 120 && lines[lines.length - 1]) {
          lines.push(w);
        } else {
          lines[lines.length - 1] = probe;
        }
      }
      const lineH = 13;
      const padX = 7;
      const chipW =
        Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
      const chipH = lines.length * lineH + 9;
      const bottom = nameShown ? this.y - 30 : this.y - 12;
      const chipY = bottom - chipH;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(12, 18, 24, 0.78)";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cx - chipW / 2, chipY, chipW, chipH, 8);
      } else {
        ctx.rect(cx - chipW / 2, chipY, chipW, chipH);
      }
      ctx.fill();
      ctx.fillStyle = "#f5efdf";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((l, i) => {
        ctx.fillText(l, cx, chipY + 5 + lineH * i + lineH / 2);
      });
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    } else if (this.sayText && this.sayUntil <= performance.now()) {
      this.sayText = null;
    }
  }
}

export class Quest {
  constructor({
    id,
    description,
    type,
    params,
    rewardScore = 10,
    unlockNPC = null,
    unlockText = null,
  }) {
    this.id = id;
    this.description = description;
    this.type = type;
    this.params = params || {};
    this.rewardScore = rewardScore;
    this.unlockId = unlockNPC;
    this.unlockText = unlockText;
    this.active = false;
    this.completed = false;
  }

  check(player) {
    if (!this.active) return false;

    switch (this.type) {
      case "collect": {
        const have = player.inventory?.[this.params.item] || 0;
        if (have < this.params.amount) return false;
        // Some collections must be dropped somewhere (balls → the pitch)
        if (this.params.dropoff && !player.zones?.[this.params.dropoff]) {
          return false;
        }
        return true;
      }
      case "solvePuzzle":
        return player.solvedPuzzles?.includes(this.params.puzzleId);
      default:
        return false;
    }
  }
  getProgress(player) {
    if (this.type === "collect") {
      const current = player.inventory?.[this.params.item] || 0;
      return { current, total: this.params.amount };
    } else if (this.type === "solvePuzzle") {
      const solved = player.solvedPuzzles?.includes(this.params.puzzleId)
        ? 1
        : 0;
      return { current: solved, total: 1 };
    }
    return null;
  }

  getProgressText(player) {
    const progress = this.getProgress(player);
    if (!progress) return "";
    if (
      this.type === "collect" &&
      this.params.dropoff &&
      progress.current >= progress.total
    ) {
      return ` (${progress.current} / ${progress.total}, drop off at the ${this.params.dropoff})`;
    }
    return ` (${progress.current} / ${progress.total})`;
  }

  unlockNPC(npcId, npcs, { showMessage } = {}) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc) {
      console.warn(`NPC with ID "${npcId}" not found.`);
      return;
    }

    npc.visible = true;
    if (showMessage)
      showMessage(
        this.unlockText ||
          `I believe that ${npc.name} may know more about what's going on here.`,
        5000
      );
  }
}
