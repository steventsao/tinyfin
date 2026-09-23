import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { toon } from "./mat";
import { prep } from "./geo";
import { biome, height, type Biome } from "./terrain";
import { hash2, mulberry32, smoothstep, lerp } from "./noise";

type ColFn = (x: number, y: number, z: number) => THREE.Color;
const C = (h: string) => new THREE.Color(h);

// ---------- Geometry helpers. Every body is normalised: nose at +z 0.5, length ≈ 1. ----------

function body(r: (t: number) => number, sx: number, sy: number, col: ColFn, z0 = -0.5, z1 = 0.5, seg = 48, rad = 28): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector2(Math.max(1e-4, r(t)), z0 + (z1 - z0) * t));
  }
  const g = new THREE.LatheGeometry(pts, rad);
  g.rotateX(Math.PI / 2);
  g.scale(sx, sy, 1);
  g.computeVertexNormals();
  return prep(g, col);
}

/** A flat fin from a 2D outline; `place` moves it from the xy plane onto the body. */
function fin(pts: [number, number][], col: THREE.ColorRepresentation | ColFn, place: (g: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))));
  place(g);
  return prep(g, col);
}
/** Outline (x, z) lying flat in the horizontal plane. */
const flatXZ = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);
/** Outline (z, y) standing in the vertical mid-plane. */
const upright = (g: THREE.BufferGeometry) => g.rotateY(-Math.PI / 2);
const mirrorX = (g: THREE.BufferGeometry) => g.clone().scale(-1, 1, 1);

function eye(x: number, y: number, z: number, r: number, col = "#0c0f12"): THREE.BufferGeometry {
  const e = new THREE.SphereGeometry(r, 10, 8);
  e.translate(x, y, z);
  return prep(e, col);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

// ---------- Species models ----------

function whaleGeo(kind: "humpback" | "blue"): THREE.BufferGeometry {
  const hump = kind === "humpback";
  const top = hump ? C("#2c3640") : C("#5d7890");
  const belly = hump ? C("#dfe3e4") : C("#8ea6b8");
  const col: ColFn = (x, y, z) => {
    const b = smoothstep(0.012, -0.045, y);
    const c = top.clone().lerp(belly, b * 0.92);
    // Throat pleats along the belly.
    if (b > 0.5 && z > -0.05 && z < 0.44 && Math.sin(x * 230) > 0.5) c.multiplyScalar(0.72);
    // Mottling and scars.
    const h = hash2(Math.floor(x * 70), Math.floor(z * 70 + y * 40), hump ? 3 : 4);
    if (h > (hump ? 0.94 : 0.8)) c.lerp(C(hump ? "#c9cfd2" : "#a9bccb"), hump ? 0.6 : 0.4);
    return c;
  };
  const R = hump ? 0.1 : 0.068;
  const parts = [body((t) => R * Math.pow(Math.sin(Math.PI * Math.pow(t, hump ? 0.62 : 0.7)), 0.72), 1, hump ? 0.85 : 0.78, col)];
  // Flukes.
  const span = hump ? 0.2 : 0.13;
  const fl: [number, number][] = [[0, -0.46], [span * 0.6, -0.53], [span, -0.585], [span * 0.8, -0.6], [span * 0.35, -0.575], [0, -0.56]];
  const flG = fin(fl, hump ? "#39434d" : "#56708a", flatXZ);
  parts.push(flG, mirrorX(flG));
  // Pectoral fins: humpbacks' are a third of the body, pale; blues' are small.
  const pl = hump ? 0.32 : 0.1;
  const pf = fin([[0, 0.02], [pl * 0.5, 0.0], [pl, -0.06], [pl * 0.97, -0.09], [pl * 0.5, -0.05], [0, -0.04]], hump ? "#e6e9ea" : "#6f889c", (g) => {
    flatXZ(g);
    g.rotateZ(-0.45);
    g.translate(0.075, -0.045, hump ? 0.22 : 0.26);
  });
  parts.push(pf, mirrorX(pf));
  // Dorsal fin, far back.
  parts.push(fin([[-0.1, 0.05], [-0.16, 0.085], [-0.2, 0.045]].map(([z, y]) => [z - (hump ? 0 : 0.07), y * (hump ? 1 : 0.6)] as [number, number]), top, upright));
  parts.push(eye(0.078, -0.02, 0.33, 0.007), eye(-0.078, -0.02, 0.33, 0.007));
  return merge(parts);
}

function whaleSharkGeo(): THREE.BufferGeometry {
  const top = C("#3d5268"), belly = C("#e9ecee"), spot = C("#e8f0f4");
  const col: ColFn = (x, y, z) => {
    const b = smoothstep(0.0, -0.05, y);
    if (b > 0.5) return belly.clone();
    // Mouth: a dark wide line at the snout.
    if (z > 0.47 && Math.abs(y + 0.01) < 0.008) return C("#141b22");
    const u = z * 42, v = (x + y) * 42;
    const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
    if (Math.hypot(fu, fv) < 0.24) return spot.clone();
    if (z < 0.3 && (z * 13) % 1 < 0.06) return spot.clone().lerp(top, 0.3);
    return top.clone().lerp(belly, b);
  };
  const parts = [body((t) => 0.1 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.65) * (t > 0.85 ? 1 - (t - 0.85) * 1.2 : 1), 1.3, 0.78, col)];
  // Tall crescent tail, upright, lateral beat.
  parts.push(fin([[-0.4, 0], [-0.5, 0.18], [-0.55, 0.2], [-0.5, 0.05], [-0.49, 0], [-0.52, -0.08], [-0.5, -0.09], [-0.42, -0.01]], "#34485c", upright));
  parts.push(fin([[-0.02, 0.07], [-0.1, 0.18], [-0.16, 0.16], [-0.14, 0.06]], "#34485c", upright));
  parts.push(fin([[-0.28, 0.05], [-0.31, 0.09], [-0.34, 0.04]], "#34485c", upright));
  const pf = fin([[0, 0.03], [0.18, -0.06], [0.19, -0.1], [0, -0.04]], "#3a4f64", (g) => { flatXZ(g); g.rotateZ(-0.2); g.translate(0.1, -0.05, 0.2); });
  parts.push(pf, mirrorX(pf));
  parts.push(eye(0.115, 0.0, 0.42, 0.006), eye(-0.115, 0.0, 0.42, 0.006));
  return merge(parts);
}

function mantaGeo(): THREE.BufferGeometry {
  const sheet = (top: boolean) => {
    const g = new THREE.PlaneGeometry(1, 1, 30, 10);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), v = p.getY(i) + 0.5, ax = Math.abs(x);
      const zf = 0.2 - 0.62 * Math.pow(ax, 1.25), zb = -0.13 + 0.1 * ax;
      const th = 0.045 * Math.pow(Math.max(0, 1 - 2 * ax), 1.3) * Math.sin(Math.PI * v);
      // Top sheet mirrored in x, which flips its winding so its normals face up.
      p.setXYZ(i, top ? -x : x, top ? th : -th * 0.6, zb + (zf - zb) * v);
    }
    g.computeVertexNormals();
    return prep(g, top
      ? (x, _y, z) => (z > -0.02 && z < 0.13 && Math.abs(x) > 0.05 && Math.abs(x) < 0.2 ? C("#b9c3c8") : C("#1d2328"))
      : "#eef1f2");
  };
  const parts = [sheet(true), sheet(false)];
  const ceph = fin([[0.03, 0.17], [0.06, 0.28], [0.08, 0.27], [0.07, 0.17]], "#1d2328", (g) => { flatXZ(g); g.rotateZ(0.5); });
  parts.push(ceph, mirrorX(ceph));
  const tail = new THREE.CylinderGeometry(0.004, 0.001, 0.36, 4, 6);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0, -0.3);
  parts.push(prep(tail, "#1d2328"));
  parts.push(eye(0.075, 0.01, 0.17, 0.008), eye(-0.075, 0.01, 0.17, 0.008));
  return merge(parts);
}

function squidGeo(): THREE.BufferGeometry {
  const red = C("#a3342b"), pale = C("#e6a08a");
  const col: ColFn = (x, y, z) => {
    const c = red.clone().lerp(pale, smoothstep(0.0, -0.06, y) * 0.6);
    if (hash2(Math.floor(x * 120), Math.floor(z * 120 + y * 90), 8) > 0.9) c.multiplyScalar(0.7);
    return c;
  };
  const parts = [body((t) => 0.075 * Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * t)), 0.55), 1, 1, col, -0.12, 0.5, 40, 22)];
  const head = new THREE.SphereGeometry(0.058, 16, 12);
  head.scale(1, 0.95, 1.4);
  head.translate(0, 0, -0.16);
  parts.push(prep(head, col));
  for (const s of [-1, 1]) {
    parts.push(eye(s * 0.05, 0.012, -0.15, 0.028, "#e8e2c0"), eye(s * 0.07, 0.014, -0.15, 0.017, "#101010"));
  }
  const f = fin([[0, 0.5], [0.13, 0.36], [0.02, 0.3]], "#b23e33", flatXZ);
  parts.push(f, mirrorX(f));
  const limb = (a: number, len: number, r0: number, r1: number, radial: number, segs: number, club: boolean) => {
    const c = new THREE.CylinderGeometry(r0, r1, len, 5, segs);
    c.translate(0, -len / 2, 0);
    c.rotateX(Math.PI / 2);
    c.rotateY(Math.cos(a) * 0.08);
    c.rotateX(-Math.sin(a) * 0.08);
    c.translate(Math.cos(a) * radial, Math.sin(a) * radial, -0.21);
    parts.push(prep(c, col));
    if (club) {
      const k = new THREE.SphereGeometry(0.012, 6, 5);
      k.scale(1, 1, 4);
      k.translate(Math.cos(a) * radial, Math.sin(a) * radial, -0.21 - len - 0.03);
      parts.push(prep(k, col));
    }
  };
  for (let i = 0; i < 8; i++) limb((i / 8) * Math.PI * 2, 0.36 + (i % 2) * 0.05, 0.014, 0.003, 0.035, 14, false);
  for (const a of [0.5, Math.PI - 0.5]) limb(a, 0.74, 0.007, 0.004, 0.02, 26, true);
  return merge(parts);
}

// ---------- Species table: where each can appear, and how ----------

interface Species {
  key: string;
  name: string;
  blurb: string;
  len: [number, number];
  geoScale: number;
  mesh: THREE.InstancedMesh;
  speed: number;
  /** Target depth: absolute metres below the surface, or metres above the floor when floorRel. */
  band: [number, number];
  floorRel?: boolean;
  clear: number;
  radius: number;
  group: [number, number];
  weight: (b: Biome, night: boolean) => number;
  song?: number;
}

interface Creature {
  sp: Species; L: number; c: THREE.Vector2; R: number; w: number; th0: number; wob: number;
  lag: number; side: number; dy: number; y: number; baseT: number;
  pos: THREE.Vector3; dir: THREE.Vector3; ready: boolean;
}
interface Encounter { creatures: Creature[]; noticed: boolean; nextSong: number }

const CELL = 320;
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Vector3();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3();

export interface Sighting { sp: { key: string; name: string; blurb: string }; isNew: boolean }

/**
 * Rare giants. Encounters belong to 320 m world cells: a hash of the cell decides whether one lives there,
 * the biome and time of day decide which species, and the cell's seed sets size, group and path.
 * The same cell always holds the same animal on the same loop.
 */
export class Megafauna {
  readonly species: Species[];
  private active = new Map<string, Encounter>();
  readonly seen = new Set<string>();
  onSight: (s: Sighting) => void = () => {};
  onSong: (pitch: number, gain: number) => void = () => {};
  private forced: string | null;
  private forcedDone = false;

  constructor(scene: THREE.Scene, forced: string | null) {
    this.forced = forced;
    try { (JSON.parse(localStorage.getItem("drift.seen") ?? "[]") as string[]).forEach((k) => this.seen.add(k)); } catch { /* storage unavailable */ }
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
      return m;
    };
    const opts = { vertexColors: true, mask: 1, rim: 0.9, side: THREE.DoubleSide, caustic: 0.7 } as const;
    this.species = [
      { key: "humpback", name: "Humpback whale", blurb: "15 metres. Sings the longest songs in the sea.", len: [13, 16], geoScale: 1, speed: 2.6,
        mesh: mk(whaleGeo("humpback"), toon({ ...opts, id: 20, swimv: true, swimAmp: 0.035, swimRate: 1.5 }), 8),
        band: [-7, -16], clear: 4, radius: 0.1, group: [1, 3], song: 1,
        weight: (b) => b.flats * 1 + b.kelp * 0.6 + b.trench * 0.6 + b.reef * 0.2 },
      { key: "blue", name: "Blue whale", blurb: "26 metres. The largest animal that has ever lived.", len: [23, 28], geoScale: 1, speed: 3.2,
        mesh: mk(whaleGeo("blue"), toon({ ...opts, id: 21, swimv: true, swimAmp: 0.028, swimRate: 1.1 }), 4),
        band: [-12, -26], clear: 6, radius: 0.07, group: [1, 1], song: 0.55,
        weight: (b) => b.trench * 1.1 + b.flats * 0.35 },
      { key: "whaleshark", name: "Whale shark", blurb: "11 metres. A fish, not a whale. Eats plankton, like you.", len: [9, 12], geoScale: 1, speed: 1.8,
        mesh: mk(whaleSharkGeo(), toon({ ...opts, id: 22, swim: true, swimAmp: 0.05, swimRate: 2.2 }), 4),
        band: [-3, -8], clear: 3, radius: 0.1, group: [1, 2],
        weight: (b, night) => (night ? 0.1 : 1) * (b.flats * 0.8 + b.kelp * 0.5 + b.reef * 0.5) },
      { key: "manta", name: "Manta ray", blurb: "6 metres wide. Flies instead of swims.", len: [4.5, 7], geoScale: 1, speed: 2.2,
        mesh: mk(mantaGeo(), toon({ ...opts, id: 23, flap: true, swimAmp: 0.16, swimRate: 1.7 }), 10),
        band: [3, 8], floorRel: true, clear: 2, radius: 0.12, group: [1, 4],
        weight: (b) => b.reef * 1.4 + b.flats * 0.35 },
      { key: "squid", name: "Giant squid", blurb: "13 metres. Almost never seen alive. Rises from the deep at night.", len: [8, 9.5], geoScale: 1, speed: 1.4,
        mesh: mk(squidGeo(), toon({ ...opts, id: 24, tent: true, swimRate: 1.3 }), 2),
        band: [4, 12], floorRel: true, clear: 3, radius: 0.07, group: [1, 1],
        weight: (b, night) => b.trench * (night ? 2.2 : 0.25) },
    ];
  }

  get total(): number { return this.species.length; }

  private spawn(cx: number, cz: number, night: boolean, near?: THREE.Vector3): Encounter {
    const rnd = mulberry32(Math.floor(hash2(cx, cz, 777) * 4294967295));
    const enc: Encounter = { creatures: [], noticed: false, nextSong: 0 };
    let sp: Species | undefined;
    if (near && this.forced) sp = this.species.find((s) => s.key === this.forced);
    else {
      if (rnd() > 0.42) return enc;
      const ctr = biome(cx * CELL + CELL / 2, cz * CELL + CELL / 2);
      const w = this.species.map((s) => s.weight(ctr, night));
      const sum = w.reduce((a, b) => a + b, 0);
      if (sum < 0.05) return enc;
      let pick = rnd() * sum;
      sp = this.species.find((_s, i) => (pick -= w[i]) < 0);
    }
    if (!sp) return enc;
    const c = near ? new THREE.Vector2(near.x + 25, near.z + 30) : new THREE.Vector2(cx * CELL + 80 + rnd() * (CELL - 160), cz * CELL + 80 + rnd() * (CELL - 160));
    const R = near ? 32 : 45 + rnd() * 60;
    const dirSign = rnd() < 0.5 ? -1 : 1;
    const th0 = rnd() * Math.PI * 2, wob = rnd() * 6;
    const L0 = lerp(sp.len[0], sp.len[1], rnd());
    const n = sp.group[0] + Math.floor(rnd() * (sp.group[1] - sp.group[0] + 1));
    const baseT = lerp(0, 1, rnd());
    for (let i = 0; i < n; i++) {
      // Humpback groups: a mother and calf swim close; others spread in a loose line.
      const calf = sp.key === "humpback" && i > 0;
      const L = calf ? L0 * 0.35 : L0 * (i === 0 ? 1 : 0.85 + rnd() * 0.2);
      enc.creatures.push({
        sp, L, c, R, w: (dirSign * sp.speed) / R, th0, wob,
        lag: i === 0 ? 0 : (calf ? 0.3 : 0.9 + i * 0.7) * L0 / R,
        side: i === 0 ? 0 : calf ? L0 * 0.3 : (rnd() - 0.5) * L0 * 1.4,
        dy: i === 0 ? 0 : calf ? L0 * 0.12 : (rnd() - 0.5) * L0 * 0.4,
        y: 0, baseT, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), ready: false,
      });
    }
    return enc;
  }

  update(dt: number, t: number, player: THREE.Vector3, night: boolean): void {
    const cx = Math.floor(player.x / CELL), cz = Math.floor(player.z / CELL);
    for (const k of this.active.keys()) {
      const [ix, iz] = k.split(",").map(Number);
      if (Math.abs(ix - cx) > 1 || Math.abs(iz - cz) > 1) this.active.delete(k);
    }
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx},${cz + dz}`;
        if (this.active.has(k)) continue;
        const force = this.forced && !this.forcedDone && dx === 0 && dz === 0 ? player : undefined;
        if (force) this.forcedDone = true;
        this.active.set(k, this.spawn(cx + dx, cz + dz, night, force));
      }

    const counts = new Map<Species, number>();
    for (const enc of this.active.values()) {
      let nearest = Infinity;
      for (const cr of enc.creatures) {
        const th = cr.th0 + cr.w * t - Math.sign(cr.w) * cr.lag;
        const rr = cr.R * (1 + 0.22 * Math.sin(th * 2 + cr.wob)) + cr.side;
        const x = cr.c.x + Math.cos(th) * rr, z = cr.c.y + Math.sin(th) * rr;
        const floor = height(x, z);
        const bandY = lerp(cr.sp.band[0], cr.sp.band[1], cr.baseT);
        let ty = (cr.sp.floorRel ? floor + bandY : bandY) + cr.dy + Math.sin(t * 0.07 + cr.wob) * 2;
        ty = Math.max(ty, floor + cr.sp.clear + cr.L * 0.1);
        ty = Math.min(ty, -1.5 - cr.L * 0.08);
        if (!cr.ready) cr.y = ty;
        cr.y += (ty - cr.y) * (1 - Math.exp(-dt * 0.6));
        _p.set(x, cr.y, z);
        if (cr.ready) {
          _a.subVectors(_p, cr.pos);
          if (_a.lengthSq() > 1e-8) cr.dir.lerp(_a.normalize(), 1 - Math.exp(-dt * 2));
        } else {
          const th2 = th + Math.sign(cr.w) * 0.01;
          cr.dir.set(cr.c.x + Math.cos(th2) * rr - x, 0, cr.c.y + Math.sin(th2) * rr - z).normalize();
        }
        cr.pos.copy(_p);
        cr.ready = true;

        const i = counts.get(cr.sp) ?? 0;
        if (i < cr.sp.mesh.instanceMatrix.count) {
          _a.copy(cr.dir);
          _a.y = THREE.MathUtils.clamp(_a.y, -0.5, 0.5);
          _m.lookAt(ZERO, _a.normalize().negate(), UP);
          _m.scale(_s.setScalar(cr.L * cr.sp.geoScale));
          _m.setPosition(cr.pos);
          cr.sp.mesh.setMatrixAt(i, _m);
          counts.set(cr.sp, i + 1);
        }

        // The fish can't swim through a giant: a few spheres along its spine push it out.
        for (const s of [-0.3, 0, 0.28]) {
          _a.copy(cr.pos).addScaledVector(cr.dir, s * cr.L);
          const r = cr.sp.radius * cr.L * (s === 0 ? 1 : 0.75) + 0.6;
          _p.subVectors(player, _a);
          const d = _p.length();
          if (d < r && d > 1e-4) player.addScaledVector(_p, (r - d) / d);
        }
        nearest = Math.min(nearest, player.distanceTo(cr.pos) - cr.L * 0.5);
      }
      if (!enc.creatures.length) continue;
      const sp = enc.creatures[0].sp;
      if (!enc.noticed && nearest < 38) {
        enc.noticed = true;
        const isNew = !this.seen.has(sp.key);
        this.seen.add(sp.key);
        try { localStorage.setItem("drift.seen", JSON.stringify([...this.seen])); } catch { /* storage unavailable */ }
        this.onSight({ sp, isNew });
      }
      if (sp.song && nearest < 140) {
        enc.nextSong -= dt;
        if (enc.nextSong <= 0) {
          this.onSong(sp.song, 0.05 + 0.12 * (1 - Math.min(1, nearest / 140)));
          enc.nextSong = 16 + Math.random() * 14;
        }
      }
    }
    for (const s of this.species) {
      s.mesh.count = counts.get(s) ?? 0;
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
