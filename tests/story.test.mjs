// The main-arc finale: completing mystery_ring_bell triggers the staged
// sequence — glow, bell, beats — ending in a story-complete card with its
// own share text, a +200 bonus, Nandi's epilogue, and a persistent flag.
import {
  launchBrowser,
  collectProblems,
  startGame,
  parkNpcs,
  finish,
} from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
collectProblems(page, problems);

const started = await startGame(page);
await parkNpcs(page);

// Complete the final quest directly: reveal the keeper, activate his
// quest, hand the player the bell.
const setup = await page.evaluate(async () => {
  const cm = window.__cm;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  cm.player.setInvulnerable(1e9);
  const keeper = cm.getNpcs().find((n) => n.id === "lighthouse_keeper");
  keeper.visible = true;
  keeper.currentQuest.active = true;
  cm.player.inventory = { bell: 1 };
  await frame();
  await frame();
  await frame();
  return { questDone: keeper.currentQuest.completed };
});

// Beat 1: the bell message
await page.waitForTimeout(2600);
const bellMsg = (await page.textContent("#message-modal")).trim();

// Mid-sequence: the golden glow should be up
await page.waitForTimeout(3000);
const glow = await page.evaluate(() => window.__cm.ambience.glowAlpha());

// Final card lands at ~14s
await page.waitForTimeout(9500);
const endState = await page.evaluate(() => ({
  modalText: document.getElementById("message-modal").textContent,
  shareBtn: !!document.getElementById("share-nostr-btn"),
  storyFlag: localStorage.getItem("checkmateStoryComplete"),
  nandiOpener: window.__cm.getNpcs().find((n) => n.id === "nandi")
    ?.dialogQueue[0],
  // Town gossip: the stage system should have given Musa his bell lines
  musaOpener: window.__cm.getNpcs().find((n) => n.id === "musa")
    ?.dialogQueue[0],
  score: null,
}));

await browser.close();

const ok =
  started &&
  setup.questDone &&
  bellMsg.includes("bell") &&
  glow > 0.05 &&
  endState.modalText.includes("Bell of the Bay") &&
  endState.modalText.includes("Story complete") &&
  endState.shareBtn &&
  endState.storyFlag === "true" &&
  (endState.nandiOpener || "").includes("heard it too") &&
  (endState.musaOpener || "").includes("in the water") &&
  problems.length === 0;

finish("story", ok, { started, setup, bellMsg, glow, endState, problems });
