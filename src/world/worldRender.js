// World textures and the three offscreen world-sized canvases (grass,
// roads, trees). Rendering to them happens once per world generation;
// the game loop just blits them.

import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";

export const roadTexture = new Image();
roadTexture.src = "/assets/road.webp";

const grassTexture = new Image();
grassTexture.src = "/assets/fyn2.webp";

// Photoreal gravel tile (tools/make-gravel.cjs): tiled into the district
// roads, so surface realism costs nothing at bake or play time
const gravelTexture = new Image();
gravelTexture.src = "/assets/gravel.webp";

export const buildingImages = [
  "/assets/house.webp",
  "/assets/house2.webp",
  "/assets/house3.webp",
  "/assets/house4.webp",
  "/assets/shack.webp",
  "/assets/flat.webp",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

export const treeImages = [
  "/assets/tree.webp",
  "/assets/tree2.webp",
  "/assets/tree3.webp",
  "/assets/tree4.webp",
  "/assets/tree5.webp",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

export const grassCanvas = document.createElement("canvas");
grassCanvas.width = WORLD_WIDTH;
grassCanvas.height = WORLD_HEIGHT;
const grassCtx = grassCanvas.getContext("2d");

export const roadCanvas = document.createElement("canvas");
roadCanvas.width = WORLD_WIDTH;
roadCanvas.height = WORLD_HEIGHT;
const roadCtx = roadCanvas.getContext("2d");

export const treeCanvas = document.createElement("canvas");
treeCanvas.width = WORLD_WIDTH;
treeCanvas.height = WORLD_HEIGHT;
const treeCtx = treeCanvas.getContext("2d");
treeCtx.imageSmoothingEnabled = false;

let grassRendered = false;

function tryRenderGrass() {
  if (!grassTexture.complete) return;
  const pattern = grassCtx.createPattern(grassTexture, "repeat");
  if (pattern) {
    grassCtx.fillStyle = pattern;
    grassCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grassRendered = true;
  }
}

grassTexture.onload = tryRenderGrass;
roadTexture.onload = tryRenderGrass;

export function texturesReady() {
  // gravelTexture.complete is true even on a failed load, so this can
  // never wedge the start; paintGravel falls back to flat dirt then
  return grassRendered && roadTexture.complete && gravelTexture.complete;
}

// Refill the grass base — startNewGame calls this before painting the
// pitch so per-run ground markings never accumulate across runs.
export function renderGrassBase() {
  tryRenderGrass();
}

// World-prop sprites (shadows baked in, like the vehicles)
const propImg = (name) => {
  const img = new Image();
  img.src = `/assets/${name}.webp`;
  return img;
};

export const propSprites = {
  tank: [propImg("tank1"), propImg("tank2")],
  container: [propImg("container1"), propImg("container2"), propImg("container3")],
  boat: [propImg("boat1"), propImg("boat2"), propImg("boat3")],
};

export const lighthouseSprite = propImg("lighthouse");

// A small corner of the bay in the south-west: banded water easing from
// deep teal to turquoise shallows, a wet sand line, dry speckled beach
// fading into the veld, and a scatter of the bluebottles the town is
// named for. Painted once onto the grass canvas; the shoreline is a
// jittered quarter-ellipse anchored at the world corner.
export function renderBayOffscreen(bay) {
  if (!bay || !bay.enabled) return;
  const g = grassCtx;
  const { rx, ry } = bay;
  const cornerY = WORLD_HEIGHT;

  // Deterministic jitter so every run's shoreline is the same shape
  let s = 29;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };

  // Trace one quarter-ellipse arc at a given scale with a wobbled edge
  const arcPath = (scale, wobble) => {
    g.beginPath();
    g.moveTo(0, cornerY - ry * scale);
    const steps = 34;
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      const w = 1 + ((rnd() - 0.5) * wobble) / 100;
      g.lineTo(
        Math.sin(a) * rx * scale * w,
        cornerY - Math.cos(a) * ry * scale * w
      );
    }
    g.lineTo(0, cornerY);
    g.closePath();
  };

  // Dry beach first (widest), fading into the veld with stacked arcs —
  // no canvas blurs, they cost raster seconds on the world canvas
  g.save();
  for (const [scale, alpha] of [
    [1.4, 0.14],
    [1.36, 0.18],
    [1.32, 0.24],
    [1.28, 0.36],
    [1.24, 0.5],
  ]) {
    g.fillStyle = `rgba(199, 179, 141, ${alpha})`;
    arcPath(scale, 4);
    g.fill();
  }
  g.fillStyle = "#cdb992";
  arcPath(1.18, 5);
  g.fill();

  // Beach speckle: shells, kelp bits, darker sand
  for (let i = 0; i < 260; i++) {
    const a = rnd() * (Math.PI / 2);
    const t = 1.0 + rnd() * 0.3;
    const px = Math.sin(a) * rx * t;
    const py = cornerY - Math.cos(a) * ry * t;
    const tone = rnd();
    g.fillStyle =
      tone < 0.55
        ? `rgba(160, 138, 100, ${0.2 + rnd() * 0.25})`
        : tone < 0.85
          ? `rgba(224, 208, 172, ${0.25 + rnd() * 0.3})`
          : `rgba(120, 108, 84, ${0.15 + rnd() * 0.2})`;
    g.beginPath();
    g.ellipse(px, py, 0.7 + rnd() * 1.8, 0.5 + rnd() * 1.4, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }

  // Wind ripples on the dry sand: faint elongated streaks along the shore
  for (let i = 0; i < 60; i++) {
    const a = rnd() * (Math.PI / 2);
    const t = 1.1 + rnd() * 0.22;
    const px = Math.sin(a) * rx * t;
    const py = cornerY - Math.cos(a) * ry * t;
    g.strokeStyle = `rgba(150, 130, 96, ${0.08 + rnd() * 0.1})`;
    g.lineWidth = 0.8 + rnd();
    g.beginPath();
    g.moveTo(px, py);
    // streaks run roughly parallel to the waterline
    g.lineTo(
      px + Math.cos(a) * (8 + rnd() * 18),
      py + Math.sin(a) * (8 + rnd() * 18)
    );
    g.stroke();
  }

  // Wet sand: a darker glistening band right at the waterline
  g.fillStyle = "rgba(148, 128, 96, 0.45)";
  arcPath(1.085, 3);
  g.fill();
  g.fillStyle = "rgba(148, 128, 96, 0.75)";
  arcPath(1.06, 3);
  g.fill();

  // Water: bright shallows at the sand, deepening out toward the corner
  g.fillStyle = "#3a848e";
  arcPath(1.0, 3);
  g.fill();
  g.fillStyle = "#2c7480";
  arcPath(0.86, 4);
  g.fill();
  g.fillStyle = "#225d6b";
  arcPath(0.64, 4);
  g.fill();
  g.fillStyle = "#194a58";
  arcPath(0.42, 5);
  g.fill();

  // Soften the band seams with in-between tones
  g.globalAlpha = 0.4;
  g.fillStyle = "#266976";
  arcPath(0.75, 4);
  g.fill();
  g.fillStyle = "#2f7a86";
  arcPath(0.93, 4);
  g.fill();
  g.globalAlpha = 1;

  // Surface texture: the flat teal needs grain to sit beside photographic
  // grass — small tonal flecks all over the water, denser near shore
  for (let i = 0; i < 900; i++) {
    const a = rnd() * (Math.PI / 2);
    const t = Math.sqrt(rnd()) * 0.99;
    const px = Math.sin(a) * rx * t;
    const py = cornerY - Math.cos(a) * ry * t;
    const dark = rnd() < 0.5;
    g.fillStyle = dark
      ? `rgba(12, 40, 50, ${0.05 + rnd() * 0.08})`
      : `rgba(180, 220, 224, ${0.04 + rnd() * 0.07})`;
    g.beginPath();
    g.ellipse(
      px,
      py,
      1.2 + rnd() * 3.4,
      0.6 + rnd() * 1.6,
      rnd() * 3,
      0,
      Math.PI * 2
    );
    g.fill();
  }

  // Sun glints in the shallows
  for (let i = 0; i < 46; i++) {
    const a = rnd() * (Math.PI / 2);
    const t = 0.72 + rnd() * 0.24;
    g.fillStyle = `rgba(240, 250, 250, ${0.1 + rnd() * 0.14})`;
    g.beginPath();
    g.ellipse(
      Math.sin(a) * rx * t,
      cornerY - Math.cos(a) * ry * t,
      0.8 + rnd() * 1.6,
      0.5 + rnd() * 0.8,
      rnd() * 3,
      0,
      Math.PI * 2
    );
    g.fill();
  }

  // Faint swell lines following the shore
  g.strokeStyle = "rgba(220, 238, 240, 0.1)";
  g.lineWidth = 2;
  for (const t of [0.62, 0.84]) {
    g.beginPath();
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      const w = 1 + (rnd() - 0.5) * 0.05;
      const px = Math.sin(a) * rx * t * w;
      const py = cornerY - Math.cos(a) * ry * t * w;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
  }

  // Foam at the waterline: two broken white passes
  for (const [t, alpha, lw] of [
    [1.0, 0.55, 2.5],
    [0.965, 0.3, 1.6],
  ]) {
    g.strokeStyle = `rgba(244, 250, 250, ${alpha})`;
    g.lineWidth = lw;
    const steps = 40;
    let drawing = false;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * (Math.PI / 2);
      const w = 1 + (rnd() - 0.5) * 0.035;
      const px = Math.sin(a) * rx * t * w;
      const py = cornerY - Math.cos(a) * ry * t * w;
      if (rnd() < 0.82) {
        if (!drawing) {
          g.beginPath();
          g.moveTo(px, py);
          drawing = true;
        } else {
          g.lineTo(px, py);
        }
      } else if (drawing) {
        g.stroke();
        drawing = false;
      }
    }
    if (drawing) g.stroke();
  }

  // Bluebottles on the wet sand, the town's namesake: tiny cobalt floats
  // with a trailing tentacle line
  for (let i = 0; i < 8; i++) {
    const a = 0.12 + rnd() * 1.3;
    const t = 1.08 + rnd() * 0.06;
    const px = Math.sin(a) * rx * t;
    const py = cornerY - Math.cos(a) * ry * t;
    g.fillStyle = "rgba(58, 92, 200, 0.85)";
    g.beginPath();
    g.ellipse(px, py, 1.6, 1.0, rnd() * 3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(80, 110, 210, 0.5)";
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + (rnd() - 0.5) * 8, py + 2 + rnd() * 5);
    g.stroke();
  }

  g.restore();
}

// A worn five-a-side pitch painted straight onto the grass: faded lines,
// goal frames with a hint of net, and bare goalmouth earth.
export function renderPitchOffscreen(pitch) {
  if (!pitch) return;
  const g = grassCtx;
  const { x, y, w, h } = pitch;
  const horiz = w > h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // The playing surface itself: hard-packed dusty ground. The apron fades
  // very gradually into the veld; the field proper is solidly worn.
  // Layered unfiltered fills, NOT canvas blurs — the old blur(46) apron
  // alone cost ~8 seconds of raster time on the world canvas.
  g.save();
  for (let i = 0; i < 10; i++) {
    const inset = 46 - i * 8; // +46 apron … -26 interior
    g.fillStyle = "rgba(176, 156, 118, 0.075)";
    g.beginPath();
    if (g.roundRect) {
      g.roundRect(
        x - inset,
        y - inset,
        w + inset * 2,
        h + inset * 2,
        Math.max(6, 30 - i * 3)
      );
    } else {
      g.rect(x - inset, y - inset, w + inset * 2, h + inset * 2);
    }
    g.fill();
  }
  // patchy surface: surviving grass tufts and extra-worn dust, soft-edged
  // via radial gradients
  for (let i = 0; i < 30; i++) {
    const px = x + 12 + Math.random() * (w - 24);
    const py = y + 12 + Math.random() * (h - 24);
    const pr = 9 + Math.random() * 22;
    const tone =
      Math.random() < 0.42
        ? [118, 126, 80, 0.22] // grass that survived
        : [166, 144, 102, 0.26]; // dust worn harder
    const grad = g.createRadialGradient(px, py, 0, px, py, pr);
    grad.addColorStop(0, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${tone[3]})`);
    grad.addColorStop(0.65, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, ${tone[3] * 0.6})`);
    grad.addColorStop(1, `rgba(${tone[0]}, ${tone[1]}, ${tone[2]}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(px, py, pr, pr * 0.7, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // Bare, kicked-to-death earth at the goalmouths and centre: radial
  // gradients, filter-free
  const wear = (wx, wy, rx, ry, alpha) => {
    g.save();
    g.translate(wx, wy);
    g.scale(1, ry / rx);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, `rgba(148, 130, 100, ${alpha})`);
    grad.addColorStop(0.7, `rgba(148, 130, 100, ${alpha * 0.55})`);
    grad.addColorStop(1, "rgba(148, 130, 100, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, rx, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  if (horiz) {
    wear(x + 24, cy, 34, 44, 0.5);
    wear(x + w - 24, cy, 34, 44, 0.5);
  } else {
    wear(cx, y + 24, 44, 34, 0.5);
    wear(cx, y + h - 24, 44, 34, 0.5);
  }
  wear(cx, cy, 26, 22, 0.35);

  // Faded painted lines
  g.save();
  g.strokeStyle = "rgba(244, 244, 238, 0.34)";
  g.lineWidth = 3;
  g.strokeRect(x, y, w, h);

  if (horiz) {
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx, y + h);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(x, cy);
    g.lineTo(x + w, cy);
    g.stroke();
  }

  g.beginPath();
  g.arc(cx, cy, Math.min(w, h) * 0.17, 0, Math.PI * 2);
  g.stroke();

  // Goal boxes
  const boxD = Math.min(w, h) * 0.28;
  const boxL = Math.min(w, h) * 0.62;
  if (horiz) {
    g.strokeRect(x, cy - boxL / 2, boxD, boxL);
    g.strokeRect(x + w - boxD, cy - boxL / 2, boxD, boxL);
  } else {
    g.strokeRect(cx - boxL / 2, y, boxL, boxD);
    g.strokeRect(cx - boxL / 2, y + h - boxD, boxL, boxD);
  }

  // A second, patchier pass so the paint reads worn, not fresh
  g.strokeStyle = "rgba(244, 244, 238, 0.14)";
  g.lineWidth = 5;
  g.setLineDash([26, 34]);
  g.strokeRect(x, y, w, h);
  g.setLineDash([]);

  // Goals: white frame with a touch of net hatching behind
  const goalW = Math.min(w, h) * 0.24;
  const drawGoal = (gx, gy, facing) => {
    g.strokeStyle = "rgba(250, 250, 246, 0.62)";
    g.lineWidth = 2.5;
    const depth = 10;
    g.save();
    g.translate(gx, gy);
    g.rotate(facing);
    g.strokeRect(-goalW / 2, -depth, goalW, depth);
    g.strokeStyle = "rgba(230, 230, 226, 0.24)";
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const nx = -goalW / 2 + (goalW / 5) * i;
      g.beginPath();
      g.moveTo(nx, -depth);
      g.lineTo(nx, 0);
      g.stroke();
    }
    g.restore();
  };
  if (horiz) {
    drawGoal(x, cy, Math.PI / 2);
    drawGoal(x + w, cy, -Math.PI / 2);
  } else {
    drawGoal(cx, y, Math.PI);
    drawGoal(cx, y + h, 0);
  }
  g.restore();
}

// Resolves once the critical world textures are usable
export function whenReady() {
  return new Promise((resolve) => {
    const check = () => (texturesReady() ? resolve() : setTimeout(check, 100));
    check();
  });
}

// A gravel surface: warm gray base, tonal mottling, fine stone speckle,
// darker wheel tracks where the traffic runs, soft dirt shoulders
function paintGravel(g, road, rnd, plain = false) {
  const horiz = road.width > road.height;

  // dirt shoulders bleeding into the veld: linear gradients, not filters —
  // a full-length blurred fill on the world canvas costs seconds of
  // raster time in software rendering
  if (!plain) {
    const SH = 10;
    if (horiz) {
      let grad = g.createLinearGradient(0, road.y - SH, 0, road.y + 4);
      grad.addColorStop(0, "rgba(158, 143, 110, 0)");
      grad.addColorStop(1, "rgba(158, 143, 110, 0.5)");
      g.fillStyle = grad;
      g.fillRect(road.x, road.y - SH, road.width, SH + 4);
      grad = g.createLinearGradient(0, road.y + road.height - 4, 0, road.y + road.height + SH);
      grad.addColorStop(0, "rgba(158, 143, 110, 0.5)");
      grad.addColorStop(1, "rgba(158, 143, 110, 0)");
      g.fillStyle = grad;
      g.fillRect(road.x, road.y + road.height - 4, road.width, SH + 4);
    } else {
      let grad = g.createLinearGradient(road.x - SH, 0, road.x + 4, 0);
      grad.addColorStop(0, "rgba(158, 143, 110, 0)");
      grad.addColorStop(1, "rgba(158, 143, 110, 0.5)");
      g.fillStyle = grad;
      g.fillRect(road.x - SH, road.y, SH + 4, road.height);
      grad = g.createLinearGradient(road.x + road.width - 4, 0, road.x + road.width + SH, 0);
      grad.addColorStop(0, "rgba(158, 143, 110, 0.5)");
      grad.addColorStop(1, "rgba(158, 143, 110, 0)");
      g.fillStyle = grad;
      g.fillRect(road.x + road.width - 4, road.y, SH + 4, road.height);
    }
  }

  // The gravel body has no straight edges: both long sides wobble like a
  // graded road that the veld keeps arguing with. One path, filled once,
  // then a single blurred stroke to soften the boundary — cheap at bake.
  const wobblyBody = () => {
    const lenW = horiz ? road.width : road.height;
    const step = 26;
    g.beginPath();
    if (horiz) {
      g.moveTo(road.x, road.y + (rnd() - 0.5) * 5);
      for (let a = step; a <= lenW; a += step) {
        g.lineTo(road.x + Math.min(a, lenW), road.y + (rnd() - 0.5) * 6);
      }
      for (let a = 0; a <= lenW; a += step) {
        g.lineTo(
          road.x + lenW - Math.min(a, lenW),
          road.y + road.height + (rnd() - 0.5) * 6
        );
      }
    } else {
      g.moveTo(road.x + (rnd() - 0.5) * 5, road.y);
      for (let a = step; a <= lenW; a += step) {
        g.lineTo(road.x + (rnd() - 0.5) * 6, road.y + Math.min(a, lenW));
      }
      for (let a = 0; a <= lenW; a += step) {
        g.lineTo(
          road.x + road.width + (rnd() - 0.5) * 6,
          road.y + lenW - Math.min(a, lenW)
        );
      }
    }
    g.closePath();
  };

  // The surface itself is the photoreal tile; fall back to flat dirt if
  // it hasn't loaded (never blocks the bake)
  const usePattern = gravelTexture.complete && gravelTexture.naturalWidth > 0;
  const surface = () => {
    if (usePattern) {
      const pat = g.createPattern(gravelTexture, "repeat");
      // at half scale the stones sit at true grit size from the air
      pat.setTransform(new DOMMatrix().scale(0.5));
      g.fillStyle = pat;
    } else {
      g.fillStyle = "#8f8773";
    }
  };

  if (plain) {
    surface();
    g.fillRect(road.x, road.y, road.width, road.height);
  } else {
    surface();
    wobblyBody();
    g.fill();
    // soften the wobbled edge with layered strokes instead of a filter
    for (const [lw, alpha] of [
      [7, 0.18],
      [5, 0.3],
      [3, 0.55],
    ]) {
      g.strokeStyle = `rgba(143, 135, 115, ${alpha})`;
      g.lineWidth = lw;
      wobblyBody();
      g.stroke();
    }
  }

  const len = horiz ? road.width : road.height;

  // Washboard corrugation: the aerial signature of a gravel road — faint
  // transverse ripples, spacing wandering around half a metre
  if (!plain) {
    const across = horiz ? road.height : road.width;
    let along = rnd() * 8;
    while (along < len) {
      const alpha = 0.035 + rnd() * 0.045;
      const bow = (rnd() - 0.5) * 3;
      g.strokeStyle = `rgba(70, 64, 54, ${alpha})`;
      g.lineWidth = 1.6 + rnd() * 1.4;
      g.beginPath();
      if (horiz) {
        const px = road.x + along;
        g.moveTo(px, road.y + 4);
        g.quadraticCurveTo(px + bow, road.y + across / 2, px, road.y + across - 4);
      } else {
        const py = road.y + along;
        g.moveTo(road.x + 4, py);
        g.quadraticCurveTo(road.x + across / 2, py + bow, road.x + across - 4, py);
      }
      g.stroke();
      along += 8 + rnd() * 7;
    }
  }

  // wheel tracks along each lane: stacked soft-edged bands that also
  // smooth the washboard where the tyres run
  if (!plain) {
    const laneOff = (horiz ? road.height : road.width) * 0.26;
    const center = horiz ? road.y + road.height / 2 : road.x + road.width / 2;
    for (const off of [-laneOff, laneOff]) {
      for (const [half, alpha] of [
        [7, 0.06],
        [5, 0.08],
        [3, 0.11],
      ]) {
        g.fillStyle = `rgba(80, 74, 62, ${alpha})`;
        if (horiz) {
          g.fillRect(road.x, center + off - half, road.width, half * 2);
        } else {
          g.fillRect(center + off - half, road.y, half * 2, road.height);
        }
      }
    }
  }
}

export function renderRoadsOffscreen(roads) {
  roadCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Deterministic gravel detail per bake
  let seed = 17;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  // Gravel goes down FIRST; tar is laid over it, so wherever a paved road
  // crosses a gravel one, the tar surface simply wins — no gravel
  // shoulders or wobble ever sit on top of pavement.
  roads
    .filter((r) => r.kind === "gravel")
    .forEach((road) => paintGravel(roadCtx, road, rnd));

  roads
    .filter((r) => r.kind !== "gravel")
    .forEach((road) => {
      for (let x = road.x; x < road.x + road.width; x += roadTexture.width) {
        for (let y = road.y; y < road.y + road.height; y += roadTexture.height) {
          const tileWidth = Math.min(roadTexture.width, road.x + road.width - x);
          const tileHeight = Math.min(
            roadTexture.height,
            road.y + road.height - y
          );
          roadCtx.drawImage(
            roadTexture,
            0,
            0,
            tileWidth,
            tileHeight,
            x,
            y,
            tileWidth,
            tileHeight
          );
        }
      }
    });

  // --- Re-tile tar-on-tar crossings for clean seams (gravel crossings
  // need nothing: tar was laid over gravel, gravel-on-gravel overlays) ---
  roads.forEach((r1, i) => {
    for (let j = i + 1; j < roads.length; j++) {
      const r2 = roads[j];
      if (r1.kind === "gravel" || r2.kind === "gravel") continue;
      const intersectX = Math.max(r1.x, r2.x);
      const intersectY = Math.max(r1.y, r2.y);
      const intersectWidth =
        Math.min(r1.x + r1.width, r2.x + r2.width) - intersectX;
      const intersectHeight =
        Math.min(r1.y + r1.height, r2.y + r2.height) - intersectY;
      if (intersectWidth > 0 && intersectHeight > 0) {
        for (
          let x = intersectX;
          x < intersectX + intersectWidth;
          x += roadTexture.width
        ) {
          for (
            let y = intersectY;
            y < intersectY + intersectHeight;
            y += roadTexture.height
          ) {
            const tileWidth = Math.min(
              roadTexture.width,
              intersectX + intersectWidth - x
            );
            const tileHeight = Math.min(
              roadTexture.height,
              intersectY + intersectHeight - y
            );
            roadCtx.drawImage(
              roadTexture,
              0,
              0,
              tileWidth,
              tileHeight,
              x,
              y,
              tileWidth,
              tileHeight
            );
          }
        }
      }
    }
  });

  // --- Draw borders without intersections (gravel has soft shoulders
  // instead of kerbs) ---
  roadCtx.strokeStyle = "#5c5c5c";
  roadCtx.lineWidth = 4;

  roads.forEach((road) => {
    if (road.kind === "gravel") return;
    roadCtx.save();
    roadCtx.beginPath();
    roadCtx.rect(road.x, road.y, road.width, road.height);

    roads.forEach((other) => {
      if (road === other) return;
      // A paved road keeps its kerbs where a gravel road joins it —
      // only paved crossings open a gap
      if (other.kind === "gravel") return;
      const intersectX = Math.max(road.x, other.x);
      const intersectY = Math.max(road.y, other.y);
      const intersectWidth =
        Math.min(road.x + road.width, other.x + other.width) - intersectX;
      const intersectHeight =
        Math.min(road.y + road.height, other.y + other.height) - intersectY;
      if (intersectWidth > 0 && intersectHeight > 0) {
        roadCtx.rect(intersectX, intersectY, intersectWidth, intersectHeight);
      }
    });

    roadCtx.clip("evenodd");
    roadCtx.strokeRect(road.x, road.y, road.width, road.height);
    roadCtx.restore();
  });

  // --- Draw dashed center lines (gravel roads have no paint at all) ---
  roadCtx.strokeStyle = "#fff";
  roadCtx.lineWidth = 2;
  roadCtx.setLineDash([20, 20]);

  roads
    .filter((r) => r.width > r.height && r.kind !== "gravel")
    .forEach((r) => {
      const y = r.y + r.height / 2;
      roadCtx.beginPath();
      roadCtx.moveTo(0, y);
      roadCtx.lineTo(WORLD_WIDTH, y);
      roadCtx.stroke();
    });

  roads
    .filter((r) => r.height > r.width && r.kind !== "gravel")
    .forEach((r) => {
      const x = r.x + r.width / 2;
      roadCtx.beginPath();
      roadCtx.moveTo(x, 0);
      roadCtx.lineTo(x, WORLD_HEIGHT);
      roadCtx.stroke();
    });

  roadCtx.setLineDash([]);

  // --- The main road earns painted edge lines: yellow shoulder lines,
  // the South African way, a little sun-faded. They break at every
  // crossing — paint doesn't run through an intersection.
  roadCtx.strokeStyle = "rgba(222, 178, 62, 0.75)";
  roadCtx.lineWidth = 3;
  roads
    .filter((r) => r.kind === "main")
    .forEach((r) => {
      const horiz = r.width > r.height;
      const start = horiz ? r.x : r.y;
      const end = horiz ? r.x + r.width : r.y + r.height;

      // spans of open road between paved crossings (the paint runs
      // straight through a gravel junction)
      const gaps = roads
        .filter(
          (o) =>
            o !== r &&
            o.kind !== "gravel" &&
            (horiz ? o.height > o.width : o.width > o.height)
        )
        .map((o) => (horiz ? [o.x - 4, o.x + o.width + 4] : [o.y - 4, o.y + o.height + 4]))
        .sort((a, b) => a[0] - b[0]);
      const spans = [];
      let cursor = start;
      for (const [gs, ge] of gaps) {
        if (gs > cursor) spans.push([cursor, Math.min(gs, end)]);
        cursor = Math.max(cursor, ge);
      }
      if (cursor < end) spans.push([cursor, end]);

      roadCtx.beginPath();
      for (const [s0, s1] of spans) {
        if (horiz) {
          roadCtx.moveTo(s0, r.y + 6);
          roadCtx.lineTo(s1, r.y + 6);
          roadCtx.moveTo(s0, r.y + r.height - 6);
          roadCtx.lineTo(s1, r.y + r.height - 6);
        } else {
          roadCtx.moveTo(r.x + 6, s0);
          roadCtx.lineTo(r.x + 6, s1);
          roadCtx.moveTo(r.x + r.width - 6, s0);
          roadCtx.lineTo(r.x + r.width - 6, s1);
        }
      }
      roadCtx.stroke();
    });
}

// Bake potholes into the road canvas (call after renderRoadsOffscreen so
// the holes eat the lane markings too, the way real decay does).
export function renderPotholesOffscreen(potholes) {
  const path = (pts) => {
    roadCtx.beginPath();
    roadCtx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) roadCtx.lineTo(pts[i][0], pts[i][1]);
    roadCtx.closePath();
  };

  potholes.forEach((p) => {
    // Worn, slightly pale halo where the surface is crumbling
    roadCtx.save();
    path(p.outline);
    roadCtx.shadowColor = "rgba(148, 145, 138, 0.5)";
    roadCtx.shadowBlur = 4;
    roadCtx.fillStyle = "rgba(120, 117, 110, 0.25)";
    roadCtx.fill();
    roadCtx.restore();

    // Radial cracks
    roadCtx.strokeStyle = "rgba(58, 55, 50, 0.55)";
    roadCtx.lineWidth = 0.9;
    p.cracks.forEach((pts) => {
      roadCtx.beginPath();
      roadCtx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) roadCtx.lineTo(pts[i][0], pts[i][1]);
      roadCtx.stroke();
    });

    // The hole itself: gravel-toned base falling to a dark offset deep spot
    path(p.outline);
    const grad = roadCtx.createRadialGradient(
      p.x + p.deepDx,
      p.y + p.deepDy,
      p.r * 0.15,
      p.x,
      p.y,
      p.r * 1.05
    );
    grad.addColorStop(0, "#332f2a");
    grad.addColorStop(0.6, "#4a463f");
    grad.addColorStop(1, "#5b574f");
    roadCtx.fillStyle = grad;
    roadCtx.fill();

    // A crisp broken lip around the hole
    path(p.outline);
    roadCtx.strokeStyle = "rgba(32, 29, 25, 0.45)";
    roadCtx.lineWidth = 0.8;
    roadCtx.stroke();

    // Deepest patch
    path(p.inner);
    roadCtx.fillStyle = "rgba(38, 34, 30, 0.85)";
    roadCtx.fill();

    // Sun catches the far lip (light from top-left, consistent with the
    // building/tree shadows)
    roadCtx.strokeStyle = "rgba(178, 174, 165, 0.5)";
    roadCtx.lineWidth = 1;
    roadCtx.beginPath();
    let started = false;
    p.outline.forEach(([px, py]) => {
      const ang = Math.atan2(py - p.y, px - p.x);
      if (ang > 0.2 && ang < 1.9) {
        if (!started) {
          roadCtx.moveTo(px, py);
          started = true;
        } else {
          roadCtx.lineTo(px, py);
        }
      } else {
        started = false;
      }
    });
    roadCtx.stroke();

    // Loose chips
    p.gravel.forEach(([gx, gy, tone]) => {
      roadCtx.fillStyle = tone ? "rgba(130,126,118,0.8)" : "rgba(88,84,77,0.8)";
      roadCtx.fillRect(gx, gy, 1.4, 1.4);
    });
  });
}

// Canvas shadowBlur is a per-draw gaussian — far too slow to run every
// frame per building. Bake each building with its shadow once; the frame
// loop just blits the result. Padding covers the blur spread.
export const BUILDING_SHADOW_PAD = 26;

export function bakeBuilding(b) {
  const pad = BUILDING_SHADOW_PAD;
  const c = document.createElement("canvas");
  c.width = Math.ceil(b.width + pad * 2);
  c.height = Math.ceil(b.height + pad * 2);
  const bctx = c.getContext("2d");
  bctx.shadowColor = "rgba(0,0,0,1)";
  bctx.shadowBlur = 20;
  bctx.drawImage(b.img, pad, pad, b.width, b.height);
  b.baked = c;
}

export function renderTreesOffscreen(trees) {
  treeCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  trees.forEach((t) => {
    if (!t.img || !t.img.complete) return;

    treeCtx.save();

    // --- Soft shadow behind tree for depth ---
    treeCtx.shadowColor = "rgba(0,0,0,0.5)";
    treeCtx.shadowBlur = 25;

    treeCtx.drawImage(t.img, t.x, t.y, t.size * 2, t.size * 2);

    treeCtx.restore();
  });
}
