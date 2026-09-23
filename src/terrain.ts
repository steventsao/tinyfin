import { fbm, vnoise, smoothstep, WORLD } from "./noise";

export interface Biome { reef: number; kelp: number; trench: number; flats: number }

/** Low-frequency biome field: reefs are shallow, trenches plunge, kelp grows in between. */
export function biome(x: number, z: number): Biome {
  x += WORLD.ox; z += WORLD.oz;
  const b = fbm(x / 420, z / 420, 3, 11);
  const reef = smoothstep(0.47, 0.35, b);
  const trench = smoothstep(0.6, 0.72, b);
  const mid = Math.max(0, 1 - reef - trench);
  const kelp = mid * smoothstep(0.38, 0.58, vnoise(x / 150, z / 150, 7));
  return { reef, kelp, trench, flats: Math.max(0, mid - kelp) };
}

export function biomeName(x: number, z: number): string {
  const b = biome(x, z);
  const m = Math.max(b.reef, b.kelp, b.trench, b.flats);
  return m === b.reef ? "Coral Reef" : m === b.kelp ? "Kelp Forest" : m === b.trench ? "The Deep" : "Sand Flats";
}

/** Seafloor height (m, surface at 0). */
export function height(x: number, z: number): number {
  const bi = biome(x, z);
  x += WORLD.ox; z += WORLD.oz;
  let h = -30 + (fbm(x / 110, z / 110, 5, 3) - 0.5) * 26;
  const r = vnoise(x / 35, z / 35, 5);
  h += (1 - Math.abs(r * 2 - 1)) * 5;
  h += bi.reef * 13;
  h -= bi.trench * 58 * (0.7 + 0.3 * vnoise(x / 60, z / 60, 9));
  h += Math.sin(x * 0.17 + vnoise(x / 20, z / 20, 2) * 4) * 0.55 * (1 - bi.trench);
  if (h > -10) h = -10 + (h + 10) * 0.35;
  return Math.min(h, -5);
}
