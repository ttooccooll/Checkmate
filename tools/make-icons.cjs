// Generates the full icon set from the cover art: PWA/manifest icons,
// apple-touch-icon, and a root favicon.ico. Mini-app browsers (Fedi et al.)
// and home-screen installs look for these rather than the <link rel=icon>.
//   node tools/make-icons.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PUB = path.join(__dirname, "..", "public");

// A 64px PNG wrapped in a single-image ICO container (valid modern .ico)
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // offset: 6 + 16
  return Buffer.concat([header, entry, png]);
}

(async () => {
  const cover = fs.readFileSync(path.join(PUB, "assets", "cover.webp"));
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const icons = await page.evaluate(async (coverB64) => {
    const img = new Image();
    img.src = "data:image/webp;base64," + coverB64;
    await img.decode();

    // Crop in on the rider so the subject stays legible at small sizes
    const crop = { x: 120, y: 150, s: 820 };
    const render = (size) => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, crop.x, crop.y, crop.s, crop.s, 0, 0, size, size);
      return c.toDataURL("image/png").split(",")[1];
    };
    return {
      512: render(512),
      192: render(192),
      180: render(180),
      64: render(64),
    };
  }, cover.toString("base64"));

  await browser.close();

  const buf = (size) => Buffer.from(icons[size], "base64");
  fs.writeFileSync(path.join(PUB, "icon-512.png"), buf(512));
  fs.writeFileSync(path.join(PUB, "icon-192.png"), buf(192));
  fs.writeFileSync(path.join(PUB, "apple-touch-icon.png"), buf(180));
  fs.writeFileSync(path.join(PUB, "favicon.ico"), pngToIco(buf(64), 64));
  console.log("wrote icon-512.png, icon-192.png, apple-touch-icon.png, favicon.ico");
})();
