// Regenerates every top-down vehicle sprite (taxis, bakkies, hatchbacks)
// as WebP into public/assets/, via headless Chromium's SVG renderer.
//
//   node tools/make-vehicles.cjs        (run from the repo root)
//
// The sprites are hand-tuned SVG: photoreal-ish gradients and baked soft
// shadows so they sit next to the photographic world art. Front faces up;
// the game rotates per heading. In-game draw sizes: taxi 40x75,
// bakkie 38x70, hatch 34x58 (see VEHICLE_TYPES in src/entities/traffic.js).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public", "assets");

function taxiSvg(accent) {
  return `
<svg width="256" height="512" viewBox="0 0 256 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#b4bac1"/><stop offset="0.10" stop-color="#e8ebee"/>
      <stop offset="0.45" stop-color="#fafbfc"/><stop offset="0.62" stop-color="#f2f4f6"/>
      <stop offset="0.90" stop-color="#dfe3e7"/><stop offset="1" stop-color="#a7adb5"/>
    </linearGradient>
    <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2f4f6"/><stop offset="0.5" stop-color="#eceff1"/>
      <stop offset="1" stop-color="#e2e6e9"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2a35"/><stop offset="0.55" stop-color="#31485a"/>
      <stop offset="1" stop-color="#243746"/>
    </linearGradient>
    <linearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e3e7ea"/><stop offset="1" stop-color="#d3d8dc"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>

  <rect x="42" y="48" width="180" height="428" rx="34" fill="rgba(0,0,0,0.42)"
        filter="url(#drop)" transform="translate(7,12)"/>
  <rect x="36" y="34" width="184" height="444" rx="30" fill="url(#body)"
        stroke="#7e858d" stroke-width="2.5"/>

  <rect x="44" y="38" width="168" height="16" rx="8" fill="#8e959c"/>
  <rect x="44" y="38" width="168" height="6" rx="3" fill="#a6adb4"/>
  <rect x="52" y="40" width="28" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>
  <rect x="176" y="40" width="28" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>

  <rect x="46" y="56" width="164" height="30" rx="8" fill="url(#hood)"/>
  <line x1="56" y1="84" x2="200" y2="84" stroke="#b9bfc5" stroke-width="2"/>

  <rect x="12" y="96" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="218" y="96" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="34" y="99" width="8" height="5" fill="#2b2f34"/>
  <rect x="214" y="99" width="8" height="5" fill="#2b2f34"/>

  <path d="M 54 92 L 202 92 L 192 148 L 64 148 Z" fill="url(#glass)"
        stroke="#161f27" stroke-width="3"/>
  <path d="M 70 96 L 108 96 L 84 144 L 68 144 Z" fill="#ffffff" opacity="0.16"/>
  <path d="M 118 96 L 134 96 L 116 144 L 108 144 Z" fill="#ffffff" opacity="0.10"/>

  <rect x="50" y="154" width="156" height="266" rx="14" fill="url(#roof)"
        stroke="#c4cad0" stroke-width="1.5"/>
  <g stroke-width="3" opacity="0.8">
    <line x1="88"  y1="164" x2="88"  y2="410" stroke="#dbe0e4"/>
    <line x1="128" y1="164" x2="128" y2="410" stroke="#dbe0e4"/>
    <line x1="168" y1="164" x2="168" y2="410" stroke="#dbe0e4"/>
    <line x1="91"  y1="164" x2="91"  y2="410" stroke="#f6f8f9"/>
    <line x1="131" y1="164" x2="131" y2="410" stroke="#f6f8f9"/>
    <line x1="171" y1="164" x2="171" y2="410" stroke="#f6f8f9"/>
  </g>

  <rect x="38" y="158" width="9" height="258" rx="4" fill="${accent}"/>
  <rect x="209" y="158" width="9" height="258" rx="4" fill="${accent}"/>
  <rect x="104" y="166" width="48" height="16" rx="5" fill="${accent}"
        stroke="rgba(0,0,0,0.25)" stroke-width="1.5"/>

  <path d="M 66 424 L 190 424 L 182 452 L 74 452 Z" fill="url(#glass)"
        stroke="#161f27" stroke-width="2.5"/>

  <rect x="44" y="458" width="168" height="14" rx="7" fill="#8e959c"/>
  <rect x="50" y="459" width="24" height="8" rx="3" fill="#c0392b" opacity="0.9"/>
  <rect x="182" y="459" width="24" height="8" rx="3" fill="#c0392b" opacity="0.9"/>
  <rect x="39" y="37" width="178" height="438" rx="27" fill="none"
        stroke="rgba(0,0,0,0.10)" stroke-width="7"/>
</svg>`;
}

function bakkieSvg(bodyTop, bodyMid, bodyEdge, stroke, hoodTop, hoodBot) {
  return `
<svg width="256" height="480" viewBox="0 0 256 480" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${bodyEdge}"/><stop offset="0.1" stop-color="${bodyMid}"/>
      <stop offset="0.45" stop-color="${bodyTop}"/><stop offset="0.9" stop-color="${bodyMid}"/>
      <stop offset="1" stop-color="${bodyEdge}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2a35"/><stop offset="0.55" stop-color="#31485a"/>
      <stop offset="1" stop-color="#243746"/>
    </linearGradient>
    <linearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hoodTop}"/><stop offset="1" stop-color="${hoodBot}"/>
    </linearGradient>
    <linearGradient id="bed" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#43474c"/><stop offset="1" stop-color="#33373b"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
  </defs>

  <rect x="40" y="42" width="176" height="400" rx="30" fill="rgba(0,0,0,0.42)" filter="url(#drop)" transform="translate(7,12)"/>
  <rect x="34" y="30" width="188" height="420" rx="26" fill="url(#body)" stroke="${stroke}" stroke-width="2.5"/>

  <rect x="42" y="34" width="172" height="15" rx="7" fill="#8e959c"/>
  <rect x="42" y="34" width="172" height="6" rx="3" fill="#a6adb4"/>
  <rect x="50" y="36" width="30" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>
  <rect x="176" y="36" width="30" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>

  <rect x="44" y="52" width="168" height="58" rx="9" fill="url(#hood)"/>
  <line x1="128" y1="56" x2="128" y2="106" stroke="#c3c9ce" stroke-width="2.5"/>
  <line x1="54" y1="108" x2="202" y2="108" stroke="#b9bfc5" stroke-width="2"/>

  <rect x="12" y="118" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="218" y="118" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="34" y="121" width="8" height="5" fill="#2b2f34"/>
  <rect x="214" y="121" width="8" height="5" fill="#2b2f34"/>

  <path d="M 52 114 L 204 114 L 194 162 L 62 162 Z" fill="url(#glass)" stroke="#161f27" stroke-width="3"/>
  <path d="M 68 118 L 104 118 L 82 158 L 66 158 Z" fill="#ffffff" opacity="0.15"/>

  <rect x="48" y="166" width="160" height="58" rx="12" fill="#eceff1" stroke="#c4cad0" stroke-width="1.5"/>
  <line x1="88" y1="172" x2="88" y2="218" stroke="#dbe0e4" stroke-width="3"/>
  <line x1="168" y1="172" x2="168" y2="218" stroke="#dbe0e4" stroke-width="3"/>

  <path d="M 62 228 L 194 228 L 200 244 L 56 244 Z" fill="url(#glass)" stroke="#161f27" stroke-width="2.5"/>

  <rect x="44" y="250" width="168" height="184" rx="8" fill="url(#body)"/>
  <rect x="56" y="258" width="144" height="168" rx="5" fill="url(#bed)" stroke="#22262a" stroke-width="2"/>
  <g stroke="#292d31" stroke-width="4" opacity="0.9">
    <line x1="74" y1="262" x2="74" y2="422"/><line x1="101" y1="262" x2="101" y2="422"/>
    <line x1="128" y1="262" x2="128" y2="422"/><line x1="155" y1="262" x2="155" y2="422"/>
    <line x1="182" y1="262" x2="182" y2="422"/>
  </g>
  <g stroke="#53585d" stroke-width="1.5" opacity="0.8">
    <line x1="76" y1="262" x2="76" y2="422"/><line x1="103" y1="262" x2="103" y2="422"/>
    <line x1="130" y1="262" x2="130" y2="422"/><line x1="157" y1="262" x2="157" y2="422"/>
    <line x1="184" y1="262" x2="184" y2="422"/>
  </g>
  <line x1="56" y1="414" x2="200" y2="414" stroke="#22262a" stroke-width="3"/>

  <rect x="42" y="432" width="172" height="14" rx="7" fill="#8e959c"/>
  <rect x="48" y="433" width="26" height="8" rx="3" fill="#c0392b" opacity="0.9"/>
  <rect x="182" y="433" width="26" height="8" rx="3" fill="#c0392b" opacity="0.9"/>
  <rect x="37" y="33" width="182" height="414" rx="23" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="6"/>
</svg>`;
}

function hatchSvg(bodyTop, bodyMid, bodyEdge, stroke) {
  return `
<svg width="256" height="420" viewBox="0 0 256 420" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${bodyEdge}"/><stop offset="0.12" stop-color="${bodyMid}"/>
      <stop offset="0.45" stop-color="${bodyTop}"/><stop offset="0.88" stop-color="${bodyMid}"/>
      <stop offset="1" stop-color="${bodyEdge}"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2a35"/><stop offset="0.55" stop-color="#31485a"/>
      <stop offset="1" stop-color="#243746"/>
    </linearGradient>
    <filter id="drop" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <rect x="38" y="34" width="180" height="358" rx="52" fill="rgba(0,0,0,0.42)" filter="url(#drop)" transform="translate(6,11)"/>
  <rect x="32" y="24" width="192" height="372" rx="48" fill="url(#body)" stroke="${stroke}" stroke-width="2.5"/>

  <rect x="46" y="28" width="164" height="14" rx="7" fill="#8e959c"/>
  <rect x="54" y="30" width="28" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>
  <rect x="174" y="30" width="28" height="9" rx="4" fill="#f2eecb" opacity="0.95"/>

  <path d="M 54 48 Q 128 40 202 48 L 196 92 Q 128 84 60 92 Z" fill="rgba(255,255,255,0.14)"/>
  <line x1="128" y1="48" x2="128" y2="90" stroke="rgba(0,0,0,0.12)" stroke-width="2.5"/>

  <rect x="10" y="100" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="220" y="100" width="26" height="12" rx="4" fill="#2b2f34"/>
  <rect x="32" y="103" width="8" height="5" fill="#2b2f34"/>
  <rect x="216" y="103" width="8" height="5" fill="#2b2f34"/>

  <path d="M 50 96 L 206 96 L 192 150 L 64 150 Z" fill="url(#glass)" stroke="#161f27" stroke-width="3"/>
  <path d="M 66 100 L 102 100 L 82 146 L 66 146 Z" fill="#ffffff" opacity="0.15"/>

  <rect x="56" y="156" width="144" height="116" rx="16" fill="rgba(255,255,255,0.10)"/>
  <rect x="56" y="156" width="144" height="116" rx="16" fill="none" stroke="rgba(0,0,0,0.14)" stroke-width="2"/>

  <path d="M 62 278 L 194 278 L 204 348 L 52 348 Z" fill="url(#glass)" stroke="#161f27" stroke-width="3"/>
  <path d="M 74 284 L 106 284 L 92 342 L 72 342 Z" fill="#ffffff" opacity="0.13"/>

  <rect x="44" y="372" width="168" height="14" rx="7" fill="#8e959c"/>
  <rect x="50" y="373" width="26" height="8" rx="3" fill="#c0392b" opacity="0.92"/>
  <rect x="180" y="373" width="26" height="8" rx="3" fill="#c0392b" opacity="0.92"/>
  <rect x="35" y="27" width="186" height="366" rx="45" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="6"/>
</svg>`;
}

const JOBS = [
  { file: "taxi1.webp", svg: taxiSvg("#f2c230"), w: 128, h: 256 },
  { file: "taxi2.webp", svg: taxiSvg("#2fa45b"), w: 128, h: 256 },
  { file: "taxi3.webp", svg: taxiSvg("#d9482b"), w: 128, h: 256 },
  { file: "bakkie.webp",  svg: bakkieSvg("#f8f9fa", "#e0e4e7", "#a4aab1", "#788088", "#e6e9ec", "#d2d7db"), w: 128, h: 240 },
  { file: "bakkie2.webp", svg: bakkieSvg("#9db8d6", "#7d9cc0", "#56718f", "#42586f", "#8aa8c9", "#7694b5"), w: 128, h: 240 },
  { file: "bakkie3.webp", svg: bakkieSvg("#b4574a", "#964035", "#6b2c26", "#521f1a", "#a44c40", "#8f4136"), w: 128, h: 240 },
  { file: "hatch1.webp", svg: hatchSvg("#d9534f", "#c0392b", "#8f2a20", "#6e1f18"), w: 128, h: 210 },
  { file: "hatch2.webp", svg: hatchSvg("#dfe3e7", "#c2c8cd", "#9aa1a8", "#787f86"), w: 128, h: 210 },
  { file: "hatch3.webp", svg: hatchSvg("#5b84c4", "#41669e", "#2d4a75", "#22375a"), w: 128, h: 210 },
  { file: "hatch4.webp", svg: hatchSvg("#5c6167", "#45494e", "#303338", "#232629"), w: 128, h: 210 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 300, height: 560 } });

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
