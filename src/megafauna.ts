import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { toon, G } from "./mat";
import { prep } from "./geo";
import { biome, height, type Biome } from "./terrain";
import { hash2, mulberry32, smoothstep, lerp, WORLD } from "./noise";

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

/** Sperm whale: square head ≈ ⅓ of length, narrow underslung jaw, wrinkled skin, hump and knuckles, no real dorsal fin. */
function spermGeo(): THREE.BufferGeometry {
  const skin = C("#3e3b3c");
  const col: ColFn = (_x, y, z) => {
    const c = skin.clone();
    // Behind the head the skin is shrivelled into fine bands.
    if (z < 0.15 && Math.sin(z * 260 + Math.sin(y * 40) * 2) > 0.3) c.multiplyScalar(0.82);
    if (y < -0.06 && z > 0.1) c.lerp(C("#6c6668"), 0.4);
    return c;
  };
  const r = (t: number) => {
    const rise = Math.pow(smoothstep(0.0, 0.5, t), 0.75);
    // Square-ish forehead that rounds off over the last few percent, not a cut-off pipe.
    const f = smoothstep(0.9, 1.0, t);
    const blunt = Math.sqrt(Math.max(0, 1 - f * f * 0.97));
    return 0.1 * Math.max(0.05, rise) * blunt;
  };
  const parts = [body(r, 0.82, 1.0, col, -0.5, 0.5, 64, 26)];
  // Lower jaw: a narrow rod under the front third, pale inside.
  const jaw = new THREE.CylinderGeometry(0.012, 0.018, 0.32, 8, 4);
  jaw.rotateX(Math.PI / 2);
  jaw.translate(0, -0.088, 0.3);
  parts.push(prep(jaw, "#d9d2cc"));
  // Dorsal hump and the knuckles behind it.
  parts.push(fin([[-0.12, 0.085], [-0.16, 0.115], [-0.2, 0.08]], skin, upright));
  for (let i = 0; i < 4; i++) parts.push(fin([[-0.23 - i * 0.045, 0.065 - i * 0.008], [-0.245 - i * 0.045, 0.08 - i * 0.009], [-0.26 - i * 0.045, 0.06 - i * 0.008]], skin, upright));
  const pf = fin([[0, 0.02], [0.07, -0.01], [0.075, -0.035], [0, -0.02]], "#343132", (g) => { flatXZ(g); g.rotateZ(-0.6); g.translate(0.07, -0.06, 0.16); });
  parts.push(pf, mirrorX(pf));
  const fl = fin([[0, -0.46], [0.09, -0.52], [0.16, -0.56], [0.12, -0.58], [0.04, -0.565], [0, -0.555]], "#353233", flatXZ);
  parts.push(fl, mirrorX(fl));
  parts.push(eye(0.078, -0.05, 0.17, 0.006), eye(-0.078, -0.05, 0.17, 0.006));
  return merge(parts);
}

/** Orca: stout, black with white eye patch, belly and flank lobe, grey saddle; tall dorsal; big rounded paddles. */
function orcaGeo(): THREE.BufferGeometry {
  const black = C("#101318"), white = C("#f2f4f5"), grey = C("#7d8590");
  const col: ColFn = (x, y, z) => {
    // Eye patch: an oval above and behind the eye.
    const ex = (z - 0.335) / 0.05, ey = (y - 0.03) / 0.016;
    if (Math.abs(x) > 0.05 && ex * ex + ey * ey < 1) return white.clone();
    // Belly: white from chin to vent, with a lobe sweeping up the flank behind the dorsal.
    const lobe = z < -0.02 && z > -0.3 ? 0.05 * Math.sin(((z + 0.02) / -0.28) * Math.PI) : 0;
    if (y < -0.035 + lobe && z > -0.3 && z < 0.47) return white.clone();
    if (y > 0.075 && z < -0.02 && z > -0.14) return grey.clone();
    return black.clone();
  };
  const parts = [body((t) => 0.11 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.58)), 0.7), 0.95, 1.0, col, -0.5, 0.5, 56, 28)];
  parts.push(fin([[0.04, 0.09], [-0.02, 0.28], [-0.035, 0.29], [-0.08, 0.1]], black, upright));
  const pf = fin([[0, 0.03], [0.07, 0.02], [0.13, -0.04], [0.12, -0.09], [0.05, -0.07], [0, -0.03]], black, (g) => { flatXZ(g); g.rotateZ(-0.5); g.translate(0.08, -0.07, 0.22); });
  parts.push(pf, mirrorX(pf));
  const fl = fin([[0, -0.44], [0.08, -0.5], [0.13, -0.55], [0.1, -0.57], [0.03, -0.54], [0, -0.535]], black, flatXZ);
  parts.push(fl, mirrorX(fl));
  parts.push(eye(0.085, 0.005, 0.32, 0.006), eye(-0.085, 0.005, 0.32, 0.006));
  return merge(parts);
}

/** Great white: conical snout, torpedo body, sharp grey/white countershading, five gill slits, lunate tail. */
function whiteSharkGeo(): THREE.BufferGeometry {
  const top = C("#66717d"), belly = C("#f1f2f0");
  const col: ColFn = (x, y, z) => {
    const line = -0.015 + 0.012 * Math.sin(z * 34) + 0.006 * Math.sin(z * 91);
    if (Math.abs(x) > 0.04 && z > 0.18 && z < 0.29 && Math.abs(((z - 0.18) / 0.022) % 1 - 0.5) < 0.12 && y < 0.05 && y > -0.05) return C("#2b3139");
    return y < line ? belly.clone() : top.clone();
  };
  const r = (t: number) => 0.095 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.95)), 0.62) * (1 - smoothstep(0.88, 1.0, t) * 0.35);
  const parts = [body(r, 0.9, 1.0, col, -0.5, 0.5, 56, 26)];
  parts.push(fin([[0.08, 0.08], [0.0, 0.2], [-0.03, 0.19], [-0.06, 0.08]], top, upright));
  parts.push(fin([[-0.3, 0.03], [-0.32, 0.06], [-0.34, 0.03]], top, upright));
  parts.push(fin([[-0.42, 0.0], [-0.52, 0.16], [-0.56, 0.17], [-0.5, 0.02], [-0.5, -0.02], [-0.55, -0.14], [-0.52, -0.14], [-0.43, -0.01]], top, upright));
  const pf = fin([[0, 0.03], [0.1, -0.04], [0.2, -0.12], [0.18, -0.13], [0.05, -0.07], [0, -0.03]], top, (g) => { flatXZ(g); g.rotateZ(-0.35); g.translate(0.07, -0.05, 0.2); });
  parts.push(pf, mirrorX(pf));
  parts.push(eye(0.06, 0.02, 0.4, 0.007), eye(-0.06, 0.02, 0.4, 0.007));
  return merge(parts);
}

/** Ocean sunfish: tall laterally-flat disc, truncated behind into a scalloped clavus, towering dorsal and anal fins. */
function molaGeo(): THREE.BufferGeometry {
  const col: ColFn = (x, y, z) => {
    const c = C("#9aa6ae").lerp(C("#e2e6e6"), smoothstep(0.1, -0.3, y));
    if (hash2(Math.floor(x * 30 + z * 30), Math.floor(y * 30), 5) > 0.86) c.multiplyScalar(1.12);
    return c;
  };
  const s = new THREE.SphereGeometry(1, 36, 26);
  const p = s.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 0.12, y = p.getY(i) * 0.4, z = p.getZ(i) * 0.46;
    // Truncated rear: the back of the ellipsoid is squashed flat.
    if (z < -0.3) z = -0.3 + (z + 0.3) * 0.35;
    if (z > 0.3) y *= 1 - (z - 0.3) * 1.4;
    x *= 1 - Math.max(0, -z - 0.2) * 1.5;
    p.setXYZ(i, x, y, z);
  }
  s.computeVertexNormals();
  const parts = [prep(s, col)];
  const finCol = "#6f7c86";
  parts.push(fin([[-0.14, 0.3], [-0.26, 0.64], [-0.33, 0.62], [-0.32, 0.26]], finCol, upright));
  parts.push(fin([[-0.14, -0.3], [-0.26, -0.64], [-0.33, -0.62], [-0.32, -0.26]], finCol, upright));
  const clav: [number, number][] = [[-0.33, 0.3]];
  for (let i = 0; i <= 10; i++) { const y = 0.3 - i * 0.06; clav.push([-0.43 - (i % 2 ? 0.035 : 0), y]); }
  clav.push([-0.33, -0.3]);
  parts.push(fin(clav, finCol, upright));
  const pf = fin([[0, 0.03], [0.05, 0.0], [0, -0.03]], finCol, (g) => { g.rotateY(Math.PI / 2); g.translate(0.07, 0.02, 0.12); });
  parts.push(pf, mirrorX(pf));
  parts.push(eye(0.065, 0.08, 0.3, 0.018, "#1a1d20"));
  parts.push(eye(-0.065, 0.08, 0.3, 0.018, "#1a1d20"));
  const mouth = new THREE.SphereGeometry(0.018, 8, 6);
  mouth.translate(0, 0.02, 0.455);
  parts.push(prep(mouth, "#3a3f44"));
  return merge(parts);
}

/** Lion's mane: lobed crimson bell (diameter 1), frilly oral arms, 8 clusters of tentacles ~15 bells long. */
function lionGeo(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, a = t * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * 0.5), Math.sin(a) * 0.3 + 0.02));
  }
  const bell = new THREE.LatheGeometry(prof, 48);
  const p = bell.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x), edge = 1 - y / 0.32;
    const k = 1 + 0.07 * edge * Math.cos(a * 8);
    p.setXYZ(i, x * k, y, z * k);
  }
  bell.computeVertexNormals();
  const parts = [prep(bell, (_x, y) => C("#b8452a").lerp(C("#e8a24a"), smoothstep(0.3, 0.05, y) * 0.7))];
  const r = mulberry32(55);
  for (let c = 0; c < 8; c++) {
    const a0 = ((c + 0.5) / 8) * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = a0 + (r() - 0.5) * 0.35, rr = 0.36 + r() * 0.1, len = 10 + r() * 6;
      const t = new THREE.PlaneGeometry(0.012, len, 1, 24);
      t.translate(0, -len / 2, 0);
      t.rotateY(r() * Math.PI);
      t.translate(Math.cos(a) * rr, 0.03, Math.sin(a) * rr);
      parts.push(prep(t, (_x, y) => C("#f0c070").lerp(C("#c9643a"), smoothstep(0, -10, y) * 0.5)));
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, len = 1.6 + r() * 1.2;
    const t = new THREE.PlaneGeometry(0.16, len, 3, 14);
    const q = t.getAttribute("position");
    for (let j = 0; j < q.count; j++) q.setZ(j, Math.sin(q.getY(j) * 9 + q.getX(j) * 30) * 0.03);
    t.translate(0, -len / 2, 0);
    t.rotateY(a);
    t.translate(Math.cos(a) * 0.08, 0.05, Math.sin(a) * 0.08);
    t.computeVertexNormals();
    parts.push(prep(t, "#e98a55"));
  }
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
  clicks?: boolean;
  /** Drifts upright (jellies) instead of pointing along its path; `hang` is trailing length below, in body lengths. */
  upright?: boolean;
  hang?: number;
  /** Per-individual ranges: girth (x, y scale), width (x only), colour lightness, hue shift, speed. */
  vary: { girth: [number, number]; width?: [number, number]; light: [number, number]; hue: number; speed: [number, number] };
}

interface Creature {
  sp: Species; L: number; c: THREE.Vector2; R: number; w: number; th0: number; wob: number;
  lag: number; side: number; dy: number; y: number; baseT: number;
  pos: THREE.Vector3; dir: THREE.Vector3; ready: boolean;
  gx: number; gy: number; tint: THREE.Color;
  /** Gallery mode: held in place at home instead of swimming a loop. */
  home?: THREE.Vector3;
}
interface Encounter { creatures: Creature[]; noticed: boolean; nextSong: number; viewT: number }

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
  onClicks: (gain: number) => void = () => {};
  private forced: string | null;
  private forcedDone = false;
  private galleryOn = false;
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  /** Nearest giant not yet seen in this encounter, for the on-screen guide. */
  readonly hint = { active: false, pos: new THREE.Vector3(), dist: 0 };

  constructor(scene: THREE.Scene, forced: string | null) {
    this.forced = forced;
    try { (JSON.parse(localStorage.getItem("drift.seen") ?? "[]") as string[]).forEach((k) => this.seen.add(k)); } catch { /* storage unavailable */ }
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false;
      for (let i = 0; i < cap; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
      m.count = 0;
      scene.add(m);
      return m;
    };
    const opts = { vertexColors: true, mask: 1, rim: 1.1, side: THREE.DoubleSide, caustic: 0.7, fogMul: 0.5 } as const;
    this.species = [
      { key: "humpback", name: "Humpback whale", blurb: "15 metres. Sings the longest songs in the sea.", len: [11.5, 17], geoScale: 1, speed: 2.6,
        mesh: mk(whaleGeo("humpback"), toon({ ...opts, id: 20, swimv: true, swimAmp: 0.035, swimRate: 1.5 }), 8),
        band: [-7, -16], clear: 4, radius: 0.1, group: [1, 3], song: 1,
        vary: { girth: [0.88, 1.16], light: [0.72, 1.22], hue: 0.02, speed: [0.8, 1.25] },
        weight: (b) => b.flats * 1 + b.kelp * 0.6 + b.trench * 0.6 + b.reef * 0.2 },
      { key: "blue", name: "Blue whale", blurb: "26 metres. The largest animal that has ever lived.", len: [21, 30], geoScale: 1, speed: 3.2,
        mesh: mk(whaleGeo("blue"), toon({ ...opts, id: 21, swimv: true, swimAmp: 0.028, swimRate: 1.1 }), 4),
        band: [-12, -26], clear: 6, radius: 0.07, group: [1, 2], song: 0.55,
        vary: { girth: [0.9, 1.1], light: [0.85, 1.18], hue: 0.025, speed: [0.85, 1.2] },
        weight: (b) => b.trench * 1.1 + b.flats * 0.35 },
      { key: "whaleshark", name: "Whale shark", blurb: "11 metres. A fish, not a whale. Eats plankton, like you.", len: [7.5, 13], geoScale: 1, speed: 1.8,
        mesh: mk(whaleSharkGeo(), toon({ ...opts, id: 22, swim: true, swimAmp: 0.05, swimRate: 2.2 }), 4),
        band: [-3, -8], clear: 3, radius: 0.1, group: [1, 2],
        vary: { girth: [0.88, 1.2], light: [0.8, 1.2], hue: 0.03, speed: [0.75, 1.3] },
        weight: (b, night) => (night ? 0.1 : 1) * (b.flats * 0.8 + b.kelp * 0.5 + b.reef * 0.5) },
      { key: "manta", name: "Manta ray", blurb: "6 metres wide. Flies instead of swims.", len: [3.8, 7.5], geoScale: 1, speed: 2.2,
        mesh: mk(mantaGeo(), toon({ ...opts, id: 23, flap: true, swimAmp: 0.16, swimRate: 1.7 }), 10),
        band: [3, 8], floorRel: true, clear: 2, radius: 0.12, group: [1, 5],
        vary: { girth: [0.85, 1.2], width: [0.88, 1.15], light: [0.7, 1.15], hue: 0.02, speed: [0.8, 1.3] },
        weight: (b) => b.reef * 1.4 + b.flats * 0.35 },
      { key: "squid", name: "Giant squid", blurb: "13 metres. Almost never seen alive. Rises from the deep at night.", len: [8, 12.5], geoScale: 1, speed: 1.4,
        mesh: mk(squidGeo(), toon({ ...opts, id: 24, tent: true, swimRate: 1.3 }), 2),
        band: [4, 12], floorRel: true, clear: 3, radius: 0.04, group: [1, 1],
        vary: { girth: [0.85, 1.18], light: [0.75, 1.2], hue: 0.04, speed: [0.8, 1.2] },
        weight: (b, night) => b.trench * (night ? 2.2 : 0.25) },
      { key: "sperm", name: "Sperm whale", blurb: "16 metres. A third of it is head. Hunts squid in the dark, by sound.", len: [11, 18], geoScale: 1, speed: 2.2,
        mesh: mk(spermGeo(), toon({ ...opts, id: 25, swimv: true, swimAmp: 0.03, swimRate: 1.2 }), 4),
        band: [-18, -40], clear: 5, radius: 0.1, group: [1, 3], clicks: true,
        vary: { girth: [0.9, 1.12], light: [0.8, 1.25], hue: 0.02, speed: [0.8, 1.2] },
        weight: (b) => b.trench * 1.3 + b.flats * 0.2 },
      { key: "orca", name: "Orca", blurb: "7 metres. The largest dolphin. Hunts in family pods.", len: [5.5, 8], geoScale: 1, speed: 4,
        mesh: mk(orcaGeo(), toon({ ...opts, id: 26, swimv: true, swimAmp: 0.04, swimRate: 2.4 }), 12),
        band: [-3, -12], clear: 3, radius: 0.11, group: [3, 6], song: 2.6,
        vary: { girth: [0.92, 1.12], light: [0.95, 1.05], hue: 0.0, speed: [0.85, 1.2] },
        weight: (b) => b.flats * 0.7 + b.kelp * 0.6 + b.reef * 0.3 + b.trench * 0.3 },
      { key: "whiteshark", name: "Great white shark", blurb: "5 metres. Countershaded: dark from above, pale from below.", len: [4, 6], geoScale: 1, speed: 2.2,
        mesh: mk(whiteSharkGeo(), toon({ ...opts, id: 27, swim: true, swimAmp: 0.06, swimRate: 3 }), 3),
        band: [-4, -16], clear: 2, radius: 0.08, group: [1, 1],
        vary: { girth: [0.9, 1.18], light: [0.85, 1.12], hue: 0.015, speed: [0.8, 1.3] },
        weight: (b) => b.flats * 0.6 + b.kelp * 0.6 + b.reef * 0.3 },
      { key: "mola", name: "Ocean sunfish", blurb: "Taller than it is long. The heaviest bony fish in the sea.", len: [1.8, 3.3], geoScale: 1, speed: 0.8,
        mesh: mk(molaGeo(), toon({ ...opts, id: 28, scull: true, swimAmp: 0.1, swimRate: 1.6 }), 3),
        band: [-2, -8], clear: 3, radius: 0.35, group: [1, 1],
        vary: { girth: [0.9, 1.1], light: [0.85, 1.15], hue: 0.02, speed: [0.8, 1.3] },
        weight: (b, night) => (night ? 0.2 : 1) * (b.flats * 0.7 + b.kelp * 0.4) },
      { key: "lionsmane", name: "Lion's mane jellyfish", blurb: "Bell up to 2 metres; tentacles longer than a blue whale.", len: [0.6, 2], geoScale: 1, speed: 0.3,
        mesh: mk(lionGeo(), toon({ ...opts, id: 29, jelly: true, swimAmp: 0.22, emissive: 0.12, rim: 1.2 }), 3),
        band: [-4, -10], clear: 1, radius: 0.3, group: [1, 1], upright: true, hang: 14,
        vary: { girth: [0.9, 1.1], light: [0.8, 1.2], hue: 0.04, speed: [0.7, 1.3] },
        weight: (b, night) => (b.flats * 0.4 + b.trench * 0.5 + b.kelp * 0.3) * (night ? 1.4 : 0.8) },
    ];
  }

  get total(): number { return this.species.length; }

  /** Live positions of every nearby encounter, for the map. */
  markers(): { x: number; z: number; key: string; name: string; seen: boolean }[] {
    const out: { x: number; z: number; key: string; name: string; seen: boolean }[] = [];
    for (const enc of this.active.values()) {
      const cr = enc.creatures[0];
      if (!cr || !cr.ready) continue;
      out.push({ x: cr.pos.x, z: cr.pos.z, key: cr.sp.key, name: cr.sp.name, seen: this.seen.has(cr.sp.key) });
    }
    return out;
  }

  /** Record a sighting (giant or common type); returns true the first time. Persists across visits. */
  note(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    try { localStorage.setItem("drift.seen", JSON.stringify([...this.seen])); } catch { /* storage unavailable */ }
    return true;
  }

  /** Push a point (the camera) out of every giant's body; pad is extra clearance in metres. */
  pushOut(p: THREE.Vector3, pad: number): void {
    for (const enc of this.active.values())
      for (const cr of enc.creatures) {
        if (!cr.ready) continue;
        for (const s of [-0.35, -0.15, 0, 0.15, 0.3]) {
          _a.copy(cr.pos).addScaledVector(cr.dir, s * cr.L);
          const r = cr.sp.radius * cr.L * (Math.abs(s) > 0.2 ? 0.7 : 1) * Math.max(cr.gx, cr.gy) + pad;
          _p.subVectors(p, _a);
          const d = _p.length();
          if (d < r && d > 1e-4) p.addScaledVector(_p, (r - d) / d);
        }
      }
  }

  /**
   * Swap in the Blender-built models (scripts/blender/species.py) as they arrive. Until then, and if one
   * fails, the code-built shape stays in place. Same axes and unit length, so nothing else changes.
   */
  loadModels(base: string): void {
    const draco = new DRACOLoader().setDecoderPath(`${base}draco/`);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    const keys = ["blue", "humpback", "sperm", "orca", "whiteshark", "whaleshark", "mola", "manta", "squid"];
    for (const sp of this.species) {
      if (!keys.includes(sp.key)) continue;
      loader.load(`${base}models/${sp.key}.glb`, (gltf) => {
        let found: THREE.Mesh | undefined;
        gltf.scene.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
        if (!found) return;
        const g = found.geometry;
        if (!g.getAttribute("normal")) g.computeVertexNormals();
        sp.mesh.geometry.dispose();
        sp.mesh.geometry = g;
      }, undefined, () => { /* keep the code-built shape */ });
    }
  }

  private spawn(cx: number, cz: number, night: boolean, near?: THREE.Vector3): Encounter {
    const rnd = mulberry32(Math.floor(hash2(cx, cz, 777 + WORLD.seed) * 4294967295));
    const enc: Encounter = { creatures: [], noticed: false, nextSong: 0, viewT: 0 };
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
      // Every individual draws its own proportions, colour and pace from the species' ranges.
      const v = sp.vary;
      const girth = lerp(v.girth[0], v.girth[1], rnd());
      const width = v.width ? lerp(v.width[0], v.width[1], rnd()) : 1;
      const tint = new THREE.Color(1, 1, 1).offsetHSL((rnd() - 0.5) * 2 * v.hue, 0, 0).multiplyScalar(lerp(v.light[0], v.light[1], rnd()));
      const speed = sp.speed * (i === 0 ? lerp(v.speed[0], v.speed[1], rnd()) : 1);
      enc.creatures.push({
        sp, L, c, R, w: (dirSign * (i === 0 ? speed : enc.creatures[0].w * R * dirSign)) / R, th0, wob,
        gx: girth * width, gy: calf ? girth * 1.05 : girth, tint,
        lag: i === 0 ? 0 : (calf ? 0.3 : 0.9 + i * 0.7) * L0 / R,
        side: i === 0 ? 0 : calf ? L0 * 0.3 : (rnd() - 0.5) * L0 * 1.4,
        dy: i === 0 ? 0 : calf ? L0 * 0.12 : (rnd() - 0.5) * L0 * 0.4,
        y: 0, baseT, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), ready: false,
      });
    }
    return enc;
  }

  /** ?gallery=1: every species in one row at true scale, smallest to largest, for checking models. */
  gallery(origin: THREE.Vector3): { key: string; name: string; L: number; pos: THREE.Vector3 }[] {
    this.galleryOn = true;
    this.active.clear();
    const order = ["mola", "whiteshark", "manta", "orca", "lionsmane", "squid", "whaleshark", "humpback", "sperm", "blue"];
    const enc: Encounter = { creatures: [], noticed: true, nextSong: 999, viewT: 0 };
    let x = origin.x - 70;
    const z = origin.z + 26;
    const out: { key: string; name: string; L: number; pos: THREE.Vector3 }[] = [];
    for (const key of order) {
      const sp = this.species.find((s) => s.key === key)!;
      const L = (sp.len[0] + sp.len[1]) / 2;
      const span = sp.key === "manta" || sp.key === "lionsmane" ? L * 0.6 : L;
      x += span / 2;
      const floor = height(x, z);
      let y = Math.max(-12, floor + sp.clear + L * (sp.hang ?? 0.15));
      y = Math.min(y, -1.5 - L * 0.08);
      const home = new THREE.Vector3(x, y, z);
      enc.creatures.push({ sp, L, c: new THREE.Vector2(), R: 1, w: 0, th0: 0, wob: out.length, lag: 0, side: 0, dy: 0, y, baseT: 0,
        pos: home.clone(), dir: new THREE.Vector3(1, 0, 0), ready: true, gx: 1, gy: 1, tint: new THREE.Color(1, 1, 1), home });
      out.push({ key: sp.key, name: sp.name, L, pos: home });
      x += span / 2 + 6;
    }
    this.active.set("gallery", enc);
    return out;
  }

  update(dt: number, t: number, player: THREE.Vector3, night: boolean, camera: THREE.Camera): void {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    // A giant counts as seen only when it is on screen and close enough to show through the fog.
    const visible = G.uFogDist.value * 0.6;
    this.hint.active = false;
    let hintD = 120;
    const cx = Math.floor(player.x / CELL), cz = Math.floor(player.z / CELL);
    if (!this.galleryOn) for (const k of this.active.keys()) {
      const [ix, iz] = k.split(",").map(Number);
      if (Math.abs(ix - cx) > 1 || Math.abs(iz - cz) > 1) this.active.delete(k);
    }
    if (!this.galleryOn) for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${cx + dx},${cz + dz}`;
        if (this.active.has(k)) continue;
        const force = this.forced && !this.forcedDone && dx === 0 && dz === 0 ? player : undefined;
        if (force) this.forcedDone = true;
        this.active.set(k, this.spawn(cx + dx, cz + dz, night, force));
      }

    const counts = new Map<Species, number>();
    for (const enc of this.active.values()) {
      let nearest = Infinity, inView = false, near: Creature | null = null;
      for (const cr of enc.creatures) {
        if (cr.home) {
          cr.pos.copy(cr.home);
          cr.pos.y += Math.sin(t * 0.5 + cr.wob) * 0.3;
          cr.ready = true;
        } else {
          const th = cr.th0 + cr.w * t - Math.sign(cr.w) * cr.lag;
          const rr = cr.R * (1 + 0.22 * Math.sin(th * 2 + cr.wob)) + cr.side;
          const x = cr.c.x + Math.cos(th) * rr, z = cr.c.y + Math.sin(th) * rr;
          const floor = height(x, z);
          const bandY = lerp(cr.sp.band[0], cr.sp.band[1], cr.baseT);
          let ty = (cr.sp.floorRel ? floor + bandY : bandY) + cr.dy + Math.sin(t * 0.07 + cr.wob) * 2;
          ty = Math.max(ty, floor + cr.sp.clear + cr.L * (cr.sp.hang ?? 0.1));
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
        }

        const i = counts.get(cr.sp) ?? 0;
        if (i < cr.sp.mesh.instanceMatrix.count) {
          if (cr.sp.upright) _m.makeRotationY(Math.atan2(cr.dir.x, cr.dir.z) * 0.2 + cr.wob);
          else {
            _a.copy(cr.dir);
            _a.y = THREE.MathUtils.clamp(_a.y, -0.5, 0.5);
            _m.lookAt(ZERO, _a.normalize().negate(), UP);
          }
          _m.scale(_s.set(cr.L * cr.gx, cr.L * cr.gy, cr.L).multiplyScalar(cr.sp.geoScale));
          _m.setPosition(cr.pos);
          cr.sp.mesh.setMatrixAt(i, _m);
          cr.sp.mesh.setColorAt(i, cr.tint);
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
        const d = camera.position.distanceTo(cr.pos) - cr.L * 0.4;
        if (d < nearest) { nearest = d; near = cr; }
        if (d < visible * 0.85) {
          _a.copy(cr.pos).applyMatrix4(this.projView);
          const w = cr.pos.x * this.projView.elements[3] + cr.pos.y * this.projView.elements[7] + cr.pos.z * this.projView.elements[11] + this.projView.elements[15];
          if (w > 0 && Math.abs(_a.x) < 0.85 && Math.abs(_a.y) < 0.85) inView = true;
        }
      }
      if (!enc.creatures.length) continue;
      const sp = enc.creatures[0].sp;
      if (!enc.noticed && near && nearest < hintD) {
        hintD = nearest;
        this.hint.active = true;
        this.hint.pos.copy(near.pos);
        this.hint.dist = Math.max(0, nearest);
      }
      // Seen = held near the middle of the screen for a moment, not a one-frame glimpse.
      enc.viewT = inView ? enc.viewT + dt : 0;
      if (!enc.noticed && enc.viewT > 0.6) {
        enc.noticed = true;
        this.onSight({ sp, isNew: this.note(sp.key) });
      }
      if (sp.clicks && nearest < 160) {
        enc.nextSong -= dt;
        if (enc.nextSong <= 0) { this.onClicks(0.04 + 0.1 * (1 - Math.min(1, nearest / 160))); enc.nextSong = 5 + Math.random() * 8; }
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
      if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
    }
  }
}
