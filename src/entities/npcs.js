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

    this.visible = !data.hidden;
    this.wasHidden = !!data.hidden;
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

    // --- Fake shadow (VERY cheap) ---
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(
      this.x + this.width / 2, // center X
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

    if (!player) return;
    const cx = this.x + this.width / 2;
    const d = Math.hypot(
      player.x + player.width / 2 - cx,
      player.y + player.height / 2 - (this.y + this.height / 2)
    );

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

    const nameShown = d < 170;
    if (hasNews && d < 460 && !this.talking) {
      // A quiet speech bubble, breathing slowly
      const by = nameShown ? this.y - 24 : this.y - 12;
      const a = 0.55 + 0.2 * Math.sin(performance.now() / 480 + this.x);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#f6f0e0";
      ctx.strokeStyle = "rgba(40, 36, 28, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - 9, by - 6, 18, 12, 5);
      else ctx.rect(cx - 9, by - 6, 18, 12);
      ctx.moveTo(cx - 2, by + 6);
      ctx.lineTo(cx + 1, by + 10);
      ctx.lineTo(cx + 4, by + 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#55503f";
      for (const dx of [-4.5, 0, 4.5]) {
        ctx.beginPath();
        ctx.arc(cx + dx, by, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Name fades in as you ride up
    if (nameShown) {
      const alpha = Math.min(1, (170 - d) / 60);
      ctx.font = "600 11px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(12, 20, 26, ${(alpha * 0.8).toFixed(2)})`;
      ctx.fillText(this.name, cx, this.y - 5);
      ctx.fillStyle = `rgba(245, 239, 225, ${(alpha * 0.95).toFixed(2)})`;
      ctx.fillText(this.name, cx, this.y - 6);
      ctx.textAlign = "left";
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
      return ` (${progress.current} / ${progress.total} — drop off at the ${this.params.dropoff})`;
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
