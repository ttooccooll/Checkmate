import { WORLD_WIDTH, WORLD_HEIGHT } from "../core/constants.js";
import { rectCollision } from "../core/collision.js";

// Minibus taxis cruising the roads. South Africa drives on the left, so
// each direction of travel keeps to its own side of the road.
const TAXI_W = 40;
const TAXI_H = 75;
const LANE_FRAC = 0.26; // lane center offset from road center, as road-height fraction
const WRAP_MARGIN = 90;

class Taxi {
  constructor(sprite, road, forward, slowZones) {
    this.sprite = sprite;
    this.road = road;
    this.horizontal = road.width > road.height;
    this.forward = forward; // +1 = east/south, -1 = west/north
    this.speed = 2.1 + Math.random() * 1.1;
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
    const w = (this.horizontal ? TAXI_H : TAXI_W) * 0.82;
    const h = (this.horizontal ? TAXI_W : TAXI_H) * 0.82;
    return { x: this.x - w / 2, y: this.y - h / 2, width: w, height: h };
  }

  update(deltaTime, player, speedFactor = 1) {
    // A well-behaved driver: ease off near intersections, brake hard when
    // someone is in the lane ahead, take it slow in the wet.
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

  spawn(roads, player, count = 6) {
    this.taxis = [];
    if (!roads.length) return;

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

    for (let i = 0; i < count; i++) {
      const road = roads[Math.floor(Math.random() * roads.length)];
      const forward = Math.random() < 0.5 ? 1 : -1;
      const sprite = this.sprites[i % this.sprites.length];
      const taxi = new Taxi(sprite, road, forward, zonesByRoad.get(road) || []);

      // Never materialize a taxi on top of the freshly spawned player
      if (player && Math.hypot(taxi.x - player.x, taxi.y - player.y) < 400) {
        if (taxi.horizontal) {
          taxi.x = (taxi.x + WORLD_WIDTH / 2) % WORLD_WIDTH;
        } else {
          taxi.y = (taxi.y + WORLD_HEIGHT / 2) % WORLD_HEIGHT;
        }
      }
      this.taxis.push(taxi);
    }
  }

  update(deltaTime, player, { onCrash, horn, speedFactor = 1 } = {}) {
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;
    const playerBox = player.getHitbox();

    for (const taxi of this.taxis) {
      taxi.update(deltaTime, player, speedFactor);
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
          onCrash();
        }
      }
    }
  }

  draw(ctx, isVisible) {
    for (const taxi of this.taxis) {
      const w = taxi.horizontal ? TAXI_H : TAXI_W;
      const h = taxi.horizontal ? TAXI_W : TAXI_H;
      if (!isVisible(taxi.x - w / 2, taxi.y - h / 2, w, h)) continue;
      if (!taxi.sprite.complete) continue;

      ctx.save();
      ctx.translate(taxi.x, taxi.y);
      ctx.rotate((taxi.heading * Math.PI) / 180);
      ctx.drawImage(taxi.sprite, -TAXI_W / 2, -TAXI_H / 2, TAXI_W, TAXI_H);
      ctx.restore();
    }
  }
}
