// A seamless photoreal gravel tile for the district roads: thousands of
// individually shaded stones over compacted fines, rendered supersampled
// at 512 and downscaled to a 256 tile. Generated once; the game just
// tiles it, so realism costs nothing at runtime.
//   node tools/make-gravel.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "public", "assets");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

  const dataUrl = await page.evaluate(() => {
    const S = 512; // supersample; final tile is S/2
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const g = c.getContext("2d");

    // Seeded rng: the tile is reproducible
    let s = 41;
    const rnd = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };

    // --- Compacted fines: dirt base with soft tonal drift ---
    g.fillStyle = "#867d6a";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 40 + rnd() * 110;
      const dark = rnd() < 0.5;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const tone = dark ? "96, 88, 70" : "160, 152, 132";
      grad.addColorStop(0, `rgba(${tone}, ${0.08 + rnd() * 0.1})`);
      grad.addColorStop(1, `rgba(${tone}, 0)`);
      g.fillStyle = grad;
      // wrap the blotches too so the drift is seamless
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }

    // fine grit noise
    for (let i = 0; i < 15000; i++) {
      const light = rnd() < 0.5;
      g.fillStyle = light
        ? `rgba(210, 202, 182, ${0.05 + rnd() * 0.1})`
        : `rgba(58, 52, 42, ${0.05 + rnd() * 0.1})`;
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd(), 1 + rnd());
    }

    // --- Stones: shadow, body, highlight; drawn wrapped for seamlessness ---
    const palette = [
      [154, 145, 125],
      [141, 138, 128],
      [125, 113, 92],
      [150, 118, 90],
      [184, 176, 160],
      [110, 104, 92],
      [166, 152, 128],
    ];

    const stonePath = (px, py, rx, ry, rot, angular, verts) => {
      g.beginPath();
      if (!angular) {
        g.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
        return;
      }
      // crushed stone: irregular polygon
      for (let v = 0; v < verts.length; v++) {
        const [va, vr] = verts[v];
        const a = rot + va;
        const wx = px + Math.cos(a) * rx * vr;
        const wy = py + Math.sin(a) * ry * vr;
        if (v) g.lineTo(wx, wy);
        else g.moveTo(wx, wy);
      }
      g.closePath();
    };

    const drawStone = (x, y, r) => {
      const tone = palette[Math.floor(rnd() * palette.length)];
      const bright = 0.85 + rnd() * 0.3;
      const rx = r * (0.75 + rnd() * 0.5);
      const ry = r * (0.75 + rnd() * 0.5);
      const rot = rnd() * Math.PI;
      const angular = rnd() < 0.45;
      const verts = [];
      if (angular) {
        const n = 5 + Math.floor(rnd() * 3);
        for (let v = 0; v < n; v++) {
          verts.push([(v / n) * Math.PI * 2 + rnd() * 0.5, 0.7 + rnd() * 0.45]);
        }
      }
      const positions = [];
      for (const dx of [-S, 0, S]) {
        for (const dy of [-S, 0, S]) {
          const px = x + dx;
          const py = y + dy;
          if (px > -10 && px < S + 10 && py > -10 && py < S + 10) {
            positions.push([px, py]);
          }
        }
      }
      for (const [px, py] of positions) {
        // embedded, not sitting on top: a tight soft shadow
        g.fillStyle = "rgba(42, 38, 30, 0.3)";
        stonePath(px + r * 0.2, py + r * 0.24, rx, ry, rot, angular, verts);
        g.fill();
        // body
        g.fillStyle = `rgb(${Math.round(tone[0] * bright)}, ${Math.round(
          tone[1] * bright
        )}, ${Math.round(tone[2] * bright)})`;
        stonePath(px, py, rx, ry, rot, angular, verts);
        g.fill();
        // sun catches the upper-left face
        g.fillStyle = `rgba(255, 250, 238, ${0.12 + rnd() * 0.14})`;
        stonePath(
          px - rx * 0.26,
          py - ry * 0.3,
          rx * 0.5,
          ry * 0.45,
          rot,
          angular,
          verts
        );
        g.fill();
      }
    };

    // At aerial scale (this tile spans ~17 metres of road) stones read as
    // pixel glints, not pebbles: plenty of small ones, few large
    for (let i = 0; i < 3400; i++) {
      drawStone(rnd() * S, rnd() * S, 1.2 + Math.pow(rnd(), 2) * 3.4);
    }
    for (let i = 0; i < 40; i++) {
      drawStone(rnd() * S, rnd() * S, 4.5 + rnd() * 2.5);
    }

    // settle it together: a whisper of dust over everything
    g.fillStyle = "rgba(134, 125, 106, 0.1)";
    g.fillRect(0, 0, S, S);

    // --- Downscale to the final tile ---
    const out = document.createElement("canvas");
    out.width = S / 2;
    out.height = S / 2;
    const og = out.getContext("2d");
    og.imageSmoothingQuality = "high";
    og.drawImage(c, 0, 0, S / 2, S / 2);
    return out.toDataURL("image/webp", 0.92);
  });

  fs.writeFileSync(
    path.join(OUT, "gravel.webp"),
    Buffer.from(dataUrl.split(",")[1], "base64")
  );
  // preview PNG for the screenshot gate
  const png = await page.evaluate(async (durl) => {
    const img = new Image();
    img.src = durl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d");
    // 2x2 tiling so seams show if they exist
    for (const dx of [0, 256]) {
      for (const dy of [0, 256]) {
        g.drawImage(img, dx, dy);
      }
    }
    return c.toDataURL("image/png");
  }, dataUrl);
  fs.writeFileSync(
    path.join(__dirname, "gravel-preview.png"),
    Buffer.from(png.split(",")[1], "base64")
  );
  console.log("wrote gravel.webp + preview");
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
