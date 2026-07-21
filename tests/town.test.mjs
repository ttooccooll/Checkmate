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

// --- World props, the pitch, and the keeper at his lighthouse ---
// (checked before parkNpcs moves everyone)
const townScape = await page.evaluate(() => {
  const cm = window.__cm;
  const roads = cm.getRoads();
  const props = cm.getProps();
  const pitch = cm.getPitch();
  const lh = cm.getLighthouse();
  const keeper = cm.getNpcs().find((n) => n.id === "lighthouse_keeper");
  const balls = cm.getItems().filter((i) => i.id === "ball");
  const onRoad = (x, y, w, h) =>
    roads.some(
      (r) => x + w > r.x && x < r.x + r.width && y + h > r.y && y < r.y + r.height
    );
  return {
    propCount: props.length,
    propsOnRoad: props.filter((p) => onRoad(p.x, p.y, p.w, p.h)).length,
    pitchPlaced: !!pitch,
    pitchOnRoad: pitch ? onRoad(pitch.x, pitch.y, pitch.w, pitch.h) : true,
    keeperAtLighthouse: keeper
      ? Math.hypot(keeper.x - lh.x, keeper.y - lh.y) < 150
      : false,
    ballsOnPitch:
      !!pitch &&
      balls.length > 0 &&
      balls.every(
        (b) =>
          b.x > pitch.x &&
          b.x < pitch.x + pitch.w &&
          b.y > pitch.y &&
          b.y < pitch.y + pitch.h
      ),
  };
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
    // Hard-yielding at a crossing legally stops a vehicle, so "everyone
    // moving" is no longer an invariant — but most of the fleet should be.
    movingCount: window.__cm.traffic.taxis.filter((t) => t.currentSpeed > 0.1)
      .length,
  };
});

// --- Crossing yield: a vertical vehicle must never overlap a horizontal
// one occupying the intersection — it stops and waits ---
const crossing = await page.evaluate(async () => {
  const cm = window.__cm;
  const A = cm.traffic.taxis.find((t) => t.horizontal);
  const B = cm.traffic.taxis.find((t) => !t.horizontal);
  const cx = B.road.x + B.road.width / 2;
  const cy = A.road.y + A.road.height / 2;

  A.x = cx; // park the horizontal one crawling through the box
  A.speed = 0.8;
  A.currentSpeed = 0.8;
  B.y = cy - B.forward * 160; // vertical approaches the same box
  B.currentSpeed = B.speed;

  const hit = (r1, r2) =>
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y;

  let everOverlapped = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (hit(A.hitbox(), B.hitbox())) everOverlapped = true;
  }
  return { everOverlapped, bSpeed: B.currentSpeed };
});

// --- The "stopped on the tracks" case: a vertical already mid-crossing
// must commit and clear while the arriving horizontal stops for it ---
const crossing2 = await page.evaluate(async () => {
  const cm = window.__cm;
  const A = cm.traffic.taxis.filter((t) => t.horizontal)[1] ||
    cm.traffic.taxis.find((t) => t.horizontal);
  const B = cm.traffic.taxis.filter((t) => !t.horizontal)[1] ||
    cm.traffic.taxis.find((t) => !t.horizontal);
  const cx = B.road.x + B.road.width / 2;

  // B is straddling A's lane right now; A bears down from 130px away
  B.y = A.y; // dead center of A's lane
  B.currentSpeed = B.speed;
  A.x = cx - A.forward * 130;
  A.speed = 3.2;
  A.currentSpeed = 3.2;

  const hit = (r1, r2) =>
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y;

  let everOverlapped = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (hit(A.hitbox(), B.hitbox())) everOverlapped = true;
  }
  // B must have cleared the lane, not parked on it
  const bCleared = Math.abs(B.y - A.y) > 60;
  return { everOverlapped, bCleared };
});

// --- Gridlock melts: over 6 seconds of normal running, every vehicle
// must actually cover ground (the unstick failsafe guarantees it) ---
const gridlock = await page.evaluate(async () => {
  const cm = window.__cm;
  const before = cm.traffic.taxis.map((t) => ({ x: t.x, y: t.y }));
  await new Promise((r) => setTimeout(r, 6000));
  const moved = cm.traffic.taxis.filter(
    (t, i) => Math.hypot(t.x - before[i].x, t.y - before[i].y) > 40
  ).length;
  return { moved, total: cm.traffic.taxis.length };
});

await browser.close();

const ok =
  started &&
  npcsOnRoad === 0 &&
  townScape.propCount >= 12 &&
  townScape.propsOnRoad === 0 &&
  townScape.pitchPlaced &&
  !townScape.pitchOnRoad &&
  townScape.keeperAtLighthouse &&
  townScape.ballsOnPitch &&
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
  queue.movingCount >= 10 && // a couple may be waiting at crossings, most roll
  crossing.everOverlapped === false && // crossing traffic never overlaps
  crossing2.everOverlapped === false && // even when caught mid-box
  crossing2.bCleared && // the mid-box crosser commits and clears
  gridlock.moved === gridlock.total && // nobody is permanently stuck
  problems.length === 0;

finish("town", ok, {
  started,
  npcsOnRoad,
  townScape,
  world,
  jolt,
  offer,
  queue,
  crossing,
  crossing2,
  gridlock,
  problems,
});
