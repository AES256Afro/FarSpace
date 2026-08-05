// Keyboard + mouse input, tracked in internal-resolution coordinates.

export class Input {
  down = new Set<string>();
  pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mousePressed = false;
  wheel = 0;

  constructor(canvas: HTMLCanvasElement, getScale: () => { scale: number; ox: number; oy: number }) {
    window.addEventListener("keydown", (e) => {
      if (["Tab", "F5", "F9", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
    });
    window.addEventListener("keyup", (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.down.delete(k);
    });
    window.addEventListener("blur", () => this.down.clear());
    canvas.addEventListener("mousemove", (e) => {
      const { scale, ox, oy } = getScale();
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left - ox) / scale;
      this.mouseY = (e.clientY - r.top - oy) / scale;
    });
    canvas.addEventListener("mousedown", () => {
      this.mouseDown = true;
      this.mousePressed = true;
    });
    window.addEventListener("mouseup", () => (this.mouseDown = false));
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  // Call at end of each frame
  flush(): void {
    this.pressed.clear();
    this.mousePressed = false;
    this.wheel = 0;
  }

  isDown(k: string): boolean {
    return this.down.has(k);
  }
  wasPressed(k: string): boolean {
    return this.pressed.has(k);
  }
}
