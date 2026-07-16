// Share on Nostr: NIP-07 publish path (fake signer + fake relay) and the
// no-extension clipboard fallback, plus modal dismissal.
import {
  launchBrowser,
  BASE_URL,
  startGame,
  parkNpcs,
  dieByTaxi,
  finish,
} from "./helpers.mjs";

const browser = await launchBrowser();
const problems = [];

// --- Path 1: NIP-07 extension present, relays accept ---
const page1 = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page1.on("pageerror", (e) => problems.push("p1 pageerror: " + e.message));
await page1.addInitScript(() => {
  window.__published = [];
  window.WebSocket = class {
    constructor(url) {
      this.url = url;
      setTimeout(() => this.onopen?.(), 15);
    }
    send(raw) {
      const [type, ev] = JSON.parse(raw);
      if (type === "EVENT") {
        window.__published.push({ relay: this.url, event: ev });
        setTimeout(
          () => this.onmessage?.({ data: JSON.stringify(["OK", ev.id, true, ""]) }),
          15
        );
      }
    }
    close() {}
  };
  window.nostr = {
    getPublicKey: async () => "ab".repeat(32),
    signEvent: async (ev) => ({
      ...ev,
      id: "cd".repeat(32),
      pubkey: "ab".repeat(32),
      sig: "ef".repeat(64),
    }),
  };
});
await startGame(page1);
await parkNpcs(page1);
await dieByTaxi(page1);
await page1.click("#share-nostr-btn");
await page1.waitForTimeout(800);
const publishPath = await page1.evaluate(() => ({
  btnText: document.getElementById("share-nostr-btn").textContent,
  publishedCount: window.__published.length,
  kind: window.__published[0]?.event.kind,
  hasGamestrTag: (window.__published[0]?.event.tags || []).some(
    (t) => t[0] === "t" && t[1] === "gamestr"
  ),
  contentHasScore: /Score: \d+/.test(window.__published[0]?.event.content || ""),
}));
await page1.close();

// --- Path 2: no extension -> clipboard fallback ---
const ctx = await browser.newContext({
  viewport: { width: 1000, height: 750 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page2 = await ctx.newPage();
page2.on("pageerror", (e) => problems.push("p2 pageerror: " + e.message));
await startGame(page2);
await parkNpcs(page2);
await dieByTaxi(page2);
await page2.click("#share-nostr-btn");
await page2.waitForTimeout(600);
const fallback = await page2.evaluate(async () => ({
  btnText: document.getElementById("share-nostr-btn").textContent,
  clipboard: await navigator.clipboard.readText().catch(() => "<unreadable>"),
}));
await page2.click("#message-modal", { position: { x: 10, y: 10 } });
const modalClosed = await page2.evaluate(
  () => document.getElementById("message-modal").style.display === "none"
);
await page2.close();
await ctx.close();
await browser.close();

const ok =
  publishPath.btnText.includes("Shared") &&
  publishPath.publishedCount === 3 &&
  publishPath.kind === 1 &&
  publishPath.hasGamestrTag &&
  publishPath.contentHasScore &&
  fallback.btnText.includes("Copied") &&
  /Score: \d+/.test(fallback.clipboard) &&
  modalClosed &&
  problems.length === 0;

finish("nostr", ok, { publishPath, fallback, modalClosed, problems, baseUrl: BASE_URL });
