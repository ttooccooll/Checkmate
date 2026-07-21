// Renders world-prop sprites (water tanks, shipping containers, upturned
// boats, the lighthouse) to WebP in public/assets/, via headless Chromium.
//
//   node tools/make-props.cjs        (run from the repo root)
//
// Top-down, photoreal-leaning SVG with baked soft shadows, same pipeline
// as the vehicles. World scale reference: ~15px per metre (taxi = 5m = 75px).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "assets");

// JoJo-style rainwater tank, top-down: concentric shell, radial ribs, lid.
function tankSvg(shellOuter, shellMid, shellInner, lid) {
  const ribs = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x1 = 100 + Math.cos(a) * 78;
    const y1 = 100 + Math.sin(a) * 78;
    const x2 = 100 + Math.cos(a) * 92;
    const y2 = 100 + Math.sin(a) * 92;
    ribs.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(0,0,0,0.18)" stroke-width="3.5"/>`
    );
  }
  return `
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="shell" cx="0.38" cy="0.36" r="0.75">
      <stop offset="0" stop-color="${shellInner}"/>
      <stop offset="0.55" stop-color="${shellMid}"/>
      <stop offset="1" stop-color="${shellOuter}"/>
    </radialGradient>
    <radialGradient id="lid" cx="0.42" cy="0.4" r="0.7">
      <stop offset="0" stop-color="${lid}"/>
      <stop offset="1" stop-color="${shellMid}"/>
    </radialGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <circle cx="106" cy="110" r="90" fill="rgba(0,0,0,0.4)" filter="url(#drop)"/>
  <circle cx="100" cy="100" r="92" fill="url(#shell)" stroke="rgba(0,0,0,0.35)" stroke-width="2.5"/>
  ${ribs.join("\n  ")}
  <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="4"/>
  <circle cx="100" cy="100" r="40" fill="url(#lid)" stroke="rgba(0,0,0,0.22)" stroke-width="2"/>
  <circle cx="100" cy="100" r="12" fill="${shellMid}" stroke="rgba(0,0,0,0.3)" stroke-width="2"/>
  <path d="M 60 62 A 55 55 0 0 1 118 48" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="9" stroke-linecap="round"/>
</svg>`;
}

// 6m shipping container, top-down: corrugated roof ridges, door-end
// locking bars, weathering and rust bloom.
function containerSvg(top, mid, edge, rust) {
  const ridges = [];
  for (let x = 36; x <= 344; x += 14) {
    ridges.push(
      `<line x1="${x}" y1="26" x2="${x}" y2="126" stroke="rgba(0,0,0,0.16)" stroke-width="4"/>`,
      `<line x1="${x + 4}" y1="26" x2="${x + 4}" y2="126" stroke="rgba(255,255,255,0.12)" stroke-width="2.5"/>`
    );
  }
  return `
<svg width="380" height="160" viewBox="0 0 380 160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${edge}"/>
      <stop offset="0.18" stop-color="${mid}"/>
      <stop offset="0.5" stop-color="${top}"/>
      <stop offset="0.82" stop-color="${mid}"/>
      <stop offset="1" stop-color="${edge}"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <rect x="26" y="30" width="336" height="104" rx="8" fill="rgba(0,0,0,0.4)" filter="url(#drop)" transform="translate(6,9)"/>
  <rect x="20" y="22" width="340" height="108" rx="7" fill="url(#body)" stroke="rgba(0,0,0,0.4)" stroke-width="3"/>
  ${ridges.join("\n  ")}
  <!-- corner castings -->
  <rect x="22" y="24" width="14" height="14" rx="2" fill="rgba(0,0,0,0.35)"/>
  <rect x="344" y="24" width="14" height="14" rx="2" fill="rgba(0,0,0,0.35)"/>
  <rect x="22" y="114" width="14" height="14" rx="2" fill="rgba(0,0,0,0.35)"/>
  <rect x="344" y="114" width="14" height="14" rx="2" fill="rgba(0,0,0,0.35)"/>
  <!-- door end: seam + locking bar heads -->
  <line x1="352" y1="26" x2="352" y2="126" stroke="rgba(0,0,0,0.4)" stroke-width="3"/>
  <rect x="354" y="38" width="6" height="10" rx="2" fill="rgba(0,0,0,0.45)"/>
  <rect x="354" y="62" width="6" height="10" rx="2" fill="rgba(0,0,0,0.45)"/>
  <rect x="354" y="86" width="6" height="10" rx="2" fill="rgba(0,0,0,0.45)"/>
  <rect x="354" y="106" width="6" height="10" rx="2" fill="rgba(0,0,0,0.45)"/>
  <!-- weathering -->
  <ellipse cx="70" cy="40" rx="30" ry="10" fill="${rust}" opacity="0.28"/>
  <ellipse cx="300" cy="116" rx="40" ry="9" fill="${rust}" opacity="0.32"/>
  <ellipse cx="180" cy="30" rx="22" ry="6" fill="${rust}" opacity="0.2"/>
  <rect x="23" y="25" width="334" height="102" rx="5" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="6"/>
  <path d="M 40 44 L 200 36" stroke="rgba(255,255,255,0.22)" stroke-width="7" stroke-linecap="round" fill="none"/>
</svg>`;
}

// Upturned dinghy: hull-up, pointed bow, keel line, plank strakes.
function boatSvg(hullTop, hullMid, hullEdge, keel) {
  return `
<svg width="160" height="360" viewBox="0 0 160 360" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="hull" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${hullEdge}"/>
      <stop offset="0.2" stop-color="${hullMid}"/>
      <stop offset="0.5" stop-color="${hullTop}"/>
      <stop offset="0.8" stop-color="${hullMid}"/>
      <stop offset="1" stop-color="${hullEdge}"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
  </defs>
  <path d="M 84 26 C 130 70 138 150 134 250 L 130 330 C 128 342 42 342 40 330 L 36 250 C 32 150 40 70 86 26 Z"
        fill="rgba(0,0,0,0.4)" filter="url(#drop)" transform="translate(6,10)"/>
  <path d="M 80 18 C 126 62 134 142 130 242 L 126 322 C 124 334 36 334 34 322 L 30 242 C 26 142 34 62 80 18 Z"
        fill="url(#hull)" stroke="rgba(0,0,0,0.42)" stroke-width="3"/>
  <!-- strakes -->
  <path d="M 80 34 C 114 72 120 146 117 240 L 114 314" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2.5"/>
  <path d="M 80 34 C 46 72 40 146 43 240 L 46 314" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2.5"/>
  <path d="M 80 52 C 102 84 106 150 104 240 L 102 310" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>
  <path d="M 80 52 C 58 84 54 150 56 240 L 58 310" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="2"/>
  <!-- keel -->
  <path d="M 80 22 L 80 330" stroke="${keel}" stroke-width="7" stroke-linecap="round"/>
  <path d="M 80 22 L 80 330" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>
  <!-- transom -->
  <path d="M 36 326 C 60 336 100 336 124 326" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="4"/>
  <!-- sun catch on one side -->
  <path d="M 70 60 C 52 100 48 170 50 250" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round"/>
  <!-- scuffs -->
  <ellipse cx="96" cy="200" rx="9" ry="26" fill="rgba(255,255,255,0.12)"/>
  <ellipse cx="60" cy="270" rx="7" ry="18" fill="rgba(0,0,0,0.12)"/>
</svg>`;
}

// The lighthouse from above: rocky base, white tower ring with red band
// segments visible at the rim, gallery railing, lantern-room glazing.
function lighthouseSvg() {
  // The outcrop is a mound of individually shaded boulders — overlapping
  // rounded stones with top-left highlights and grounded shadows read as
  // rock in a way flat facets never do.
  const rnd = (() => {
    let s = 7;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();

  const boulders = [];
  const stones = [];
  // Dense inner mass under and around the tower, thinning outward
  for (let ring = 0; ring < 3; ring++) {
    const count = [14, 16, 12][ring];
    const dist = [58, 96, 126][ring];
    const size = [26, 20, 13][ring];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.7 + rnd() * 0.4;
      const d = dist + (rnd() - 0.5) * 26;
      const br = size * (0.7 + rnd() * 0.65);
      const bx = 170 + Math.cos(a) * d;
      const by = 170 + Math.sin(a) * d;
      const tone = 96 + Math.floor(rnd() * 46);
      const warm = Math.floor(rnd() * 10);
      const rotDeg = Math.floor(rnd() * 180);
      const ry = br * (0.72 + rnd() * 0.24);
      boulders.push({ bx, by, br, ry, tone, warm, rotDeg });
    }
  }
  // sort so higher (smaller y) boulders draw first — lower ones overlap
  // them the way a mound stacks
  boulders.sort((a, b) => a.by - b.by);
  const boulderSvg = boulders
    .map((b) => {
      // Mix cool granite grays with warm weathered browns
      const cool = rnd() < 0.5;
      const t = 88 + Math.floor(rnd() * 58);
      const base = cool
        ? `rgb(${t}, ${t + 3}, ${t + 7})`
        : `rgb(${t + 14}, ${t + 6}, ${t - 6})`;
      const lumpDx = (rnd() - 0.5) * b.br * 0.7;
      const lumpDy = (rnd() - 0.5) * b.ry * 0.7;
      // mottling: darker mineral patches
      const mottles = [];
      const nm = 2 + Math.floor(rnd() * 2);
      for (let m = 0; m < nm; m++) {
        mottles.push(
          `<ellipse cx="${(b.bx + (rnd() - 0.5) * b.br).toFixed(1)}" cy="${(b.by + (rnd() - 0.5) * b.ry).toFixed(1)}" rx="${(b.br * (0.15 + rnd() * 0.2)).toFixed(1)}" ry="${(b.ry * (0.12 + rnd() * 0.18)).toFixed(1)}" fill="rgba(24, 22, 20, ${(0.1 + rnd() * 0.1).toFixed(2)})"/>`
        );
      }
      // coastal lichen on about a third of the stones
      const lichen =
        rnd() < 0.34
          ? `<ellipse cx="${(b.bx + (rnd() - 0.5) * b.br * 0.8).toFixed(1)}" cy="${(b.by + (rnd() - 0.5) * b.ry * 0.8).toFixed(1)}" rx="${(b.br * 0.32).toFixed(1)}" ry="${(b.ry * 0.26).toFixed(1)}" fill="rgba(126, 128, 74, ${(0.16 + rnd() * 0.12).toFixed(2)})"/>`
          : "";
      const hi = 0.18 + rnd() * 0.18;
      return `
  <g transform="rotate(${b.rotDeg} ${b.bx.toFixed(1)} ${b.by.toFixed(1)})">
    <ellipse cx="${(b.bx + 3).toFixed(1)}" cy="${(b.by + 4.5).toFixed(1)}" rx="${b.br.toFixed(1)}" ry="${b.ry.toFixed(1)}" fill="rgba(0,0,0,0.32)"/>
    <ellipse cx="${b.bx.toFixed(1)}" cy="${b.by.toFixed(1)}" rx="${b.br.toFixed(1)}" ry="${b.ry.toFixed(1)}" fill="${base}" stroke="rgba(38,34,30,0.55)" stroke-width="1.3"/>
    <ellipse cx="${(b.bx + lumpDx).toFixed(1)}" cy="${(b.by + lumpDy).toFixed(1)}" rx="${(b.br * 0.72).toFixed(1)}" ry="${(b.ry * 0.75).toFixed(1)}" fill="${base}" stroke="rgba(38,34,30,0.3)" stroke-width="1"/>
    <ellipse cx="${(b.bx + b.br * 0.24).toFixed(1)}" cy="${(b.by + b.ry * 0.3).toFixed(1)}" rx="${(b.br * 0.74).toFixed(1)}" ry="${(b.ry * 0.6).toFixed(1)}" fill="rgba(28, 25, 22, 0.32)"/>
    ${mottles.join("\n    ")}
    ${lichen}
    <ellipse cx="${(b.bx - b.br * 0.32).toFixed(1)}" cy="${(b.by - b.ry * 0.38).toFixed(1)}" rx="${(b.br * 0.4).toFixed(1)}" ry="${(b.ry * 0.3).toFixed(1)}" fill="rgba(255,250,240,${hi.toFixed(2)})"/>
  </g>`;
    })
    .join("");

  // Loose scree beyond the mound
  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 132 + rnd() * 28;
    const br = 2.5 + rnd() * 4.5;
    const bx = 170 + Math.cos(a) * d;
    const by = 170 + Math.sin(a) * d;
    const tone = 104 + Math.floor(rnd() * 40);
    stones.push(
      `<ellipse cx="${(bx + 1.2).toFixed(1)}" cy="${(by + 1.8).toFixed(1)}" rx="${br.toFixed(1)}" ry="${(br * 0.8).toFixed(1)}" fill="rgba(0,0,0,0.22)"/>`,
      `<ellipse cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" rx="${br.toFixed(1)}" ry="${(br * 0.8).toFixed(1)}" fill="rgb(${tone + 6},${tone + 2},${tone - 4})" stroke="rgba(42,38,34,0.4)" stroke-width="0.8"/>`
    );
  }
  // red/white banding visible as rim segments
  const bands = [];
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 0.5) / 8) * Math.PI * 2;
    const large = 0;
    bands.push(
      `<path d="M ${(170 + Math.cos(a0) * 62).toFixed(1)} ${(170 + Math.sin(a0) * 62).toFixed(1)} A 62 62 0 ${large} 1 ${(170 + Math.cos(a1) * 62).toFixed(1)} ${(170 + Math.sin(a1) * 62).toFixed(1)}" fill="none" stroke="#b8352a" stroke-width="12" opacity="0.9"/>`
    );
  }
  // gallery railing posts
  const rail = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    rail.push(
      `<circle cx="${(170 + Math.cos(a) * 44).toFixed(1)}" cy="${(170 + Math.sin(a) * 44).toFixed(1)}" r="2.4" fill="#5a1f18"/>`
    );
  }
  // lantern glazing bars
  const glaze = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glaze.push(
      `<line x1="170" y1="170" x2="${(170 + Math.cos(a) * 26).toFixed(1)}" y2="${(170 + Math.sin(a) * 26).toFixed(1)}" stroke="rgba(30,40,48,0.75)" stroke-width="2.5"/>`
    );
  }
  return `
<svg width="340" height="340" viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rock" cx="0.42" cy="0.4" r="0.8">
      <stop offset="0" stop-color="#8e8880"/>
      <stop offset="0.6" stop-color="#767068"/>
      <stop offset="1" stop-color="#5c5751"/>
    </radialGradient>
    <radialGradient id="tower" cx="0.4" cy="0.38" r="0.8">
      <stop offset="0" stop-color="#fbfaf7"/>
      <stop offset="0.7" stop-color="#eceae4"/>
      <stop offset="1" stop-color="#cfccc4"/>
    </radialGradient>
    <radialGradient id="glass" cx="0.4" cy="0.38" r="0.8">
      <stop offset="0" stop-color="#9fc2d4"/>
      <stop offset="0.55" stop-color="#5f8497"/>
      <stop offset="1" stop-color="#39566a"/>
    </radialGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>
  <!-- sandy ground disc under the outcrop -->
  <circle cx="172" cy="173" r="140" fill="rgba(146, 132, 106, 0.4)" filter="url(#drop)"/>
  <circle cx="170" cy="170" r="132" fill="rgba(158, 145, 118, 0.35)"/>
  ${boulderSvg}
  ${stones.join("\n  ")}
  <!-- tower -->
  <circle cx="174" cy="174" r="66" fill="rgba(0,0,0,0.35)" filter="url(#drop)"/>
  <circle cx="170" cy="170" r="66" fill="url(#tower)" stroke="rgba(60,56,52,0.55)" stroke-width="2.5"/>
  ${bands.join("\n  ")}
  <!-- gallery deck + railing -->
  <circle cx="170" cy="170" r="50" fill="#e6e2da" stroke="rgba(60,56,52,0.4)" stroke-width="2"/>
  <circle cx="170" cy="170" r="44" fill="none" stroke="#7c2a20" stroke-width="3.5"/>
  ${rail.join("\n  ")}
  <!-- lantern room -->
  <circle cx="170" cy="170" r="28" fill="url(#glass)" stroke="#1e2830" stroke-width="3"/>
  ${glaze.join("\n  ")}
  <circle cx="170" cy="170" r="6" fill="#f4efdd" stroke="#1e2830" stroke-width="2"/>
  <path d="M 152 152 A 26 26 0 0 1 176 144" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="5" stroke-linecap="round"/>
</svg>`;
}

const JOBS = [
  { file: "tank1.webp", svg: tankSvg("#3d6b34", "#4f8442", "#6aa257", "#5b9349"), w: 96, h: 96 },
  { file: "tank2.webp", svg: tankSvg("#6f6a58", "#8a8571", "#a6a08a", "#96917c"), w: 96, h: 96 },
  { file: "container1.webp", svg: containerSvg("#4f7799", "#3f6182", "#2e4a66", "#7a4a2a"), w: 256, h: 108 },
  { file: "container2.webp", svg: containerSvg("#a8503a", "#8c3f2c", "#6b2e1f", "#4a1f12"), w: 256, h: 108 },
  { file: "container3.webp", svg: containerSvg("#5d7d54", "#4a6743", "#374f32", "#6e502c"), w: 256, h: 108 },
  { file: "boat1.webp", svg: boatSvg("#e9e6de", "#d3cfc4", "#a8a396", "#8c3a2e"), w: 80, h: 180 },
  { file: "boat2.webp", svg: boatSvg("#5f88ad", "#4a6f92", "#365576", "#e0dcd0"), w: 80, h: 180 },
  { file: "boat3.webp", svg: boatSvg("#b8574b", "#9c4438", "#763228", "#e8e4d8"), w: 80, h: 180 },
  { file: "lighthouse.webp", svg: lighthouseSvg(), w: 220, h: 220 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 420 } });

  for (const job of JOBS) {
    await page.setContent(`<body style="margin:0;background:transparent">${job.svg}</body>`);
    const el = await page.$("svg");
    const png = await el.screenshot({ omitBackground: true });
    const dataUrl = await page.evaluate(
      async ({ b64, w, h }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        return c.toDataURL("image/webp", 0.92);
      },
      { b64: png.toString("base64"), w: job.w, h: job.h }
    );
    fs.writeFileSync(path.join(OUT, job.file), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log("wrote", job.file);
  }

  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
