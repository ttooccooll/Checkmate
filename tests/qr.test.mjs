// The QR payment flow renders a square code from a stubbed invoice and
// cancel hides it. The "no WebLN provider" warning is the designed
// fallback path, not a failure.
import { launchBrowser, BASE_URL, finish } from "./helpers.mjs";

const FAKE_INVOICE =
  "lnbc500n1pn0testpp5" + "q".repeat(52) + "sdqqcqzzsxqyz5vqsp5" + "r".repeat(52);

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

await page.route("**/api/create-invoice", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      paymentRequest: FAKE_INVOICE,
      paymentHash: "a".repeat(64),
      satoshis: 50,
    }),
  })
);
await page.route("**/api/check-invoice*", (route) =>
  route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ paid: false, status: "PENDING" }),
  })
);

await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1200);
await page.click("#new-game-btn");
await page.waitForTimeout(2000);

// Helmet is owned by default; Speed Boost triggers the QR flow
await page.click("#speed-boost-btn");
await page.waitForSelector("#qr-container.visible", { timeout: 10000 });
await page.waitForTimeout(800);

const qr = await page.evaluate(() => {
  const canvas = document.getElementById("qr-code");
  const rect = canvas.getBoundingClientRect();
  return {
    internalW: canvas.width,
    internalH: canvas.height,
    displayW: Math.round(rect.width),
    displayH: Math.round(rect.height),
    invoiceShown: document.getElementById("invoice-text").textContent.length > 0,
  };
});

await page.click("#cancel-payment-btn");
await page.waitForTimeout(300);
const hiddenAfterCancel = await page.evaluate(
  () => !document.getElementById("qr-container").classList.contains("visible")
);

await browser.close();

const square =
  qr.internalW === qr.internalH && qr.displayW === qr.displayH && qr.displayW > 0;

finish("qr", square && qr.invoiceShown && hiddenAfterCancel && problems.length === 0, {
  qr,
  square,
  hiddenAfterCancel,
  problems,
});
