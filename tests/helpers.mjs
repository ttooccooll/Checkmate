import { chromium } from "playwright";

export const BASE_URL = process.env.TEST_URL || "http://127.0.0.1:8347/";

export function launchBrowser(options = {}) {
  return chromium.launch({ headless: true, ...options });
}

export function collectProblems(page, problems) {
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console.error: " + m.text());
  });
}

export async function startGame(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.click("#new-game-btn");
  await page.waitForTimeout(2500);
  return (await page.textContent("#new-game-btn")).trim() === "Quest Log";
}

// Move every NPC into a corner so scripted driving can't hit a pedestrian
export function parkNpcs(page) {
  return page.evaluate(() => {
    window.__cm.getNpcs().forEach((n, i) => {
      n.x = 2820;
      n.y = 80 + i * 90;
    });
  });
}

// Crash into a taxi twice: once for the helmet, once fatal
export async function dieByTaxi(page) {
  await page.evaluate(async () => {
    const cm = window.__cm;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const jump = async () => {
      const t = cm.traffic.taxis[0];
      cm.player.x = t.x - 15;
      cm.player.y = t.y - 15;
      await frame();
      await frame();
      await frame();
    };
    await jump();
    await new Promise((r) => setTimeout(r, 1700));
    await jump();
  });
  await page.waitForSelector("#share-nostr-btn", { timeout: 5000 });
}

export function finish(name, ok, details) {
  console.log(JSON.stringify({ test: name, ok, ...details }, null, 2));
  process.exit(ok ? 0 : 1);
}
