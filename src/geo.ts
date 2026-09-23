import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32, vnoise } from "./noise";

type ColFn = (x: number, y: number, z: number) => THREE.Color;

/** Non-indexed, no uv, per-vertex colour: every part merges with every other part. */
export function prep(g: THREE.BufferGeometry, col: THREE.ColorRepresentation | ColFn): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  n.deleteAttribute("uv");
  if (!n.getAttribute("normal")) n.computeVertexNormals();
  const pos = n.getAttribute("position");
  const c = new Float32Array(pos.count * 3);
  const fixed = typeof col === "function" ? null : new THREE.Color(col);
  for (let i = 0; i < pos.count; i++) {
    const k = fixed ?? (col as ColFn)(pos.getX(i), pos.getY(i), pos.getZ(i));
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  n.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return n;
}

function tri(pts: number[][], normal: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p: number[] = [], nn: number[] = [];
  for (const q of pts) { p.push(q[0], q[1], q[2]); nn.push(...normal); }
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nn, 3));
  return g;
}

/** Fish, nose at +z 0.5, tail fork at −0.78. Length ≈ 1.3, so instance scale ≈ body length. */
export function fishGeo(body: ColFn, fin: THREE.ColorRepresentation, eye = 0x101418): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.max(0.012, 0.2 * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.35)), 0.85));
    prof.push(new THREE.Vector2(i === 0 || i === N ? 0.0001 : r, -0.5 + t));
  }
  const lathe = new THREE.LatheGeometry(prof, 18);
  lathe.rotateX(Math.PI / 2);
  lathe.scale(0.52, 1, 1);
  lathe.computeVertexNormals();
  const parts = [prep(lathe, body)];
  const fc = new THREE.Color(fin);
  parts.push(prep(tri([[0, 0, -0.44], [0, 0.26, -0.8], [0, 0.02, -0.62], [0, 0, -0.44], [0, -0.02, -0.62], [0, -0.26, -0.8]], [1, 0, 0]), fc));
  parts.push(prep(tri([[0, 0.15, 0.2], [0, 0.34, -0.02], [0, 0.14, -0.24]], [1, 0, 0]), fc));
  parts.push(prep(tri([[0, -0.13, 0.02], [0, -0.24, -0.12], [0, -0.1, -0.2]], [1, 0, 0]), fc));
  for (const s of [-1, 1]) {
    parts.push(prep(tri([[s * 0.085, -0.04, 0.16], [s * 0.2, -0.12, 0.02], [s * 0.09, -0.06, 0.03]], [s, -0.3, 0]), fc));
    const e = new THREE.SphereGeometry(0.034, 8, 6);
    e.translate(s * 0.078, 0.045, 0.31);
    parts.push(prep(e, eye));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** Kelp: a stipe with alternating blades, y ∈ [0, 1] so the sway shader can bend it by height. */
export function kelpGeo(): THREE.BufferGeometry {
  const r = mulberry32(7);
  const parts: THREE.BufferGeometry[] = [];
  const stipe = new THREE.CylinderGeometry(0.035, 0.06, 1, 4, 10, true);
  stipe.translate(0, 0.5, 0);
  parts.push(prep(stipe, (_x, y) => new THREE.Color().lerpColors(new THREE.Color("#3d4a1c"), new THREE.Color("#8a8a2c"), y)));
  for (let i = 0; i < 11; i++) {
    const y0 = 0.08 + i * 0.085;
    const side = i % 2 ? 1 : -1;
    const w = 0.28 + r() * 0.18, len = 0.1 + r() * 0.04;
    const ang = r() * Math.PI * 2;
    const blade = new THREE.PlaneGeometry(w, len, 2, 3);
    const p = blade.getAttribute("position");
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k);
      const u = x / w + 0.5;
      p.setX(k, x + w * 0.5 * side * 0.9);
      p.setY(k, y + y0 + len * 0.5 + u * 0.03);
      p.setZ(k, Math.sin(u * Math.PI) * 0.06 * Math.sin((y / len) * 6));
    }
    blade.rotateY(ang);
    blade.computeVertexNormals();
    const t = i / 10;
    parts.push(prep(blade, (_x, y) => new THREE.Color().lerpColors(new THREE.Color("#5c6a20"), new THREE.Color("#c2b43a"), Math.min(1, t * 0.6 + y * 0.4))));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

/** A tuft of seagrass blades, y ∈ [0, 1]. */
export function grassGeo(): THREE.BufferGeometry {
  const r = mulberry32(3);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.PlaneGeometry(0.07, 1, 1, 4);
    const p = b.getAttribute("position");
    const lean = (r() - 0.5) * 0.5, h = 0.55 + r() * 0.45;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + 0.5;
      p.setX(k, p.getX(k) * (1 - y * 0.85) + lean * y * y);
      p.setY(k, y * h);
    }
    b.rotateY(r() * Math.PI);
    b.translate((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    b.computeVertexNormals();
    parts.push(prep(b, (_x, y) => new THREE.Color().lerpColors(new THREE.Color("#2f5a2a"), new THREE.Color("#9cc45a"), y)));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

function branch(parts: THREE.BufferGeometry[], from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, r: () => number) {
  const to = from.clone().addScaledVector(dir, len);
  const c = new THREE.CylinderGeometry(rad * 0.7, rad, len, 5, 1, false);
  c.translate(0, len / 2, 0);
  c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  c.translate(from.x, from.y, from.z);
  parts.push(prep(c, (_x, y) => new THREE.Color(1, 1, 1).multiplyScalar(0.65 + Math.min(1, y) * 0.35)));
  if (depth === 0) {
    const s = new THREE.SphereGeometry(rad * 1.05, 6, 4);
    s.translate(to.x, to.y, to.z);
    parts.push(prep(s, 0xffffff));
    return;
  }
  const n = 2 + (r() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const d = dir.clone().add(new THREE.Vector3((r() - 0.5) * 1.3, 0.35 + r() * 0.3, (r() - 0.5) * 1.3)).normalize();
    branch(parts, to, d, len * (0.62 + r() * 0.2), rad * 0.72, depth - 1, r);
  }
}

/** Coral kinds. All sit on y = 0, about 1 unit tall; white-ish vertex colour, tinted per instance. */
export function coralGeos(): { geo: THREE.BufferGeometry; sway: number }[] {
  const out: { geo: THREE.BufferGeometry; sway: number }[] = [];
  // Branching (staghorn).
  {
    const r = mulberry32(21), parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) branch(parts, new THREE.Vector3((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3), new THREE.Vector3((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize(), 0.42, 0.07, 3, r);
    out.push({ geo: mergeGeometries(parts)!, sway: 0 });
  }
  // Brain coral: grooved dome.
  {
    const s = new THREE.SphereGeometry(0.6, 36, 18, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const p = s.getAttribute("position");
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const g = Math.sin(v.x * 16 + Math.sin(v.z * 9) * 2.2 + Math.cos(v.y * 7) * 1.5);
      v.multiplyScalar(1 + 0.045 * g);
      v.y *= 0.8;
      p.setXYZ(i, v.x, v.y - 0.1, v.z);
    }
    s.computeVertexNormals();
    out.push({ geo: prep(s, (x, y, z) => new THREE.Color(1, 1, 1).multiplyScalar(0.8 + 0.2 * Math.sin(x * 16 + Math.sin(z * 9) * 2.2 + Math.cos(y * 7) * 1.5))), sway: 0 });
  }
  // Sea fan: flat lattice of branches in the x-y plane.
  {
    const r = mulberry32(5), parts: THREE.BufferGeometry[] = [];
    const branch2 = (from: THREE.Vector3, ang: number, len: number, rad: number, d: number) => {
      const dir = new THREE.Vector3(Math.sin(ang), Math.cos(ang), 0);
      const to = from.clone().addScaledVector(dir, len);
      const c = new THREE.CylinderGeometry(rad * 0.7, rad, len, 3, 1);
      c.translate(0, len / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      c.translate(from.x, from.y, from.z);
      parts.push(prep(c, 0xffffff));
      if (d > 0) for (const s of [-1, 1]) branch2(to, ang + s * (0.25 + r() * 0.3), len * 0.75, rad * 0.75, d - 1);
    };
    branch2(new THREE.Vector3(), 0, 0.25, 0.05, 4);
    out.push({ geo: mergeGeometries(parts)!, sway: 0.08 });
  }
  // Tube sponges.
  {
    const r = mulberry32(9), parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.45 + r() * 0.7, rad = 0.09 + r() * 0.07;
      const c = new THREE.CylinderGeometry(rad * 1.15, rad, h, 10, 3, true);
      c.translate((r() - 0.5) * 0.45, h / 2, (r() - 0.5) * 0.45);
      parts.push(prep(c, (_x, y) => new THREE.Color(1, 1, 1).multiplyScalar(0.7 + 0.3 * (y / h))));
    }
    out.push({ geo: mergeGeometries(parts)!, sway: 0 });
  }
  // Anemone: a stubby column with a crown of swaying tentacles.
  {
    const r = mulberry32(13), parts: THREE.BufferGeometry[] = [];
    const col = new THREE.CylinderGeometry(0.2, 0.24, 0.25, 12);
    col.translate(0, 0.125, 0);
    parts.push(prep(col, 0x9a8a80));
    for (let i = 0; i < 34; i++) {
      const a = r() * Math.PI * 2, rr = r() * 0.18;
      const len = 0.35 + r() * 0.3;
      const t = new THREE.ConeGeometry(0.025, len, 4, 3);
      t.translate(0, len / 2, 0);
      t.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a) * rr * 2.5, 1, Math.sin(a) * rr * 2.5).normalize()));
      t.translate(Math.cos(a) * rr, 0.24, Math.sin(a) * rr);
      parts.push(prep(t, (_x, y) => new THREE.Color().lerpColors(new THREE.Color(0.8, 0.8, 0.8), new THREE.Color(1.3, 1.3, 1.3), Math.min(1, (y - 0.24) / 0.6))));
    }
    out.push({ geo: mergeGeometries(parts)!, sway: 0.18 });
  }
  return out;
}

export function rockGeo(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 1.6 + seed, v.z * 1.6 + v.y * 0.7, seed) * 0.45 + vnoise(v.x * 4 + seed, v.y * 4, seed + 1) * 0.12;
    v.multiplyScalar(0.8 + n);
    v.y = v.y * 0.62 + 0.2;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return prep(n, (_x, y) => new THREE.Color(1, 1, 1).multiplyScalar(0.8 + 0.2 * Math.min(1, Math.max(0, y))));
}

/** Jellyfish: bell y ∈ [0, 1], trailing tentacles y ∈ [−3, 0]. */
export function jellyGeo(): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const a = t * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a)) * (1 + 0.08 * Math.sin(t * 9)), Math.sin(a) * 0.9 + 0.02));
  }
  const bell = new THREE.LatheGeometry(prof, 20);
  const parts = [prep(bell, (_x, y) => new THREE.Color(1, 1, 1).multiplyScalar(0.7 + 0.5 * y))];
  const r = mulberry32(31);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const len = 1.8 + r() * 1.4;
    const t = new THREE.PlaneGeometry(0.06, len, 1, 8);
    t.translate(0, -len / 2, 0);
    t.rotateY(a + Math.PI / 2);
    t.translate(Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62);
    parts.push(prep(t, (_x, y) => new THREE.Color(1, 1, 1).multiplyScalar(1.2 + y * 0.15)));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const t = new THREE.PlaneGeometry(0.22, 1.4, 1, 6);
    t.translate(0, -0.7, 0);
    t.rotateY(a);
    t.translate(Math.cos(a) * 0.15, 0.1, Math.sin(a) * 0.15);
    parts.push(prep(t, 0xffffff));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}
