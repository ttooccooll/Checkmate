// Test orchestrator: API handler tests first (no server), then the browser
// suite against a vite preview of the production build. `npm test` runs
// this after `pretest` builds.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const BROWSER_TESTS = [
  "smoke",
  "gameplay",
  "story",
  "continue",
  "rain",
  "town",
  "mobile",
  "nostr",
  "qr",
  "treads",
];
const PORT = 8347;

function runNode(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let failures = 0;

console.log("\n=== api ===");
if ((await runNode("tests/api.test.mjs")) !== 0) failures++;

const server = spawn(
  "npx",
  ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
  { stdio: "ignore" }
);

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.ok) {
      up = true;
      break;
    }
  } catch {
    /* not up yet */
  }
  await delay(250);
}

if (!up) {
  console.error("vite preview failed to start");
  server.kill();
  process.exit(1);
}

for (const name of BROWSER_TESTS) {
  console.log(`\n=== ${name} ===`);
  if ((await runNode(`tests/${name}.test.mjs`)) !== 0) failures++;
}

server.kill();
console.log(failures ? `\n${failures} test file(s) FAILED` : "\nAll tests passed");
process.exit(failures ? 1 : 0);
