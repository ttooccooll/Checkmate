export function rectCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function circleRectCollision(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const dx = circle.x - closestX;
  const dy = circle.y - closestY;

  return dx * dx + dy * dy < circle.radius * circle.radius;
}

export function isCollidingWithObstacles(x, y, width, height, buildings = [], trees = []) {
  for (let b of buildings) {
    if (rectCollision({ x, y, width, height }, b)) return true;
  }

  for (let t of trees) {
    const circle = { x: t.x + t.size, y: t.y + t.size, radius: t.size * 0.8 };
    if (circleRectCollision(circle, { x, y, width, height })) return true;
  }

  return false;
}

export function isOnRoad(x, y, width, height) {
  return roads.some(
    (road) =>
      x + width > road.x - ROAD_BUFFER &&
      x < road.x + road.width + ROAD_BUFFER &&
      y + height > road.y - ROAD_BUFFER &&
      y < road.y + road.height + ROAD_BUFFER
  );
}