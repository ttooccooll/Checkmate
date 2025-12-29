// entities/dialog.js

export class DialogManager {
  constructor() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.callback = null;

    // Create a simple overlay for dialog
    this.dialogBox = document.createElement("div");
    this.dialogBox.id = "dialog-box";
    this.dialogBox.style.position = "absolute";
    this.dialogBox.style.bottom = "50px";
    this.dialogBox.style.left = "50%";
    this.dialogBox.style.transform = "translateX(-50%)";
    this.dialogBox.style.padding = "20px";
    this.dialogBox.style.background = "rgba(0,0,0,0.8)";
    this.dialogBox.style.color = "white";
    this.dialogBox.style.fontFamily = "Arial";
    this.dialogBox.style.fontSize = "18px";
    this.dialogBox.style.borderRadius = "8px";
    this.dialogBox.style.maxWidth = "400px";
    this.dialogBox.style.display = "none";
    this.dialogBox.style.zIndex = 1000;

    document.body.appendChild(this.dialogBox);
  }

  startDialog(lines, choices = [], callback = null) {
    if (!lines || lines.length === 0) return;
    this.activeDialog = [...lines]; // clone the array
    this.currentChoices = choices;
    this.callback = callback;
    this.showNextLine();
  }

  showNextLine() {
    if (!this.activeDialog || this.activeDialog.length === 0) {
      this.showChoices();
      return;
    }

    const line = this.activeDialog.shift();
    this.dialogBox.innerHTML = `<p>${line}</p>`;
    this.dialogBox.style.display = "block";
  }

  showChoices() {
    if (this.currentChoices.length === 0) {
      this.endDialog();
      return;
    }

    const choicesHtml = this.currentChoices
      .map(
        (choice, idx) =>
          `<button class="dialog-choice" data-idx="${idx}" style="margin:5px;padding:5px 10px;">${choice.text}</button>`
      )
      .join("");

    this.dialogBox.innerHTML += `<div>${choicesHtml}</div>`;

    this.dialogBox.querySelectorAll(".dialog-choice").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(btn.dataset.idx);
        const choice = this.currentChoices[idx];
        if (choice.callback) choice.callback();
        this.endDialog();
      });
    });
  }

  endDialog() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.callback = null;
    this.dialogBox.style.display = "none";
  }
}
