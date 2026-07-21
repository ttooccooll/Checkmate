// Re-encodes image assets to WebP (with optional downscale) via headless
// Chromium's canvas encoder. Use when adding new photographic assets so
// they match the size discipline of the existing set (the original 2MB of
// PNG/JPG shipped as 278KB of WebP).
//
//   node tools/make-webp.cjs input1.png input2.jpg ...   (from the repo root)
//
// Writes .webp files next to the inputs. Tune maxDim/quality below per run;
// reference values used originally: photos/textures maxDim 1024 q 0.75-0.8,
// buildings 512 q 0.85, small sprites 128-256 q 0.85-0.92.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const MAX_DIM = Number(process.env.MAX_DIM || 512);
const QUALITY = Number(process.env.QUALITY || 0.85);

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error("usage: [MAX_DIM=512] [QUALITY=0.85] node tools/make-webp.cjs <images...>");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("about:blank");

  for (const input of inputs) {
    const b64 = fs.readFileSync(input).toString("base64");
    const mime = input.endsWith(".jpg") || input.endsWith(".jpeg")
      ? "image/jpeg"
      : "image/png";

    const result = await page.evaluate(
      async ({ b64, mime, maxDim, q }) => {
        const img = new Image();
        img.src = `data:${mime};base64,${b64}`;
        await img.decode();
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL("image/webp", q), w, h };
      },
      { b64, mime, maxDim: MAX_DIM, q: QUALITY }
    );

    const out = input.replace(/\.(png|jpe?g)$/i, ".webp");
    const buf = Buffer.from(result.dataUrl.split(",")[1], "base64");
    fs.writeFileSync(out, buf);
    console.log(
      `${input} (${Math.round(fs.statSync(input).size / 1024)}KB) -> ${out} ${result.w}x${result.h} (${Math.round(buf.length / 1024)}KB)`
    );
  }

  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
