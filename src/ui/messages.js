// The center-screen message modal: transient toasts (click-through) and the
// interactive game-over card with its Share-on-Nostr button.

import { sfx } from "../services/audio.js";
import { shareToNostr } from "../services/nostr.js";

export function showMessage(text, duration = 5000, closable = false) {
  const modal = document.getElementById("message-modal");
  modal.textContent = text;
  modal.style.display = "block";
  modal.classList.toggle("interactive", closable);
  modal.classList.remove("card-dark");

  clearTimeout(modal._timer);

  if (closable) {
    modal.onclick = () => {
      modal.style.display = "none";
      modal.classList.remove("interactive");
      modal.onclick = null;
    };
  } else {
    modal.onclick = null;
    modal._timer = setTimeout(() => {
      modal.style.display = "none";
    }, duration);
  }
}

// End-of-run card: a dark, quiet layout — title, cause, the score large,
// one muted stats line — with pay-to-continue, New Game, and Share-on-Nostr
// actions. Clicking anywhere outside the buttons closes it.
export function showGameOverMessage(content, shareText, options = {}) {
  const modal = document.getElementById("message-modal");
  clearTimeout(modal._timer);
  modal.textContent = "";
  modal.classList.add("card-dark");

  const line = (cls, text) => {
    if (text === undefined || text === null) return;
    const el = document.createElement("div");
    el.className = cls;
    el.textContent = text;
    modal.appendChild(el);
  };

  line("go-title", content.title);
  line("go-reason", content.subtitle);
  if (content.score !== undefined) line("go-score", String(content.score));
  if (content.scoreNote) {
    line(content.isBest ? "go-score-note best" : "go-score-note", content.scoreNote);
  }
  (content.lines || []).forEach((l) => line("go-stats", l));

  const closeModal = () => {
    modal.style.display = "none";
    modal.classList.remove("interactive", "card-dark");
    modal.onclick = null;
  };

  const shareRow = document.createElement("div");
  shareRow.className = "share-row";

  if (options.continueLabel && options.onContinue) {
    const contBtn = document.createElement("button");
    contBtn.id = "continue-run-btn";
    contBtn.textContent = options.continueLabel;
    contBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (contBtn.disabled) return;
      contBtn.disabled = true;
      contBtn.classList.add("busy");
      contBtn.textContent = "Waiting for payment…";

      const paid = await options.onContinue();
      if (paid) {
        closeModal();
      } else {
        contBtn.classList.remove("busy");
        contBtn.disabled = false;
        contBtn.textContent = options.continueLabel;
      }
    });
    shareRow.appendChild(contBtn);
  }

  if (options.onNewGame) {
    const newBtn = document.createElement("button");
    newBtn.id = "card-new-game-btn";
    newBtn.textContent = "New Game";
    newBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeModal();
      options.onNewGame();
    });
    shareRow.appendChild(newBtn);
  }

  const shareBtn = document.createElement("button");
  shareBtn.id = "share-nostr-btn";
  shareBtn.textContent = "⚡ Share on Nostr";
  shareBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (shareBtn.disabled) return;
    shareBtn.disabled = true;
    shareBtn.classList.add("busy");
    shareBtn.textContent = "Signing…";

    const result = await shareToNostr(shareText);
    shareBtn.classList.remove("busy");

    if (result.ok) {
      shareBtn.classList.add("success");
      shareBtn.textContent = "✅ Shared to Nostr!";
      sfx.delivered();
      return;
    }

    if (result.reason === "rejected") {
      shareBtn.classList.add("declined");
      shareBtn.textContent = "Signing declined";
      setTimeout(() => {
        shareBtn.classList.remove("declined");
        shareBtn.disabled = false;
        shareBtn.textContent = "⚡ Share on Nostr";
      }, 1600);
      return;
    }

    // No extension (or no relay reachable): hand them the note to paste
    try {
      await navigator.clipboard.writeText(shareText);
      shareBtn.classList.add("success");
      shareBtn.textContent =
        result.reason === "no-extension"
          ? "📋 Copied — paste into your Nostr client"
          : "📋 Couldn't publish — copied instead";
    } catch {
      shareBtn.textContent = "❌ Sharing unavailable";
    }
  });

  shareRow.appendChild(shareBtn);
  modal.appendChild(shareRow);

  modal.style.display = "block";
  modal.classList.add("interactive");
  modal.onclick = (e) => {
    if (e.target.closest(".share-row")) return;
    closeModal();
  };
}
