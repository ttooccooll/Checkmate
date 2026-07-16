// The center-screen message modal: transient toasts (click-through) and the
// interactive game-over card with its Share-on-Nostr button.

import { sfx } from "../services/audio.js";
import { shareToNostr } from "../services/nostr.js";

export function showMessage(text, duration = 5000, closable = false) {
  const modal = document.getElementById("message-modal");
  modal.textContent = text;
  modal.style.display = "block";
  modal.classList.toggle("interactive", closable);

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

// Game-over modal with a "Share on Nostr" button; clicking anywhere else
// closes it, the button itself never does.
export function showGameOverMessage(text, shareText) {
  const modal = document.getElementById("message-modal");
  clearTimeout(modal._timer);
  modal.textContent = text;

  const shareRow = document.createElement("div");
  shareRow.className = "share-row";

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
    modal.style.display = "none";
    modal.classList.remove("interactive");
    modal.onclick = null;
  };
}
