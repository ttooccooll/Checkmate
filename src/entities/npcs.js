// entities/npcs.js
export class NPC {
  constructor(name, x, y, dialog = [], quest = null) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 60;
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

    if (this.currentQuest && !this.completedQuests.includes(this.currentQuest.id)) {
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
    if (this.currentQuest?.active && !this.completedQuests.includes(this.currentQuest.id)) {
      if (this.currentQuest.check(player)) {
        this.completedQuests.push(this.currentQuest.id);
        this.currentQuest.active = false;
        showMessage(`🎉 Quest "${this.currentQuest.description}" completed!`);
        return true;
      }
    }
    return false;
  }

  draw(ctx, camera) {
    if (!ctx) return;
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y;

    ctx.fillStyle = "purple";
    ctx.fillRect(screenX, screenY, this.width, this.height);
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.fillText(this.name, screenX, screenY - 5);
  }
}

// Example Quest structure
export class Quest {
  constructor(id, description, checkCallback) {
    this.id = id;
    this.description = description;
    this.check = checkCallback; // function(player) => boolean
    this.active = false;
  }
}
