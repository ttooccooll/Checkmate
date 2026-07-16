// All player input: keyboard (arrows / WASD / numpad), canvas drag
// steering, and chunky pointer buttons. Consumers read the shared `keys`
// object each frame.

export const keys = {};

export const touchMove = {
  active: false,
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0,
};

// Mutable so button handlers and the HUD can see drag state without wiring
export const pointerState = { usingDragControls: false };

export function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

export function resetTouchKeys() {
  if (!touchMove.active) {
    keys.ArrowUp = false;
    keys.ArrowDown = false;
    keys.ArrowLeft = false;
    keys.ArrowRight = false;
  }
}

export function initKeyboard({ onMuteToggle, onPauseToggle }) {
  document.addEventListener("keydown", (e) => {
    keys[e.key] = true;

    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
      case "8":
        keys["ArrowUp"] = true;
        break;
      case "ArrowDown":
      case "s":
      case "S":
      case "2":
        keys["ArrowDown"] = true;
        break;
      case "ArrowLeft":
      case "a":
      case "A":
      case "4":
        keys["ArrowLeft"] = true;
        break;
      case "ArrowRight":
      case "d":
      case "D":
      case "6":
        keys["ArrowRight"] = true;
        break;
      case "5":
        keys["Enter"] = true;
        break;
      case "m":
      case "M":
        if (!e.repeat && onMuteToggle) onMuteToggle();
        break;
      case "p":
      case "P":
        if (!e.repeat && onPauseToggle) onPauseToggle();
        break;

      case "7":
        keys["ArrowUp"] = true;
        keys["ArrowLeft"] = true;
        break;
      case "9":
        keys["ArrowUp"] = true;
        keys["ArrowRight"] = true;
        break;
      case "1":
        keys["ArrowDown"] = true;
        keys["ArrowLeft"] = true;
        break;
      case "3":
        keys["ArrowDown"] = true;
        keys["ArrowRight"] = true;
        break;

      default:
        break;
    }
  });

  document.addEventListener("keyup", (e) => {
    keys[e.key] = false;

    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
      case "8":
        keys["ArrowUp"] = false;
        break;
      case "ArrowDown":
      case "s":
      case "S":
      case "2":
        keys["ArrowDown"] = false;
        break;
      case "ArrowLeft":
      case "a":
      case "A":
      case "4":
        keys["ArrowLeft"] = false;
        break;
      case "ArrowRight":
      case "d":
      case "D":
      case "6":
        keys["ArrowRight"] = false;
        break;
      case "5":
        keys["Enter"] = false;
        break;

      case "7":
        keys["ArrowUp"] = false;
        keys["ArrowLeft"] = false;
        break;
      case "9":
        keys["ArrowUp"] = false;
        keys["ArrowRight"] = false;
        break;
      case "1":
        keys["ArrowDown"] = false;
        keys["ArrowLeft"] = false;
        break;
      case "3":
        keys["ArrowDown"] = false;
        keys["ArrowRight"] = false;
        break;

      default:
        break;
    }
  });
}

export function initCanvasDrag(canvas, { isGameRunning }) {
  canvas.tabIndex = 0;

  canvas.addEventListener("pointerdown", (e) => {
    if (!isGameRunning()) return;

    pointerState.usingDragControls = true;
    touchMove.active = true;
    touchMove.startX = e.clientX;
    touchMove.startY = e.clientY;
    touchMove.dx = 0;
    touchMove.dy = 0;

    resetTouchKeys();
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!touchMove.active) return;

    touchMove.dx = e.clientX - touchMove.startX;
    touchMove.dy = e.clientY - touchMove.startY;
  });

  canvas.addEventListener("pointerup", (e) => {
    touchMove.active = false;
    pointerState.usingDragControls = false;
    resetTouchKeys();
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointercancel", () => {
    touchMove.active = false;
    pointerState.usingDragControls = false;
    resetTouchKeys();
  });
}

export function bindPointerButton(id, onDown, onUp = onDown) {
  const el = document.getElementById(id);
  if (!el) return;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    onDown();
  });

  el.addEventListener("pointerup", (e) => {
    e.preventDefault();
    onUp();
    el.releasePointerCapture(e.pointerId);
  });

  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", onUp);
}
