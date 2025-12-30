export class DialogManager {
  constructor() {
    this.activeDialog = null;
    this.currentChoices = [];
    this.callback = null;
    this.onClose = null;
    this.speakerName = "";

    this.dialogBox = document.createElement("div");
    this.dialogBox.id = "dialog-box";

    this.typingSpeed = 25; // ms per character
    this.isTyping = false;
    this.fullLineText = "";
    this.typeInterval = null;

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

    // If currently typing, finish instantly
    if (this.isTyping) {
      clearInterval(this.typeInterval);
      this.isTyping = false;

      const textEl = this.dialogBox.querySelector("#dialog-text");
      if (textEl) textEl.textContent = this.fullLineText;
      return;
    }

    if (this.activeDialog.length > 0) {
      const line = this.activeDialog.shift();
      this.fullLineText = line;

      this.dialogBox.innerHTML = `
      <div style="margin-bottom:8px;">
        <strong>${this.speakerName}:</strong>
      </div>
      <div id="dialog-text" style="margin-bottom:10px; min-width:250px;"></div>
      <button id="dialog-next-btn"
        style="padding:6px 12px; display:block; margin:0 auto;">
        Next
      </button>
    `;

      this.dialogBox.style.display = "block";

      const textEl = this.dialogBox.querySelector("#dialog-text");
      const nextBtn = this.dialogBox.querySelector("#dialog-next-btn");

      this.isTyping = true;
      textEl.textContent = "";

      let index = 0;
      this.typeInterval = setInterval(() => {
        if (index < line.length) {
          textEl.textContent += line[index++];
        } else {
          clearInterval(this.typeInterval);
          this.isTyping = false;
        }
      }, this.typingSpeed);

      nextBtn.addEventListener("click", () => this.showNextLine());
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
    if (this.typeInterval) {
      clearInterval(this.typeInterval);
      this.typeInterval = null;
    }

    this.isTyping = false;
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
