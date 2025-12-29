export class DialogManager {
  constructor() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.callback = null;

    this.dialogBox = document.createElement("div");
    this.dialogBox.id = "dialog-box";
    Object.assign(this.dialogBox.style, {
      position: "absolute",
      bottom: "50px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "20px",
      background: "rgba(0,0,0,0.85)",
      color: "white",
      fontFamily: "Arial",
      fontSize: "18px",
      borderRadius: "8px",
      maxWidth: "400px",
      display: "none",
      zIndex: 1000,
    });
    document.body.appendChild(this.dialogBox);
  }

  startDialog(lines = [], choices = [], callback = null) {
    if (!lines.length && !choices.length) return;
    this.activeDialog = [...lines];
    this.currentChoices = choices;
    this.callback = callback;
    this.showNextLine();
  }

  showNextLine() {
    if (this.activeDialog.length > 0) {
      const line = this.activeDialog.shift();
      this.dialogBox.innerHTML = `<p>${line}</p>`;
      this.dialogBox.style.display = "block";
    } else {
      this.showChoices();
    }
  }

  showChoices() {
    if (!this.currentChoices.length) return this.endDialog();

    const choicesHtml = this.currentChoices
      .map(
        (choice, idx) =>
          `<button class="dialog-choice" data-idx="${idx}" style="margin:5px;padding:5px 10px;">${choice.text}</button>`
      )
      .join("");

    this.dialogBox.innerHTML += `<div>${choicesHtml}</div>`;

    this.dialogBox.querySelectorAll(".dialog-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        const choice = this.currentChoices[idx];
        if (choice.callback) choice.callback();
        this.endDialog();
        if (this.onClose) this.onClose();
      });
    });
  }

  endDialog() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.dialogBox.style.display = "none";
    if (this.callback) this.callback();
    this.callback = null;
  }
}
