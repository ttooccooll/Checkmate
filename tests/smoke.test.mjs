// Game boots, starts, drives, and the volume cycle responds.
import { launchBrowser, collectProblems, startGame, finish } from "./helpers.mjs";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
collectProblems(page, problems);

const started = await startGame(page);

await page.keyboard.down("d");
await page.waitForTimeout(600);
await page.keyboard.up("d");

await page.keyboard.press("m");
await page.waitForTimeout(300);
const volumeMsg = (await page.textContent("#message-modal")).trim();

await browser.close();

finish("smoke", started && volumeMsg.includes("Sound") && problems.length === 0, {
  started,
  volumeMsg,
  problems,
});
