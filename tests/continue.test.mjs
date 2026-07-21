// Zap-to-continue: the game-over card offers a paid continue (stubbed
// invoice), the run resumes with score intact, and a second death in the
// same run gets no second chance.
import {
  launchBrowser,
  startGame,
  parkNpcs,
  dieByTaxi,
  finish,
} from "./helpers.mjs";

const FAKE_INVOICE =
  "lnbc21m1pn0testpp5" + "q".repeat(52) + "sdqqcqzzsxqyz5vqsp5" + "r".repeat(52);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

await page.route("**/api/create-invoice", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      paymentRequest: FAKE_INVOICE,
      paymentHash: "b".repeat(64),
      satoshis: 21000,
    }),
  })
);
await page.route("**/api/check-invoice*", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ paid: true, status: "PAID" }),
  })
);

const started = await startGame(page);
await parkNpcs(page);
await dieByTaxi(page);

const beforeContinue = await page.evaluate(() => ({
  score: window.__cm.getScore(),
  running: window.__cm.isRunning(),
  continueBtn: !!document.getElementById("continue-run-btn"),
}));

// Pay and resume (stubbed invoice settles on the first poll)
await page.click("#continue-run-btn");
await page.waitForTimeout(4000);

const afterContinue = await page.evaluate(() => ({
  score: window.__cm.getScore(),
  running: window.__cm.isRunning(),
  modalHidden:
    document.getElementById("message-modal").style.display === "none",
}));

// Ride out the revival invulnerability, then die again — no second offer
await page.waitForTimeout(3400);
await dieByTaxi(page);
const secondDeath = await page.evaluate(() => ({
  continueBtn: !!document.getElementById("continue-run-btn"),
  shareBtn: !!document.getElementById("share-nostr-btn"),
}));

await browser.close();

const ok =
  started &&
  !beforeContinue.running &&
  beforeContinue.continueBtn &&
  afterContinue.running &&
  afterContinue.modalHidden &&
  afterContinue.score === beforeContinue.score &&
  !secondDeath.continueBtn &&
  secondDeath.shareBtn &&
  problems.length === 0;

finish("continue", ok, { started, beforeContinue, afterContinue, secondDeath, problems });
