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
