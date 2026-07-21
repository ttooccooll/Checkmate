// Checkmate Delivery — game orchestration: state, the update/draw loop,
// and wiring between the world, entities, UI, and services modules.

import * as payments from "./services/payments.js";
import { sfx, cycleVolume, engine, ambient } from "./services/audio.js";
import { SkidMarks } from "./world/effects.js";
import { Ambience } from "./world/ambience.js";
import { TrafficManager } from "./entities/traffic.js";
import { DeliveryManager } from "./entities/deliveries.js";

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  INVULNERABLE_DURATION,
  FLASH_DURATION,
  OFFROAD_MAX,
} from "./core/constants.js";
import { rectCollision, circleRectCollision } from "./core/collision.js";
import {
  keys,
  touchMove,
  pointerState,
  isTouchDevice,
  initKeyboard,
  initCanvasDrag,
  bindPointerButton,
} from "./core/input.js";

import { Player } from "./entities/player.js";
import { NPC, Quest } from "./entities/npcs.js";
import { DialogManager } from "./entities/dialog.js";
import { spawnQuestItems } from "./entities/items.js";

import {
  generateRoads,
  generateBuildings,
  generateTrees,
  generateCoins,
  generatePotholes,
  findSafeSpawn,
  isOnRoad,
} from "./world/generation.js";
import {
  buildingImages,
  treeImages,
  grassCanvas,
  roadCanvas,
  treeCanvas,
  texturesReady,
  whenReady,
  renderRoadsOffscreen,
  renderPotholesOffscreen,
  renderTreesOffscreen,
} from "./world/worldRender.js";

import { QuestLogManager } from "./ui/questLog.js";
import { showMessage, showGameOverMessage } from "./ui/messages.js";
import { drawHUD, drawQuestCompass } from "./ui/hud.js";

// --- Core objects -----------------------------------------------------------

const dialogManager = new DialogManager();
const questLog = new QuestLogManager();

const canvas = document.getElementById("game-board");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const playerSprite = new Image();
playerSprite.src = "/assets/player.webp";

const player = new Player(playerSprite);
player.onCrash = (reason) => {
  handleCrash(reason);
};

const loadSprites = (srcs) =>
  srcs.map((src) => {
    const img = new Image();
    img.src = src;
    return img;
  });

const vehicleSprites = {
  taxi: loadSprites([
    "/assets/taxi1.webp",
    "/assets/taxi2.webp",
    "/assets/taxi3.webp",
  ]),
  bakkie: loadSprites([
    "/assets/bakkie.webp",
    "/assets/bakkie2.webp",
    "/assets/bakkie3.webp",
  ]),
  hatch: loadSprites([
    "/assets/hatch1.webp",
    "/assets/hatch2.webp",
    "/assets/hatch3.webp",
    "/assets/hatch4.webp",
  ]),
};

const skidMarks = new SkidMarks();
const ambience = new Ambience();
const traffic = new TrafficManager(vehicleSprites);
const deliveries = new DeliveryManager({
  showMessage: (msg, ms) => showMessage(msg, ms),
  addScore: (n) => addScore(n),
  sfx,
  isFoggy: () => ambience.isFoggy(),
});

// --- Game state --------------------------------------------------------------

let npcs = [];
let buildings = [];
let trees = [];
let coins = [];
let items = [];
let roads = [];
let potholes = [];
let dustParticles = [];

let score = 0;
let gameRunning = false;
let startingGame = false;
let paused = false;
let continuesUsed = false;
let rafScheduled = false;

// Wet-weather momentum: the velocity the bike actually carries. When dry
// this equals the input velocity exactly (see the grip math in update).
let carriedVx = 0;
let carriedVy = 0;
let slideSkidTimer = 0;
let potholeSlowTimer = 0;
let photoFlashTimer = 0;

const CONTINUE_PRICE_LABEL = "⚡ Continue · 21,000 sats";
let offRoadTimer = 0;
let treadsWarned = false;
let flashTimer = 0;
let lastTime = 0;
let introMessageTimer = null;

const camera = { x: 0, y: 0 };
const sessionStats = { distancePx: 0, timeSec: 0, coins: 0, quests: 0 };

function addScore(amount) {
  score += amount;
}
window.addScore = addScore;

const savedUpgrades =
  JSON.parse(localStorage.getItem("motorcycleUpgrades")) || {};

let upgrades = {
  speedBoost: false,
  helmet: true,
  offRoadTreads: false,
  metalDetector: false,
  ...savedUpgrades,
};

// --- Canvas & input wiring ----------------------------------------------------

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

function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  if (paused) {
    engine.stop();
  } else {
    engine.start();
  }
}

initCanvasDrag(canvas, { isGameRunning: () => gameRunning && !paused });
initKeyboard({
  onMuteToggle: () => showMessage(cycleVolume(), 1200),
  onPauseToggle: togglePause,
});

const touchControls = document.getElementById("touch-controls");

if (!isTouchDevice()) {
  touchControls.style.display = "none";
}

// A small permanent mark on the title screen for finishing the story
try {
  if (localStorage.getItem("checkmateStoryComplete") === "true") {
    const badge = document.createElement("p");
    badge.id = "intro-badge";
    badge.textContent = "🔔 You've heard the bell.";
    document.getElementById("intro-hint")?.after(badge);
  }
} catch {
  /* ignore */
}

// --- World setup ---------------------------------------------------------------

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
    const spawn = findSafeSpawn({
      avoid: [...npcs, player],
      npcs,
      buildings,
      trees,
      roads, // pedestrians stand on the verge, never in the street
    });
    npc.x = spawn.x;
    npc.y = spawn.y;
  });

  return npcs;
}

async function startNewGame() {
  if (startingGame || gameRunning) return;
  startingGame = true;

  // If textures are still downloading, wait them out instead of making
  // the player click again
  if (!texturesReady()) {
    const newGameBtn = document.getElementById("new-game-btn");
    const prevLabel = newGameBtn.textContent;
    newGameBtn.textContent = "Loading…";
    showMessage("Loading the coast…", 1500);
    await whenReady();
    newGameBtn.textContent = prevLabel;
  }

  showMessage("New Game!", 2000);

  resizeCanvas();

  score = 0;
  flashTimer = 0;
  dustParticles = [];

  offRoadTimer = 0;
  treadsWarned = false;

  roads = generateRoads();
  renderRoadsOffscreen(roads);
  potholes = generatePotholes(roads, 16);
  renderPotholesOffscreen(potholes);
  trees = generateTrees(70, roads, treeImages);
  renderTreesOffscreen(trees);
  buildings = generateBuildings(50, roads, buildingImages);
  coins = generateCoins(15, buildings, trees);

  // Load NPCs
  await loadNPCs();

  // spawn quest items
  items = []; // reset
  npcs.forEach((npc) => {
    spawnQuestItems(npc, items, { buildings, trees });
  });

  // Themba's report-the-potholes quest: photo markers sit on real potholes
  let photoIdx = 0;
  items.forEach((item) => {
    if (item.id === "photo" && potholes.length) {
      const p = potholes[photoIdx++ % potholes.length];
      item.x = p.x - item.size / 2;
      item.y = p.y - item.size / 2;
    }
  });

  const spawn = findSafeSpawn({ npcs, buildings, trees });
  player.x = spawn.x;
  player.y = spawn.y;
  player.setInvulnerable(20);

  traffic.spawn(roads, player);
  skidMarks.clear();
  ambience.reset();
  deliveries.reset();
  Object.assign(sessionStats, {
    distancePx: 0,
    timeSec: 0,
    coins: 0,
    quests: 0,
  });
  paused = false;
  continuesUsed = false;
  carriedVx = 0;
  carriedVy = 0;
  slideSkidTimer = 0;
  potholeSlowTimer = 0;
  engine.start();
  ambient.start();

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

// --- Story finale -----------------------------------------------------------
// The main arc ends here: a staged sequence — glow, the bell, the town
// stepping outside — closing on a story-complete card the player can share.

let storyFinaleTimers = [];

function finaleBeat(delayMs, fn) {
  storyFinaleTimers.push(setTimeout(fn, delayMs));
}

function cancelStoryFinale() {
  storyFinaleTimers.forEach(clearTimeout);
  storyFinaleTimers = [];
}

function runStoryFinale() {
  cancelStoryFinale();

  // The town watches out for its rider during this moment
  player.setInvulnerable(1500);
  deliveries.cooldown = Math.max(deliveries.cooldown, 30);
  if (deliveries.state === "enroute") deliveries.timer += 25;

  finaleBeat(1200, () => {
    ambience.triggerGlow(26);
  });

  finaleBeat(2000, () => {
    sfx.bell();
    showMessage("🔔 The bell. Deep and clear, rolling out over the bay.", 4200);
  });

  finaleBeat(6500, () => {
    showMessage(
      "Doors open along the promenade. The whole town steps outside, looking up at the point.",
      3800
    );
  });

  finaleBeat(10500, () => {
    showMessage(
      "Kagiso said the bell rang for the ones who didn't come home. Let it ring for the ones who did.",
      3400
    );
  });

  finaleBeat(14000, () => {
    addScore(200);
    sfx.quest();
    try {
      localStorage.setItem("checkmateStoryComplete", "true");
    } catch {
      /* ignore */
    }

    // Nandi has one more thing to say, if you go find her
    const nandi = npcs.find((n) => n.id === "nandi");
    if (nandi?.epilogueDialog) {
      nandi.dialogQueue = [...nandi.epilogueDialog];
      nandi.hasTalked = false;
    }

    const card = `
🔔 The Bell of the Bay 🔔
The keeper's watch is over. The town remembers its own.
Story complete · +200 points
Nandi will want a word.
    `.trim();

    const shareText = [
      "🔔 Followed the mystery to the end and rang the bell above the bay.",
      "Checkmate Delivery — story complete.",
      "",
      `Ride the coast, run deliveries, pay in sats ⚡ ${location.origin}`,
      "#gamestr",
    ].join("\n");

    showGameOverMessage(card, shareText);
  });
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

function updateTouchControlsVisibility() {
  if (pointerState.usingDragControls) {
    // Player is using drag → hide touch buttons
    touchControls.style.opacity = 0;
    touchControls.style.pointerEvents = "none";
  } else {
    // Player is using touch buttons → show them
    touchControls.style.opacity = 1;
    touchControls.style.pointerEvents = "auto";
  }
}

// --- Update ---------------------------------------------------------------------

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
  const offRoad = !isOnRoad(roads, player.x, player.y, player.width, player.height);
  if (offRoad && !upgrades.offRoadTreads) {
    baseSpeed *= 0.5;
  }

  // A pothole jolt knocks the pace down for a moment
  if (potholeSlowTimer > 0) {
    potholeSlowTimer -= deltaTime;
    baseSpeed *= 0.55;
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

  // Wet grip: in rain, carried velocity chases the input instead of
  // snapping to it. At rainIntensity 0 the retain factor is 0, so this is
  // exactly the old instant handling — bit-identical when dry.
  const retain = 0.84 * ambience.rainIntensity;
  const grip = 1 - Math.pow(retain, deltaTime);
  carriedVx += (dx - carriedVx) * grip;
  carriedVy += (dy - carriedVy) * grip;
  if (Math.abs(carriedVx) < 0.01) carriedVx = 0;
  if (Math.abs(carriedVy) < 0.01) carriedVy = 0;

  player.move(carriedVx, carriedVy);
  player.clamp(WORLD_WIDTH, WORLD_HEIGHT);

  const moving = Math.abs(carriedVx) > 0.05 || Math.abs(carriedVy) > 0.05;
  sessionStats.timeSec += deltaTime / 60;

  // Pothole hits: a thunk, a puff of dust, and a brief loss of pace
  if (moving) {
    const hb = player.getHitbox();
    for (const p of potholes) {
      if (p.hitCooldown > 0) continue;
      const cx = Math.max(hb.x, Math.min(p.x, hb.x + hb.width));
      const cy = Math.max(hb.y, Math.min(p.y, hb.y + hb.height));
      if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < (p.r * 0.8) ** 2) {
        p.hitCooldown = 90;
        potholeSlowTimer = 35;
        sfx.pothole();
        spawnDust();
        break;
      }
    }
  }
  potholes.forEach((p) => {
    if (p.hitCooldown > 0) p.hitCooldown -= deltaTime;
  });

  // Sliding in the wet leaves rubber: skid when the bike's travel departs
  // from where the rider is pointing (or keeps rolling with no input)
  if (moving && ambience.rainIntensity > 0.4) {
    slideSkidTimer -= deltaTime;
    const speedMag = Math.hypot(carriedVx, carriedVy);
    const inputMag = Math.hypot(dx, dy);
    let sliding = false;
    if (inputMag < 0.1) {
      sliding = speedMag > 1.4;
    } else if (speedMag > 1.8) {
      const diff = Math.abs(
        ((Math.atan2(carriedVy, carriedVx) -
          Math.atan2(dy, dx) +
          Math.PI * 3) %
          (Math.PI * 2)) -
          Math.PI
      );
      sliding = diff > 0.45;
    }
    if (sliding && slideSkidTimer <= 0) {
      skidMarks.add(
        player.x + player.width / 2,
        player.y + player.height / 2,
        player.direction
      );
      slideSkidTimer = 5;
    }
  }

  if (moving) {
    sessionStats.distancePx += Math.hypot(carriedVx, carriedVy);
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
    onCrash: (vehicleType) => player.crash(vehicleType),
    horn: () => sfx.horn(),
    // Drivers ease off in the wet
    speedFactor: 1 - 0.15 * ambience.rainIntensity,
  });

  deliveries.update(deltaTime / 60, player, npcs);

  ambience.update(deltaTime / 60, {
    onFogIn: () =>
      showMessage(
        "🌫️ Fog rolls in from the bay… deliveries pay double while it lasts!",
        5000
      ),
    onFogOut: () => showMessage("☀️ The fog lifts.", 2500),
    onRainIn: () => {
      showMessage(
        "🌧️ A squall blows in off the water — the roads are slick!",
        5000
      );
      sfx.thunder();
    },
    onRainOut: () => showMessage("🌦️ The squall passes.", 2500),
  });
  ambient.setFog(ambience.fogIntensity);
  ambient.setRain(ambience.rainIntensity);

  npcs.forEach((npc) => {
    if (npc.isPlayerNearby(player)) {
      if (!npc.talking && !dialogManager.activeDialog) {
        npc.interact(player, dialogManager, { showMessage });
      }
    }
    // Invulnerability frames protect here too, so a continued run isn't
    // instantly ended by the pedestrian you fell on
    if (player.canCrash() && npc.checkDangerCollision(player)) {
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
        runStoryFinale();
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

      if (item.id === "photo") {
        // Photos are shot, not collected
        sfx.shutter();
        photoFlashTimer = 8;
        showMessage("📸 Pothole photographed!");
      } else {
        sfx.item();
        showMessage(`🎉 Collected ${item.id}!`);
      }
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

// --- Draw -----------------------------------------------------------------------

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // --- Translate for camera ---
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const nowMs = performance.now();

  // --- Draw world ---
  ctx.drawImage(grassCanvas, 0, 0);
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
    ctx.ellipse(c.x + r, c.y + r, Math.max(0.8, r * spin), r, 0, 0, Math.PI * 2);
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

  // --- Camera flash (photographing a pothole) ---
  if (photoFlashTimer > 0) {
    photoFlashTimer -= 1;
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * (photoFlashTimer / 8)})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  // --- Quest compass ---
  if (gameRunning) {
    drawQuestCompass(ctx, {
      player,
      camera,
      npcs,
      items,
      deliveryNpc: deliveries.getCompassTarget(),
      isVisible,
    });
  }

  // --- HUD ---
  drawHUD(ctx, {
    score,
    upgrades,
    offRoadTimer,
    deliveryLine: gameRunning ? deliveries.timerText() : null,
    fogLine: gameRunning && ambience.isFoggy() ? "🌫️ 2× delivery" : null,
    rainLine: gameRunning && ambience.isRaining() ? "🌧️ Slick roads" : null,
  });

  // --- Pause overlay ---
  if (paused) {
    const dpr = window.devicePixelRatio || 1;
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;
    ctx.save();
    ctx.fillStyle = "rgba(8, 16, 22, 0.55)";
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f2ecdf";
    ctx.font = "bold 34px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("⏸ Paused", vw / 2, vh / 2 - 16);
    ctx.fillStyle = "rgba(242, 236, 223, 0.8)";
    ctx.font = "16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("Press P to ride on", vw / 2, vh / 2 + 22);
    ctx.restore();
  }
}

// --- Game over & loop -------------------------------------------------------------

function endGame(reason = "Game Over") {
  if (!gameRunning) return;
  upgrades.metalDetector = false;
  upgrades.speedBoost = false;
  upgrades.offRoadTreads = false;
  offRoadTimer = 0;
  treadsWarned = false;
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
  paused = false;
  flashTimer = FLASH_DURATION;
  engine.stop();
  sfx.gameover();
  // Queued messages must not wipe the game-over screen
  clearTimeout(introMessageTimer);
  cancelStoryFinale();

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

  const shareText = [
    "🏍️ Checkmate Delivery",
    reason,
    `Score: ${score}${isNewBest ? " — new personal best 🏆" : ""}`,
    `🛣️ ${km} km · ⏱️ ${clock} · 🪙 ${sessionStats.coins} · 📦 ${deliveries.completed} · 📜 ${sessionStats.quests}`,
    "",
    `Ride the coast, run deliveries, pay in sats ⚡ ${location.origin}`,
    "#gamestr",
  ].join("\n");

  showGameOverMessage(
    message,
    shareText,
    continuesUsed
      ? {}
      : { continueLabel: CONTINUE_PRICE_LABEL, onContinue: continueRun }
  );

  resetButtonSize();
}

function resetButtonSize() {
  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => {
    button.classList.remove("smaller-buttons");
  });
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
  if (!paused) update(deltaTime);
  draw();

  if (gameRunning || flashTimer > 0) {
    requestAnimationFrame(gameLoop);
    rafScheduled = true;
  } else {
    rafScheduled = false;
  }
}

// Zap-to-continue: pay (dearly) to pick the run back up where it ended.
// Score, stats, and delivery state survive; the wiped run-upgrades don't —
// the payment revives the rider, not the gear. Once per run.
async function continueRun() {
  const success = await payments.makePayment("continueRun");
  if (!success) return false;

  continuesUsed = true;
  player.setInvulnerable(180); // ~3s to ride clear of whatever ended the run
  carriedVx = 0;
  carriedVy = 0;
  flashTimer = 0;
  gameRunning = true;
  paused = false;
  engine.start();

  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "Quest Log";
  newGameBtn.onclick = () => questLog.toggle();

  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => button.classList.add("smaller-buttons"));

  if (!rafScheduled) {
    lastTime = performance.now();
    rafScheduled = true;
    requestAnimationFrame(gameLoop);
  }

  showMessage("⚡ Back on the bike. The run continues!", 3000);
  return true;
}

function handleCrash(reason) {
  // A crash ruins a fragile package even if the helmet saves the rider
  deliveries.onPlayerCrash();

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
    bakkie: "A bakkie flattened you!",
    hatch: "You were run down in traffic!",
  };
  endGame(reasons[reason] || "You crashed!");
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    engine.stop();
    ambient.stop();
    if (gameRunning) paused = true; // resume deliberately with P
  } else if (gameRunning) {
    ambient.start();
    if (!paused) engine.start();
  }
});

// Dev/test handle for poking live systems from the console
window.__cm = {
  ambience,
  deliveries,
  traffic,
  skidMarks,
  player,
  getNpcs: () => npcs,
  getRoads: () => roads,
  getPotholes: () => potholes,
  getPotholeSlow: () => potholeSlowTimer,
  getItems: () => items,
  isPaused: () => paused,
  isRunning: () => gameRunning,
  getScore: () => score,
};

// --- Shop & buttons -----------------------------------------------------------------

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
    if (!pointerState.usingDragControls) keys.ArrowUp = true;
  },
  () => (keys.ArrowUp = false)
);

bindPointerButton(
  "down-btn",
  () => {
    if (!pointerState.usingDragControls) keys.ArrowDown = true;
  },
  () => (keys.ArrowDown = false)
);

bindPointerButton(
  "left-btn",
  () => {
    if (!pointerState.usingDragControls) keys.ArrowLeft = true;
  },
  () => (keys.ArrowLeft = false)
);

bindPointerButton(
  "right-btn",
  () => {
    if (!pointerState.usingDragControls) keys.ArrowRight = true;
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
