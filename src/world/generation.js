// Procedural world generation: road grid, buildings, trees, coins, and
// safe spawn placement. Pure functions — callers own the resulting arrays.

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ROAD_HEIGHT,
  ROAD_BUFFER,
} from "../core/constants.js";
import {
  rectCollision,
  isCollidingWithObstacles,
} from "../core/collision.js";
import { Tree } from "../entities/trees.js";

export class RoadSegment {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

export function generateRoads() {
  const roads = [];

  const H_ROADS = 5;
  const V_ROADS = 6;
  const hSpacing = WORLD_HEIGHT / (H_ROADS + 1);
  const vSpacing = WORLD_WIDTH / (V_ROADS + 1);

  for (let i = 1; i <= H_ROADS; i++) {
    const y = i * hSpacing - ROAD_HEIGHT / 2 + (Math.random() * 100 - 10);
    roads.push(new RoadSegment(0, y, WORLD_WIDTH, ROAD_HEIGHT));
  }

  for (let i = 1; i <= V_ROADS; i++) {
    const x = i * vSpacing - ROAD_HEIGHT / 2 + (Math.random() * 100 - 10);
    roads.push(new RoadSegment(x, 0, ROAD_HEIGHT, WORLD_HEIGHT));
  }

  return roads;
}

export function isOnRoad(roads, x, y, width, height) {
  return roads.some(
    (road) =>
      x + width > road.x - ROAD_BUFFER &&
      x < road.x + road.width + ROAD_BUFFER &&
      y + height > road.y - ROAD_BUFFER &&
      y < road.y + road.height + ROAD_BUFFER
  );
}

export function generateBuildings(count, roads, buildingImages, reserved = []) {
  let arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 30) {
    let img = buildingImages[Math.floor(Math.random() * buildingImages.length)];

    let width, height;

    if (img.src.includes("shack")) {
      // Shacks: smaller
      width = 40 + Math.random() * 40;
      const aspect = 0.6 + Math.random() * 0.8;
      height = width * aspect;
    } else if (img.src.includes("house") && !img.src.includes("flat")) {
      // Houses: medium size
      width = 100 + Math.random() * 100;
      const aspect = 0.6 + Math.random() * 0.8;
      height = width * aspect;
    } else {
      // Flats: keep original larger size
      width = 200 + Math.random() * 100;
      const aspect = 0.5 + Math.random() * 1.0;
      height = width * aspect;
    }

    // Randomly rotate 50% of buildings
    const rotate90 = Math.random() < 0.5;
    if (rotate90) [width, height] = [height, width];

    const x = Math.random() * (WORLD_WIDTH - width);
    const y = Math.random() * (WORLD_HEIGHT - height);

    if (
      isOnRoad(roads, x, y, width, height) ||
      reserved.some((r) => rectCollision({ x, y, width, height }, r))
    ) {
      attempts++;
      continue;
    }

    const overlapping = arr.some((b) =>
      rectCollision({ x, y, width, height }, b)
    );
    if (!overlapping) {
      arr.push({
        x,
        y,
        width,
        height,
        img,
        rotated: rotate90,
      });
    }

    attempts++;
  }

  return arr;
}

export function generateTrees(count, roads, treeImages, reserved = []) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    const img = treeImages[Math.floor(Math.random() * treeImages.length)];
    const size = 30 + Math.random() * 30;
    const x = Math.random() * (WORLD_WIDTH - size * 2);
    const y = Math.random() * (WORLD_HEIGHT - size * 2);

    const rect = { x, y, width: size * 2, height: size * 2 };
    if (
      !isOnRoad(roads, x, y, size * 2, size * 2) &&
      !reserved.some((r) => rectCollision(rect, r))
    ) {
      arr.push(new Tree(x, y, size, img));
    }

    attempts++;
  }

  return arr;
}

export function generateCoins(count, buildings, trees) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 500) {
    const x = Math.random() * (WORLD_WIDTH - 5);
    const y = Math.random() * (WORLD_HEIGHT - 5);

    if (!isCollidingWithObstacles(x - 2, y - 2, 9, 9, buildings, trees)) {
      arr.push({ x, y, size: 5 });
    }
    attempts++;
  }

  return arr;
}

// Potholes: irregular decay patches on the road surface. All geometry is
// precomputed here (jittered outline, offset deep spot, radial cracks,
// gravel specks) so the renderer just replays fixed paths — every pothole
// is unique and stays identical from frame to frame.
export function generatePotholes(roads, count = 16) {
  // Intersection centers — potholes stay clear of them
  const crossings = [];
  roads.forEach((a, i) => {
    for (let j = i + 1; j < roads.length; j++) {
      const b = roads[j];
      const ix = Math.max(a.x, b.x);
      const iw = Math.min(a.x + a.width, b.x + b.width) - ix;
      const iy = Math.max(a.y, b.y);
      const ih = Math.min(a.y + a.height, b.y + b.height) - iy;
      if (iw > 0 && ih > 0) crossings.push({ x: ix + iw / 2, y: iy + ih / 2 });
    }
  });

  const potholes = [];
  let attempts = 0;

  while (potholes.length < count && attempts < count * 50) {
    attempts++;
    const road = roads[Math.floor(Math.random() * roads.length)];
    const r = 6 + Math.random() * 7;
    const inset = r + 10;
    const x = road.x + inset + Math.random() * (road.width - inset * 2);
    const y = road.y + inset + Math.random() * (road.height - inset * 2);

    if (crossings.some((c) => Math.hypot(c.x - x, c.y - y) < 130)) continue;
    if (potholes.some((p) => Math.hypot(p.x - x, p.y - y) < 150)) continue;

    // Jittered outline
    const verts = 11;
    const outline = [];
    for (let v = 0; v < verts; v++) {
      const ang = (v / verts) * Math.PI * 2 + Math.random() * 0.25;
      const rr = r * (0.72 + Math.random() * 0.55);
      outline.push([x + Math.cos(ang) * rr, y + Math.sin(ang) * rr]);
    }

    // Deep spot, offset from center
    const deepDx = (Math.random() - 0.5) * r * 0.5;
    const deepDy = (Math.random() - 0.5) * r * 0.5;
    const inner = outline.map(([px, py]) => [
      x + deepDx + (px - x) * 0.5,
      y + deepDy + (py - y) * 0.5,
    ]);

    // Radial cracks, each a short wobbly polyline
    const cracks = [];
    const crackCount = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < crackCount; c++) {
      const ang = Math.random() * Math.PI * 2;
      const len = r * (0.8 + Math.random() * 1.3);
      const pts = [[x + Math.cos(ang) * r * 0.85, y + Math.sin(ang) * r * 0.85]];
      const segs = 3;
      for (let s = 1; s <= segs; s++) {
        const wobble = (Math.random() - 0.5) * 3.5;
        const d = r * 0.85 + (len * s) / segs;
        const wAng = ang + (wobble * 0.06 * s) / segs;
        pts.push([
          x + Math.cos(wAng) * d + wobble * 0.4,
          y + Math.sin(wAng) * d + wobble * 0.4,
        ]);
      }
      cracks.push(pts);
    }

    // Loose gravel inside and just past the lip
    const gravel = [];
    const gravelCount = 8 + Math.floor(Math.random() * 7);
    for (let g = 0; g < gravelCount; g++) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 1.25;
      gravel.push([
        x + Math.cos(ang) * d,
        y + Math.sin(ang) * d,
        Math.random() < 0.5 ? 0 : 1, // tone variant
      ]);
    }

    potholes.push({
      x,
      y,
      r,
      outline,
      inner,
      deepDx,
      deepDy,
      cracks,
      gravel,
      hitCooldown: 0,
    });
  }

  return potholes;
}

// Pass `roads` to also keep the spawn off the road surface (used for NPCs
// so taxis can never drive over a pedestrian; the player may spawn on roads).
// One worn five-a-side pitch somewhere in the grass blocks
export const PITCH_W = 340;
export const PITCH_H = 220;

export function placePitch(roads, reserved = []) {
  for (let i = 0; i < 4000; i++) {
    const horiz = Math.random() < 0.5;
    const w = horiz ? PITCH_W : PITCH_H;
    const h = horiz ? PITCH_H : PITCH_W;
    const x = 60 + Math.random() * (WORLD_WIDTH - w - 120);
    const y = 60 + Math.random() * (WORLD_HEIGHT - h - 120);
    const rect = { x: x - 20, y: y - 20, width: w + 40, height: h + 40 };
    if (
      !isOnRoad(roads, rect.x, rect.y, rect.width, rect.height) &&
      !reserved.some((r) => rectCollision(rect, r))
    ) {
      return { x, y, w, h };
    }
  }
  return null;
}

// Yard clutter: water tanks beside houses, containers and upturned boats
// in the open. Solid (they crash like buildings) so they never sit on
// roads, the pitch, or the lighthouse rock.
export function placeProps(roads, buildings, trees, reserved = []) {
  const props = [];

  const blocked = (rect) =>
    isOnRoad(roads, rect.x - 8, rect.y - 8, rect.width + 16, rect.height + 16) ||
    reserved.some((r) => rectCollision(rect, r)) ||
    buildings.some((b) => rectCollision(rect, b)) ||
    trees.some((t) =>
      rectCollision(rect, { x: t.x, y: t.y, width: t.size * 2, height: t.size * 2 })
    ) ||
    props.some((p) =>
      rectCollision(rect, { x: p.x - 12, y: p.y - 12, width: p.w + 24, height: p.h + 24 })
    );

  const inWorld = (rect) =>
    rect.x > 20 &&
    rect.y > 20 &&
    rect.x + rect.width < WORLD_WIDTH - 20 &&
    rect.y + rect.height < WORLD_HEIGHT - 20;

  // Tanks huddle against houses
  const shuffled = [...buildings].sort(() => Math.random() - 0.5);
  let tanks = 0;
  for (const b of shuffled) {
    if (tanks >= 14) break;
    const size = 28 + Math.random() * 6;
    const spots = [
      { x: b.x - size - 8, y: b.y + Math.random() * Math.max(1, b.height - size) },
      { x: b.x + b.width + 8, y: b.y + Math.random() * Math.max(1, b.height - size) },
      { x: b.x + Math.random() * Math.max(1, b.width - size), y: b.y - size - 8 },
      { x: b.x + Math.random() * Math.max(1, b.width - size), y: b.y + b.height + 8 },
    ].sort(() => Math.random() - 0.5);
    for (const s of spots) {
      const rect = { x: s.x, y: s.y, width: size, height: size };
      if (inWorld(rect) && !blocked(rect)) {
        props.push({
          type: "tank",
          x: s.x,
          y: s.y,
          w: size,
          h: size,
          bw: size,
          bh: size,
          rot: 0,
          variant: tanks % 2,
        });
        tanks++;
        break;
      }
    }
  }

  // Containers in yards and open ground
  let placed = 0;
  let attempts = 0;
  while (placed < 8 && attempts++ < 1100) {
    const horiz = Math.random() < 0.5;
    const w = horiz ? 140 : 57;
    const h = horiz ? 57 : 140;
    const x = 30 + Math.random() * (WORLD_WIDTH - w - 60);
    const y = 30 + Math.random() * (WORLD_HEIGHT - h - 60);
    const rect = { x, y, width: w, height: h };
    if (!blocked(rect)) {
      props.push({
        type: "container",
        x,
        y,
        w,
        h,
        bw: 140,
        bh: 57,
        rot: horiz ? 0 : Math.PI / 2,
        variant: placed % 3,
      });
      placed++;
    }
  }

  // Upturned boats on the verges
  placed = 0;
  attempts = 0;
  while (placed < 9 && attempts++ < 1100) {
    const horiz = Math.random() < 0.5;
    const w = horiz ? 68 : 30;
    const h = horiz ? 30 : 68;
    const x = 30 + Math.random() * (WORLD_WIDTH - w - 60);
    const y = 30 + Math.random() * (WORLD_HEIGHT - h - 60);
    const rect = { x, y, width: w, height: h };
    if (!blocked(rect)) {
      props.push({
        type: "boat",
        x,
        y,
        w,
        h,
        bw: 30,
        bh: 68,
        rot:
          (horiz ? Math.PI / 2 : 0) +
          (Math.random() - 0.5) * 0.45 +
          (Math.random() < 0.5 ? Math.PI : 0),
        variant: placed % 3,
      });
      placed++;
    }
  }

  return props;
}

// Informal settlement pockets: tight clusters of shacks with a shipping
// container or two on the edge — the dense counterpoint to the scattered
// houses. Shacks join the buildings array (collide/bake identically);
// containers join props.
export function buildClusters(roads, reserved, shackImg, count = 3) {
  const shacks = [];
  const containers = [];
  const clusterRects = [];
  let made = 0;
  let attempts = 0;

  while (made < count && attempts++ < 600) {
    const cw = 280 + Math.random() * 60;
    const ch = 230 + Math.random() * 50;
    const x = 40 + Math.random() * (WORLD_WIDTH - cw - 80);
    const y = 40 + Math.random() * (WORLD_HEIGHT - ch - 80);
    const rect = { x: x - 24, y: y - 24, width: cw + 48, height: ch + 48 };
    if (isOnRoad(roads, rect.x, rect.y, rect.width, rect.height)) continue;
    if (reserved.some((r) => rectCollision(rect, r))) continue;
    if (clusterRects.some((r) => rectCollision(rect, r))) continue;
    clusterRects.push(rect);
    made++;

    // Dense, slightly ragged rows of shacks
    const cols = 3;
    const rows = 2 + (Math.random() < 0.5 ? 1 : 0);
    const cellW = cw / cols;
    const cellH = ch / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.18) continue; // gaps where a yard would be
        let w = 44 + Math.random() * 22;
        let h = w * (0.7 + Math.random() * 0.5);
        if (Math.random() < 0.5) [w, h] = [h, w];
        const sx = x + c * cellW + 6 + Math.random() * Math.max(4, cellW - w - 12);
        const sy = y + r * cellH + 6 + Math.random() * Math.max(4, cellH - h - 12);
        shacks.push({
          x: sx,
          y: sy,
          width: w,
          height: h,
          img: shackImg,
          rotated: false,
        });
      }
    }

    // One or two containers along the cluster edge — their footprints are
    // checked against everything placed so far AND returned so later
    // building placement can avoid them too
    const nCont = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nCont; i++) {
      const horiz = Math.random() < 0.5;
      const w = horiz ? 140 : 57;
      const h = horiz ? 57 : 140;
      const side = Math.floor(Math.random() * 4);
      let px = x;
      let py = y;
      if (side === 0) {
        px = x + Math.random() * Math.max(1, cw - w);
        py = y - h - 8;
      } else if (side === 1) {
        px = x + Math.random() * Math.max(1, cw - w);
        py = y + ch + 8;
      } else if (side === 2) {
        px = x - w - 8;
        py = y + Math.random() * Math.max(1, ch - h);
      } else {
        px = x + cw + 8;
        py = y + Math.random() * Math.max(1, ch - h);
      }
      const rect = { x: px, y: py, width: w, height: h };
      if (px < 24 || py < 24 || px + w > WORLD_WIDTH - 24 || py + h > WORLD_HEIGHT - 24) continue;
      if (isOnRoad(roads, px - 8, py - 8, w + 16, h + 16)) continue;
      if (reserved.some((r) => rectCollision(rect, r))) continue;
      if (shacks.some((s) => rectCollision(rect, s))) continue;
      if (
        containers.some((c) =>
          rectCollision(rect, { x: c.x - 10, y: c.y - 10, width: c.w + 20, height: c.h + 20 })
        )
      )
        continue;
      containers.push({
        type: "container",
        x: px,
        y: py,
        w,
        h,
        bw: 140,
        bh: 57,
        rot: horiz ? 0 : Math.PI / 2,
        variant: Math.floor(Math.random() * 3),
      });
    }
  }

  return { shacks, containers, clusterRects };
}

export function findSafeSpawn(
  { avoid = [], npcs = [], buildings = [], trees = [], roads = [] },
  maxAttempts = 5000
) {
  const allAvoid = [...avoid, ...npcs, ...buildings, ...trees];

  const SPAWN_SIZE = 40;
  const PADDING = 15;

  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.random() * (WORLD_WIDTH - SPAWN_SIZE);
    const y = Math.random() * (WORLD_HEIGHT - SPAWN_SIZE);

    const hitbox = {
      x: x - PADDING,
      y: y - PADDING,
      width: SPAWN_SIZE + PADDING * 2,
      height: SPAWN_SIZE + PADDING * 2,
    };

    const collides =
      (roads.length > 0 &&
        isOnRoad(roads, hitbox.x, hitbox.y, hitbox.width, hitbox.height)) ||
      isCollidingWithObstacles(
        hitbox.x,
        hitbox.y,
        hitbox.width,
        hitbox.height,
        buildings,
        trees
      ) ||
      allAvoid.some((e) =>
        rectCollision(hitbox, {
          x: e.x,
          y: e.y,
          width: e.width || SPAWN_SIZE,
          height: e.height || SPAWN_SIZE,
        })
      );

    if (!collides) {
      return { x, y };
    }
  }

  console.warn("No free spawn points! Using default.");
  return { x: 50, y: 300 };
}
