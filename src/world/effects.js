// Fading tire marks left behind on hard turns. Marks live in a small capped
// array — no extra world-sized canvas, only visible marks are drawn.
export class SkidMarks {
  constructor(max = 240) {
    this.marks = [];
    this.max = max;
  }

  clear() {
    this.marks = [];
  }

  // cx/cy: player center; angleDeg: travel direction before the turn
  // (0 = up, 90 = right, matching the player sprite convention).
  // kind: "rubber" on tar, "dust" on gravel and bare veld
  add(cx, cy, angleDeg, kind = "rubber") {
    const a = (angleDeg * Math.PI) / 180;
    // travel vector for angle 0 = up
    const dirX = Math.sin(a);
    const dirY = -Math.cos(a);
    // perpendicular offset puts one mark under each wheel
    const perpX = Math.cos(a);
    const perpY = Math.sin(a);
    const offset = 6;

    for (const side of [-1, 1]) {
      this.marks.push({
        x: cx + perpX * offset * side,
        y: cy + perpY * offset * side,
        dirX,
        dirY,
        kind,
        life: 210,
        maxLife: 210,
      });
    }
    if (this.marks.length > this.max) {
      this.marks.splice(0, this.marks.length - this.max);
    }
  }

  update(deltaTime) {
    for (const m of this.marks) m.life -= deltaTime;
    this.marks = this.marks.filter((m) => m.life > 0);
  }

  draw(ctx, isVisible) {
    if (!this.marks.length) return;
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const m of this.marks) {
      if (!isVisible(m.x - 6, m.y - 6, 12, 12)) continue;
      const t = m.life / m.maxLife;
      // rubber burns dark into tar; on dirt the tyre scuffs pale dust up
      ctx.strokeStyle =
        m.kind === "dust"
          ? `rgba(206, 194, 166, ${0.38 * t})`
          : `rgba(38, 32, 26, ${0.42 * t})`;
      ctx.beginPath();
      ctx.moveTo(m.x - m.dirX * 5, m.y - m.dirY * 5);
      ctx.lineTo(m.x + m.dirX * 5, m.y + m.dirY * 5);
      ctx.stroke();
    }
    ctx.restore();
  }
}
