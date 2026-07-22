// The full loop: skids, taxis, pause, a standard delivery start to finish,
// a fragile package ruined by a crash, then death by taxi with stats.
import {
  launchBrowser,
  collectProblems,
  startGame,
  parkNpcs,
  dieByTaxi,
  finish,
} from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
collectProblems(page, problems);

const started = await startGame(page);
await parkNpcs(page);

// Teleporting to parked NPCs can land inside buildings — stay invulnerable
// until the test wants a crash to count
await page.evaluate(() => window.__cm.player.setInvulnerable(1e9));

// --- Drive an S-curve: skid marks + engine without incident ---
for (const key of ["d", "s", "a", "w", "d"]) {
  await page.keyboard.down(key);
  await page.waitForTimeout(300);
  await page.keyboard.up(key);
}
const world = await page.evaluate(() => ({
  skids: window.__cm.skidMarks.marks.length,
  taxis: window.__cm.traffic.taxis.length,
}));

// --- Pause on P, resume on P ---
await page.keyboard.press("p");
await page.waitForTimeout(200);
const pausedOn = await page.evaluate(() => window.__cm.isPaused());
await page.keyboard.press("p");
await page.waitForTimeout(200);
const pausedOff = await page.evaluate(() => window.__cm.isPaused());

// --- Standard delivery, forced deterministic, start to finish ---
// Arriving at the pickup opens the NPC's dialog, and packages now wait
// until the player has finished reading — so read like a player would.
const delivery = await page.evaluate(async () => {
  const cm = window.__cm;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const readDialog = async () => {
    for (let i = 0; i < 16; i++) {
      const btn = document.getElementById("dialog-next-btn");
      if (!btn) break;
      btn.click();
      await new Promise((r) => setTimeout(r, 120));
    }
    const decline = [...document.querySelectorAll(".dialog-choice")].find(
      (b) => b.textContent.includes("Decline")
    );
    if (decline) {
      decline.click();
      await new Promise((r) => setTimeout(r, 120));
    }
  };
  cm.deliveries.cooldown = 0;
  await frame(); await frame(); await frame();
  const offered = cm.deliveries.state;

  // pin the job type so a two-stop roll can't change the flow
  cm.deliveries.jobType = "standard";
  cm.deliveries.legsRemaining = 1;

  const pk = cm.deliveries.pickupNpc;
  if (pk) {
    cm.player.x = pk.x;
    cm.player.y = pk.y + 20;
  }
  await frame(); await frame(); await frame();
  // While the conversation is open, the package must wait
  const held = document.getElementById("dialog-next-btn")
    ? cm.deliveries.state
    : null;
  // Parked NPCs stand close together — drain every conversation that
  // opens until the package is actually collected
  for (let i = 0; i < 6 && cm.deliveries.state === "pickup"; i++) {
    await readDialog();
    await frame(); await frame(); await frame();
  }
  const afterPickup = cm.deliveries.state;
  const timer = Math.round(cm.deliveries.timer);

  const dp = cm.deliveries.dropoffNpc;
  if (dp) {
    cm.player.x = dp.x;
    cm.player.y = dp.y + 20;
  }
  await frame(); await frame(); await frame();
  return {
    offered,
    held,
    afterPickup,
    timer,
    completed: cm.deliveries.completed,
    endState: cm.deliveries.state,
  };
});

// --- Fragile package + crash = ruined delivery (helmet absorbs the hit) ---
const fragile = await page.evaluate(async () => {
  const cm = window.__cm;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const readDialog = async () => {
    for (let i = 0; i < 16; i++) {
      const btn = document.getElementById("dialog-next-btn");
      if (!btn) break;
      btn.click();
      await new Promise((r) => setTimeout(r, 120));
    }
    const decline = [...document.querySelectorAll(".dialog-choice")].find(
      (b) => b.textContent.includes("Decline")
    );
    if (decline) {
      decline.click();
      await new Promise((r) => setTimeout(r, 120));
    }
  };
  // Close the dropoff NPC's conversation first — offers wait for dialog
  await readDialog();
  cm.deliveries.clearRun(0);
  cm.deliveries.cooldown = 0;
  for (let i = 0; i < 40 && cm.deliveries.state !== "pickup"; i++) {
    await frame();
  }
  cm.deliveries.jobType = "fragile";
  cm.deliveries.legsRemaining = 1;
  const pk = cm.deliveries.pickupNpc;
  if (pk) {
    cm.player.x = pk.x;
    cm.player.y = pk.y + 20;
  }
  await frame(); await frame(); await frame();
  for (let i = 0; i < 6 && cm.deliveries.state === "pickup"; i++) {
    await readDialog();
    await frame(); await frame(); await frame();
  }
  const carrying = cm.deliveries.state;

  // crash into a taxi — helmet saves the rider, not the package.
  // Avoid taxis mid-wrap at the world edge (teleport would clamp and miss).
  cm.player.invulnerableTimer = 0; // this crash is supposed to count
  const t =
    cm.traffic.taxis.find(
      (x) =>
        x.type === "taxi" && x.x > 150 && x.x < 3450 && x.y > 150 && x.y < 3450
    ) || cm.traffic.taxis[0];
  cm.player.x = t.x - 15;
  cm.player.y = t.y - 15;
  await frame(); await frame(); await frame();
  return {
    carrying,
    afterCrash: cm.deliveries.state,
    failed: cm.deliveries.failed,
  };
});

// --- Death by taxi shows reason + stats ---
await page.waitForTimeout(1700); // invulnerability from the helmet crash
await dieByTaxi(page);
const gameOverMsg = (await page.textContent("#message-modal")).replace(/\n+/g, " | ");

await browser.close();

const ok =
  started &&
  world.skids > 0 &&
  world.taxis === 18 &&
  pausedOn === true &&
  pausedOff === false &&
  delivery.offered === "pickup" &&
  delivery.held !== "enroute" && // reading never starts the run
  delivery.afterPickup === "enroute" &&
  delivery.timer > 0 &&
  delivery.completed === 1 &&
  delivery.endState === "idle" &&
  fragile.carrying === "enroute" &&
  fragile.afterCrash === "idle" &&
  fragile.failed >= 1 &&
  gameOverMsg.includes("taxi") &&
  gameOverMsg.includes("km") &&
  gameOverMsg.includes("deliveries") &&
  problems.length === 0;

finish("gameplay", ok, {
  started,
  world,
  pausedOn,
  pausedOff,
  delivery,
  fragile,
  gameOverMsg,
  problems,
});
