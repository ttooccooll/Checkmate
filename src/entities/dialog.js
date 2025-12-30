export class DialogManager {
  constructor() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.callback = null;
    this.onClose = null;
    this.speakerName = "";

    this.dialogBox = document.createElement("div");
    this.dialogBox.id = "dialog-box";

    Object.assign(this.dialogBox.style, {
      position: "absolute",
      bottom: "50%",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "10px",
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

    this.handleDialogClick = this.handleDialogClick.bind(this);
  }

  startDialog(name, lines = [], choices = [], callback = null) {
    if (!lines.length && !choices.length) return;
    this.speakerName = name;
    this.activeDialog = [...lines];
    this.currentChoices = choices;
    this.callback = callback;
    this.showNextLine();
  }

  showNextLine() {
    if (!this.activeDialog) return;

    if (this.activeDialog.length > 0) {
      const line = this.activeDialog.shift();

      this.dialogBox.innerHTML = `
      <div style="margin-bottom:8px;">
        <strong>${this.speakerName}:</strong>
      </div>
      <div style="margin-bottom:10px;">
        ${line}
      </div>
      <button id="dialog-next-btn" style="padding:6px 12px; display:block; margin:0 auto;">
        Next
      </button>
    `;

      this.dialogBox.style.display = "block";

      document
        .getElementById("dialog-next-btn")
        .addEventListener("click", () => this.showNextLine());
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

    this.dialogBox.innerHTML = `
  <div style="margin-bottom:8px;">
    <strong>${this.speakerName}:</strong>
  </div>
  <div>${choicesHtml}</div>
`;

    this.dialogBox.querySelectorAll(".dialog-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx);
        const choice = this.currentChoices[idx];
        if (choice.callback) choice.callback();
        this.closeDialog();
      });
    });
  }

  handleDialogClick(e) {
    if (e.target.classList.contains("dialog-choice")) return;

    if (!this.activeDialog) return;

    if (this.activeDialog.length > 0) {
      this.showNextLine();
    } else {
      // No lines left → no choices → close dialog
      this.endDialog();
    }
  }

  endDialog() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.dialogBox.style.display = "none";

    if (this.callback) this.callback();

    this.callback = null;
    this.onClose = null;
  }

  closeDialog() {
    this.endDialog();
    if (this.onClose) this.onClose();
  }
}
