// World textures and the three offscreen world-sized canvases (grass,
// roads, trees). Rendering to them happens once per world generation;
// the game loop just blits them.

import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";

export const roadTexture = new Image();
roadTexture.src = "/assets/road.webp";

const grassTexture = new Image();
grassTexture.src = "/assets/fyn2.webp";

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
  return grassRendered && roadTexture.complete;
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

// A worn five-a-side pitch painted straight onto the grass: faded lines,
// goal frames with a hint of net, and bare goalmouth earth.
export function renderPitchOffscreen(pitch) {
  if (!pitch) return;
  const g = grassCtx;
  const { x, y, w, h } = pitch;
  const horiz = w > h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // The playing surface itself: hard-packed dusty ground that fades out
  // into the veld at the edges — a field, not lines on wild grass
  g.save();
  g.filter = "blur(24px)";
  g.fillStyle = "rgba(174, 154, 116, 0.4)";
  g.fillRect(x - 16, y - 16, w + 32, h + 32);
  g.filter = "blur(9px)";
  g.fillStyle = "rgba(181, 161, 122, 0.38)";
  g.fillRect(x + 6, y + 6, w - 12, h - 12);
  g.filter = "blur(6px)";
  // patchy surface: surviving grass tufts and extra-worn dust
  for (let i = 0; i < 30; i++) {
    const px = x + 12 + Math.random() * (w - 24);
    const py = y + 12 + Math.random() * (h - 24);
    const pr = 9 + Math.random() * 22;
    g.fillStyle =
      Math.random() < 0.42
        ? "rgba(118, 126, 80, 0.22)" // grass that survived
        : "rgba(166, 144, 102, 0.26)"; // dust worn harder
    g.beginPath();
    g.ellipse(px, py, pr, pr * 0.7, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = "none";
  g.restore();

  // Bare, kicked-to-death earth at the goalmouths and centre
  const wear = (wx, wy, rx, ry, alpha) => {
    g.save();
    g.fillStyle = `rgba(148, 130, 100, ${alpha})`;
    g.filter = "blur(6px)";
    g.beginPath();
    g.ellipse(wx, wy, rx, ry, 0, 0, Math.PI * 2);
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
  g.strokeStyle = "rgba(244, 244, 238, 0.5)";
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
  g.strokeStyle = "rgba(244, 244, 238, 0.22)";
  g.lineWidth = 5;
  g.setLineDash([26, 34]);
  g.strokeRect(x, y, w, h);
  g.setLineDash([]);

  // Goals: white frame with a touch of net hatching behind
  const goalW = Math.min(w, h) * 0.24;
  const drawGoal = (gx, gy, facing) => {
    g.strokeStyle = "rgba(250, 250, 246, 0.85)";
    g.lineWidth = 2.5;
    const depth = 10;
    g.save();
    g.translate(gx, gy);
    g.rotate(facing);
    g.strokeRect(-goalW / 2, -depth, goalW, depth);
    g.strokeStyle = "rgba(230, 230, 226, 0.35)";
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

export function renderRoadsOffscreen(roads) {
  roadCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  roads.forEach((road) => {
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

  // --- Draw intersections ---
  roads.forEach((r1, i) => {
    for (let j = i + 1; j < roads.length; j++) {
      const r2 = roads[j];
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

  // --- Draw borders without intersections ---
  roadCtx.strokeStyle = "#5c5c5c";
  roadCtx.lineWidth = 4;

  roads.forEach((road) => {
    roadCtx.save();
    roadCtx.beginPath();
    roadCtx.rect(road.x, road.y, road.width, road.height);

    roads.forEach((other) => {
      if (road === other) return;
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

  // --- Draw dashed center lines ---
  roadCtx.strokeStyle = "#fff";
  roadCtx.lineWidth = 2;
  roadCtx.setLineDash([20, 20]);

  roads
    .filter((r) => r.width > r.height)
    .forEach((r) => {
      const y = r.y + r.height / 2;
      roadCtx.beginPath();
      roadCtx.moveTo(0, y);
      roadCtx.lineTo(WORLD_WIDTH, y);
      roadCtx.stroke();
    });

  roads
    .filter((r) => r.height > r.width)
    .forEach((r) => {
      const x = r.x + r.width / 2;
      roadCtx.beginPath();
      roadCtx.moveTo(x, 0);
      roadCtx.lineTo(x, WORLD_HEIGHT);
      roadCtx.stroke();
    });

  roadCtx.setLineDash([]);
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
