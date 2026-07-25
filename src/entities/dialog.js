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

    // All chrome lives in style.css (#dialog-box) — same dark-card
    // language as the game-over card and name plates
    this.dialogBox.style.display = "none";
    document.body.appendChild(this.dialogBox);

    this.handleDialogClick = this.handleDialogClick.bind(this);
  }

  startDialog(name, lines = [], choices = [], callback = null, choicePrompt = "") {
    if (!lines.length && !choices.length) return;
    this.speakerName = name;
    this.activeDialog = [...lines];
    this.currentChoices = choices;
    this.callback = callback;
    this.choicePrompt = choicePrompt;
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
      <div class="dialog-speaker">${this.speakerName}</div>
      <div id="dialog-text"></div>
      <button id="dialog-next-btn">Next</button>
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
          `<button class="dialog-choice${
            /accept/i.test(choice.text) ? " dialog-choice-accept" : ""
          }" data-idx="${idx}">${choice.text}</button>`
      )
      .join("");

    const promptHtml = this.choicePrompt
      ? `<div id="dialog-quest-prompt">${this.choicePrompt}</div>`
      : "";

    this.dialogBox.innerHTML = `
  <div class="dialog-speaker">${this.speakerName}</div>
  ${promptHtml}
  <div class="dialog-choices">${choicesHtml}</div>
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

    // Did the player actually read to the end, or drive off mid-sentence?
    const finished = !this.activeDialog || this.activeDialog.length === 0;

    this.isTyping = false;
    this.activeDialog = null;
    this.currentChoices = [];
    this.choicePrompt = "";
    this.dialogBox.style.display = "none";

    if (this.callback) this.callback(finished);

    this.callback = null;
    this.onClose = null;
  }

  closeDialog() {
    this.endDialog();
    if (this.onClose) this.onClose();
  }
}
