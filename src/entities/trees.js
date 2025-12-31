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
}
