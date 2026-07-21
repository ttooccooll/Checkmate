// Rain squalls: dry handling is unchanged (instant stop on key release),
// wet handling carries momentum (the bike slides), and the rain state
// reports correctly. Runs on an open road so nothing interrupts the slide.
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

// Put the player on an open horizontal road, invulnerable so taxis and
// scenery can't end the test
await page.evaluate(() => {
  const cm = window.__cm;
  cm.player.setInvulnerable(1e9);
  const t = cm.traffic.taxis.find((x) => x.horizontal) || cm.traffic.taxis[0];
  cm.player.x = 600;
  cm.player.y = t.road.y + t.road.height / 2 - cm.player.height / 2;
});

async function rideAndRelease() {
  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  const atRelease = await page.evaluate(() => window.__cm.player.x);
  await page.waitForTimeout(400);
  const afterCoast = await page.evaluate(() => window.__cm.player.x);
  return afterCoast - atRelease;
}

// --- Dry control: releasing the key stops the bike immediately ---
const dryCoast = await rideAndRelease();

// --- Force a squall at full intensity ---
await page.evaluate(() => {
  const a = window.__cm.ambience;
  a.rainTarget = 1;
  a.rainIntensity = 1;
  a.rainEndsAt = 1e9;
  a.nextWeatherAt = 1e9;
});
await page.waitForTimeout(300);
const raining = await page.evaluate(() => window.__cm.ambience.isRaining());

// Reset position for the wet run
await page.evaluate(() => {
  const cm = window.__cm;
  const t = cm.traffic.taxis.find((x) => x.horizontal) || cm.traffic.taxis[0];
  cm.player.x = 600;
  cm.player.y = t.road.y + t.road.height / 2 - cm.player.height / 2;
});

// --- Wet run: the bike keeps sliding after release ---
const wetCoast = await rideAndRelease();

// Sliding should also have left skid marks
const skids = await page.evaluate(() => window.__cm.skidMarks.marks.length);

// --- Fog rolls in slowly now: ~8s ramp, so after 2s it's still building ---
await page.evaluate(() => {
  const a = window.__cm.ambience;
  a.rainTarget = 0;
  a.rainIntensity = 0;
  a.fogTarget = 1;
  a.fogIntensity = 0;
  a.fogEndsAt = 1e9;
  a.nextWeatherAt = 1e9;
});
await page.waitForTimeout(2000);
const fogRamp = await page.evaluate(() => window.__cm.ambience.fogIntensity);

await browser.close();

const ok =
  started &&
  raining &&
  dryCoast < 2 && // dry: instant stop, exactly the old handling
  wetCoast > 5 && // wet: real momentum
  wetCoast > dryCoast + 4 &&
  skids > 0 &&
  fogRamp > 0.1 && // fog is building...
  fogRamp < 0.45 && // ...but a 3s ramp would already be at ~0.66
  problems.length === 0;

finish("rain", ok, {
  started,
  raining,
  dryCoast,
  wetCoast,
  skids,
  fogRamp,
  problems,
});
