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
    spawnQuestItems(npc, items);
  });

  const spawn = findSafeSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  player.setInvulnerable(20);

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

  setTimeout(() => {
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

function generateCoins(count) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 500) {
    const x = Math.random() * (WORLD_WIDTH - 5);
    const y = Math.random() * (WORLD_HEIGHT - 5);

    if (!isCollidingWithObstacles(x - 2, y - 2, 9, 9)) {
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

  npcs.forEach((npc) => {
    const completedQuest = npc.checkQuestCompletion(player, npcs, {
      showMessage,
    });

    if (completedQuest) {
      const reward = completedQuest.rewardScore || 0;
      addScore(reward);

      showMessage(
        `🎉 Quest "${
          completedQuest.description || "Unnamed Quest"
        }" completed! +${reward} score`,
        0,
        5000
      );

      questLog.update(npcs, player);
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

      showMessage(`🎉 Collected ${item.id}!`);
      questLog.update(npcs, player);
    }
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

  updateTouchControlsVisibility();
}

function enableLighthouseBell() {
  // Example: show a message and maybe activate a visual indicator
  showMessage("🔔 Go ring the lighthouse bell!");

  // Optionally, set a game state for the bell
  window.lighthouseBellActive = true;
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
  const message = `
💥 Game Over
${reason}
Score: ${score}
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

  // --- Draw world ---
  if (grassCanvas) ctx.drawImage(grassCanvas, 0, 0);
  ctx.drawImage(roadCanvas, 0, 0);

  // --- Draw NPCs ---
  npcs.forEach((npc) => npc.draw(ctx));

  // --- Draw coins ---
  coins.forEach((c) => {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(c.x + c.size / 2, c.y + c.size / 2, c.size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "black";
    ctx.stroke();
  });

  items.forEach((item) => {
    if (item.collected) return;

    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(
      item.x + item.size / 2,
      item.y + item.size / 2,
      item.size / 2,
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

  // --- HUD ---
  ctx.font = "16px monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#111";

  ctx.fillText(`Score: ${score}`, 10, 10);

  const hudX = 10;
  let hudY = 30;

  const upgradeLabels = {
    helmet: "🪖 Helmet",
    speedBoost: "⚡ Speed Boost",
    offRoadTreads: "🛞 Off-Road Treads",
    metalDetector: "🧲 Metal Detector",
  };

  Object.keys(upgrades).forEach((key) => {
    if (upgrades[key]) {
      ctx.fillText(upgradeLabels[key], hudX, hudY);
      hudY += 18; // spacing between upgrades
    }
  });
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
        hitbox.height
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

  endGame("You crashed!");
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

bindPointerButton(
  "metal-detector-btn",
  () => buyUpgrade("metalDetector", 75),
  () => {}
);

const introScreen = document.getElementById("intro-screen");
const gameContainer = document.getElementById("game-container");
const actionButtons = document.getElementById("action-buttons");
