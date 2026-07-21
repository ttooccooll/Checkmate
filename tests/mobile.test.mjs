// Mobile layout and controls on an emulated iPhone: clean pregame title,
// touch hint text, on-screen pause/volume, and the wallet deep link
// alongside the copy-invoice backup.
import { chromium, devices } from "playwright";
import { BASE_URL, finish } from "./helpers.mjs";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);

const pregame = await page.evaluate(() => {
  const vis = (id) => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== "none";
  };
  return {
    newGame: vis("new-game-btn"),
    shopHidden: !vis("helmet-btn"),
    // check the containers: children of display:none parents still report
    // their own computed display
    arrowsHidden: !vis("touch-controls"),
    utilsHidden: !vis("mobile-utils"),
    hint: document.getElementById("intro-hint").textContent,
  };
});

await page.click("#new-game-btn");
await page.waitForTimeout(2500);

const ingame = await page.evaluate(() => {
  const vis = (id) => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== "none";
  };
  return {
    shopVisible: vis("helmet-btn"),
    arrowsVisible: vis("up-btn"),
    utilsVisible: vis("pause-btn"),
    walletBtnExists: !!document.getElementById("open-wallet-btn"),
    copyBtnExists: !!document.getElementById("copy-invoice-btn"),
  };
});

// On-screen volume first — read the modal immediately, before the delayed
// intro story message can overwrite it
await page.click("#sound-btn");
const soundMsg = (await page.textContent("#message-modal")).trim();

// On-screen pause
await page.click("#pause-btn");
await page.waitForTimeout(200);
const pausedOn = await page.evaluate(() => window.__cm.isPaused());
await page.click("#pause-btn");
await page.waitForTimeout(200);
const pausedOff = await page.evaluate(() => window.__cm.isPaused());

await browser.close();

const ok =
  pregame.newGame &&
  pregame.shopHidden &&
  pregame.arrowsHidden &&
  pregame.utilsHidden &&
  pregame.hint.includes("Drag") &&
  ingame.shopVisible &&
  ingame.arrowsVisible &&
  ingame.utilsVisible &&
  ingame.walletBtnExists &&
  ingame.copyBtnExists &&
  pausedOn === true &&
  pausedOff === false &&
  soundMsg.includes("Sound") &&
  problems.length === 0;

finish("mobile", ok, { pregame, ingame, pausedOn, pausedOff, soundMsg, problems });
