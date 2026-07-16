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

  const H_ROADS = 4;
  const V_ROADS = 5;
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

export function generateBuildings(count, roads, buildingImages) {
  let arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 30) {
    let img = buildingImages[Math.floor(Math.random() * buildingImages.length)];

    let width, height;

    if (img.src.includes("shack.png")) {
      // Shacks: smaller
      width = 40 + Math.random() * 40;
      const aspect = 0.6 + Math.random() * 0.8;
      height = width * aspect;
    } else if (img.src.includes("house") && !img.src.includes("flat.png")) {
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

    if (isOnRoad(roads, x, y, width, height)) {
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

export function generateTrees(count, roads, treeImages) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    const img = treeImages[Math.floor(Math.random() * treeImages.length)];
    const size = 30 + Math.random() * 30;
    const x = Math.random() * (WORLD_WIDTH - size * 2);
    const y = Math.random() * (WORLD_HEIGHT - size * 2);

    if (!isOnRoad(roads, x, y, size * 2, size * 2)) {
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

export function findSafeSpawn(
  { avoid = [], npcs = [], buildings = [], trees = [] },
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
