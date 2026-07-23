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
  placePitch,
  placeProps,
  buildClusters,
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
  renderGrassBase,
  renderPitchOffscreen,
  renderBayOffscreen,
  propSprites,
  lighthouseSprite,
  bakeBuilding,
  BUILDING_SHADOW_PAD,
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
let props = [];
let pitch = null;
let solidRects = []; // buildings + props + lighthouse, for spawn avoidance
let dustParticles = [];

// The lighthouse stands on the point — the south-west corner of the map
const LIGHTHOUSE = { x: 175, y: 3420, hitR: 78, drawSize: 270 };

// A small corner of Bluebottle Bay laps at the south-west pocket, which
// no road can ever reach (roads live at x>464, y<3140 at their extremes).
// Flip enabled to false to remove the bay entirely — art, reserve, and
// water collision are all keyed off this one object.
const BAY = { enabled: true, rx: 230, ry: 235 };
const BAY_RESERVE = { x: 0, y: 3255, width: 345, height: 345 };
const LIGHTHOUSE_RESERVE = {
  x: LIGHTHOUSE.x - 160,
  y: LIGHTHOUSE.y - 160,
  width: 320,
  height: 320,
};

let score = 0;
let gameRunning = false;
let startingGame = false;
let paused = false;
let continuesUsed = false;
let loopTicks = 0; // one per gameLoop call: stacked loops show up as >1 per frame
let bakeTimes = {}; // coarse world-build timings from the last startNewGame

// Wet-weather momentum: the velocity the bike actually carries. When dry
// this equals the input velocity exactly (see the grip math in update).
let carriedVx = 0;
let carriedVy = 0;
let slideSkidTimer = 0;
let potholeSlowTimer = 0;
let rockSlowTimer = 0;
let rockBumpCooldown = 0;
let photoFlashTimer = 0;

// A pothole hit shoves the bike off-line briefly (decays each frame)
let joltVx = 0;
let joltVy = 0;
let shakeTimer = 0;

const CONTINUE_PRICE_LABEL = "⚡ Continue · 5,000 sats";
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
  shockAbsorbers: false,
  ...savedUpgrades,
};

// --- Canvas & input wiring ----------------------------------------------------

// Capped at 2: 3x panels burn fill-rate for detail nobody can see at
// this art scale
function getDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

// Phones see far too little town at 1:1 — a 390px window crosses in just
// over a second at riding speed, which plays as impossibly fast. Zoom
// the camera out so at least this much world is always in view; larger
// screens stay exactly 1:1.
const MIN_VIEW_WIDTH = 640;
function viewScale() {
  return Math.min(1, window.innerWidth / MIN_VIEW_WIDTH);
}

// The visible world window, in world pixels
function viewWidth() {
  return canvas.width / (getDpr() * viewScale());
}

function viewHeight() {
  return canvas.height / (getDpr() * viewScale());
}

function resizeCanvas() {
  const dpr = getDpr();
  const vs = viewScale();

  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";

  ctx.setTransform(dpr * vs, 0, 0, dpr * vs, 0, 0);
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
const IS_TOUCH = isTouchDevice();

if (!IS_TOUCH) {
  touchControls.style.display = "none";
}

// Touch devices: keyboard hints are useless, and pause/volume need buttons
if (IS_TOUCH) {
  // Lets CSS dock transient toasts under the HUD instead of mid-screen
  document.body.classList.add("touch");
  const hint = document.getElementById("intro-hint");
  if (hint) {
    hint.textContent =
      "Drag anywhere to steer, or use the arrow pad · ⏸ pause · 🔊 sound";
  }
  const utils = document.getElementById("mobile-utils");
  if (utils) utils.style.display = "flex";
}

document.getElementById("pause-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  togglePause();
});
document.getElementById("sound-btn")?.addEventListener("click", (e) => {
  e.preventDefault();
  showMessage(cycleVolume(), 1200);
});

// --- Title screen -------------------------------------------------------
// One line of town talk per visit — the cast, observed, never explained
const INTRO_TEASES = [
  "Bluebottle Bay. A few streets pinched between the hills and the sea. Too small for most maps.",
  "Named for what the tide leaves on the sand. Prettier than they sting.",
  "Sipho hasn't missed a night at the lighthouse in thirty years. Nobody's asked him why he started.",
  "Themba keeps a list of every pothole on the main road. The potholes are winning.",
  "Keabetswe's stall opens before the gulls are up.",
  "Samkelo repaints his sign every spring. The sea helps itself to a little every winter.",
  "The taxis hoot twice for hello, once for get-out-of-the-road.",
  "Musa reckons the fog eats sound. Stand in it a while and you'll agree.",
  "The kids play on the pitch till the light goes. Then a bit longer.",
];

try {
  const storyDone = localStorage.getItem("checkmateStoryComplete") === "true";

  // After the story, Nandi's note changes — quietly
  if (storyDone) {
    const lore = document.getElementById("intro-lore");
    if (lore) {
      lore.textContent = "";
      const mk = (cls, text) => {
        const p = document.createElement("p");
        p.className = cls;
        p.textContent = text;
        lore.appendChild(p);
      };
      mk("note-line line-1", "The kettle's on when you get here.");
      mk(
        "note-line note-bell",
        "Nobody talks about the bell anymore. They talk about the one who rang it."
      );
      mk("note-sig", "N.");
    }

    const badge = document.createElement("p");
    badge.id = "intro-badge";
    badge.textContent = "🔔 You've heard the bell.";
    document.getElementById("intro-hint")?.after(badge);
  }

  const tease = document.getElementById("intro-tease");
  if (tease) {
    tease.textContent =
      INTRO_TEASES[Math.floor(Math.random() * INTRO_TEASES.length)];
  }

  const lastRun = JSON.parse(localStorage.getItem("checkmateLastRun") || "null");
  const lastRunEl = document.getElementById("intro-lastrun");
  if (lastRun && lastRunEl) {
    lastRunEl.textContent = `Last shift: ${lastRun.km} km · ${lastRun.deliveries} deliveries · ${lastRun.score} points`;
  }

  // The staged reveal plays exactly once. Anyone who's been here before
  // gets the whole screen at once — no waiting through a known intro.
  if (localStorage.getItem("checkmateSeenIntro") !== "true") {
    document.getElementById("intro-screen")?.classList.add("staged");
    localStorage.setItem("checkmateSeenIntro", "true");
  }
} catch {
  /* ignore */
}

// --- World setup ---------------------------------------------------------------

let npcDataCache = null;

async function loadNPCs() {
  // The dialog file never changes within a session — fetch it once, not
  // on every restart
  if (!npcDataCache) {
    const t = performance.now();
    const response = await fetch("./npcDialog.json");
    npcDataCache = await response.json();
    bakeTimes.npcFetch = Math.round(performance.now() - t);
  }
  const npcData = npcDataCache;

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
            dropoff: n.quest.params?.dropoff,
            puzzleId: n.quest.puzzleId,
          },
        })
      : null;

    return new NPC(n, 0, 0, quest);
  });

  const tPlace = performance.now();
  npcs.forEach((npc) => {
    const spawn = findSafeSpawn({
      avoid: [...npcs, player],
      npcs,
      buildings: solidRects.length ? solidRects : buildings,
      trees,
      roads, // pedestrians stand on the verge, never in the street
    });
    npc.x = spawn.x;
    npc.y = spawn.y;
  });
  bakeTimes.npcPlace = Math.round(performance.now() - tPlace);

  return npcs;
}

async function startNewGame() {
  if (startingGame || gameRunning) return;
  startingGame = true;

  // Immediate feedback — world generation takes a beat, and the player
  // should never wonder whether the click landed. The button steps aside
  // so the toast never sits on top of it.
  const loadingBtn = document.getElementById("new-game-btn");
  loadingBtn.textContent = "Loading…";
  loadingBtn.style.visibility = "hidden";
  // Long duration + a slow pulse: the town takes a moment to build, and
  // a breathing message reads as "working", not "frozen"
  showMessage("Rolling into town…", 30000);
  document.getElementById("message-modal").classList.add("loading-pulse");
  // let the message actually paint before the heavy work starts
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // If textures are still downloading, wait them out instead of making
  // the player click again
  if (!texturesReady()) {
    await whenReady();
  }

  score = 0;
  flashTimer = 0;
  dustParticles = [];

  offRoadTimer = 0;
  treadsWarned = false;
  storyStage = 0;

  // Coarse world-bake timings, kept for perf work: __cm.getBakeTimes()
  bakeTimes = {};
  let bakeT = performance.now();
  const lap = (name) => {
    bakeTimes[name] = Math.round(performance.now() - bakeT);
    bakeT = performance.now();
  };

  roads = generateRoads();
  renderRoadsOffscreen(roads);
  potholes = generatePotholes(roads, 23);
  renderPotholesOffscreen(potholes);
  lap("roads");

  pitch = placePitch(
    roads,
    BAY.enabled ? [LIGHTHOUSE_RESERVE, BAY_RESERVE] : [LIGHTHOUSE_RESERVE]
  );
  renderGrassBase();
  lap("grass");
  renderBayOffscreen(BAY);
  lap("bay");
  renderPitchOffscreen(pitch);
  lap("pitch");

  const reserved = [LIGHTHOUSE_RESERVE];
  if (BAY.enabled) reserved.push(BAY_RESERVE);
  if (pitch) {
    reserved.push({
      x: pitch.x - 20,
      y: pitch.y - 20,
      width: pitch.w + 40,
      height: pitch.h + 40,
    });
  }

  // Informal settlement pockets go in first so trees and loose houses
  // keep clear of them
  const shackImg =
    buildingImages.find((i) => i.src.includes("shack")) || buildingImages[0];
  const clusters = buildClusters(roads, reserved, shackImg, 4);
  reserved.push(...clusters.clusterRects);
  // Cluster containers stick out past the cluster margin — reserve their
  // footprints so loose houses can't be placed on top of them
  reserved.push(
    ...clusters.containers.map((c) => ({
      x: c.x - 6,
      y: c.y - 6,
      width: c.w + 12,
      height: c.h + 12,
    }))
  );

  trees = generateTrees(100, roads, treeImages, reserved);
  renderTreesOffscreen(trees);
  lap("trees");
  buildings = generateBuildings(72, roads, buildingImages, reserved);
  buildings.push(...clusters.shacks);
  buildings.forEach((b) => {
    if (b.img.complete) bakeBuilding(b);
  });
  lap("buildings");
  props = placeProps(roads, buildings, trees, reserved);
  props.push(...clusters.containers);

  solidRects = [
    ...buildings,
    ...props.map((p) => ({ x: p.x, y: p.y, width: p.w, height: p.h })),
    LIGHTHOUSE_RESERVE,
  ];
  if (BAY.enabled) solidRects.push(BAY_RESERVE);
  coins = generateCoins(22, solidRects, trees);

  lap("propsCoins");
  // Load NPCs
  await loadNPCs();
  lap("npcs");

  // The keeper lives where the story says he does
  const keeper = npcs.find((n) => n.id === "lighthouse_keeper");
  if (keeper) {
    keeper.x = LIGHTHOUSE.x + 104;
    keeper.y = LIGHTHOUSE.y - 42;
  }

  // spawn quest items
  items = []; // reset
  npcs.forEach((npc) => {
    // solidRects includes props and the lighthouse, so nothing spawns
    // wedged where the bike can't reach it
    spawnQuestItems(npc, items, { buildings: solidRects, trees });
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

  // The kids' balls rolled off down the streets — scatter them along the
  // road verges, away from the pitch they need bringing back to
  items.forEach((item) => {
    if (item.id !== "ball") return;
    for (let tries = 0; tries < 300; tries++) {
      const r = roads[Math.floor(Math.random() * roads.length)];
      const horiz = r.width > r.height;
      const off = 14 + Math.random() * 34;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = horiz
        ? r.x + 40 + Math.random() * (r.width - 80)
        : side < 0
          ? r.x - off - item.size
          : r.x + r.width + off;
      const y = horiz
        ? side < 0
          ? r.y - off - item.size
          : r.y + r.height + off
        : r.y + 40 + Math.random() * (r.height - 80);
      const rect = { x, y, width: item.size, height: item.size };
      const onPitch =
        pitch &&
        rectCollision(rect, {
          x: pitch.x - 30,
          y: pitch.y - 30,
          width: pitch.w + 60,
          height: pitch.h + 60,
        });
      const padded = {
        x: rect.x - 30,
        y: rect.y - 30,
        width: rect.width + 60,
        height: rect.height + 60,
      };
      const blocked =
        onPitch ||
        x < 20 ||
        y < 20 ||
        x > WORLD_WIDTH - 30 ||
        y > WORLD_HEIGHT - 30 ||
        solidRects.some((s) => rectCollision(padded, s)) ||
        trees.some((t) =>
          rectCollision(padded, {
            x: t.x,
            y: t.y,
            width: t.size * 2,
            height: t.size * 2,
          })
        );
      if (!blocked) {
        item.x = x;
        item.y = y;
        break;
      }
    }
  });

  const spawn = findSafeSpawn({ npcs, buildings: solidRects, trees });
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
  rockSlowTimer = 0;
  rockBumpCooldown = 0;
  joltVx = 0;
  joltVy = 0;
  shakeTimer = 0;
  engine.start();
  ambient.start();

  // Only now swap the intro art for the game world — the cover stays up
  // the whole time the town is being built
  document.body.classList.remove("pregame");
  document.getElementById("intro-screen").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  document.getElementById("touch-controls").style.display = "grid";
  document.getElementById("action-buttons").style.display = "flex";
  loadingBtn.style.visibility = "";
  resizeCanvas();

  const visibleWidth = viewWidth();
  const visibleHeight = viewHeight();

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

  showMessage("New Game!", 2000);

  introMessageTimer = setTimeout(() => {
    showMessage(
      "🔔 A distant bell echoes through the air… It reminds you of your sister Nandi, who always described mysterious ringing at the lighthouse.",
      4000
    );
  }, 5000);

  startingGame = false;
  startLoop();
}

// --- Story stages ------------------------------------------------------------
// Word travels in a small town. As the mystery progresses, NPCs with
// stageDialog entries pick up new lines — the latest stage they know
// about. Purely dialogQueue swaps; quests and reactions are untouched.

const STORY_STAGE_BY_QUEST = {
  mystery_bell_fragments: 1,
  mystery_old_routes: 2,
  mystery_keeper_clues: 3,
  mystery_clear_path: 4,
  mystery_ring_bell: 5,
};
const STAGE_KEYS = ["fragments", "routes", "keeper", "path", "bell"];

let storyStage = 0;

function applyStoryStage(stage) {
  if (stage <= storyStage) return;
  storyStage = stage;
  npcs.forEach((npc) => {
    if (!npc.stageDialog) return;
    for (let s = stage; s >= 1; s--) {
      const lines = npc.stageDialog[STAGE_KEYS[s - 1]];
      if (lines) {
        npc.dialogQueue = [...lines];
        npc.hasTalked = false;
        // fresh lines re-arm the speech cue: this person knows something
        npc.everTalked = false;
        break;
      }
    }
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

    const card = {
      title: "The Bell of the Bay",
      subtitle: "The keeper's watch is over. The town remembers its own.",
      lines: ["Story complete · +200 points", "Nandi will want a word."],
    };

    const shareText = [
      "🔔 Followed the mystery to the end and rang the bell above the bay.",
      "Checkmate Delivery: story complete.",
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
  const vw = viewWidth();
  const vh = viewHeight();

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
    baseSpeed *= 0.5;
  }

  // Picking across the lighthouse rocks is slow going
  if (rockSlowTimer > 0) {
    rockSlowTimer -= deltaTime;
    baseSpeed *= upgrades.shockAbsorbers ? 0.8 : 0.6;
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

  // Diagonals must not be faster than straights: with drag steering the
  // bike rides diagonally most of the time, and the raw two-axis sum made
  // that sqrt(2) quicker than any cardinal direction
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
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

  player.move(carriedVx + joltVx, carriedVy + joltVy);
  player.clamp(WORLD_WIDTH, WORLD_HEIGHT);

  // The pothole shove dies out over ~20 frames
  const joltDecay = Math.pow(0.85, deltaTime);
  joltVx *= joltDecay;
  joltVy *= joltDecay;
  if (Math.abs(joltVx) < 0.02) joltVx = 0;
  if (Math.abs(joltVy) < 0.02) joltVy = 0;

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
        // Shock absorbers soak up most of the hit
        const damp = upgrades.shockAbsorbers ? 0.4 : 1;
        potholeSlowTimer = upgrades.shockAbsorbers ? 14 : 40;
        // The front wheel kicks sideways — faster in means further off-line
        const speedMag = Math.hypot(carriedVx, carriedVy) || 1;
        const kickAng =
          Math.atan2(carriedVy, carriedVx) +
          (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2) +
          (Math.random() - 0.5) * 0.6;
        const kick = (1.1 + speedMag * 0.25) * damp;
        joltVx += Math.cos(kickAng) * kick;
        joltVy += Math.sin(kickAng) * kick;
        shakeTimer = upgrades.shockAbsorbers ? 4 : 9;
        sfx.pothole();
        spawnDust();
        break;
      }
    }
  }
  potholes.forEach((p) => {
    if (p.hitCooldown > 0) p.hitCooldown -= deltaTime;
  });

  // The rocky apron around the lighthouse is ridable, but it rattles the
  // bike: constant small kicks and a slower pace while you're on it
  if (moving) {
    const dRock = Math.hypot(
      player.x + player.width / 2 - LIGHTHOUSE.x,
      player.y + player.height / 2 - LIGHTHOUSE.y
    );
    if (dRock > LIGHTHOUSE.hitR && dRock < LIGHTHOUSE.drawSize / 2 - 4) {
      rockSlowTimer = 8;
      rockBumpCooldown -= deltaTime;
      if (rockBumpCooldown <= 0) {
        rockBumpCooldown = 5 + Math.random() * 8;
        const damp = upgrades.shockAbsorbers ? 0.4 : 1;
        const ang = Math.random() * Math.PI * 2;
        const mag = (0.35 + Math.hypot(carriedVx, carriedVy) * 0.16) * damp;
        joltVx += Math.cos(ang) * mag;
        joltVy += Math.sin(ang) * mag;
        shakeTimer = Math.max(shakeTimer, upgrades.shockAbsorbers ? 2 : 3);
        spawnDust();
      }
    }
  }

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

  ambience.update(deltaTime / 60, {
    onFogIn: () =>
      showMessage(
        "🌫️ Fog rolls in from the bay… deliveries pay double while it lasts!",
        5000
      ),
    onFogOut: () => showMessage("☀️ The fog lifts.", 2500),
    onRainIn: () => {
      showMessage(
        "🌧️ A squall blows in off the water. The roads are slick!",
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
      // While they're saying a handoff line, the line gets the moment;
      // linger and the conversation follows
      const speaking = npc.sayText && npc.sayUntil > performance.now();
      if (!npc.talking && !dialogManager.activeDialog && !speaking) {
        npc.interact(player, dialogManager, { showMessage });
      }
    }
    // Invulnerability frames protect here too, so a continued run isn't
    // instantly ended by the pedestrian you fell on
    if (player.canCrash() && npc.checkDangerCollision(player)) {
      endGame("You hit a pedestrian!");
    }
  });

  // Deliveries run AFTER dialog handling: arriving at a talkative pickup
  // opens their dialog first, and the package waits until it's read
  deliveries.update(
    deltaTime / 60,
    player,
    npcs,
    !!dialogManager.activeDialog
  );

  player.checkBuildingCollisions(buildings, rectCollision);
  player.checkTreeCollisions(trees, circleRectCollision, isVisible);

  // Yard props and the lighthouse are as solid as buildings
  if (player.canCrash()) {
    const hb = player.getHitbox();
    for (const p of props) {
      if (rectCollision(hb, { x: p.x, y: p.y, width: p.w, height: p.h })) {
        player.crash("prop");
        break;
      }
    }
    const dxL = player.x + player.width / 2 - LIGHTHOUSE.x;
    const dyL = player.y + player.height / 2 - LIGHTHOUSE.y;
    if (dxL * dxL + dyL * dyL < LIGHTHOUSE.hitR * LIGHTHOUSE.hitR) {
      player.crash("lighthouse");
    }

    // The bay is water, not scenery. Slightly inset so wheels at the
    // foam line survive.
    if (BAY.enabled) {
      const bx = (player.x + player.width / 2) / BAY.rx;
      const by = (WORLD_HEIGHT - (player.y + player.height / 2)) / BAY.ry;
      if (bx * bx + by * by < 0.94) {
        player.crash("bay");
      }
    }
  }

  // Drop-off zones quests can require (balls → the pitch)
  player.zones = player.zones || {};
  player.zones.pitch =
    !!pitch &&
    rectCollision(player.getHitbox(), {
      x: pitch.x,
      y: pitch.y,
      width: pitch.w,
      height: pitch.h,
    });

  npcs.forEach((npc) => {
    const completedQuest = npc.checkQuestCompletion(player, npcs, {
      showMessage,
    });

    if (completedQuest) {
      const reward = completedQuest.rewardScore || 0;
      addScore(reward);
      sessionStats.quests++;
      sfx.quest();

      const stage = STORY_STAGE_BY_QUEST[completedQuest.id];
      if (stage) applyStoryStage(stage);

      // The balls stay where you dropped them: on the pitch, in play
      if (completedQuest.id === "lost_play_balls" && pitch) {
        player.inventory.ball = 0;
        for (let i = 0; i < 3; i++) {
          items.push({
            id: "ball",
            decor: true,
            collected: false,
            size: 10,
            color: "#EC7063",
            x: pitch.x + 40 + Math.random() * (pitch.w - 80),
            y: pitch.y + 40 + Math.random() * (pitch.h - 80),
          });
        }
      }

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
            "🎉 Lanterns flicker on along the promenade: music, laughter, the smell of a braai on the wind. The whole town has come out. +75 points!",
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
      !item.decor &&
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
      } else if (item.id === "ball") {
        sfx.item();
        const have = player.inventory.ball;
        showMessage(
          have >= 3
            ? "⚽ That's all of them. Drop them off at the pitch."
            : `⚽ Ball picked up (${have}/3).`
        );
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
  const targetX = player.x + player.width / 2 - viewWidth() / 2;
  const targetY = player.y + player.height / 2 - viewHeight() / 2;

  const lerpFactor = 0.1;
  camera.x += (targetX - camera.x) * lerpFactor;
  camera.y += (targetY - camera.y) * lerpFactor;

  // Clamp in world coordinates
  const visibleWidth = viewWidth();
  const visibleHeight = viewHeight();

  camera.x = Math.max(0, Math.min(WORLD_WIDTH - visibleWidth, camera.x));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - visibleHeight, camera.y));
}

// --- Draw -----------------------------------------------------------------------

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // --- Translate for camera (plus the pothole rattle) ---
  ctx.save();
  let shakeX = 0;
  let shakeY = 0;
  if (shakeTimer > 0) {
    const mag = 2.2 * (shakeTimer / 9);
    shakeX = (Math.random() - 0.5) * 2 * mag;
    shakeY = (Math.random() - 0.5) * 2 * mag;
  }
  ctx.translate(-camera.x + shakeX, -camera.y + shakeY);

  const nowMs = performance.now();

  // --- Draw world (only the viewport slice of the world-sized canvases) ---
  const viewW = Math.min(viewWidth(), WORLD_WIDTH - camera.x);
  const viewH = Math.min(viewHeight(), WORLD_HEIGHT - camera.y);
  const blitWorld = (source) =>
    ctx.drawImage(
      source,
      camera.x,
      camera.y,
      viewW,
      viewH,
      camera.x,
      camera.y,
      viewW,
      viewH
    );

  blitWorld(grassCanvas);
  blitWorld(roadCanvas);

  // --- Skid marks (under everything that moves) ---
  skidMarks.draw(ctx, isVisible);

  // --- The lighthouse on the point (under the rider: the rocky apron is
  // ground you bump across, only the tower itself is solid) ---
  if (
    lighthouseSprite.complete &&
    isVisible(
      LIGHTHOUSE.x - LIGHTHOUSE.drawSize / 2,
      LIGHTHOUSE.y - LIGHTHOUSE.drawSize / 2,
      LIGHTHOUSE.drawSize,
      LIGHTHOUSE.drawSize
    )
  ) {
    ctx.drawImage(
      lighthouseSprite,
      LIGHTHOUSE.x - LIGHTHOUSE.drawSize / 2,
      LIGHTHOUSE.y - LIGHTHOUSE.drawSize / 2,
      LIGHTHOUSE.drawSize,
      LIGHTHOUSE.drawSize
    );
  }

  // --- Draw NPCs ---
  // Labels counter the mobile zoom-out so they read at screen size
  const labelScale = Math.min(1 / viewScale(), 1.8);
  npcs.forEach((npc) => npc.draw(ctx, player, labelScale));

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

  // A small soccer ball: shaded leather, centre pentagon, seams, rim panels
  const drawBall = (cx, cy, r) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createRadialGradient(
      cx - r * 0.4,
      cy - r * 0.4,
      r * 0.2,
      cx,
      cy,
      r
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.7, "#e9e9e6");
    grad.addColorStop(1, "#b5b5b0");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const px = cx + Math.cos(a) * r * 0.33;
      const py = cy + Math.sin(a) * r * 0.33;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(40, 40, 40, 0.45)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.33, cy + Math.sin(a) * r * 0.33);
      ctx.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(43, 43, 43, 0.8)";
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + Math.PI / 5 + (i * 2 * Math.PI) / 5;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * r * 0.92,
        cy + Math.sin(a) * r * 0.92,
        r * 0.19,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(40, 40, 40, 0.8)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Each quest item drawn as the thing it is, at pickup scale
  const drawItemIcon = (item, cx, cy) => {
    const s = item.size;
    switch (item.id) {
      case "ball":
        drawBall(cx, cy, s / 2);
        return true;
      case "sign": {
        ctx.fillStyle = "#7a5a3a";
        ctx.fillRect(cx - 1, cy, 2, s * 0.5);
        ctx.fillStyle = "#58D68D";
        ctx.fillRect(cx - s / 2, cy - s * 0.55, s, s * 0.55);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(cx - s / 2, cy - s * 0.55, s, s * 0.55);
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(cx - s * 0.32, cy - s * 0.4, s * 0.64, 1);
        ctx.fillRect(cx - s * 0.32, cy - s * 0.22, s * 0.45, 1);
        return true;
      }
      case "light": {
        const g = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, s * 0.75);
        g.addColorStop(0, "rgba(255, 236, 160, 0.85)");
        g.addColorStop(1, "rgba(255, 236, 160, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
        ctx.fillStyle = "#5a5a5a";
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffe9a8";
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
        return true;
      }
      case "litter": {
        ctx.fillStyle = "#d9d9d4";
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.38, cy - s * 0.1);
        ctx.lineTo(cx - s * 0.12, cy - s * 0.45);
        ctx.lineTo(cx + s * 0.22, cy - s * 0.32);
        ctx.lineTo(cx + s * 0.3, cy);
        ctx.lineTo(cx + s * 0.1, cy + s * 0.25);
        ctx.lineTo(cx - s * 0.25, cy + s * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 120, 115, 0.7)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.fillStyle = "rgba(90, 130, 90, 0.9)";
        ctx.fillRect(cx + s * 0.26, cy - s * 0.1, s * 0.2, s * 0.5);
        return true;
      }
      case "notice": {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.15);
        ctx.fillStyle = "#f6f1e4";
        ctx.fillRect(-s * 0.4, -s * 0.5, s * 0.8, s);
        ctx.strokeStyle = "rgba(90, 80, 60, 0.5)";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(-s * 0.4, -s * 0.5, s * 0.8, s);
        ctx.fillStyle = "#F5B041";
        ctx.fillRect(-s * 0.4, -s * 0.5, s * 0.8, s * 0.22);
        ctx.fillStyle = "rgba(70, 70, 70, 0.6)";
        ctx.fillRect(-s * 0.28, -s * 0.08, s * 0.56, 0.9);
        ctx.fillRect(-s * 0.28, s * 0.14, s * 0.4, 0.9);
        ctx.restore();
        return true;
      }
      case "bell": {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "#c9a24f";
        ctx.beginPath();
        ctx.moveTo(-s * 0.38, s * 0.28);
        ctx.quadraticCurveTo(-s * 0.42, -s * 0.1, -s * 0.16, -s * 0.34);
        ctx.quadraticCurveTo(0, -s * 0.5, s * 0.16, -s * 0.34);
        ctx.quadraticCurveTo(s * 0.42, -s * 0.1, s * 0.38, s * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(90, 65, 20, 0.7)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.fillStyle = "#b08c3e";
        ctx.fillRect(-s * 0.45, s * 0.28, s * 0.9, s * 0.14);
        ctx.fillStyle = "#6d5518";
        ctx.beginPath();
        ctx.arc(0, s * 0.5, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 240, 200, 0.55)";
        ctx.fillRect(-s * 0.16, -s * 0.3, s * 0.1, s * 0.4);
        ctx.restore();
        return true;
      }
      case "fragment": {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(((cx * 7) % 6) * 0.5);
        ctx.fillStyle = "#8e6fae";
        ctx.beginPath();
        ctx.moveTo(-s * 0.4, s * 0.3);
        ctx.lineTo(-s * 0.1, -s * 0.45);
        ctx.lineTo(s * 0.35, -s * 0.15);
        ctx.lineTo(s * 0.25, s * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(50, 30, 70, 0.7)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.strokeStyle = "rgba(230, 215, 250, 0.8)";
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.45);
        ctx.lineTo(-s * 0.05, s * 0.3);
        ctx.stroke();
        ctx.restore();
        return true;
      }
      case "clue": {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "#F4D03F";
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 === 0 ? s * 0.5 : s * 0.18;
          const a = (i * Math.PI) / 4;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      }
      case "marker": {
        ctx.strokeStyle = "#777";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 1, cy + s * 0.5);
        ctx.lineTo(cx - 1, cy - s * 0.5);
        ctx.stroke();
        ctx.fillStyle = "#5DADE2";
        ctx.beginPath();
        ctx.moveTo(cx - 1, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.5, cy - s * 0.28);
        ctx.lineTo(cx - 1, cy - s * 0.05);
        ctx.closePath();
        ctx.fill();
        return true;
      }
      case "photo": {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "#3c3c40";
        ctx.fillRect(-s * 0.5, -s * 0.32, s, s * 0.64);
        ctx.fillStyle = "#2a2a2e";
        ctx.fillRect(-s * 0.2, -s * 0.42, s * 0.4, s * 0.12);
        ctx.strokeStyle = "#cfcfd4";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#8fb7d6";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f3e9b0";
        ctx.fillRect(s * 0.28, -s * 0.26, s * 0.12, s * 0.12);
        ctx.restore();
        return true;
      }
      default:
        return false;
    }
  };

  items.forEach((item) => {
    if (item.collected) return;

    const itemCx = item.x + item.size / 2;
    const itemCy = item.y + item.size / 2;
    // Offset each item's pulse by position so they don't blink in sync
    const phase = pulseNow / 180 + itemCx * 0.05;

    // A quiet finder ring — the icons carry the identity now (delivered
    // decor items don't need finding at all)
    if (!item.decor) {
      ctx.strokeStyle = item.color;
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(phase);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(itemCx, itemCy, item.size / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (drawItemIcon(item, itemCx, itemCy)) return;

    // Unknown item types keep the classic pulsing dot
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

  // --- Draw player (under vehicles: a collision reads as going under
  // the van, same as trees and buildings) ---
  player.draw(ctx);

  // --- Taxis ---
  traffic.draw(ctx, isVisible);

  // --- Draw trees ---
  blitWorld(treeCanvas);

  // --- Draw buildings with (pre-baked) shadows ---
  buildings.forEach((b) => {
    if (!isVisible(b.x, b.y, b.width, b.height)) return;

    if (!b.baked && b.img.complete) bakeBuilding(b);
    if (b.baked) {
      ctx.drawImage(
        b.baked,
        b.x - BUILDING_SHADOW_PAD,
        b.y - BUILDING_SHADOW_PAD
      );
    }
  });

  // --- Yard props (tanks, containers, upturned boats) ---
  props.forEach((p) => {
    if (!isVisible(p.x - 12, p.y - 12, p.w + 24, p.h + 24)) return;
    const pool = propSprites[p.type];
    const img = pool && pool[p.variant % pool.length];
    if (!img || !img.complete) return;

    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(p.rot);
    ctx.drawImage(img, -p.bw / 2, -p.bh / 2, p.bw, p.bh);
    ctx.restore();
  });

  ctx.restore();

  // --- Quest compass (world-scaled space, tracking the rider) ---
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

  // --- Screen-space layers render at CSS scale, not world scale ---
  const dpr = getDpr();
  const vs = viewScale();
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // --- Atmosphere: dusk tint + fog ---
  ambience.drawScreen(
    ctx,
    canvas.width / dpr,
    canvas.height / dpr,
    (player.x + player.width / 2 - camera.x) * vs,
    (player.y + player.height / 2 - camera.y) * vs
  );

  // --- Crash flash overlay ---
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255, 40, 40, ${(0.3 * flashTimer) / FLASH_DURATION})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  // --- Camera flash (photographing a pothole) ---
  if (photoFlashTimer > 0) {
    photoFlashTimer -= 1;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * (photoFlashTimer / 8)})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
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

  ctx.restore();

  // --- Pause overlay ---
  if (paused) {
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(8, 16, 22, 0.55)";
    ctx.fillRect(0, 0, vw, vh);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f2ecdf";
    ctx.font = "bold 34px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("⏸ Paused", vw / 2, vh / 2 - 16);
    ctx.fillStyle = "rgba(242, 236, 223, 0.8)";
    ctx.font = "16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(
      IS_TOUCH ? "Tap ⏸ to ride on" : "Press P to ride on",
      vw / 2,
      vh / 2 + 22
    );
    ctx.restore();
  }
}

// --- Game over & loop -------------------------------------------------------------

function endGame(reason = "Game Over") {
  if (!gameRunning) return;
  upgrades.metalDetector = false;
  upgrades.speedBoost = false;
  upgrades.offRoadTreads = false;
  upgrades.shockAbsorbers = false;
  offRoadTimer = 0;
  treadsWarned = false;
  localStorage.setItem("motorcycleUpgrades", JSON.stringify(upgrades));

  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "New Game";
  newGameBtn.onclick = () => startNewGame();
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

  // The title screen greets returning riders with their last shift
  try {
    localStorage.setItem(
      "checkmateLastRun",
      JSON.stringify({ score, km, deliveries: deliveries.completed })
    );
  } catch {
    /* ignore */
  }

  const shareText = [
    "🏍️ Checkmate Delivery",
    reason,
    `Score: ${score}${isNewBest ? ", new personal best 🏆" : ""}`,
    `🛣️ ${km} km · ⏱️ ${clock} · 🪙 ${sessionStats.coins} · 📦 ${deliveries.completed} · 📜 ${sessionStats.quests}`,
    "",
    `Ride the coast, run deliveries, pay in sats ⚡ ${location.origin}`,
    "#gamestr",
  ].join("\n");

  showGameOverMessage(
    {
      title: "Game Over",
      subtitle: reason,
      score,
      scoreNote: isNewBest ? "New personal best" : `Best ${previousBest}`,
      isBest: isNewBest,
      lines: [
        `${km} km · ${clock} · ${sessionStats.coins} coins · ${deliveries.completed} deliveries · ${sessionStats.quests} quests`,
      ],
    },
    shareText,
    {
      ...(continuesUsed
        ? {}
        : { continueLabel: CONTINUE_PRICE_LABEL, onContinue: continueRun }),
      onNewGame: () => newGameBtn.onclick?.(),
    }
  );

  resetButtonSize();
}

function resetButtonSize() {
  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => {
    button.classList.remove("smaller-buttons");
  });
}

// Exactly one loop chain may ever run. startLoop() supersedes any older
// chain via the token: a stale chain returns without ticking on its next
// frame, so stacking is structurally impossible no matter how restart,
// continue, and the death flash interleave.
let loopToken = 0;

function startLoop() {
  loopToken++;
  const mine = loopToken;
  // The first rAF timestamp can PREDATE a performance.now() taken here
  // (it marks the frame's start, not the schedule time), and a negative
  // delta turns the wet-grip pow() into Infinity. Prime lastTime from
  // the first frame's own clock instead.
  let first = true;
  const step = (timestamp) => {
    if (mine !== loopToken) return; // superseded by a newer chain
    if (first) {
      lastTime = timestamp;
      first = false;
    }
    gameLoopFrame(timestamp);
    if (gameRunning || flashTimer > 0) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function gameLoopFrame(timestamp) {
  loopTicks++;
  let deltaTime = (timestamp - lastTime) / 16.666;
  // Clamp BOTH ends: a negative delta (clock skew) reaches pow() as a
  // negative exponent and mints Infinity
  deltaTime = Math.max(0, Math.min(deltaTime, 3));
  lastTime = timestamp;

  // Runs outside update() so the game-over flash still fades out
  if (flashTimer > 0) {
    flashTimer = Math.max(0, flashTimer - deltaTime);
  }
  if (shakeTimer > 0) {
    shakeTimer = Math.max(0, shakeTimer - deltaTime);
  }

  questLog.update(npcs, player);
  if (!paused) update(deltaTime);
  draw();
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
  joltVx = 0;
  joltVy = 0;
  flashTimer = 0;
  gameRunning = true;
  paused = false;
  engine.start();

  const newGameBtn = document.getElementById("new-game-btn");
  newGameBtn.textContent = "Quest Log";
  newGameBtn.onclick = () => questLog.toggle();

  const actionButtons = document.querySelectorAll("#action-buttons");
  actionButtons.forEach((button) => button.classList.add("smaller-buttons"));

  startLoop();

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
    lighthouse: "You rode into the lighthouse. The keeper definitely saw.",
    bay: "You rode into the bay. It's colder than it looks.",
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
  getRockSlow: () => rockSlowTimer,
  getItems: () => items,
  getCoins: () => coins,
  getProps: () => props,
  getPitch: () => pitch,
  getLighthouse: () => LIGHTHOUSE,
  getBay: () => BAY,
  isPaused: () => paused,
  isRunning: () => gameRunning,
  getScore: () => score,
  getLoopTicks: () => loopTicks,
  getBakeTimes: () => bakeTimes,
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
    // The consumable terms live here now, off the buttons
    const labels = {
      helmet: "Helmet unlocked. Absorbs one crash.",
      speedBoost: "Speed Boost unlocked. Lasts this run.",
      offRoadTreads:
        "Off-Road Treads unlocked. They wear out as you ride off-road.",
      metalDetector: "Metal Detector unlocked. Lasts this run.",
      shockAbsorbers:
        "Shock Absorbers unlocked. Potholes and rough ground barely bite. Lasts this run.",
    };

    showMessage(`✔ ${labels[upgradeName]}`);
  } else {
    showMessage(`❌ Payment failed`);
  }
}

document.getElementById("new-game-btn").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  // The intro (and its cover art) stays up until the world is actually
  // built — startNewGame swaps the screens when it's ready to roll
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
  "shock-absorbers-btn",
  () => buyUpgrade("shockAbsorbers"),
  () => {}
);

bindPointerButton(
  "metal-detector-btn",
  () => buyUpgrade("metalDetector"),
  () => {}
);
