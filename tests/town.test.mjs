// Town behavior: quest offers show what they are before accept/decline,
// and taxis keep following distance in a shared lane without deadlocking.
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

// --- No pedestrian may spawn on the road surface (taxis own the road) ---
const npcsOnRoad = await page.evaluate(() => {
  const cm = window.__cm;
  const roads = cm.getRoads();
  return cm.getNpcs().filter((n) =>
    roads.some(
      (r) =>
        n.x + n.width > r.x &&
        n.x < r.x + r.width &&
        n.y + n.height > r.y &&
        n.y < r.y + r.height
    )
  ).length;
});

await parkNpcs(page);
await page.evaluate(() => window.__cm.player.setInvulnerable(1e9));

// --- Potholes, photo markers, and the vehicle fleet ---
const world = await page.evaluate(() => {
  const cm = window.__cm;
  const roads = cm.getRoads();
  const potholes = cm.getPotholes();
  const photos = cm.getItems().filter((i) => i.id === "photo");
  return {
    potholeCount: potholes.length,
    allOnRoad: potholes.every((p) =>
      roads.some(
        (r) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height
      )
    ),
    photoCount: photos.length,
    photosOnPotholes: photos.every((ph) =>
      potholes.some(
        (p) =>
          Math.hypot(p.x - (ph.x + ph.size / 2), p.y - (ph.y + ph.size / 2)) < 3
      )
    ),
    fleet: cm.traffic.taxis.map((t) => t.type),
  };
});

// --- Riding into a pothole registers a jolt ---
await page.evaluate(() => {
  const cm = window.__cm;
  const p = cm.getPotholes()[0];
  cm.player.x = p.x - 40;
  cm.player.y = p.y - cm.player.height / 2;
});
await page.keyboard.down("d");
await page.waitForTimeout(500);
await page.keyboard.up("d");
const jolt = await page.evaluate(() => ({
  slow: window.__cm.getPotholeSlow(),
  hitRegistered: window.__cm.getPotholes().some((p) => p.hitCooldown > 0),
}));

// --- Quest offer prompt: ride up to Nandi, click through her lines ---
await page.evaluate(() => {
  const cm = window.__cm;
  const nandi = cm.getNpcs().find((n) => n.id === "nandi");
  cm.player.x = nandi.x + 40;
  cm.player.y = nandi.y;
});
await page.waitForTimeout(700);

// Each line may need two clicks (finish typing, then advance)
for (let i = 0; i < 10; i++) {
  const nextBtn = await page.$("#dialog-next-btn");
  if (!nextBtn) break;
  await nextBtn.click();
  await page.waitForTimeout(250);
}

const offer = await page.evaluate(() => {
  const box = document.getElementById("dialog-box");
  const prompt = document.getElementById("dialog-quest-prompt");
  const buttons = [...box.querySelectorAll(".dialog-choice")].map(
    (b) => b.textContent
  );
  return { promptText: prompt ? prompt.textContent : null, buttons };
});

// Decline so the rest of the run is unaffected
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll(".dialog-choice")];
  buttons.find((b) => b.textContent.includes("Decline"))?.click();
});
await page.waitForTimeout(300);

// --- Taxi queue: force a faster taxi directly behind another, same lane ---
await page.evaluate(() => {
  const cm = window.__cm;
  const [a, b] = cm.traffic.taxis;
  b.road = a.road;
  b.horizontal = a.horizontal;
  b.forward = a.forward;
  b.heading = a.heading;
  b.speed = a.speed + 0.9; // wants to rear-end the leader
  b.currentSpeed = b.speed;
  if (a.horizontal) {
    a.x = 1200;
    b.x = 1200 - a.forward * 70;
    b.y = a.y;
  } else {
    a.y = 1200;
    b.y = 1200 - a.forward * 70;
    b.x = a.x;
  }
  // move the player far away so player-braking doesn't interfere
  cm.player.x = 40;
  cm.player.y = 2900;
});
await page.waitForTimeout(3000);

const queue = await page.evaluate(() => {
  const [a, b] = window.__cm.traffic.taxis;
  const gap = Math.abs(a.horizontal ? a.x - b.x : a.y - b.y);
  const lateral = Math.abs(a.horizontal ? a.y - b.y : a.x - b.x);
  return {
    gap,
    lateral,
    leaderSpeed: a.currentSpeed,
    followerSpeed: b.currentSpeed,
    allMoving: window.__cm.traffic.taxis.every((t) => t.currentSpeed > 0.1),
  };
});

await browser.close();

const ok =
  started &&
  npcsOnRoad === 0 &&
  world.potholeCount > 0 &&
  world.allOnRoad &&
  world.photoCount === 4 &&
  world.photosOnPotholes &&
  world.fleet.length === 14 &&
  world.fleet.filter((t) => t === "taxi").length === 6 &&
  world.fleet.filter((t) => t === "bakkie").length === 4 &&
  world.fleet.filter((t) => t === "hatch").length === 4 &&
  jolt.hitRegistered &&
  (offer.promptText || "").includes("Search the shoreline") &&
  (offer.promptText || "").includes("+15 points") &&
  offer.buttons.some((b) => b.includes("Accept")) &&
  offer.buttons.some((b) => b.includes("Decline")) &&
  queue.lateral < 5 && // still in the same lane
  queue.gap > 55 && // no overlap (taxis are 75 long, center gap > 55 with follow logic)
  queue.followerSpeed > 0.1 && // following, not frozen
  queue.allMoving && // nobody deadlocked anywhere on the map
  problems.length === 0;

finish("town", ok, { started, npcsOnRoad, world, jolt, offer, queue, problems });
