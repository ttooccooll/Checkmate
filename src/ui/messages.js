// The center-screen message modal: transient toasts (click-through) and the
// interactive game-over card with its Share-on-Nostr button.

import { sfx } from "../services/audio.js";
import { shareToNostr } from "../services/nostr.js";

// Two visible toast slots: the newest message takes the headline and the
// previous one demotes to a smaller line beneath it for a moment —
// a delivery, a coin, and a squall arriving together no longer erase
// each other. Interactive cards still own the whole modal.
let toastSlots = []; // [{ text, until }]

function renderToasts(modal) {
  modal.textContent = "";
  toastSlots.forEach((s, i) => {
    const line = document.createElement("div");
    line.className = i === 0 ? "toast-line" : "toast-line toast-old";
    line.textContent = s.text;
    modal.appendChild(line);
  });
  modal.style.display = toastSlots.length ? "block" : "none";
}

export function clearToasts() {
  toastSlots = [];
}

export function showMessage(text, duration = 5000, closable = false) {
  const modal = document.getElementById("message-modal");
  modal.classList.toggle("interactive", closable);
  modal.classList.remove("card-dark", "loading-pulse");
  clearTimeout(modal._timer);

  if (closable) {
    toastSlots = [];
    modal.textContent = text;
    modal.style.display = "block";
    modal.onclick = () => {
      modal.style.display = "none";
      modal.classList.remove("interactive");
      modal.onclick = null;
    };
    return;
  }

  modal.onclick = null;
  const now = performance.now();
  toastSlots = toastSlots.filter((s) => s.until > now);
  const prev = toastSlots[0];
  toastSlots = [{ text, until: now + duration }];
  if (prev) {
    // the demoted line gets a short grace period, not its full run
    toastSlots.push({
      text: prev.text,
      until: Math.min(prev.until, now + 2600),
    });
  }
  renderToasts(modal);

  const tick = () => {
    const n = performance.now();
    const before = toastSlots.length;
    toastSlots = toastSlots.filter((s) => s.until > n);
    if (toastSlots.length !== before || !toastSlots.length) {
      renderToasts(modal);
    }
    if (toastSlots.length) modal._timer = setTimeout(tick, 250);
  };
  modal._timer = setTimeout(tick, 250);
}

// End-of-run card: a dark, quiet layout — title, cause, the score large,
// one muted stats line — with pay-to-continue, New Game, and Share-on-Nostr
// actions. Clicking anywhere outside the buttons closes it.
export function showGameOverMessage(content, shareText, options = {}) {
  const modal = document.getElementById("message-modal");
  clearTimeout(modal._timer);
  toastSlots = [];
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
          ? "📋 Copied. Paste it into your Nostr client"
          : "📋 Couldn't publish. Copied instead";
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
