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
      "/assets/npc1.png",
      "/assets/npc2.png",
      "/assets/npc3.png",
      "/assets/npc4.png",
      "/assets/npc5.png",
    ];

    this.sprite = new Image();
    this.sprite.src = npcImages[Math.floor(Math.random() * npcImages.length)];

    this.currentQuest = quest;
    this.completedQuests = [];
    this.talking = false;
    this.hasTalked = false;
    this.postQuestDialog = data.postQuestDialog || [];
    this.hasReactedToQuest = false;

    this.visible = !data.hidden;
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

    // 🎉 Post-quest reaction takes priority
    if (
      this.currentQuest &&
      this.completedQuests.includes(this.currentQuest.id) &&
      this.postQuestDialog.length &&
      !this.hasReactedToQuest
    ) {
      lines = [...this.postQuestDialog];
      this.hasReactedToQuest = true;
    }

    const choices = [];

    // ✅ ONLY create quest choices if a quest exists
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

    dialogManager.startDialog(this.name, lines, choices, () => {
      this.talking = false;
      this.lastTalkTime = performance.now();
    });

    this.talking = true;
    return true;
  }

  checkDangerCollision(player) {
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

        // 🔹 Automatically unlock NPCs if needed
        switch (this.currentQuest.id) {
          case "mystery_bell_fragments":
            unlockNPC("kagiso", npcs, { showMessage });
            break;
          case "mystery_old_routes":
            unlockNPC("thabo", npcs, { showMessage });
            break;
          case "mystery_keeper_clues":
            unlockNPC("hlokomela", npcs, { showMessage });
            break;
          case "mystery_clear_path":
            enableLighthouseBell();
            break;
        }

        return this.currentQuest;
      }
    }
    return null;
  }

  draw(ctx) {
    if (!this.sprite.complete) return;
    if (!this.visible) return;
    // --- Fake shadow (VERY cheap) ---
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(
      this.x + this.width / 2, // center X
      this.y + this.height - 2, // just under feet
      this.width * 0.35, // shadow width
      this.height * 0.18, // shadow height
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // --- NPC sprite ---
    ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
  }
}

export class Quest {
  constructor({ id, description, type, params, rewardScore = 10 }) {
    this.id = id;
    this.description = description;
    this.type = type;
    this.params = params || {};
    this.rewardScore = rewardScore;

    this.completed = false;
  }

  check(player) {
    if (!this.active) return false;

    switch (this.type) {
      case "collect":
        return player[this.params.item + "s"] >= this.params.amount;
      case "solvePuzzle":
        return player.solvedPuzzles?.includes(this.params.puzzleId);
      default:
        return false;
    }
  }
  getProgress(player) {
    switch (this.type) {
      case "collect": {
        const current = player[this.params.item + "s"] || 0;
        return {
          current,
          total: this.params.amount,
        };
      }

      case "solvePuzzle": {
        const solved = player.solvedPuzzles?.includes(this.params.puzzleId)
          ? 1
          : 0;
        return {
          current: solved,
          total: 1,
        };
      }

      default:
        return null;
    }
  }

  getProgressText(player) {
    const progress = this.getProgress(player);
    if (!progress) return "";
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
        `I believe that ${npc.name} may know more about what's going on here.`
      );
  }
}
