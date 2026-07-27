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
    // the recipient says something on handoff
    said: !!(dp && dp.sayText && dp.sayUntil > performance.now()),
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
        x.type === "taxi" &&
        !x.pullPhase &&
        x.x > 150 &&
        x.x < 3450 &&
        x.y > 150 &&
        x.y < 3450
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

// --- Catch-the-taxi: the dropoff is a real taxi waiting at the verge ---
const taxiRun = await page.evaluate(async () => {
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
  await readDialog();
  // teleports land on parked NPCs and buildings; stay invulnerable for
  // the whole chase and hand a clean state to the death section after
  cm.player.setInvulnerable(1e9);
  cm.deliveries.clearRun(0);
  cm.deliveries.cooldown = 0;
  for (let i = 0; i < 40 && cm.deliveries.state !== "pickup"; i++) {
    await frame();
  }
  cm.deliveries.jobType = "taxiRun";
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
  const enroute =
    cm.deliveries.state === "enroute" && cm.deliveries.jobType === "taxiRun";
  const t = cm.deliveries.targetTaxi;
  if (!enroute || !t) {
    cm.player.x = 2400;
    cm.player.y = 3480;
    cm.player.invulnerableTimer = 0;
    return {
      enroute,
      caught: false,
      jobType: cm.deliveries.jobType,
      state: cm.deliveries.state,
      hasTaxi: !!t,
      dialogOpen: !!document.getElementById("dialog-next-btn"),
    };
  }
  // wait for the taxi to reach the verge, then hand the parcel over
  const t0 = performance.now();
  while (!t.pullPhase && performance.now() - t0 < 30000) {
    await new Promise((r) => setTimeout(r, 200));
  }
  cm.player.x = t.x;
  cm.player.y = t.y - 40;
  await new Promise((r) => setTimeout(r, 700));
  const result = {
    enroute,
    phase: t.pullPhase || "gone",
    caught: cm.deliveries.completed >= 2,
  };
  // clear the stage for the death test: off the road, crashable again
  cm.player.x = 2400;
  cm.player.y = 3480;
  cm.player.invulnerableTimer = 0;
  return result;
});

// --- Death by taxi shows reason + stats ---
await page.waitForTimeout(1700); // invulnerability from the helmet crash
await dieByTaxi(page);
const gameOverMsg = (await page.textContent("#message-modal")).replace(/\n+/g, " | ");

// --- Restarting inside the death-flash window must not stack a second
// game loop (the "impossibly fast on mobile" bug): ticks per animation
// frame stays at one ---
await page.click("#card-new-game-btn");
await page.waitForFunction(
  () =>
    document.getElementById("new-game-btn").textContent.trim() === "Quest Log",
  null,
  { timeout: 25000 }
);
const loopRatio = await page.evaluate(async () => {
  const start = window.__cm.getLoopTicks();
  let rafs = 0;
  await new Promise((resolve) => {
    const t0 = performance.now();
    const step = () => {
      rafs++;
      if (performance.now() - t0 < 800) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return (window.__cm.getLoopTicks() - start) / rafs;
});

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
  delivery.said === true &&
  fragile.carrying === "enroute" &&
  fragile.afterCrash === "idle" &&
  fragile.failed >= 1 &&
  taxiRun.enroute === true &&
  taxiRun.caught === true &&
  gameOverMsg.includes("taxi") &&
  gameOverMsg.includes("km") &&
  gameOverMsg.includes("deliveries") &&
  loopRatio > 0.5 &&
  loopRatio < 1.4 && // exactly one loop per frame, never a stacked chain
  problems.length === 0;

finish("gameplay", ok, {
  started,
  world,
  pausedOn,
  pausedOff,
  loopRatio,
  delivery,
  taxiRun,
  fragile,
  gameOverMsg,
  problems,
});
