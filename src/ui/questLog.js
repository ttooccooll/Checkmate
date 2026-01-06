export class QuestLogManager {
  constructor() {
    this.visible = false;

    this.container = document.createElement("div");
    this.container.id = "quest-log";

    this.container.innerHTML = `
      <h3>📜 Quest Log</h3>
      <div class="quest-section">
        <strong>Active</strong>
        <ul id="quest-log-active"></ul>
      </div>
      <div class="quest-section">
        <strong>Completed</strong>
        <ul id="quest-log-completed"></ul>
      </div>
    `;

    Object.assign(this.container.style, {
      position: "absolute",
      top: "60px",
      right: "20px",
      width: "260px",
      background: "rgba(0,0,0,0.85)",
      color: "white",
      padding: "10px",
      borderRadius: "8px",
      fontFamily: "Arial",
      zIndex: 3000,
      display: "none",
    });

    document.body.appendChild(this.container);
  }

  toggle() {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? "block" : "none";
  }

  hide() {
    this.visible = false;
    this.container.style.display = "none";
  }

  update(npcs, player) {
    const active = this.container.querySelector("#quest-log-active");
    const completed = this.container.querySelector("#quest-log-completed");
console.log(npc.name, q.id, q.active, q.completed);

    if (!active || !completed) return;

    active.innerHTML = "";
    completed.innerHTML = "";

    npcs.forEach((npc) => {
      const q = npc.currentQuest;
      if (!q) return;

      // Active quest
      if (q.active && !npc.completedQuests.includes(q.id)) {
        const li = document.createElement("li");
        li.textContent = q.description + q.getProgressText(player);
        active.appendChild(li);
      }

      // Completed quest
      if (npc.completedQuests.includes(q.id)) {
        const li = document.createElement("li");
        li.textContent = `✔ ${q.description}`;
        completed.appendChild(li);
      }
    });
  }
}
