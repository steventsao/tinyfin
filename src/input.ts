/** Keyboard, cursor-offset mouse steering, and a one-finger touch stick. All always on. */
export class Input {
  private keys = new Set<string>();
  readonly mouse = { x: 0, y: 0, inside: false };
  onAny: () => void = () => {};
  readonly touch = { active: false, x: 0, y: 0 };
  private t0: { x: number; y: number } | null = null;
  onKey: (code: string) => void = () => {};

  constructor(el: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.onKey(e.code);
      this.onAny();
      this.keys.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    // Mouse: the cursor's offset from screen centre is a steering rate. Touch-emulated events are ignored.
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = (e.clientY / innerHeight) * 2 - 1;
      this.mouse.inside = true;
    });
    document.documentElement.addEventListener("mouseleave", () => { this.mouse.inside = false; });
    addEventListener("pointerdown", () => this.onAny());
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

  /** Mouse steering in −1..1 with a dead zone round the centre. */
  mouseSteer(): { x: number; y: number } {
    if (!this.mouse.inside || this.touch.active) return { x: 0, y: 0 };
    const dz = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.12) / 0.88;
    return { x: -dz(this.mouse.x), y: -dz(this.mouse.y) };
  }
}
