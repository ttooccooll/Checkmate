import * as payments from './payments.js';

const canvas = document.getElementById("game-board");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const WORLD_WIDTH = 3000;
const WORLD_HEIGHT = 2000;
const ROAD_HEIGHT = 100;
const COLLISION_FACTOR = 0.5;
const ROAD_BUFFER = 15;
const roadCanvas = document.createElement("canvas");
roadCanvas.width = WORLD_WIDTH;
roadCanvas.height = WORLD_HEIGHT;
const roadCtx = roadCanvas.getContext("2d");
let scale = 1;
class RoadSegment {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}
const roadTexture = new Image();
roadTexture.src = "./assets/road.jpg";
const grassTexture = new Image();
grassTexture.src = "./assets/fyn2.jpg";
const buildingImages = [
  "./assets/house.png",
  "./assets/house2.png",
  "./assets/house3.png",
  "./assets/house4.png",
  "./assets/shack.png",
  "./assets/flat.png",
].map((src) => {
  const img = new Image();
  img.src = src;
  return img;
});
const treeImages = [
  "./assets/tree.png",
  "./assets/tree2.png",
  "./assets/tree3.png",
  "./assets/tree4.png",
  "./assets/tree5.png",
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

const playerSprite = new Image();
playerSprite.src = "./assets/player.png";
let playerSpriteLoaded = false;
let playerWidth = 60;
let playerHeight = 55;

// Variable to store the current facing direction
let currentDirection = 0;

// Wait until the sprite is loaded
playerSprite.onload = () => {
  playerSpriteLoaded = true;
  console.log("Player sprite loaded!");
};

function loadWorldTextures() {
  if (!grassTexture.complete || !roadTexture.complete) return;

  // --- Grass offscreen ---
  const pattern = grassCtx.createPattern(grassTexture, "repeat");
  if (pattern) {
    grassCtx.fillStyle = pattern;
    grassCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    grassRendered = true;
  }

  // --- Roads offscreen ---
  if (roads.length > 0) renderRoadsOffscreen();
}

roadTexture.onload = loadWorldTextures;

function isCollidingWithObstacles(x, y, width, height) {
  // Roads
  if (isOnRoad(x, y, width, height)) return true;

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
  const availableWidth = window.innerWidth;
  const availableHeight = window.innerHeight;
  const scaleX = availableWidth / GAME_WIDTH;
  const scaleY = availableHeight / GAME_HEIGHT;
  scale = Math.min(scaleX, scaleY);

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

canvas.tabIndex = 0;
canvas.focus();

let player = { x: 50, y: 300, width: 40, height: 20, speed: 5 };
let buildings = [];
let trees = [];
let coins = [];
let score = 0;
let gameRunning = false;
let invulnerableTimer = 0;
const INVULNERABLE_DURATION = 80;
const savedUpgrades =
  JSON.parse(localStorage.getItem("motorcycleUpgrades")) || {};

// Offscreen rendering for grass
const grassCanvas = document.createElement("canvas");
grassCanvas.width = WORLD_WIDTH;
grassCanvas.height = WORLD_HEIGHT;
const grassCtx = grassCanvas.getContext("2d");

function renderGrassOffscreen() {
  const pattern = grassCtx.createPattern(grassTexture, "repeat");
  if (pattern) {
    grassCtx.fillStyle = pattern;
    grassCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
}

// Only render the grass once when the texture is loaded
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
const FLASH_DURATION = 150;
const camera = {
  x: 0,
  y: 0,
};
let lastTime = 0;
let roads = [];

function isTouchDevice() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

document.addEventListener("keydown", (e) => {
  console.log("Key pressed:", e.key);
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

  if (!gameRunning && e.key === "Enter") {
    startNewGame();
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

function startNewGame() {
  if (!grassRendered || !roadTexture.complete) {
    showMessage("Loading textures…", 1000);
    return;
  }

  score = 0;
  generateRoads();
  trees = generateTrees(50);
  renderTreesOffscreen();
  buildings = generateBuildings(35);
  coins = generateCoins(15);

  const spawn = findSafeSpawn();
  player.x = spawn.x;
  player.y = spawn.y;

  flashTimer = 0;
  gameRunning = true;
  lastTime = performance.now();

  const actionButtons = document.querySelectorAll('#action-buttons');
    actionButtons.forEach(button => {
      button.classList.add('smaller-buttons');  // Apply smaller button class
    });

  requestAnimationFrame(gameLoop);
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
                tileHeight, // source clipping
                x,
                y,
                tileWidth,
                tileHeight // destination
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
      // Expand the road dimensions by the buffer size
      x + width > road.x - ROAD_BUFFER &&
      x < road.x + road.width + ROAD_BUFFER &&
      y + height > road.y - ROAD_BUFFER &&
      y < road.y + road.height + ROAD_BUFFER
  );
}

function generateBuildings(count) {
  let arr = [];
  let attempts = 0;

  const roofTypes = ["flat", "chimney", "vent"];

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
        roofType: roofTypes[Math.floor(Math.random() * roofTypes.length)],
        roofColor: "#3e3e3eff",
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
    treeCtx.shadowBlur = 15;
    treeCtx.drawImage(t.img, t.x, t.y, t.size * 2, t.size * 2);
    treeCtx.restore();
  });
}


function generateTrees(count) {
  const arr = [];
  let attempts = 0;

  while (arr.length < count && attempts < count * 20) {
    let img = treeImages[Math.floor(Math.random() * treeImages.length)];
    const size = 20 + Math.random() * 30; // radius: 20–50
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
        radius: size * COLLISION_FACTOR,
      });
    }
    attempts++;
  }

  return arr;
}

function generateCoins(count) {
  let arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      x: Math.random() * (WORLD_WIDTH - 20),
      y: Math.random() * (WORLD_HEIGHT - 20),
      size: 20,
    });
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

function showMessage(text, duration = 2000) {
  const modal = document.getElementById("message-modal");
  modal.textContent = text;
  modal.style.display = "block";
  clearTimeout(modal._timer);
  modal._timer = setTimeout(() => {
    modal.style.display = "none";
  }, duration);
}

function update(deltaTime = 1) {
  if (!gameRunning) return;

  let baseSpeed = player.speed + (upgrades.speedBoost ? 3 : 0);

  // Reduce speed if off-road
  if (!isOnRoad(player.x, player.y, player.width, player.height) && !upgrades.offRoadTreads) {
    baseSpeed *= 0.5; // 50% of normal speed off-road
  }

  const speed = baseSpeed * deltaTime;

  // Handle key presses and update direction for diagonal movement
  if (keys["ArrowUp"] && keys["ArrowLeft"]) {
    player.y -= speed;
    player.x -= speed;
    currentDirection = -45; // Diagonal up-left
  } else if (keys["ArrowUp"] && keys["ArrowRight"]) {
    player.y -= speed;
    player.x += speed;
    currentDirection = 45; // Diagonal up-right
  } else if (keys["ArrowDown"] && keys["ArrowLeft"]) {
    player.y += speed;
    player.x -= speed;
    currentDirection = -135; // Diagonal down-left
  } else if (keys["ArrowDown"] && keys["ArrowRight"]) {
    player.y += speed;
    player.x += speed;
    currentDirection = 135; // Diagonal down-right
  } else {
    // Handle single axis movement
    if (keys["ArrowUp"]) {
      player.y -= speed;
      currentDirection = 0; // Facing up
    }
    if (keys["ArrowDown"]) {
      player.y += speed;
      currentDirection = 180; // Facing down
    }
    if (keys["ArrowLeft"]) {
      player.x -= speed;
      currentDirection = -90; // Facing left
    }
    if (keys["ArrowRight"]) {
      player.x += speed;
      currentDirection = 90; // Facing right
    }
  }

  // Ensure the player stays within bounds
  player.x = Math.max(0, Math.min(WORLD_WIDTH - player.width, player.x));
  player.y = Math.max(0, Math.min(WORLD_HEIGHT - player.height, player.y));

  if (invulnerableTimer === 0) {
    for (let b of buildings) {
      if (rectCollision(player, b)) {
        handleCrash();
        return;
      }
    }
  }

  if (invulnerableTimer === 0) {
    for (let t of trees) {
      if (!isVisible(t.x, t.y, t.size * 2, t.size * 2)) continue;
      if (circleRectCollision(t, player)) {
        handleCrash();
        return;
      }
    }
  }

  // --- Coins ---
  coins = coins.filter((c) => {
    if (
      rectCollision(player, { x: c.x, y: c.y, width: c.size, height: c.size })
    ) {
      score++;
      return false;
    }
    return true;
  });

  // --- Camera ---
  camera.x = player.x + player.width / 2 - canvas.width / 2;
  camera.y = player.y + player.height / 2 - canvas.height / 2;

  camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, camera.y));
  camera.x = Math.round(camera.x);
  camera.y = Math.round(camera.y);

  if (invulnerableTimer > 0) {
    invulnerableTimer--;
  }
}

function endGame() {
  gameRunning = false;
  flashTimer = FLASH_DURATION;
  showMessage(`💥 Game Over! Score: ${score}`);
  resetButtonSize();
}

function resetButtonSize() {
  const actionButtons = document.querySelectorAll('#action-buttons');
  actionButtons.forEach(button => {
    button.classList.remove('smaller-buttons');
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

function circleRectCollision(circle, rect) {
  // Find closest point on rectangle to circle center
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;

  // Collision occurs if distance is less than circle radius
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function draw() {
  // Clear the screen
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // --- Translate to camera position ---
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // --- Grass ---
  if (grassCanvas) {
    ctx.drawImage(
      grassCanvas,
      camera.x,
      camera.y,
      canvas.width,
      canvas.height,
      camera.x,
      camera.y,
      canvas.width,
      canvas.height
    );
  }

  // --- Roads ---
  ctx.drawImage(
    roadCanvas,
    camera.x,
    camera.y,
    canvas.width,
    canvas.height,
    camera.x,
    camera.y,
    canvas.width,
    canvas.height
  );

    // --- Player (Delivery Motorcycle) ---
  if (playerSpriteLoaded) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 2)";
    ctx.shadowBlur = 25; // soft blur
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.translate(player.x + player.width / 2, player.y + player.height / 2);

    ctx.rotate((currentDirection * Math.PI) / 180);
    // Determine direction based on key presses
    ctx.drawImage(
      playerSprite,
      -playerWidth / 2, // Offset to center sprite
      -playerHeight / 2, // Offset to center sprite
      playerWidth, // Width of the player (resize sprite)
      playerHeight // Height of the player (resize sprite)
    );
    ctx.restore();
  } else {
    // Fallback: If the sprite is not loaded yet, draw a simple rectangle
    ctx.fillStyle = "red";
    ctx.fillRect(player.x, player.y, player.width, player.height);
  }

  ctx.drawImage(
    treeCanvas,
    camera.x,
    camera.y,
    canvas.width,
    canvas.height,
    camera.x,
    camera.y,
    canvas.width,
    canvas.height
  );

  // --- Buildings ---
  buildings.forEach((b) => {
    if (!isVisible(b.x, b.y, b.width, b.height)) return;

    // --- Draw soft shadow around all sides ---
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 3)"; // subtle shadow color
    ctx.shadowColor = "rgba(0, 0, 0, 3)";
    ctx.shadowBlur = 25; // soft blur
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (b.rotated) {
      ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-b.width / 2, -b.height / 2, b.width, b.height);
    } else {
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    ctx.restore();

    // --- Draw the building itself ---
    if (b.img && b.img.complete) {
      ctx.save();
      if (b.rotated) {
        ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(b.img, -b.width / 2, -b.height / 2, b.width, b.height);
      } else {
        ctx.drawImage(b.img, b.x, b.y, b.width, b.height);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = b.roofColor;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }
  });

  // --- Coins ---
  coins.forEach((c) => {
    if (!isVisible(c.x, c.y, c.size, c.size)) return;
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(c.x + 10, c.y + 10, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore(); // undo camera translation

  // --- Flash effect ---
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,0,0,${0.4 * (flashTimer / FLASH_DURATION)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    flashTimer--;
  }

  // --- HUD ---
  ctx.fillStyle = "black";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${score}`, 10, 25);

  // Build upgrade text
  const ownedUpgrades = [];
  if (upgrades.speedBoost) ownedUpgrades.push("⚡");
  if (upgrades.helmet) ownedUpgrades.push("🪖");
  if (upgrades.offRoadTreads) ownedUpgrades.push("🛞");

  const upgradeText =
    ownedUpgrades.length > 0
      ? `Upgrades: ${ownedUpgrades.join(" ")}`
      : "Upgrades: None";

  ctx.fillText(upgradeText, 10, 45);
}

function getFreeSpawnPoints(cellSize = 50) {
  const freePoints = [];

  for (let x = 0; x < WORLD_WIDTH; x += cellSize) {
    for (let y = 0; y < WORLD_HEIGHT; y += cellSize) {
      if (!isCollidingWithObstacles(x, y, player.width, player.height)) {
        freePoints.push({ x, y });
      }
    }
  }

  return freePoints;
}

function findSafeSpawn() {
  const freePoints = getFreeSpawnPoints();
  if (freePoints.length === 0) {
    console.warn("No free spawn points! Falling back to default.");
    return { x: 50, y: 300 };
  }
  return freePoints[Math.floor(Math.random() * freePoints.length)];
}

const spawn = findSafeSpawn();
player.x = spawn.x;
player.y = spawn.y;

function gameLoop(timestamp) {
  let deltaTime = (timestamp - lastTime) / 16.666;
  deltaTime = Math.min(deltaTime, 5);
  lastTime = timestamp;

  update(deltaTime);
  draw();

  if (gameRunning || flashTimer > 0) requestAnimationFrame(gameLoop);
}

function rectCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function handleCrash() {
  if (upgrades.helmet) {
    upgrades.helmet = false;
    localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));

    invulnerableTimer = INVULNERABLE_DURATION;
    flashTimer = FLASH_DURATION;

    showMessage("🪖 Helmet destroyed!");
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
    showMessage(`⚡ ${upgradeName} unlocked!`);
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

bindPointerButton("new-game-btn", () => {
  document.getElementById("intro-screen").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  document.getElementById("touch-controls").style.display = "grid";
  document.getElementById("action-buttons").style.display = "flex";
  startNewGame();
});

bindPointerButton("up-btn",
  () => keys.ArrowUp = true,
  () => keys.ArrowUp = false
);

bindPointerButton("down-btn",
  () => keys.ArrowDown = true,
  () => keys.ArrowDown = false
);

bindPointerButton("left-btn",
  () => keys.ArrowLeft = true,
  () => keys.ArrowLeft = false
);

bindPointerButton("right-btn",
  () => keys.ArrowRight = true,
  () => keys.ArrowRight = false
);

bindPointerButton("helmet-btn", 
  () => buyUpgrade("helmet", 50),
  () => {}
);

bindPointerButton("speed-boost-btn", 
  () => buyUpgrade("speedBoost", 50),
  () => {}
);

bindPointerButton("off-road-treads-btn", 
  () => buyUpgrade("offRoadTreads", 75),
  () => {}
);
