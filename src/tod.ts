import * as THREE from "three";
import { G } from "./mat";

interface Preset {
  name: string;
  sunDir: THREE.Vector3; sunCol: THREE.Color; ambTop: THREE.Color; ambBot: THREE.Color;
  fogShallow: THREE.Color; fogDeep: THREE.Color; surf: THREE.Color; fogDist: number; glow: number; rays: number;
}
const c = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const PRESETS: Preset[] = [
  { name: "Midday", sunDir: new THREE.Vector3(0.25, 1, 0.15).normalize(), sunCol: c("#fff1d2", 1.25), ambTop: c("#7cc4dc", 0.55), ambBot: c("#1e4f70", 0.5),
    fogShallow: c("#3aa8c6"), fogDeep: c("#0a3a5e"), surf: c("#d8fbff", 1.1), fogDist: 55, glow: 1, rays: 1 },
  { name: "Golden hour", sunDir: new THREE.Vector3(0.75, 0.55, 0.25).normalize(), sunCol: c("#ffc382", 1.2), ambTop: c("#7ea9b4", 0.5), ambBot: c("#263c5c", 0.5),
    fogShallow: c("#4c93a6"), fogDeep: c("#12304e"), surf: c("#ffe0ae", 1.1), fogDist: 50, glow: 1.4, rays: 1.25 },
  { name: "Night", sunDir: new THREE.Vector3(-0.3, 1, 0.2).normalize(), sunCol: c("#8fb0ff", 0.3), ambTop: c("#1c3a5e", 0.5), ambBot: c("#081228", 0.5),
    fogShallow: c("#0f2e4c"), fogDeep: c("#020816"), surf: c("#5c82b8", 0.7), fogDist: 42, glow: 2.4, rays: 0.3 },
];

/** Presets blend over a few seconds; T steps to the next. */
export class TimeOfDay {
  private from = 0;
  private to = 0;
  private k = 1;
  constructor(start: string | null) {
    const i = PRESETS.findIndex((p) => p.name.toLowerCase().startsWith((start ?? "").toLowerCase()));
    this.from = this.to = start && i >= 0 ? i : 0;
    this.apply();
  }
  get name(): string { return PRESETS[this.to].name; }
  next(): void {
    this.from = this.to;
    this.to = (this.to + 1) % PRESETS.length;
    this.k = 0;
  }
  update(dt: number): void {
    if (this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / 3.5);
    this.apply();
  }
  private apply(): void {
    const a = PRESETS[this.from], b = PRESETS[this.to];
    const t = this.k * this.k * (3 - 2 * this.k);
    G.uSunDir.value.lerpVectors(a.sunDir, b.sunDir, t).normalize();
    G.uSunCol.value.lerpColors(a.sunCol, b.sunCol, t);
    G.uAmbTop.value.lerpColors(a.ambTop, b.ambTop, t);
    G.uAmbBot.value.lerpColors(a.ambBot, b.ambBot, t);
    G.uFogShallow.value.lerpColors(a.fogShallow, b.fogShallow, t);
    G.uFogDeep.value.lerpColors(a.fogDeep, b.fogDeep, t);
    G.uSurf.value.lerpColors(a.surf, b.surf, t);
    G.uFogDist.value = a.fogDist + (b.fogDist - a.fogDist) * t;
    G.uGlow.value = a.glow + (b.glow - a.glow) * t;
    G.uRays.value = a.rays + (b.rays - a.rays) * t;
  }
}
