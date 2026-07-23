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
  // World generation takes a moment — wait for the button to flip
  // Loading… → Quest Log instead of guessing a fixed delay
  await page
    .waitForFunction(
      () =>
        document.getElementById("new-game-btn").textContent.trim() ===
        "Quest Log",
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
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

// Crash into a taxi twice: once for the helmet, once fatal.
// Taxis wrap through a ±90px margin outside the world — a mid-wrap taxi
// would make the teleport clamp back in-bounds and miss, so pick one
// that's safely inside.
export async function dieByTaxi(page) {
  await page.evaluate(async () => {
    const cm = window.__cm;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const safeTaxi = () =>
      cm.traffic.taxis.find(
        (t) =>
          t.type === "taxi" &&
          t.x > 150 &&
          t.x < 3450 &&
          t.y > 150 &&
          t.y < 3450
      ) || cm.traffic.taxis[0];
    const jump = async () => {
      const t = safeTaxi();
      cm.player.x = t.x - 15;
      cm.player.y = t.y - 15;
      await frame();
      await frame();
      await frame();
    };
    // Wait out any invulnerability (spawn grace, helmet save) OFF the
    // road — with 18 vehicles roaming, ambient traffic could otherwise
    // land the hit first and the death message names the wrong vehicle.
    // (2400, 3480) clears every possible road position and the lighthouse.
    // Invulnerability is frame-based, so poll it instead of guessing a
    // wall-clock delay (headless frames run slow under load).
    const waitCrashable = () =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const poll = () => {
          if (
            cm.player.invulnerableTimer <= 0 ||
            performance.now() - t0 > 8000
          ) {
            resolve();
          } else {
            setTimeout(poll, 100);
          }
        };
        poll();
      });

    cm.player.x = 2400;
    cm.player.y = 3480;
    await waitCrashable();
    await jump(); // helmet absorbs this one (when owned)
    cm.player.x = 2400;
    cm.player.y = 3480;
    await waitCrashable();
    // the fatal hit: retry until the run actually ends — a taxi can
    // slip out from under a single teleport on a slow frame
    const tKill = performance.now();
    while (cm.isRunning() && performance.now() - tKill < 6000) {
      await jump();
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await page.waitForSelector("#share-nostr-btn", { timeout: 5000 });
}

export function finish(name, ok, details) {
  console.log(JSON.stringify({ test: name, ok, ...details }, null, 2));
  process.exit(ok ? 0 : 1);
}
