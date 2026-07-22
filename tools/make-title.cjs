// The title sign: a hand-painted wooden board in the coastal spaza-sign
// tradition — weathered teal planks, cream lettering laid on by brush
// (every letter sits a little differently), amber second line, chips and
// speckle where the sea air has been at it.
//   node tools/make-title.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "public", "assets");

// Seeded rng so the sign is reproducible
let s = 11;
const rnd = () => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return s / 2147483648;
};

const W = 1240;
const H = 430;

function letters(text, cx, y, size, fill, spacing, weight = 900) {
  // Hand-painted: each letter gets its own tilt, drop, and a hair of size
  const widths = text.length * spacing;
  let x = cx - widths / 2 + spacing / 2;
  let out = "";
  for (const ch of text) {
    const rot = (rnd() - 0.5) * 4.6;
    const dy = (rnd() - 0.5) * 7;
    const sz = size * (0.97 + rnd() * 0.07);
    out += `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}"
      transform="rotate(${rot.toFixed(2)} ${x.toFixed(1)} ${(y + dy).toFixed(1)})"
      font-family="Arial Black, Arial, sans-serif" font-weight="${weight}"
      font-size="${sz.toFixed(1)}" fill="${fill}" text-anchor="middle">${ch}</text>`;
    x += spacing;
  }
  return out;
}

function titleSvg() {
  // Planks
  const plankColors = ["#20606427", "", "", ""];
  void plankColors;
  const planks = [
    { y: 12, h: 102, c: "#216064" },
    { y: 116, h: 100, c: "#1d585c" },
    { y: 218, h: 102, c: "#215e60" },
    { y: 322, h: 96, c: "#1b5356" },
  ]
    .map(
      (p) =>
        `<rect x="14" y="${p.y}" width="${W - 28}" height="${p.h}" fill="${p.c}"/>
         <rect x="14" y="${p.y + p.h - 2}" width="${W - 28}" height="3" fill="#12393c" opacity="0.85"/>`
    )
    .join("");

  // Wood grain: faint long streaks along each plank
  let grain = "";
  for (let i = 0; i < 26; i++) {
    const gy = 22 + rnd() * (H - 44);
    const gx = 30 + rnd() * (W - 300);
    const len = 90 + rnd() * 260;
    grain += `<path d="M ${gx} ${gy} q ${len / 2} ${(rnd() - 0.5) * 6} ${len} 0"
      stroke="rgba(10, 40, 42, ${(0.12 + rnd() * 0.14).toFixed(2)})" stroke-width="${(1 + rnd() * 1.6).toFixed(1)}" fill="none"/>`;
  }

  // Nails at plank ends
  let nails = "";
  for (const py of [63, 166, 269, 368]) {
    for (const nx of [34, W - 34]) {
      nails += `<circle cx="${nx}" cy="${py}" r="4.2" fill="#2c2318"/>
                <circle cx="${nx - 1}" cy="${py - 1}" r="1.4" fill="#6a5a42" opacity="0.8"/>`;
    }
  }

  // Chips: sea air took the paint down to the wood
  let chips = "";
  for (let i = 0; i < 9; i++) {
    const cx = 30 + rnd() * (W - 60);
    const cy = 18 + rnd() * (H - 36);
    const r = 4 + rnd() * 9;
    let pts = "";
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2;
      const rr = r * (0.6 + rnd() * 0.6);
      pts += `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr * 0.7).toFixed(1)} `;
    }
    chips += `<polygon points="${pts}" fill="#7d6647" opacity="${(0.5 + rnd() * 0.3).toFixed(2)}"/>`;
  }

  // Speckle: salt and old paint flecks
  let speckle = "";
  for (let i = 0; i < 60; i++) {
    speckle += `<circle cx="${(20 + rnd() * (W - 40)).toFixed(1)}" cy="${(16 + rnd() * (H - 32)).toFixed(1)}"
      r="${(0.6 + rnd() * 1.5).toFixed(1)}" fill="rgba(238, 230, 208, ${(0.06 + rnd() * 0.12).toFixed(2)})"/>`;
  }

  // Hand-painted border: two passes, neither quite straight
  const border = (inset, w, o) => {
    let d = `M ${inset} ${inset + 6}`;
    const steps = 26;
    const per = (W - inset * 2) / steps;
    for (let i = 1; i <= steps; i++)
      d += ` L ${(inset + per * i).toFixed(1)} ${(inset + (rnd() - 0.5) * 5).toFixed(1)}`;
    for (let i = 1; i <= 8; i++)
      d += ` L ${(W - inset + (rnd() - 0.5) * 5).toFixed(1)} ${(inset + ((H - inset * 2) / 8) * i).toFixed(1)}`;
    for (let i = 1; i <= steps; i++)
      d += ` L ${(W - inset - per * i).toFixed(1)} ${(H - inset + (rnd() - 0.5) * 5).toFixed(1)}`;
    for (let i = 1; i <= 8; i++)
      d += ` L ${(inset + (rnd() - 0.5) * 5).toFixed(1)} ${(H - inset - ((H - inset * 2) / 8) * i).toFixed(1)}`;
    d += " Z";
    return `<path d="${d}" fill="none" stroke="#eee6d0" stroke-width="${w}" opacity="${o}" stroke-linejoin="round"/>`;
  };

  // The lettering
  const checkmate = letters("CHECKMATE", W / 2, 178, 118, "#f2e9d2", 122);
  const delivery = letters("DELIVERY", W / 2, 296, 66, "#e8a13d", 88);

  // Small caption with painted dashes either side
  const caption = `
    <rect x="${W / 2 - 300}" y="357" width="90" height="4" rx="2" fill="#cfc4a6" opacity="0.7" transform="rotate(-0.6 ${W / 2 - 255} 359)"/>
    <text x="${W / 2}" y="369" font-family="Arial, sans-serif" font-weight="600" font-size="27"
      fill="#d8cdae" text-anchor="middle" letter-spacing="9" opacity="0.9">SOUTH COAST</text>
    <rect x="${W / 2 + 210}" y="357" width="90" height="4" rx="2" fill="#cfc4a6" opacity="0.7" transform="rotate(0.8 ${W / 2 + 255} 359)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="ds" x="-6%" y="-8%" width="112%" height="120%">
        <feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000" flood-opacity="0.45"/>
      </filter>
      <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.09"/>
        <stop offset="0.25" stop-color="#ffffff" stop-opacity="0.02"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.14"/>
      </linearGradient>
    </defs>
    <g filter="url(#ds)">
      <rect x="10" y="8" width="${W - 20}" height="${H - 16}" rx="10" fill="#17484b"/>
      ${planks}
      ${grain}
      ${chips}
      <rect x="10" y="8" width="${W - 20}" height="${H - 16}" rx="10" fill="url(#sheen)"/>
      ${border(30, 6, 0.9)}
      ${border(30, 3, 0.35)}
      ${nails}
      ${checkmate}
      ${delivery}
      ${caption}
      ${speckle}
    </g>
  </svg>`;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;background:transparent">${titleSvg()}</body>`
  );
  const el = await page.$("svg");
  const png = await el.screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(__dirname, "title-sign-preview.png"), png);
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", 0.94);
  }, png.toString("base64"));
  fs.writeFileSync(
    path.join(OUT, "title-sign.webp"),
    Buffer.from(dataUrl.split(",")[1], "base64")
  );
  console.log("wrote title-sign.webp");
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
