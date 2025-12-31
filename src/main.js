import * as payments from "./services/payments.js";

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  ROAD_HEIGHT,
  COLLISION_FACTOR,
  ROAD_BUFFER,
  INVULNERABLE_DURATION,
  FLASH_DURATION,
  OFFROAD_MAX,
} from "./core/constants.js";

import { rectCollision, circleRectCollision } from "./core/collision.js";
import { Player } from "./entities/player.js";
import { NPC, Quest } from "./entities/npcs.js";
import { DialogManager } from "./entities/dialog.js";
import { QuestLogManager } from "./ui/questLog.js";

const dialogManager = new DialogManager();
const questLog = new QuestLogManager();

let npcs = [];

let startingGame = false;
let usingDragControls = false;
let speedStress = 0;
let offRoadTimer = 0;

let dustParticles = [];

const canvas = document.getElementById("game-board");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const roadCanvas = document.createElement("canvas");
roadCanvas.width = WORLD_WIDTH;
roadCanvas.height = WORLD_HEIGHT;
const roadCtx = roadCanvas.getContext("2d");
class RoadSegment {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}
const roadTexture = new Image();
roadTexture.src = "/assets/road.jpg";

const grassTexture = new Image();
grassTexture.src = "/assets/fyn2.jpg";
const grassCanvas = document.createElement("canvas");
grassCanvas.width = WORLD_WIDTH;
grassCanvas.height = WORLD_HEIGHT;
const grassCtx = grassCanvas.getContext("2d");

const buildingImages = [
  "/assets/house.png",
  "/assets/house2.png",
  "/assets/house3.png",
  "/assets/house4.png",
  "/assets/shack.png",
  "/assets/flat.png",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});
const treeImages = [
  "/assets/tree.png",
  "/assets/tree2.png",
  "/assets/tree3.png",
  "/assets/tree4.png",
  "/assets/tree5.png",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});
const treeCanvas = document.createElement("canvas");
treeCanvas.width = WORLD_WIDTH;
treeCanvas.height = WORLD_HEIGHT;
const treeCtx = treeCanvas.getContext("2d");
treeCtx.imageSmoothingEnabled = false;

const touchMove = {
  active: false,
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0,
};

const playerSprite = new Image();
playerSprite.src = "/assets/player.png";

const player = new Player(playerSprite);

player.onCrash = (reason) => {
  handleCrash(reason);
};

let buildings = [];
let trees = [];
let coins = [];
let score = 0;
let gameRunning = false;

const savedUpgrades =
  JSON.parse(localStorage.getItem("motorcycleUpgrades")) || {};

function loadWorldTextures() {
  if (!grassTexture.complete || !roadTexture.complete) return;

  const pattern = grassCtx.createPattern(grassTexture, "repeat");
  if (pattern) {
    grassCtx.fillStyle = pattern;
    grassCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grassRendered = true;
  }

  if (roads.length > 0) renderRoadsOffscreen();
}

roadTexture.onload = loadWorldTextures;

function isCollidingWithObstacles(x, y, width, height) {
  // Buildings
  for (let b of buildings) {
    if (rectCollision({ x, y, width, height }, b)) return true;
  }

  // Trees
  for (let t of trees) {
    if (!isVisible(t.x, t.y, t.size * 2, t.size * 2)) continue;
    const circle = {
      x: t.x + t.size,
      y: t.y + t.size,
      radius: t.size * COLLISION_FACTOR,
    };
    if (circleRectCollision(circle, { x, y, width, height })) return true;
  }

  return false;
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

canvas.tabIndex = 0;

canvas.addEventListener("pointerdown", (e) => {
  if (!gameRunning) return;

  usingDragControls = true;
  touchMove.active = true;
  touchMove.startX = e.clientX;
  touchMove.startY = e.clientY;
  touchMove.dx = 0;
  touchMove.dy = 0;

  resetTouchKeys();
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!touchMove.active) return;

  touchMove.dx = e.clientX - touchMove.startX;
  touchMove.dy = e.clientY - touchMove.startY;
});

canvas.addEventListener("pointerup", (e) => {
  touchMove.active = false;
  usingDragControls = false;
  resetTouchKeys();
  canvas.releasePointerCapture(e.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  touchMove.active = false;
  usingDragControls = false;
  resetTouchKeys();
});

function resetTouchKeys() {
  if (!touchMove.active) {
    keys.ArrowUp = false;
    keys.ArrowDown = false;
    keys.ArrowLeft = false;
    keys.ArrowRight = false;
  }
}

let grassRendered = false;

grassTexture.onload = () => {
  const tempPattern = grassCtx.createPattern(grassTexture, "repeat");
  if (tempPattern) {
    grassCtx.fillStyle = tempPattern;
    grassCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grassRendered = true;
  }
  if (roadTexture.complete) renderRoadsOffscreen();
};

let upgrades = {
  speedBoost: false,
  helmet: true,
  offRoadTreads: false,
  ...savedUpgrades,
};

const keys = {};
let flashTimer = 0;

const camera = {
  x: 0,
  y: 0,
};
let lastTime = 0;
let roads = [];

function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

document.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  switch (e.key) {
    case "ArrowUp":
    case "8":
      keys["ArrowUp"] = true;
      break;
    case "ArrowDown":
    case "2":
      keys["ArrowDown"] = true;
      break;
    case "ArrowLeft":
    case "4":
      keys["ArrowLeft"] = true;
      break;
    case "ArrowRight":
    case "6":
      keys["ArrowRight"] = true;
      break;
    case "5":
      keys["Enter"] = true;
      break;

    case "7":
      keys["ArrowUp"] = true;
      keys["ArrowLeft"] = true;
      break;
    case "9":
      keys["ArrowUp"] = true;
      keys["ArrowRight"] = true;
      break;
    case "1":
      keys["ArrowDown"] = true;
      keys["ArrowLeft"] = true;
      break;
    case "3":
      keys["ArrowDown"] = true;
      keys["ArrowRight"] = true;
      break;

    default:
      break;
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key] = false;

  switch (e.key) {
    case "ArrowUp":
    case "8":
      keys["ArrowUp"] = false;
      break;
    case "ArrowDown":
    case "2":
      keys["ArrowDown"] = false;
      break;
    case "ArrowLeft":
    case "4":
      keys["ArrowLeft"] = false;
      break;
    case "ArrowRight":
    case "6":
      keys["ArrowRight"] = false;
      break;
    case "5":
      keys["Enter"] = false;
      break;

    case "7":
      keys["ArrowUp"] = false;
      keys["ArrowLeft"] = false;
      break;
    case "9":
      keys["ArrowUp"] = false;
      keys["ArrowRight"] = false;
      break;
    case "1":
      keys["ArrowDown"] = false;
      keys["ArrowLeft"] = false;
      break;
    case "3":
      keys["ArrowDown"] = false;
      keys["ArrowRight"] = false;
      break;

    default:
      break;
  }
});

async function loadNPCs() {
  const response = await fetch("./npcDialog.json");
  const npcData = await response.json();

  npcs = npcData.map((n) => {
    const quest = n.quest
      ? new Quest({
          id: n.quest.id,
          description: n.quest.description,
          type: n.quest.type,
          params: {
            amount: n.quest.amount,
            item: n.quest.item,
            puzzleId: n.quest.puzzleId,
          },
        })
      : null;

    const spawn = findSafeSpawn(npcs);
    return new NPC(n, spawn.x, spawn.y, quest);
  });
}

function startNewGame() {
  if (startingGame || gameRunning) return;
  if (!grassRendered || !roadTexture.complete) {
    showMessage("Loading textures…", 1000);
    return;
  }

  startingGame = true;

  score = 0;
  flashTimer = 0;

  generateRoads();
  trees = generateTrees(70);
  renderTreesOffscreen();
  buildings = generateBuildings(50);
  coins = generateCoins(15);

  loadNPCs();

  const spawn = findSafeSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  player.setInvulnerable(20);

  gameRunning = true;

  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "Quest Log";
  newGameBtn.onclick = () => questLog.toggle();

  lastTime = performance.now();

  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => {
    button.classList.add("smaller-buttons");
  });

  requestAnimationFrame((t) => {
    lastTime = t;
    startingGame = false;
    gameLoop(t);
  });
}

function renderRoadsOffscreen() {
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
        const grad = roadCtx.createLinearGradient(
          intersectX,
          intersectY,
          intersectX + intersectWidth,
          intersectY + intersectHeight
        );
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

function isOnRoad(x, y, width, height) {
  return roads.some(
    (road) =>
      x + width > road.x - ROAD_BUFFER &&
      x < road.x + road.width + ROAD_BUFFER &&
      y + height > road.y - ROAD_BUFFER &&
      y < road.y + road.height + ROAD_BUFFER
  );
}

function generateBuildings(count) {
  let arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 30) {
    let img = buildingImages[Math.floor(Math.random() * buildingImages.length)];

    let width, height;

    if (img.src.includes("shack.png")) {
      // Shacks: smaller
      width = 40 + Math.random() * 40; // smaller max
      const aspect = 0.6 + Math.random() * 0.8;
      height = width * aspect;
    } else if (img.src.includes("house") && !img.src.includes("flat.png")) {
      // Houses: medium size
      width = 100 + Math.random() * 100; // between shack and flat
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

    if (isOnRoad(x, y, width, height)) {
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

function renderTreesOffscreen() {
  treeCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  trees.forEach((t) => {
    if (!t.img || !t.img.complete) return;

    treeCtx.save();
    treeCtx.shadowColor = "rgba(0,0,0,0.4)";
    treeCtx.shadowBlur = 10;
    treeCtx.drawImage(t.img, t.x, t.y, t.size * 2, t.size * 2);
    treeCtx.restore();
  });
}

function generateTrees(count) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    let img = treeImages[Math.floor(Math.random() * treeImages.length)];
    const size = 30 + Math.random() * 30; // radius: 30–50
    const x = Math.random() * (WORLD_WIDTH - size * 2);
    const y = Math.random() * (WORLD_HEIGHT - size * 2);

    // Avoid placing trees on roads
    if (!isOnRoad(x, y, size * 2, size * 2)) {
      arr.push({
        x,
        y,
        size,
        img,
        cx: x + size,
        cy: y + size,
        radius: size * 0.3,
      });
    }
    attempts++;
  }

  return arr;
}

function generateCoins(count) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    const x = Math.random() * (WORLD_WIDTH - 20);
    const y = Math.random() * (WORLD_HEIGHT - 20);

    if (!isCollidingWithObstacles(x, y, 20, 20)) {
      arr.push({ x, y, size: 20 });
    }
    attempts++;
  }

  return arr;
}

function isVisible(x, y, w, h) {
  return (
    x + w > camera.x &&
    x < camera.x + canvas.width &&
    y + h > camera.y &&
    y < camera.y + canvas.height
  );
}

function showMessage(text, duration = 2000, closable = false) {
  const modal = document.getElementById("message-modal");
  modal.textContent = text;
  modal.style.display = "block";

  clearTimeout(modal._timer);

  if (closable) {
    modal.onclick = () => {
      modal.style.display = "none";
      modal.onclick = null;
    };
  } else {
    modal.onclick = null;
    modal._timer = setTimeout(() => {
      modal.style.display = "none";
    }, duration);
  }
}

function updateTouchControlsVisibility() {
  if (usingDragControls) {
    // Player is using drag → hide touch buttons
    touchControls.style.opacity = 0;
    touchControls.style.pointerEvents = "none";
  } else {
    // Player is using touch buttons → show them
    touchControls.style.opacity = 1;
    touchControls.style.pointerEvents = "auto";
  }
}

function update(deltaTime = 1) {
  if (!gameRunning) return;
  player.update();

  if (touchMove.active) {
    const DEADZONE = 15;
    const dx = touchMove.dx;
    const dy = touchMove.dy;

    keys.ArrowUp = dy < -DEADZONE;
    keys.ArrowDown = dy > DEADZONE;
    keys.ArrowLeft = dx < -DEADZONE;
    keys.ArrowRight = dx > DEADZONE;
  }

  let baseSpeed = player.speed + (upgrades.speedBoost ? 3 : 0);

  // Reduce speed if off-road
  if (!isOnRoad(player.x, player.y, player.width, player.height)) {
    spawnDust();
    if (upgrades.offRoadTreads) {
      offRoadTimer += deltaTime;
      if (offRoadTimer > OFFROAD_MAX) {
        upgrades.offRoadTreads = false;
        localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
        showMessage("🛞 Off-Road Treads worn out!");
        offRoadTimer = 0;
      }
    } else {
      baseSpeed *= 0.5; // slow down off-road without treads
    }
  } else {
    offRoadTimer = Math.max(0, offRoadTimer - deltaTime);
  }

  if (upgrades.speedBoost && baseSpeed > player.speed) {
    speedStress++;
  } else {
    speedStress = Math.max(0, speedStress - 1);
  }

  const speed = baseSpeed * deltaTime;

  let dx = 0;
  let dy = 0;

  if (keys["ArrowUp"] && keys["ArrowLeft"]) {
    dx = -speed;
    dy = -speed;
    player.direction = -45;
  } else if (keys["ArrowUp"] && keys["ArrowRight"]) {
    dx = speed;
    dy = -speed;
    player.direction = 45;
  } else if (keys["ArrowDown"] && keys["ArrowLeft"]) {
    dx = -speed;
    dy = speed;
    player.direction = -135;
  } else if (keys["ArrowDown"] && keys["ArrowRight"]) {
    dx = speed;
    dy = speed;
    player.direction = 135;
  } else {
    if (keys["ArrowUp"]) {
      dy = -speed;
      player.direction = 0;
    }
    if (keys["ArrowDown"]) {
      dy = speed;
      player.direction = 180;
    }
    if (keys["ArrowLeft"]) {
      dx = -speed;
      player.direction = -90;
    }
    if (keys["ArrowRight"]) {
      dx = speed;
      player.direction = 90;
    }
  }

  npcs.forEach((npc) => {
    if (npc.isPlayerNearby(player)) {
      if (!npc.talking && !dialogManager.activeDialog) {
        npc.interact(player, dialogManager, { showMessage });
      }
    }
    if (npc.checkDangerCollision(player)) {
      endGame("You hit a pedestrian!");
    }
  });

  player.move(dx, dy);
  player.clamp(WORLD_WIDTH, WORLD_HEIGHT);

  player.checkBuildingCollisions(buildings, rectCollision);
  player.checkTreeCollisions(trees, circleRectCollision, isVisible);

  npcs.forEach((npc) => npc.checkQuestCompletion(player));

  npcs.forEach((npc) => {
    const nearby = npc.isPlayerNearby(player);

    // Player drove off while dialog is active → close dialog
    if (npc.talking && !nearby) {
      dialogManager.endDialog();
      npc.talking = false;
    }

    // Allow re-talk only after fully leaving range
    if (!nearby) {
      npc.hasTalked = false;
    }
  });

  // --- Coins ---
  coins = coins.filter((c) => {
    if (
      rectCollision(player.getHitbox(), {
        x: c.x,
        y: c.y,
        width: c.size,
        height: c.size,
      })
    ) {
      score++;
      player.coins = (player.coins || 0) + 1;
      return false;
    }
    return true;
  });

  updateCamera(deltaTime);

  if (flashTimer > 0) {
    flashTimer--;
  }

  dustParticles.forEach((p) => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
  });

  dustParticles = dustParticles.filter((p) => p.life > 0);

  questLog.update(npcs, player);

  updateTouchControlsVisibility();
}

function updateCamera(deltaTime) {
  const targetX = player.x + player.width / 2 - canvas.width / 2;
  const targetY = player.y + player.height / 2 - canvas.height / 2;

  const lerpFactor = 0.1; // 0.05–0.2 for smoother or snappier movement
  camera.x += (targetX - camera.x) * lerpFactor;
  camera.y += (targetY - camera.y) * lerpFactor;

  // Clamp camera
  camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));
}

function endGame(reason = "Game Over") {
  showMessage(reason, 0, true);
  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "New Game";
  newGameBtn.onclick = () => {
    document.getElementById("intro-screen").style.display = "none";
    document.getElementById("game-container").style.display = "block";
    document.getElementById("touch-controls").style.display = "grid";
    document.getElementById("action-buttons").style.display = "flex";
    startNewGame();
  };

  questLog.hide();
  gameRunning = false;
  flashTimer = FLASH_DURATION;
  showMessage(`💥 Game Over! Score: ${score}`);
  resetButtonSize();
}

function resetButtonSize() {
  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => {
    button.classList.remove("smaller-buttons");
  });
}

function generateRoads() {
  roads = [];

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

  renderRoadsOffscreen();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // --- Translate for camera ---
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // --- Draw world ---
  if (grassCanvas) ctx.drawImage(grassCanvas, 0, 0);
  ctx.drawImage(roadCanvas, 0, 0);

  // --- Draw NPCs ---
  npcs.forEach((npc) => npc.draw(ctx));

  // --- Draw coins ---
  coins.forEach((c) => {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(c.x + 10, c.y + 10, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Draw dust (VERY LIGHT) ---
  dustParticles.forEach((p) => {
    ctx.fillStyle = `rgba(180, 141, 86, 0.1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Draw player ---
  player.draw(ctx);

  // --- Draw trees ---
  ctx.drawImage(treeCanvas, 0, 0);

  // --- Draw buildings with shadows ---
  buildings.forEach((b) => {
    if (!isVisible(b.x, b.y, b.width, b.height)) return;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; // soft black shadow
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    ctx.drawImage(b.img, b.x, b.y, b.width, b.height);
    ctx.restore();
  });

  ctx.restore();

  // --- HUD ---
  ctx.fillStyle = "black";
  ctx.fillText(`Score: ${score}`, 10, 25);
}

function spawnDust() {
  const count = 2 + Math.random() * 2;

  for (let i = 0; i < count; i++) {
    dustParticles.push({
      x: player.x + player.width / 2 + (Math.random() * 6 - 3),
      y: player.y + player.height / 2 + (Math.random() * 6 - 3),
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: 4 + Math.random() * 4,
      life: 35 + Math.random() * 25,
    });
  }

  // --- Cap the array length ---
  const MAX_DUST = 80;
  if (dustParticles.length > MAX_DUST) {
    dustParticles.splice(0, dustParticles.length - MAX_DUST);
  }
}

function findSafeSpawn(avoid = [], maxAttempts = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.random() * (WORLD_WIDTH - 40);
    const y = Math.random() * (WORLD_HEIGHT - 40);

    const pad = 15;
    const hitbox = {
      x: x - pad,
      y: y - pad,
      width: 40 + pad * 2,
      height: 40 + pad * 2,
    };

    // Check collisions with buildings, trees, and anything in avoid array
    let collision =
      isCollidingWithObstacles(
        hitbox.x,
        hitbox.y,
        hitbox.width,
        hitbox.height
      ) ||
      avoid.some((e) =>
        rectCollision(hitbox, {
          x: e.x,
          y: e.y,
          width: e.width || 40,
          height: e.height || 40,
        })
      );

    if (!collision) {
      return { x, y };
    }
  }

  console.warn("No free spawn points after random attempts! Using default.");
  return { x: 50, y: 300 };
}

function gameLoop(timestamp) {
  let deltaTime = (timestamp - lastTime) / 16.666;
  deltaTime = Math.min(deltaTime, 3);
  lastTime = timestamp;

  update(deltaTime);
  draw();

  if (gameRunning || flashTimer > 0) requestAnimationFrame(gameLoop);
}

function handleCrash(reason) {
  if (upgrades.helmet) {
    upgrades.helmet = false;
    localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
    player.setInvulnerable(INVULNERABLE_DURATION);
    flashTimer = FLASH_DURATION;
    showMessage("🪖 Helmet destroyed!");
    return;
  }

  if (upgrades.speedBoost && speedStress > 60) {
    upgrades.speedBoost = false;
    speedStress = 0;
    localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
    player.setInvulnerable(INVULNERABLE_DURATION);
    flashTimer = FLASH_DURATION;
    endGame();
    return;
  }

  endGame();
}

const touchControls = document.getElementById("touch-controls");

if (!isTouchDevice()) {
  touchControls.style.display = "none";
}

async function buyUpgrade(upgradeName, costSats) {
  if (upgrades[upgradeName]) {
    showMessage(`✔ You already own the ${upgradeName}!`);
    return;
  }

  const success = await payments.makePayment(
    costSats,
    `${upgradeName} Upgrade`
  );

  if (success) {
    upgrades[upgradeName] = true;
    localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
    const labels = {
      helmet: "Helmet",
      speedBoost: "Speed Boost",
      offRoadTreads: "Off-Road Treads",
    };

    showMessage(`✔ ${labels[upgradeName]} unlocked!`);
  } else {
    showMessage(`❌ Payment failed`);
  }
}

function bindPointerButton(id, onDown, onUp = onDown) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    onDown();
  });

  el.addEventListener("pointerup", (e) => {
    e.preventDefault();
    onUp();
    el.releasePointerCapture(e.pointerId);
  });

  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", onUp);
}

document.getElementById("new-game-btn").addEventListener("click", () => {
  document.getElementById("intro-screen").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  document.getElementById("touch-controls").style.display = "grid";
  document.getElementById("action-buttons").style.display = "flex";
  startNewGame();
});

bindPointerButton(
  "up-btn",
  () => {
    if (!usingDragControls) keys.ArrowUp = true;
  },
  () => (keys.ArrowUp = false)
);

bindPointerButton(
  "down-btn",
  () => {
    if (!usingDragControls) keys.ArrowDown = true;
  },
  () => (keys.ArrowDown = false)
);

bindPointerButton(
  "left-btn",
  () => {
    if (!usingDragControls) keys.ArrowLeft = true;
  },
  () => (keys.ArrowLeft = false)
);

bindPointerButton(
  "right-btn",
  () => {
    if (!usingDragControls) keys.ArrowRight = true;
  },
  () => (keys.ArrowRight = false)
);

bindPointerButton(
  "helmet-btn",
  () => buyUpgrade("helmet", 50),
  () => {}
);

bindPointerButton(
  "speed-boost-btn",
  () => buyUpgrade("speedBoost", 50),
  () => {}
);

bindPointerButton(
  "off-road-treads-btn",
  () => buyUpgrade("offRoadTreads", 75),
  () => {}
);

const introScreen = document.getElementById("intro-screen");
const gameContainer = document.getElementById("game-container");
const actionButtons = document.getElementById("action-buttons");
