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
    ];

    this.sprite = new Image();
    this.sprite.src = npcImages[Math.floor(Math.random() * npcImages.length)];

    this.currentQuest = quest;
    this.completedQuests = [];
    this.talking = false;
    this.hasTalked = false;
  }

  isPlayerNearby(player, range = 80) {
    const dx = player.x + player.width / 2 - (this.x + this.width / 2);
    const dy = player.y + player.height / 2 - (this.y + this.height / 2);
    return dx * dx + dy * dy <= range * range;
  }

  interact(player, dialogManager, { showMessage }) {
    const now = performance.now();
    if (now - this.lastTalkTime < 500) return false;

    if (this.hasTalked) return false;
    this.hasTalked = true;

    const lines = [...this.dialogQueue];
    const choices = [];

    // ✅ ONLY create quest choices if a quest exists
    if (
      this.currentQuest !== null &&
      !this.completedQuests.includes(this.currentQuest.id)
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
  // Never trigger while talking
  if (this.talking) return false;

  const npcBox = {
    x: this.x,
    y: this.y,
    width: this.width,
    height: this.height,
  };

  const playerBox = player.getHitbox();

  // Standard AABB collision
  const overlap =
    playerBox.x < npcBox.x + npcBox.width &&
    playerBox.x + playerBox.width > npcBox.x &&
    playerBox.y < npcBox.y + npcBox.height &&
    playerBox.y + playerBox.height > npcBox.y;

  return overlap;
}


  checkQuestCompletion(player) {
    if (
      this.currentQuest?.active &&
      !this.completedQuests.includes(this.currentQuest.id)
    ) {
      if (this.currentQuest.check(player)) {
        this.completedQuests.push(this.currentQuest.id);
        this.currentQuest.active = false;
        questLog.update(npcs);
        showMessage(`🎉 Quest "${this.currentQuest.description}" completed!`);
        return true;
      }
    }
    return false;
  }

  draw(ctx) {
    // Draw at world coordinates
    if (!this.sprite.complete) return; // avoid drawing before loaded
    ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);
  }
}

export class Quest {
  constructor({ id, description, type, params = {} }) {
    this.id = id;
    this.description = description;
    this.type = type; // e.g., "collect" or "solvePuzzle"
    this.params = params; // e.g., { amount: 5, item: "coin" }
    this.active = false;
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
}
