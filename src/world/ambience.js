// Atmosphere: occasional fog banks rolling in from the bay, and a very
// subtle day/dusk color drift. Costs at most two gradient/fill rects per
// frame, and usually zero (both effects skip drawing when inactive).

const DAY_PERIOD_SEC = 480; // full day cycle

function bump(t, center, width) {
  const d = (t - center) / width;
  return Math.exp(-d * d);
}

export class Ambience {
  constructor() {
    this.reset();
  }

  reset() {
    this.timeSec = 0;
    // Start each run somewhere in daytime so dusk arrives mid-session
    this.dayOffset = Math.random() * DAY_PERIOD_SEC * 0.35;
    this.fogIntensity = 0;
    this.fogTarget = 0;
    this.fogEndsAt = 0;
    this.nextFogAt = 65 + Math.random() * 45;
    this.glowDuration = 0;
    this.glowElapsed = 0;
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

  update(dtSec, { onFogIn, onFogOut } = {}) {
    this.timeSec += dtSec;

    if (this.fogTarget === 0 && this.timeSec >= this.nextFogAt) {
      this.fogTarget = 1;
      this.fogEndsAt = this.timeSec + 22 + Math.random() * 12;
      if (onFogIn) onFogIn();
    } else if (this.fogTarget === 1 && this.timeSec >= this.fogEndsAt) {
      this.fogTarget = 0;
      this.nextFogAt = this.timeSec + 110 + Math.random() * 70;
      if (onFogOut) onFogOut();
    }

    // ~3s ramp in and out
    const step = dtSec / 3;
    const diff = this.fogTarget - this.fogIntensity;
    this.fogIntensity += Math.max(-step, Math.min(step, diff));

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

    if (this.fogIntensity > 0.01) {
      const breathe = 1 + 0.05 * Math.sin(this.timeSec * 0.7);
      const inner = 165 * breathe;
      const outer = 440;
      const a = this.fogIntensity;
      const g = ctx.createRadialGradient(
        playerX,
        playerY,
        inner,
        playerX,
        playerY,
        outer
      );
      g.addColorStop(0, "rgba(224, 228, 233, 0)");
      g.addColorStop(0.55, `rgba(224, 228, 233, ${0.42 * a})`);
      g.addColorStop(1, `rgba(220, 225, 231, ${0.86 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
  }
}
