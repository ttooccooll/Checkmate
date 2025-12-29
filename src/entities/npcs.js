// entities/npcs.js
export class NPC {
  constructor(name, x, y, dialog = [], quest = null) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 60;
    this.sprite = new Image();
    const npcImages = [
      "/assets/npc1.png",
      "/assets/npc2.png",
      "/assets/npc3.png",
    ];
    this.sprite = new Image();
    this.sprite.src = npcImages[Math.floor(Math.random() * npcImages.length)];
    this.dialogQueue = dialog;
    this.currentQuest = quest;
    this.completedQuests = [];
  }

  isPlayerNearby(player, range = 80) {
    const dx = player.x + player.width / 2 - (this.x + this.width / 2);
    const dy = player.y + player.height / 2 - (this.y + this.height / 2);
    return dx * dx + dy * dy <= range * range;
  }

  interact(player, dialogManager) {
    if (!this.dialogQueue.length && !this.currentQuest) return false;

    const choices = [];

    if (
      this.currentQuest &&
      !this.completedQuests.includes(this.currentQuest.id)
    ) {
      choices.push({
        text: "Accept Quest",
        callback: () => {
          showMessage(`Quest accepted: ${this.currentQuest.description}`);
          this.currentQuest.active = true;
        },
      });
      choices.push({
        text: "Decline",
        callback: () => {
          showMessage("Maybe next time!");
        },
      });
    }

    dialogManager.startDialog([...this.dialogQueue], choices);
    return true;
  }

  checkQuestCompletion(player) {
    if (
      this.currentQuest?.active &&
      !this.completedQuests.includes(this.currentQuest.id)
    ) {
      if (this.currentQuest.check(player)) {
        this.completedQuests.push(this.currentQuest.id);
        this.currentQuest.active = false;
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

    // Optionally, draw a name above NPC
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.fillText(this.name, this.x, this.y - 5);
  }
}

export class Quest {
  constructor(id, description, checkCallback) {
    this.id = id;
    this.description = description;
    this.check = checkCallback; // function(player) => boolean
    this.active = false;
  }
}
