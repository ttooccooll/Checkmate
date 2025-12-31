export class Tree {
  constructor(x, y, size, img) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.img = img;

    this.cx = x + size;
    this.cy = y + size;
    this.radius = size * 0.3;
  }

  draw(ctx) {
    if (!this.img.complete) return;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(
      this.x + this.size,
      this.y + this.size * 2 - 4,
      this.size * 0.9,
      this.size * 0.35,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Tree
    ctx.drawImage(
      this.img,
      this.x,
      this.y,
      this.size * 2,
      this.size * 2
    );
  }
}
