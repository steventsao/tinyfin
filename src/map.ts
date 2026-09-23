import { biome } from "./terrain";
import type { Megafauna } from "./megafauna";

const R = 480; // metres from the fish to the map edge
const GRID = 64;

/** A top-down chart: biomes, your heading, and a glowing "?" for every giant you haven't seen yet. */
export class SeaMap {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement("canvas");
  private bgX = Infinity;
  private bgZ = Infinity;
  open = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("canvas");
    this.el.id = "map";
    parent.appendChild(this.el);
    this.ctx = this.el.getContext("2d")!;
    this.bg.width = this.bg.height = GRID;
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("on", this.open);
  }

  private paintBiomes(cx: number, cz: number): void {
    const g = this.bg.getContext("2d")!;
    const img = g.createImageData(GRID, GRID);
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const x = cx + ((i + 0.5) / GRID - 0.5) * 2 * R, z = cz + ((j + 0.5) / GRID - 0.5) * 2 * R;
        const b = biome(x, z);
        // reef coral-pink, kelp olive, flats sand, deep navy
        const r = 38 + b.reef * 150 + b.kelp * 40 + b.flats * 120 - b.trench * 30;
        const gg = 70 + b.reef * 70 + b.kelp * 80 + b.flats * 105 - b.trench * 50;
        const bl = 96 + b.reef * 70 + b.kelp * 10 + b.flats * 60 - b.trench * 40;
        const k = (j * GRID + i) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = bl; img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    this.bgX = cx;
    this.bgZ = cz;
  }

  draw(px: number, pz: number, yaw: number, giants: Megafauna, t: number): void {
    if (!this.open) return;
    const size = Math.min(innerWidth, innerHeight) * 0.72;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.el.width !== Math.round(size * dpr)) {
      this.el.width = this.el.height = Math.round(size * dpr);
      this.el.style.width = this.el.style.height = `${size}px`;
    }
    if (Math.hypot(px - this.bgX, pz - this.bgZ) > 60) this.paintBiomes(px, pz);
    const c = this.ctx, S = this.el.width, h = S / 2, k = h / R;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(h, h, h - 2, 0, Math.PI * 2);
    c.clip();
    // North-up chart centred on the fish. World +x is right, world +z is down on the chart.
    c.imageSmoothingEnabled = true;
    const off = (this.bgX - px) * k, offz = (this.bgZ - pz) * k;
    c.globalAlpha = 0.92;
    c.drawImage(this.bg, off, offz, S, S);
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(234,247,246,0.12)";
    c.lineWidth = 1 * dpr;
    for (const r of [0.33, 0.66]) { c.beginPath(); c.arc(h, h, h * r, 0, Math.PI * 2); c.stroke(); }
    c.font = `${11 * dpr}px Inter, system-ui, sans-serif`;
    c.textAlign = "center";
    for (const m of giants.markers()) {
      const x = h + (m.x - px) * k, y = h + (m.z - pz) * k;
      if (Math.hypot(x - h, y - h) > h - 14 * dpr) continue;
      if (!m.seen) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 3);
        c.fillStyle = `rgba(150,235,255,${0.25 * pulse})`;
        c.beginPath(); c.arc(x, y, 16 * dpr, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#eaf7f6";
        c.font = `600 ${15 * dpr}px Fraunces, serif`;
        c.fillText("?", x, y + 5 * dpr);
        c.font = `${11 * dpr}px Inter, system-ui, sans-serif`;
      } else {
        c.fillStyle = "rgba(234,247,246,0.85)";
        c.beginPath(); c.arc(x, y, 3.5 * dpr, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(234,247,246,0.7)";
        c.fillText(m.name, x, y - 8 * dpr);
      }
    }
    // The fish: an arrow along its heading.
    c.translate(h, h);
    c.rotate(Math.atan2(Math.cos(yaw), Math.sin(yaw)));
    c.fillStyle = "#ff8a3a";
    c.strokeStyle = "#1a1412";
    c.lineWidth = 1.5 * dpr;
    c.beginPath();
    c.moveTo(11 * dpr, 0); c.lineTo(-7 * dpr, 6 * dpr); c.lineTo(-3 * dpr, 0); c.lineTo(-7 * dpr, -6 * dpr); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    c.strokeStyle = "rgba(234,247,246,0.5)";
    c.lineWidth = 1.5 * dpr;
    c.beginPath(); c.arc(h, h, h - 2, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "rgba(234,247,246,0.7)";
    c.font = `${10 * dpr}px Inter, system-ui, sans-serif`;
    c.fillText("N", h, 16 * dpr);
    c.fillText(`${R} m`, h, S - 10 * dpr);
  }
}
