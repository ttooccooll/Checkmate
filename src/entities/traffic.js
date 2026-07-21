import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { rectCollision } from "../core/collision.js";

// Traffic cruising the roads: minibus taxis, bakkies, and hatchbacks.
// South Africa drives on the left, so each direction of travel keeps to
// its own side of the road.
const LANE_FRAC = 0.26; // lane center offset from road center, as road-height fraction
const WRAP_MARGIN = 90;

// Per-type dimensions and temperament
const VEHICLE_TYPES = {
  taxi: { w: 40, h: 75, minSpeed: 2.1, speedRange: 1.1 },
  bakkie: { w: 38, h: 70, minSpeed: 2.2, speedRange: 1.1 },
  hatch: { w: 34, h: 58, minSpeed: 2.6, speedRange: 1.1 },
};

class Taxi {
  constructor(sprite, road, forward, slowZones, type = "taxi") {
    this.sprite = sprite;
    this.type = type;
    const spec = VEHICLE_TYPES[type] || VEHICLE_TYPES.taxi;
    this.w = spec.w;
    this.h = spec.h;
    this.road = road;
    this.horizontal = road.width > road.height;
    this.forward = forward; // +1 = east/south, -1 = west/north
    this.speed = spec.minSpeed + Math.random() * spec.speedRange;
    this.currentSpeed = this.speed;
    this.slowZones = slowZones; // intersection centers along this road's axis
    this.honkCooldown = Math.random() * 4;

    const laneSize = this.horizontal ? road.height : road.width;
    // Left-hand traffic: eastbound keeps the north lane, westbound the
    // south lane; southbound keeps the east lane, northbound the west lane.
    const laneShift = laneSize * LANE_FRAC * forward;

    if (this.horizontal) {
      this.x = Math.random() * WORLD_WIDTH;
      this.y = road.y + road.height / 2 - laneShift;
      this.heading = forward > 0 ? 90 : 270;
    } else {
      this.x = road.x + road.width / 2 + laneShift;
      this.y = Math.random() * WORLD_HEIGHT;
      this.heading = forward > 0 ? 180 : 0;
    }
  }

  hitbox() {
    const w = (this.horizontal ? this.h : this.w) * 0.82;
    const h = (this.horizontal ? this.w : this.h) * 0.82;
    return { x: this.x - w / 2, y: this.y - h / 2, width: w, height: h };
  }

  update(deltaTime, player, speedFactor = 1, others = []) {
    // A well-behaved driver: ease off near intersections, brake for anyone
    // in the lane ahead (rider or taxi), take it slow in the wet.
    let targetSpeed = this.speed * speedFactor;

    const alongPos = this.horizontal ? this.x : this.y;
    for (const zone of this.slowZones) {
      const ahead = (zone - alongPos) * this.forward;
      if (ahead > -30 && ahead < 140) {
        targetSpeed = Math.min(targetSpeed, this.speed * 0.55);
        break;
      }
    }

    if (player) {
      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      const along = this.horizontal
        ? (px - this.x) * this.forward
        : (py - this.y) * this.forward;
      const lateral = this.horizontal ? py - this.y : px - this.x;
      if (along > 0 && along < 150 && Math.abs(lateral) < 55) {
        targetSpeed = Math.min(targetSpeed, this.speed * 0.12);
      }
    }

    // Other taxis. Two asymmetric rules, so nobody ever brakes for someone
    // who is braking for them:
    //  - same lane: the one behind follows the one in front
    //  - crossing at intersections: vertical yields to horizontal early;
    //    horizontal only emergency-slows when a crosser is right on top
    for (const o of others) {
      if (o === this) continue;
      const ahead = this.horizontal
        ? (o.x - this.x) * this.forward
        : (o.y - this.y) * this.forward;
      if (ahead <= 0) continue;
      const lateral = Math.abs(this.horizontal ? o.y - this.y : o.x - this.x);

      const sameLane = o.road === this.road && o.forward === this.forward;
      if (sameLane && lateral < 20 && ahead < 100) {
        targetSpeed = Math.min(
          targetSpeed,
          ahead < 70 ? o.currentSpeed * 0.7 : o.currentSpeed
        );
      } else if (!sameLane && lateral < 42 && ahead < 110) {
        if (!this.horizontal && o.horizontal) {
          targetSpeed = Math.min(targetSpeed, this.speed * 0.15);
        } else if (ahead < 50) {
          targetSpeed = Math.min(targetSpeed, this.speed * 0.3);
        }
      }
    }

    // Never a full stop — queues always creep, so they always clear
    targetSpeed = Math.max(targetSpeed, this.speed * 0.08);

    this.currentSpeed +=
      (targetSpeed - this.currentSpeed) * Math.min(1, 0.06 * deltaTime);

    const v = this.currentSpeed * this.forward * deltaTime;
    if (this.horizontal) {
      this.x += v;
      if (this.x > WORLD_WIDTH + WRAP_MARGIN) this.x = -WRAP_MARGIN;
      if (this.x < -WRAP_MARGIN) this.x = WORLD_WIDTH + WRAP_MARGIN;
    } else {
      this.y += v;
      if (this.y > WORLD_HEIGHT + WRAP_MARGIN) this.y = -WRAP_MARGIN;
      if (this.y < -WRAP_MARGIN) this.y = WORLD_HEIGHT + WRAP_MARGIN;
    }
  }
}

export class TrafficManager {
  constructor(sprites) {
    this.sprites = sprites;
    this.taxis = [];
  }

  spawn(roads, player) {
    this.taxis = [];
    if (!roads.length) return;

    // 5 taxis first (tests and helpers rely on early indices being taxis),
    // then the rest of the town's traffic
    const fleet = [
      "taxi",
      "taxi",
      "taxi",
      "taxi",
      "taxi",
      "bakkie",
      "bakkie",
      "hatch",
      "hatch",
    ];

    // Intersection centers along each road's travel axis, for slow zones
    const zonesByRoad = new Map();
    roads.forEach((road) => {
      const horizontal = road.width > road.height;
      const zones = [];
      roads.forEach((other) => {
        if (other === road) return;
        const ix = Math.max(road.x, other.x);
        const iw = Math.min(road.x + road.width, other.x + other.width) - ix;
        const iy = Math.max(road.y, other.y);
        const ih = Math.min(road.y + road.height, other.y + other.height) - iy;
        if (iw > 0 && ih > 0) {
          zones.push(horizontal ? ix + iw / 2 : iy + ih / 2);
        }
      });
      zonesByRoad.set(road, zones);
    });

    fleet.forEach((type, i) => {
      const road = roads[Math.floor(Math.random() * roads.length)];
      const forward = Math.random() < 0.5 ? 1 : -1;
      const pool = this.sprites[type] || this.sprites.taxi;
      const sprite = pool[i % pool.length];
      const taxi = new Taxi(
        sprite,
        road,
        forward,
        zonesByRoad.get(road) || [],
        type
      );

      // Never materialize a taxi on top of the freshly spawned player
      if (player && Math.hypot(taxi.x - player.x, taxi.y - player.y) < 400) {
        if (taxi.horizontal) {
          taxi.x = (taxi.x + WORLD_WIDTH / 2) % WORLD_WIDTH;
        } else {
          taxi.y = (taxi.y + WORLD_HEIGHT / 2) % WORLD_HEIGHT;
        }
      }
      this.taxis.push(taxi);
    });
  }

  update(deltaTime, player, { onCrash, horn, speedFactor = 1 } = {}) {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const playerBox = player.getHitbox();

    for (const taxi of this.taxis) {
      taxi.update(deltaTime, player, speedFactor, this.taxis);
      taxi.honkCooldown = Math.max(0, taxi.honkCooldown - deltaTime / 60);

      const dx = px - taxi.x;
      const dy = py - taxi.y;
      const distSq = dx * dx + dy * dy;

      // A quick hoot when bearing down on the player
      if (distSq < 180 * 180 && taxi.honkCooldown === 0 && horn) {
        const vx = taxi.horizontal ? taxi.forward : 0;
        const vy = taxi.horizontal ? 0 : taxi.forward;
        if (vx * dx + vy * dy > 0) {
          horn();
          taxi.honkCooldown = 7 + Math.random() * 6;
        }
      }

      if (distSq < 120 * 120 && onCrash && player.canCrash()) {
        if (rectCollision(playerBox, taxi.hitbox())) {
          onCrash(taxi.type);
        }
      }
    }
  }

  draw(ctx, isVisible) {
    for (const taxi of this.taxis) {
      const w = taxi.horizontal ? taxi.h : taxi.w;
      const h = taxi.horizontal ? taxi.w : taxi.h;
      if (!isVisible(taxi.x - w / 2, taxi.y - h / 2, w, h)) continue;
      if (!taxi.sprite.complete) continue;

      ctx.save();
      ctx.translate(taxi.x, taxi.y);
      ctx.rotate((taxi.heading * Math.PI) / 180);
      ctx.drawImage(taxi.sprite, -taxi.w / 2, -taxi.h / 2, taxi.w, taxi.h);
      ctx.restore();
    }
  }
}
