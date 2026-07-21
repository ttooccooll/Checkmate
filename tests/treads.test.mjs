// Run-scoped upgrades (boost, detector, treads) are wiped on game over.
import {
  launchBrowser,
  collectProblems,
  BASE_URL,
  parkNpcs,
  dieByTaxi,
  finish,
} from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
collectProblems(page, problems);

await page.addInitScript(() => {
  localStorage.setItem(
    "motorcycleUpgrades",
    JSON.stringify({
      speedBoost: true,
      helmet: false,
      offRoadTreads: true,
      metalDetector: true,
      shockAbsorbers: true,
    })
  );
});

await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);
await page.click("#new-game-btn");
await page.waitForFunction(
  () =>
    document.getElementById("new-game-btn").textContent.trim() === "Quest Log",
  null,
  { timeout: 25000 }
);
await parkNpcs(page);
// helmet is false, so a single taxi hit is fatal — dieByTaxi's second
// jump is a no-op after game over
await dieByTaxi(page);

const stored = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("motorcycleUpgrades"))
);
await browser.close();

const ok =
  stored.speedBoost === false &&
  stored.offRoadTreads === false &&
  stored.metalDetector === false &&
  stored.shockAbsorbers === false &&
  problems.length === 0;

finish("treads", ok, { stored, problems });
