// Atmosphere: one weather system (fog banks or rain squalls, never both),
// a very subtle day/dusk color drift, and the story-finale glow. Everything
// here is a handful of fills per frame at most, and usually nothing.

const DAY_PERIOD_SEC = 480; // full day cycle
const RAIN_DROPS = 170;

function bump(t, center, width) {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

export class Ambience {
  constructor() {
    // Screen-space rain particles in normalized [0..1) coords so window
    // resizes can't strand them
    this.rainDrops = Array.from({ length: RAIN_DROPS }, () => ({
      x: Math.random() * 1.05,
      y: Math.random(),
      speed: 0.9 + Math.random() * 0.5,
    }));
    this.splashes = [];
    this.splashCarry = 0;

    // Fog banks: big soft patches that drift in off the water
    this.fogBlobs = Array.from({ length: 7 }, () => ({
      x: Math.random() * 1.4 - 0.2,
      y: Math.random() * 1.4 - 0.2,
      r: 0.16 + Math.random() * 0.2, // radius relative to viewport width
      vx: -(0.014 + Math.random() * 0.012),
      vy: -(0.004 + Math.random() * 0.007),
      a: 0.1 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
    }));

    this.reset();
  }

  reset() {
    this.timeSec = 0;
    // Start each run somewhere in daytime so dusk arrives mid-session
    this.dayOffset = Math.random() * DAY_PERIOD_SEC * 0.35;

    this.fogIntensity = 0;
    this.fogTarget = 0;
    this.fogEndsAt = 0;

    this.rainIntensity = 0;
    this.rainTarget = 0;
    this.rainEndsAt = 0;

    this.nextWeatherAt = 65 + Math.random() * 45;

    this.glowDuration = 0;
    this.glowElapsed = 0;

    this.splashes = [];
    this.splashCarry = 0;
  }

  // A warm, slow golden wash over the whole screen — used for the story
  // finale. Ramps in over 2s, fades out over the last 5s.
  triggerGlow(durationSec) {
    this.glowDuration = durationSec;
    this.glowElapsed = 0;
  }

  glowAlpha() {
    if (this.glowDuration <= 0) return 0;
    const remain = this.glowDuration - this.glowElapsed;
    const k = Math.min(1, this.glowElapsed / 2, Math.max(0, remain / 5));
    return 0.13 * Math.max(0, k);
  }

  update(dtSec, { onFogIn, onFogOut, onRainIn, onRainOut } = {}) {
    this.timeSec += dtSec;

    // --- Weather scheduler: one event at a time ---
    const idle = this.fogTarget === 0 && this.rainTarget === 0;
    if (idle && this.timeSec >= this.nextWeatherAt) {
      if (Math.random() < 0.55) {
        this.fogTarget = 1;
        this.fogEndsAt = this.timeSec + 26 + Math.random() * 14;
        if (onFogIn) onFogIn();
      } else {
        this.rainTarget = 1;
        this.rainEndsAt = this.timeSec + 18 + Math.random() * 12;
        if (onRainIn) onRainIn();
      }
    }
    if (this.fogTarget === 1 && this.timeSec >= this.fogEndsAt) {
      this.fogTarget = 0;
      this.nextWeatherAt = this.timeSec + 110 + Math.random() * 70;
      if (onFogOut) onFogOut();
    }
    if (this.rainTarget === 1 && this.timeSec >= this.rainEndsAt) {
      this.rainTarget = 0;
      this.nextWeatherAt = this.timeSec + 110 + Math.random() * 70;
      if (onRainOut) onRainOut();
    }

    // Fog rolls in slowly (~8s); squalls hit fast (~3s), as squalls do
    const fogStep = dtSec / 8;
    const rainStep = dtSec / 3;
    const fogDiff = this.fogTarget - this.fogIntensity;
    this.fogIntensity += Math.max(-fogStep, Math.min(fogStep, fogDiff));
    const rainDiff = this.rainTarget - this.rainIntensity;
    this.rainIntensity += Math.max(-rainStep, Math.min(rainStep, rainDiff));

    // Drift the fog banks while any fog is around
    if (this.fogIntensity > 0.005) {
      for (const b of this.fogBlobs) {
        b.x += b.vx * dtSec + Math.sin(this.timeSec * 0.3 + b.phase) * 0.004 * dtSec;
        b.y += b.vy * dtSec;
        if (b.x < -0.45) b.x += 1.9;
        if (b.y < -0.45) b.y += 1.9;
        if (b.x > 1.45) b.x -= 1.9;
        if (b.y > 1.45) b.y -= 1.9;
      }
    }

    // --- Rain particles ---
    if (this.rainIntensity > 0.01) {
      for (const d of this.rainDrops) {
        d.y += d.speed * 1.1 * dtSec;
        d.x -= d.speed * 0.22 * dtSec;
        if (d.y > 1) {
          d.y -= 1.05;
          d.x = Math.random() * 1.05;
        }
        if (d.x < -0.05) d.x += 1.1;
      }

      this.splashCarry += dtSec * 26 * this.rainIntensity;
      while (this.splashCarry >= 1) {
        this.splashCarry -= 1;
        this.splashes.push({
          x: Math.random(),
          y: Math.random(),
          age: 0,
          life: 0.3 + Math.random() * 0.15,
        });
      }
      for (const s of this.splashes) s.age += dtSec;
      this.splashes = this.splashes.filter((s) => s.age < s.life);
    } else if (this.splashes.length) {
      this.splashes = [];
    }

    if (this.glowDuration > 0) {
      this.glowElapsed += dtSec;
      if (this.glowElapsed >= this.glowDuration) {
        this.glowDuration = 0;
      }
    }
  }

  isFoggy() {
    return this.fogIntensity > 0.5;
  }

  isRaining() {
    return this.rainIntensity > 0.5;
  }

  // Returns [warmAlpha, coolAlpha] for the current time of day, both subtle.
  dayTint() {
    const t = ((this.timeSec + this.dayOffset) % DAY_PERIOD_SEC) / DAY_PERIOD_SEC;
    const warm = 0.11 * bump(t, 0.62, 0.07); // golden hour
    const cool = 0.2 * bump(t, 0.8, 0.11); // dusk
    return [warm, cool];
  }

  drawScreen(ctx, vw, vh, playerX, playerY) {
    const [warm, cool] = this.dayTint();
    if (warm > 0.015) {
      ctx.fillStyle = `rgba(255, 150, 60, ${warm})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (cool > 0.015) {
      ctx.fillStyle = `rgba(35, 48, 100, ${cool})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    const glow = this.glowAlpha();
    if (glow > 0.005) {
      ctx.fillStyle = `rgba(255, 186, 80, ${glow})`;
      ctx.fillRect(0, 0, vw, vh);
    }

    // --- Rain squall: storm light, ground splashes, then streaks on top ---
    if (this.rainIntensity > 0.01) {
      const i = this.rainIntensity;

      // Storm light: dark enough that the bright streaks read against it
      ctx.fillStyle = `rgba(28, 42, 62, ${0.24 * i})`;
      ctx.fillRect(0, 0, vw, vh);

      ctx.strokeStyle = "rgba(228, 238, 248, 1)";
      ctx.lineWidth = 1.2;
      for (const s of this.splashes) {
        const k = s.age / s.life;
        ctx.globalAlpha = (1 - k) * 0.7 * i;
        ctx.beginPath();
        ctx.arc(s.x * vw, s.y * vh, 1.2 + 4 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Streaks: a faint dark shadow pass under a bright pass so the rain
      // stays visible over both pale roads and dark rooftops
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(20, 32, 46, ${0.22 * i})`;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        const x = d.x * vw + 1;
        const y = d.y * vh + 1;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 13 + d.speed * 6);
      }
      ctx.stroke();

      ctx.strokeStyle = `rgba(235, 243, 250, ${0.5 * i})`;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        const x = d.x * vw;
        const y = d.y * vh;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 4, y + 13 + d.speed * 6);
      }
      ctx.stroke();
    }

    // Fog: an even haze, drifting banks of thicker patches, and distance
    // falling away around the rider — not a hard milky ring
    if (this.fogIntensity > 0.01) {
      const i = this.fogIntensity;
      const e = i * i * (3 - 2 * i); // smoothstep: eases in and out

      ctx.fillStyle = `rgba(214, 221, 227, ${0.26 * e})`;
      ctx.fillRect(0, 0, vw, vh);

      for (const b of this.fogBlobs) {
        const bx = b.x * vw;
        const by = b.y * vh;
        const r = b.r * vw;
        const g = ctx.createRadialGradient(bx, by, r * 0.15, bx, by, r);
        g.addColorStop(0, `rgba(221, 227, 232, ${b.a * e})`);
        g.addColorStop(1, "rgba(221, 227, 232, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - r, by - r, r * 2, r * 2);
      }

      const outer = Math.hypot(vw, vh) * 0.62;
      const g = ctx.createRadialGradient(
        playerX,
        playerY,
        190,
        playerX,
        playerY,
        outer
      );
      g.addColorStop(0, "rgba(216, 223, 229, 0)");
      g.addColorStop(0.55, `rgba(216, 223, 229, ${0.3 * e})`);
      g.addColorStop(1, `rgba(216, 223, 229, ${0.62 * e})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
  }
}
