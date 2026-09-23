/** Keyboard, pointer-locked mouse, and a one-finger touch stick. */
export class Input {
  private keys = new Set<string>();
  private mx = 0;
  private my = 0;
  readonly touch = { active: false, x: 0, y: 0 };
  private t0: { x: number; y: number } | null = null;
  onKey: (code: string) => void = () => {};

  constructor(el: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.onKey(e.code);
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === el) { this.mx += e.movementX; this.my += e.movementY; }
    });
    el.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      this.t0 = { x: t.clientX, y: t.clientY };
      this.touch.active = true;
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (!this.t0) return;
      const t = e.touches[0];
      const s = Math.min(innerWidth, innerHeight) * 0.22;
      this.touch.x = Math.max(-1, Math.min(1, -(t.clientX - this.t0.x) / s));
      this.touch.y = Math.max(-1, Math.min(1, -(t.clientY - this.t0.y) / s));
      e.preventDefault();
    }, { passive: false });
    el.addEventListener("touchend", () => { this.t0 = null; this.touch.active = false; this.touch.x = this.touch.y = 0; });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  takeMouse(): { x: number; y: number } {
    const r = { x: this.mx, y: this.my };
    this.mx = this.my = 0;
    return r;
  }
}
