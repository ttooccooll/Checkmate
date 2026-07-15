import * as payments from "./services/payments.js";
import { sfx, toggleMute, engine } from "./services/audio.js";
import { SkidMarks } from "./world/effects.js";
import { Ambience } from "./world/ambience.js";
import { TrafficManager } from "./entities/traffic.js";
import { DeliveryManager } from "./entities/deliveries.js";

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

import {
  rectCollision,
  circleRectCollision,
  isCollidingWithObstacles,
} from "./core/collision.js";
import { Player } from "./entities/player.js";
import { NPC, Quest } from "./entities/npcs.js";
import { DialogManager } from "./entities/dialog.js";
import { Tree } from "./entities/trees.js";
import { spawnQuestItems } from "./entities/items.js";
import { QuestLogManager } from "./ui/questLog.js";

const dialogManager = new DialogManager();
const questLog = new QuestLogManager();

let npcs = [];

let startingGame = false;
let usingDragControls = false;
let offRoadTimer = 0;
let treadsWarned = false;

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

const taxiSprites = [
  "/assets/taxi1.png",
  "/assets/taxi2.png",
  "/assets/taxi3.png",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});

const skidMarks = new SkidMarks();
const ambience = new Ambience();
const traffic = new TrafficManager(taxiSprites);
const deliveries = new DeliveryManager({
  showMessage: (msg, ms) => showMessage(msg, ms),
  addScore: (n) => addScore(n),
  sfx,
  isFoggy: () => ambience.isFoggy(),
});

const sessionStats = { distancePx: 0, timeSec: 0, coins: 0, quests: 0 };

player.onCrash = (reason) => {
  handleCrash(reason);
};

let buildings = [];
let trees = [];
let coins = [];
let items = [];
let score = 0;
let gameRunning = false;

window.addScore = (amount) => {
  score += amount;
};

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

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  metalDetector: false,
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
let introMessageTimer = null;

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
    case "w":
    case "W":
    case "8":
      keys["ArrowUp"] = true;
      break;
    case "ArrowDown":
    case "s":
    case "S":
    case "2":
      keys["ArrowDown"] = true;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
    case "4":
      keys["ArrowLeft"] = true;
      break;
    case "ArrowRight":
    case "d":
    case "D":
    case "6":
      keys["ArrowRight"] = true;
      break;
    case "5":
      keys["Enter"] = true;
      break;
    case "m":
    case "M":
      if (!e.repeat) {
        showMessage(toggleMute() ? "🔇 Sound off" : "🔊 Sound on", 1200);
      }
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
    case "w":
    case "W":
    case "8":
      keys["ArrowUp"] = false;
      break;
    case "ArrowDown":
    case "s":
    case "S":
    case "2":
      keys["ArrowDown"] = false;
      break;
    case "ArrowLeft":
    case "a":
    case "A":
    case "4":
      keys["ArrowLeft"] = false;
      break;
    case "ArrowRight":
    case "d":
    case "D":
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
          rewardScore: n.quest.rewardScore,
          unlockNPC: n.quest.unlockNPC,
          unlockText: n.quest.unlockText,
          params: {
            amount: n.quest.params?.amount ?? n.quest.amount,
            item: n.quest.params?.item ?? n.quest.item,
            puzzleId: n.quest.puzzleId,
          },
        })
      : null;

    return new NPC(n, 0, 0, quest);
  });

  npcs.forEach((npc) => {
    const spawn = findSafeSpawn([...npcs, player]);
    npc.x = spawn.x;
    npc.y = spawn.y;
  });

  return npcs;
}

async function startNewGame() {
  if (startingGame || gameRunning) return;
  if (!grassRendered || !roadTexture.complete) {
    showMessage("Loading textures…", 1000);
    return;
  }
  showMessage("New Game!", 2000);

  resizeCanvas();

  startingGame = true;

  score = 0;
  flashTimer = 0;
  dustParticles = [];

  offRoadTimer = 0;
  treadsWarned = false;

  generateRoads();
  trees = generateTrees(70);
  renderTreesOffscreen();
  buildings = generateBuildings(50);
  coins = generateCoins(15);

  // Load NPCs
  await loadNPCs();

  // spawn quest items
  items = []; // reset
  npcs.forEach((npc) => {
    spawnQuestItems(npc, items, { buildings, trees });
  });

  const spawn = findSafeSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  player.setInvulnerable(20);

  traffic.spawn(roads, player);
  skidMarks.clear();
  ambience.reset();
  deliveries.reset();
  Object.assign(sessionStats, { distancePx: 0, timeSec: 0, coins: 0, quests: 0 });
  engine.start();

  const visibleWidth = canvas.width / (window.devicePixelRatio || 1);
  const visibleHeight = canvas.height / (window.devicePixelRatio || 1);

  camera.x = player.x + player.width / 2 - visibleWidth / 2;
  camera.y = player.y + player.height / 2 - visibleHeight / 2;

  camera.x = Math.max(0, Math.min(WORLD_WIDTH - visibleWidth, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - visibleHeight, camera.y));

  gameRunning = true;

  const newGameBtn = document.getElementById("new-game-btn");
  setTimeout(() => {
    newGameBtn.textContent = "Quest Log";
    newGameBtn.onclick = () => questLog.toggle();
  }, 0);

  lastTime = performance.now();

  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => {
    button.classList.add("smaller-buttons");
  });

  introMessageTimer = setTimeout(() => {
    showMessage(
      "🔔 A distant bell echoes through the air… It reminds you of your sister Nandi, who always described mysterious ringing at the lighthouse.",
      4000
    );
  }, 5000);

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

    // --- Soft shadow behind tree for depth ---
    treeCtx.shadowColor = "rgba(0,0,0,0.5)";
    treeCtx.shadowBlur = 25;

    treeCtx.drawImage(t.img, t.x, t.y, t.size * 2, t.size * 2);

    treeCtx.restore();
  });
}

function generateTrees(count) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    const img = treeImages[Math.floor(Math.random() * treeImages.length)];
    const size = 30 + Math.random() * 30;
    const x = Math.random() * (WORLD_WIDTH - size * 2);
    const y = Math.random() * (WORLD_HEIGHT - size * 2);

    if (!isOnRoad(x, y, size * 2, size * 2)) {
      arr.push(new Tree(x, y, size, img));
    }

    attempts++;
  }

  return arr;
}

function spawnCelebrationCoins(count = 14) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const r = 70 + Math.random() * 90;
    coins.push({
      x: Math.max(10, Math.min(WORLD_WIDTH - 10, player.x + Math.cos(ang) * r)),
      y: Math.max(10, Math.min(WORLD_HEIGHT - 10, player.y + Math.sin(ang) * r)),
      size: 5,
    });
  }
}

function generateCoins(count) {
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

function isVisible(x, y, w, h) {
  const dpr = window.devicePixelRatio || 1;
  const vw = canvas.width / dpr;
  const vh = canvas.height / dpr;

  return (
    x + w > camera.x &&
    x < camera.x + vw &&
    y + h > camera.y &&
    y < camera.y + vh
  );
}

function showMessage(text, duration = 5000, closable = false) {
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
  player.update(deltaTime);

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

  // Off-road slows you down without treads; tread wear itself is applied
  // after movement, so it only accrues while actually riding.
  const offRoad = !isOnRoad(player.x, player.y, player.width, player.height);
  if (offRoad && !upgrades.offRoadTreads) {
    baseSpeed *= 0.5;
  }

  const speed = baseSpeed * deltaTime;
  const prevDirection = player.direction;

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

  player.move(dx, dy);
  player.clamp(WORLD_WIDTH, WORLD_HEIGHT);

  const moving = dx !== 0 || dy !== 0;
  sessionStats.timeSec += deltaTime / 60;
  if (moving) {
    sessionStats.distancePx += Math.hypot(dx, dy);
    // Hard direction change at speed leaves rubber and kicks up dust
    if (player.direction !== prevDirection) {
      skidMarks.add(
        player.x + player.width / 2,
        player.y + player.height / 2,
        prevDirection
      );
      spawnDust();
    }

    // Riding off-road grinds down the treads — wear never heals
    if (offRoad) {
      spawnDust();
      if (upgrades.offRoadTreads) {
        offRoadTimer += deltaTime;
        if (offRoadTimer >= OFFROAD_MAX) {
          upgrades.offRoadTreads = false;
          localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
          showMessage("🛞 Off-Road Treads worn out!");
          offRoadTimer = 0;
          treadsWarned = false;
        } else if (!treadsWarned && offRoadTimer > OFFROAD_MAX * 0.7) {
          treadsWarned = true;
          showMessage("🛞 Your treads are wearing thin…", 3000);
        }
      }
    }
  }
  skidMarks.update(deltaTime);

  engine.update(moving ? baseSpeed / 8 : 0);

  traffic.update(deltaTime, player, {
    onCrash: () => player.crash("taxi"),
    horn: () => sfx.horn(),
  });

  deliveries.update(deltaTime / 60, player, npcs);

  ambience.update(deltaTime / 60, {
    onFogIn: () =>
      showMessage(
        "🌫️ Fog rolls in from the bay… deliveries pay double while it lasts!",
        5000
      ),
    onFogOut: () => showMessage("☀️ The fog lifts.", 2500),
  });

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

  player.checkBuildingCollisions(buildings, rectCollision);
  player.checkTreeCollisions(trees, circleRectCollision, isVisible);

  npcs.forEach((npc) => {
    const completedQuest = npc.checkQuestCompletion(player, npcs, {
      showMessage,
    });

    if (completedQuest) {
      const reward = completedQuest.rewardScore || 0;
      addScore(reward);
      sessionStats.quests++;
      sfx.quest();

      showMessage(
        `🎉 Quest "${
          completedQuest.description || "Unnamed Quest"
        }" completed! +${reward} score`,
        5000
      );

      // Promenade arc finale: the whole town comes out to celebrate.
      if (completedQuest.id === "community_notices") {
        setTimeout(() => {
          sfx.festival();
          addScore(75);
          spawnCelebrationCoins();
          showMessage(
            "🎉 Lanterns flicker on along the promenade — music, laughter, the smell of a braai on the wind. The whole town has come out. +75 points!",
            9000
          );
        }, 2500);
      }

      // Story finale: the bell is restored — let the whole bay hear it.
      if (completedQuest.id === "mystery_ring_bell") {
        setTimeout(() => {
          sfx.bell();
          showMessage(
            "🔔 The old bell rings out across the bay — deep and clear, like it never stopped. Far below, the town goes quiet and looks up. The town remembers.",
            9000
          );
        }, 2500);
      }
    }
  });

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
      sessionStats.coins++;
      sfx.coin();
      showMessage(`🎉 Collected coin! Plus one point.`);
      return false;
    }
    return true;
  });

  items.forEach((item) => {
    if (
      !item.collected &&
      rectCollision(player.getHitbox(), {
        x: item.x,
        y: item.y,
        width: item.size,
        height: item.size,
      })
    ) {
      item.collected = true;
      player.inventory = player.inventory || {};
      player.inventory[item.id] = (player.inventory[item.id] || 0) + 1;

      sfx.item();
      showMessage(`🎉 Collected ${item.id}!`);
    }
  });

  updateCamera(deltaTime);

  dustParticles.forEach((p) => {
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.life -= deltaTime;
  });

  dustParticles = dustParticles.filter((p) => p.life > 0);

  updateTouchControlsVisibility();
}

// Nearest objective worth pointing at: uncollected items for accepted quests
// first, then newly revealed story NPCs whose quest hasn't been picked up yet.
function findCompassTarget() {
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;

  // Deliveries outrank everything — there's a timer running
  const deliveryNpc = deliveries.getCompassTarget();
  if (deliveryNpc) {
    return {
      cx: deliveryNpc.x + deliveryNpc.width / 2,
      cy: deliveryNpc.y + deliveryNpc.height / 2,
      x: deliveryNpc.x,
      y: deliveryNpc.y,
      width: deliveryNpc.width,
      height: deliveryNpc.height,
      color: "#FF9F1C",
    };
  }

  const activeItemIds = new Set();
  npcs.forEach((npc) => {
    const q = npc.currentQuest;
    if (q?.active && q.type === "collect" && q.params?.item) {
      activeItemIds.add(q.params.item);
    }
  });

  let best = null;
  let bestDist = Infinity;

  items.forEach((item) => {
    if (item.collected || !activeItemIds.has(item.id)) return;
    const d = Math.hypot(item.x - px, item.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = {
        cx: item.x + item.size / 2,
        cy: item.y + item.size / 2,
        x: item.x,
        y: item.y,
        width: item.size,
        height: item.size,
        color: item.color,
      };
    }
  });

  if (best) return best;

  npcs.forEach((npc) => {
    const q = npc.currentQuest;
    if (!npc.visible || !npc.wasHidden || !q) return;
    if (q.active || npc.completedQuests.includes(q.id)) return;
    const d = Math.hypot(npc.x - px, npc.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = {
        cx: npc.x + npc.width / 2,
        cy: npc.y + npc.height / 2,
        x: npc.x,
        y: npc.y,
        width: npc.width,
        height: npc.height,
        color: "#FFD700",
      };
    }
  });

  return best;
}

// Small arrow orbiting the player, pointing toward the current objective.
// Hidden while the objective itself is on screen.
function drawQuestCompass() {
  const target = findCompassTarget();
  if (!target) return;
  if (isVisible(target.x - 8, target.y - 8, target.width + 16, target.height + 16)) {
    return;
  }

  const px = player.x + player.width / 2 - camera.x;
  const py = player.y + player.height / 2 - camera.y;
  const ang = Math.atan2(
    target.cy - (player.y + player.height / 2),
    target.cx - (player.x + player.width / 2)
  );

  ctx.save();
  ctx.translate(px + Math.cos(ang) * 55, py + Math.sin(ang) * 55);
  ctx.rotate(ang);
  ctx.globalAlpha = 0.65 + 0.3 * Math.sin(performance.now() / 250);
  ctx.fillStyle = target.color;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-6, 6.5);
  ctx.lineTo(-6, -6.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function updateCamera(deltaTime) {
  const targetX =
    player.x +
    player.width / 2 -
    canvas.width / 2 / (window.devicePixelRatio || 1);
  const targetY =
    player.y +
    player.height / 2 -
    canvas.height / 2 / (window.devicePixelRatio || 1);

  const lerpFactor = 0.1;
  camera.x += (targetX - camera.x) * lerpFactor;
  camera.y += (targetY - camera.y) * lerpFactor;

  // Clamp in world coordinates
  const visibleWidth = canvas.width / (window.devicePixelRatio || 1);
  const visibleHeight = canvas.height / (window.devicePixelRatio || 1);

  camera.x = Math.max(0, Math.min(WORLD_WIDTH - visibleWidth, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - visibleHeight, camera.y));
}

function endGame(reason = "Game Over") {
  if (!gameRunning) return;
  upgrades.metalDetector = false;
  upgrades.speedBoost = false;
  localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));

  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "New Game";
  newGameBtn.onclick = () => {
    document.getElementById("intro-screen").style.display = "none";
    document.getElementById("game-container").style.display = "block";
    document.getElementById("touch-controls").style.display = "grid";
    document.getElementById("action-buttons").style.display = "flex";
    startNewGame();
  };
  dialogManager.endDialog();
  questLog.hide();
  gameRunning = false;
  flashTimer = FLASH_DURATION;
  engine.stop();
  sfx.gameover();
  // A queued intro message must not wipe the game-over screen
  clearTimeout(introMessageTimer);

  const previousBest = Number(localStorage.getItem("checkmateBestScore")) || 0;
  const isNewBest = score > previousBest;
  if (isNewBest) {
    localStorage.setItem("checkmateBestScore", String(score));
  }

  const km = (sessionStats.distancePx / 1000).toFixed(1);
  const t = Math.max(0, Math.round(sessionStats.timeSec));
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

  const message = `
💥 Game Over 💥
${reason}
Score: ${score}
${isNewBest ? "🏆 New personal best!" : `Best: ${previousBest}`}
🛣️ ${km} km · ⏱️ ${clock}
🪙 ${sessionStats.coins} coins · 📦 ${deliveries.completed} deliveries · 📜 ${sessionStats.quests} quests
  `.trim();

  showMessage(message, 0, true);

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

  const nowMs = performance.now();

  // --- Draw world ---
  if (grassCanvas) ctx.drawImage(grassCanvas, 0, 0);
  ctx.drawImage(roadCanvas, 0, 0);

  // --- Skid marks (under everything that moves) ---
  skidMarks.draw(ctx, isVisible);

  // --- Draw NPCs ---
  npcs.forEach((npc) => npc.draw(ctx));

  // --- Draw coins (spinning: width oscillates like a flipping coin) ---
  coins.forEach((c) => {
    const r = c.size / 2;
    const spin = Math.abs(Math.cos(nowMs / 320 + c.x * 0.13));
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.ellipse(
      c.x + r,
      c.y + r,
      Math.max(0.8, r * spin),
      r,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.stroke();

    // glint as the face catches the light edge-on
    if (spin < 0.35) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(c.x + r - 0.75, c.y, 1.5, c.size);
    }
  });

  const pulseNow = nowMs;
  items.forEach((item) => {
    if (item.collected) return;

    const itemCx = item.x + item.size / 2;
    const itemCy = item.y + item.size / 2;
    // Offset each item's pulse by position so they don't blink in sync
    const phase = pulseNow / 180 + itemCx * 0.05;

    // Soft glow ring so quest items stand out from coins
    ctx.strokeStyle = item.color;
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(phase);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(itemCx, itemCy, item.size / 2 + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(
      itemCx,
      itemCy,
      (item.size / 2) * (1 + 0.35 * Math.sin(phase)),
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.stroke();
  });

  // --- Metal Detector Overlay ---
  if (upgrades.metalDetector) {
    ctx.save();
    ctx.strokeStyle = "rgba(201, 91, 27, 0.7)";
    ctx.lineWidth = 2;

    const detectorRange = 250; // radius around player

    items.forEach((item) => {
      if (!item.collected) {
        const dx = item.x + item.size / 2 - (player.x + player.width / 2);
        const dy = item.y + item.size / 2 - (player.y + player.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= detectorRange) {
          ctx.beginPath();
          ctx.arc(
            item.x + item.size / 2,
            item.y + item.size / 2,
            item.size + 8, // highlight
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }
    });

    ctx.restore();
  }

  // --- Draw dust (VERY LIGHT) ---
  dustParticles.forEach((p) => {
    ctx.fillStyle = `rgba(180, 141, 86, 0.1)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Delivery markers (parcel + destination ring) ---
  deliveries.draw(ctx, nowMs);

  // --- Taxis ---
  traffic.draw(ctx, isVisible);

  // --- Draw player ---
  player.draw(ctx);

  // --- Draw trees ---
  ctx.drawImage(treeCanvas, 0, 0);

  // --- Draw buildings with shadows ---
  buildings.forEach((b) => {
    if (!isVisible(b.x, b.y, b.width, b.height)) return;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,1)";
    ctx.shadowBlur = 20;

    ctx.drawImage(b.img, b.x, b.y, b.width, b.height);
    ctx.restore();
  });

  ctx.restore();

  // --- Atmosphere: dusk tint + fog (screen space) ---
  {
    const dpr = window.devicePixelRatio || 1;
    ambience.drawScreen(
      ctx,
      canvas.width / dpr,
      canvas.height / dpr,
      player.x + player.width / 2 - camera.x,
      player.y + player.height / 2 - camera.y
    );
  }

  // --- Crash flash overlay ---
  if (flashTimer > 0) {
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = `rgba(255, 40, 40, ${(0.3 * flashTimer) / FLASH_DURATION})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  // --- Quest compass ---
  if (gameRunning) {
    drawQuestCompass();
  }

  // --- HUD ---
  const hudX = 8;
  let hudY = 8;
  const padding = 5;
  const lineHeight = 18;

  // Compute height for background (score + upgrades + status lines)
  const deliveryLine = gameRunning ? deliveries.timerText() : null;
  const fogLine = gameRunning && ambience.isFoggy() ? "🌫️ 2× delivery" : null;
  const numLines =
    1 +
    Object.values(upgrades).filter(Boolean).length +
    (deliveryLine ? 1 : 0) +
    (fogLine ? 1 : 0);
  const bgHeight = numLines * lineHeight + padding * 2;
  const bgWidth = 130;

  // Draw a light white background
  ctx.save(); // save current state
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 50; // increase for stronger blur
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(hudX - padding, hudY - padding, bgWidth, bgHeight);
  ctx.restore(); // restore so text isn't blurred

  // Draw text on top
  ctx.font = "16px monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#111";

  ctx.fillText(`Score: ${score}`, hudX, hudY);
  let textY = hudY + lineHeight;

  const upgradeLabels = {
    helmet: "🪖 Helmet",
    speedBoost: "⚡ Boost",
    offRoadTreads: "🛞 Treads",
    metalDetector: "🧲 Detector",
  };

  Object.keys(upgrades).forEach((key) => {
    if (upgrades[key]) {
      let label = upgradeLabels[key];
      if (key === "offRoadTreads") {
        const left = Math.max(
          0,
          Math.round(100 - (offRoadTimer / OFFROAD_MAX) * 100)
        );
        label = `🛞 Treads ${left}%`;
      }
      ctx.fillText(label, hudX, textY);
      textY += lineHeight;
    }
  });

  if (deliveryLine) {
    ctx.fillStyle = "#8a4b00";
    ctx.fillText(deliveryLine, hudX, textY);
    textY += lineHeight;
  }
  if (fogLine) {
    ctx.fillStyle = "#3a5f8a";
    ctx.fillText(fogLine, hudX, textY);
    textY += lineHeight;
  }
}

function spawnDust() {
  const count = 2 + Math.random() * 2;

  for (let i = 0; i < count; i++) {
    dustParticles.push({
      x: player.x + player.width / 2 + (Math.random() * 6 - 3),
      y: player.y + player.height / 2 + (Math.random() * 6 - 3),
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: 3 + Math.random() * 5,
      life: 30 + Math.random() * 32,
    });
  }

  // --- Cap the array length ---
  const MAX_DUST = 80;
  if (dustParticles.length > MAX_DUST) {
    dustParticles.splice(0, dustParticles.length - MAX_DUST);
  }
}

function findSafeSpawn(avoid = [], maxAttempts = 5000) {
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

    // Check against all obstacles (trees, buildings, coins, roads)
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

function gameLoop(timestamp) {
  let deltaTime = (timestamp - lastTime) / 16.666;
  deltaTime = Math.min(deltaTime, 3);
  lastTime = timestamp;

  // Runs outside update() so the game-over flash still fades out
  if (flashTimer > 0) {
    flashTimer = Math.max(0, flashTimer - deltaTime);
  }

  questLog.update(npcs, player);
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
    sfx.helmet();
    showMessage("🪖 Helmet destroyed!");
    return;
  }

  sfx.crash();
  const reasons = {
    building: "You crashed into a building!",
    tree: "You hit a tree!",
    taxi: "You were flattened by a taxi!",
  };
  endGame(reasons[reason] || "You crashed!");
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    engine.stop();
  } else if (gameRunning) {
    engine.start();
  }
});

// Dev/test handle for poking live systems from the console
window.__cm = { ambience, deliveries, traffic, skidMarks, player, getNpcs: () => npcs };

const touchControls = document.getElementById("touch-controls");

if (!isTouchDevice()) {
  touchControls.style.display = "none";
}

async function buyUpgrade(upgradeName) {
  if (upgrades[upgradeName]) {
    showMessage(`✔ You already own the ${upgradeName}!`);
    return;
  }

  // The server owns the price list — we only name the item.
  const success = await payments.makePayment(upgradeName);

  if (success) {
    upgrades[upgradeName] = true;
    if (upgradeName === "offRoadTreads") {
      offRoadTimer = 0;
      treadsWarned = false;
    }
    localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));
    sfx.purchase();
    const labels = {
      helmet: "Helmet",
      speedBoost: "Speed Boost",
      offRoadTreads: "Off-Road Treads",
      metalDetector: "Metal Detector",
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

document.getElementById("new-game-btn").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

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
  () => buyUpgrade("helmet"),
  () => {}
);

bindPointerButton(
  "speed-boost-btn",
  () => buyUpgrade("speedBoost"),
  () => {}
);

bindPointerButton(
  "off-road-treads-btn",
  () => buyUpgrade("offRoadTreads"),
  () => {}
);

bindPointerButton(
  "metal-detector-btn",
  () => buyUpgrade("metalDetector"),
  () => {}
);
