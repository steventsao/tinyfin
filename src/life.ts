import * as THREE from "three";
import { toon } from "./mat";
import { fishGeo, jellyGeo, prep } from "./geo";
import { height, biome } from "./terrain";
import { vnoise } from "./noise";

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3();

/** Orient +z along dir. */
function aim(m: THREE.Matrix4, pos: THREE.Vector3, dir: THREE.Vector3, sc: number, roll = 0) {
  _d.copy(dir);
  _d.y = THREE.MathUtils.clamp(_d.y, -0.9, 0.9);
  _d.normalize();
  m.lookAt(ZERO, _a.copy(_d).negate(), UP);
  if (roll) m.multiply(new THREE.Matrix4().makeRotationZ(roll));
  m.scale(_s.set(sc, sc, sc));
  m.setPosition(pos);
}

function spawnAround(out: THREE.Vector3, center: THREE.Vector3, fwd: THREE.Vector3, rMin: number, rMax: number, above = 3) {
  const a = Math.atan2(fwd.x, fwd.z) + (Math.random() - 0.5) * 2.4;
  const r = rMin + Math.random() * (rMax - rMin);
  out.set(center.x + Math.sin(a) * r, 0, center.z + Math.cos(a) * r);
  const h = height(out.x, out.z);
  out.y = THREE.MathUtils.lerp(h + above, -3, Math.random() * 0.8);
  return out;
}

const SCHOOL_KINDS = [
  { tint: "#9fd3ff", size: 0.45, n: 34 },
  { tint: "#ffd84a", size: 0.35, n: 26 },
  { tint: "#b8ffe9", size: 0.55, n: 22 },
  { tint: "#ff9ec2", size: 0.3, n: 30 },
  { tint: "#c9d6ff", size: 0.7, n: 16 },
  { tint: "#7cf0ff", size: 0.4, n: 28 },
];

interface Member { p: THREE.Vector3; v: THREE.Vector3; off: THREE.Vector3; dir: THREE.Vector3 }
interface School { c: THREE.Vector3; v: THREE.Vector3; size: number; start: number; n: number; seed: number; members: Member[] }

/** Shoals of small fish: each member springs toward a slot in its shoal and scatters from the player. */
export class Schools {
  readonly mesh: THREE.InstancedMesh;
  private list: School[] = [];
  constructor(scene: THREE.Scene, player: THREE.Vector3) {
    const geo = fishGeo((_x, y) => new THREE.Color().lerpColors(new THREE.Color("#f4f7f8"), new THREE.Color("#5c7ea0"), THREE.MathUtils.smoothstep(y, -0.06, 0.1)), "#b9cfe0");
    const total = SCHOOL_KINDS.reduce((a, k) => a + k.n, 0);
    this.mesh = new THREE.InstancedMesh(geo, toon({ vertexColors: true, id: 7, mask: 1, swim: true, swimAmp: 0.09, swimRate: 14, side: THREE.DoubleSide, rim: 0.9 }), total);
    this.mesh.frustumCulled = false;
    let start = 0;
    SCHOOL_KINDS.forEach((k, si) => {
      const s: School = { c: new THREE.Vector3(), v: new THREE.Vector3(), size: k.size, start, n: k.n, seed: si * 13.1, members: [] };
      spawnAround(s.c, player, new THREE.Vector3(Math.sin(si), 0, Math.cos(si)), 12, 60, 4);
      const tint = new THREE.Color(k.tint);
      for (let i = 0; i < k.n; i++) {
        const off = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 2).multiplyScalar(2 + k.n * 0.1);
        s.members.push({ p: s.c.clone().add(off), v: new THREE.Vector3(), off, dir: new THREE.Vector3(0, 0, 1) });
        this.mesh.setColorAt(start + i, tint.clone().multiplyScalar(0.85 + Math.random() * 0.3));
      }
      start += k.n;
      this.list.push(s);
    });
    scene.add(this.mesh);
  }

  update(dt: number, t: number, player: THREE.Vector3, fwd: THREE.Vector3, playerSpeed: number): void {
    for (const s of this.list) {
      // Wander: a slowly turning heading from noise, plus depth keeping.
      const ang = vnoise(t * 0.05 + s.seed, s.seed, 3) * 12;
      s.v.x += (Math.sin(ang) * 2.2 - s.v.x) * dt * 0.6;
      s.v.z += (Math.cos(ang) * 2.2 - s.v.z) * dt * 0.6;
      const floor = height(s.c.x, s.c.z);
      const want = Math.min(-3, floor + 3 + (vnoise(t * 0.03, s.seed, 5) * 8));
      s.v.y += (THREE.MathUtils.clamp(want - s.c.y, -1, 1) - s.v.y) * dt;
      s.c.addScaledVector(s.v, dt);
      if (s.c.distanceTo(player) > 110) spawnAround(s.c, player, fwd, 28, 55, 4);
      for (let i = 0; i < s.n; i++) {
        const f = s.members[i];
        if (f.p.distanceTo(s.c) > 60) f.p.copy(s.c).add(f.off);
        const w = Math.sin(t * 0.7 + i) * 0.6;
        _a.copy(s.c).add(f.off).addScalar(w * 0.3).sub(f.p);
        const acc = _a.multiplyScalar(1.4).addScaledVector(f.v, -1.1).addScaledVector(s.v, 1.1);
        _d.copy(f.p).sub(player);
        const dd = _d.length();
        const scare = 5 + playerSpeed * 0.6;
        if (dd < scare) acc.addScaledVector(_d.normalize(), (scare - dd) * 7);
        f.v.addScaledVector(acc, dt);
        const sp = f.v.length();
        if (sp > 9) f.v.multiplyScalar(9 / sp);
        f.p.addScaledVector(f.v, dt);
        const fl = height(f.p.x, f.p.z) + 0.6;
        if (f.p.y < fl) f.p.y = fl;
        if (f.p.y > -0.8) f.p.y = -0.8;
        if (sp > 0.05) f.dir.lerp(_d.copy(f.v).normalize(), 1 - Math.exp(-dt * 5));
        aim(_m, f.p, f.dir, s.size * (0.85 + (i % 5) * 0.06));
        this.mesh.setMatrixAt(s.start + i, _m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Glowing jellyfish, more of them in the deep. */
export class Jellies {
  readonly mesh: THREE.InstancedMesh;
  private js: { p: THREE.Vector3; sc: number; ph: number }[] = [];
  constructor(scene: THREE.Scene, player: THREE.Vector3) {
    const n = 26;
    this.mesh = new THREE.InstancedMesh(jellyGeo(), toon({ vertexColors: true, id: 8, mask: 0.6, jelly: true, swimAmp: 1, emissive: 0.45, side: THREE.DoubleSide, caustic: 0.2, rim: 1.4 }), n);
    this.mesh.frustumCulled = false;
    const cols = ["#ff9bd2", "#b69bff", "#8ff3ff", "#ffc3a0", "#e3a6ff"].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const p = spawnAround(new THREE.Vector3(), player, new THREE.Vector3(0, 0, 1), 8, 80, 5);
      this.js.push({ p, sc: 0.4 + Math.random() * 0.8, ph: Math.random() * 6.28 });
      this.mesh.setColorAt(i, cols[i % cols.length]);
    }
    scene.add(this.mesh);
  }
  update(dt: number, t: number, player: THREE.Vector3, fwd: THREE.Vector3): void {
    this.js.forEach((j, i) => {
      const pulse = Math.max(0, Math.sin(t * 2.2 + i * 1.618));
      j.p.y += (0.08 + pulse * 0.35) * dt * j.sc;
      j.p.x += Math.sin(t * 0.2 + i) * 0.15 * dt;
      const far = j.p.distanceTo(player) > 95;
      if (far || j.p.y > -2.5) {
        spawnAround(j.p, player, fwd, 40, 85, 4);
        // Favour the deep: retry once if we landed somewhere bright and shallow.
        if (biome(j.p.x, j.p.z).trench < 0.3 && Math.random() < 0.55) spawnAround(j.p, player, fwd, 40, 85, 4);
      }
      _q.setFromAxisAngle(UP, t * 0.1 + i);
      _m.compose(j.p, _q, _s.setScalar(j.sc));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Plankton motes to eat. Clusters of glowing orbs; eating one grows the fish a little. */
export class Motes {
  readonly mesh: THREE.InstancedMesh;
  private ms: { p: THREE.Vector3; base: THREE.Vector3; ph: number }[] = [];
  eaten = 0;
  constructor(scene: THREE.Scene, player: THREE.Vector3) {
    const n = 96;
    const g = prep(new THREE.IcosahedronGeometry(0.16, 1), 0xffffff);
    this.mesh = new THREE.InstancedMesh(g, toon({ vertexColors: true, id: 9, mask: -1, emissive: 1, rim: 0 }), n);
    this.mesh.frustumCulled = false;
    const cols = ["#d8ff8a", "#9dfcff", "#fff39a"].map((c) => new THREE.Color(c).multiplyScalar(0.5));
    for (let i = 0; i < n; i++) {
      this.ms.push({ p: new THREE.Vector3(), base: new THREE.Vector3(), ph: Math.random() * 6.28 });
      this.mesh.setColorAt(i, cols[i % 3]);
    }
    for (let c = 0; c < n / 8; c++) this.cluster(c, player, new THREE.Vector3(0, 0, 1), 6, 60);
    scene.add(this.mesh);
  }
  private cluster(c: number, player: THREE.Vector3, fwd: THREE.Vector3, rMin: number, rMax: number) {
    const ctr = spawnAround(new THREE.Vector3(), player, fwd, rMin, rMax, 2.5);
    for (let k = 0; k < 8; k++) {
      const m = this.ms[c * 8 + k];
      m.base.set(ctr.x + (Math.random() - 0.5) * 5, ctr.y + (Math.random() - 0.5) * 2.5, ctr.z + (Math.random() - 0.5) * 5);
      m.base.y = Math.min(m.base.y, -1.5);
      m.p.copy(m.base);
    }
  }
  /** Returns how many were eaten this frame. */
  update(t: number, mouth: THREE.Vector3, reach: number, player: THREE.Vector3, fwd: THREE.Vector3): number {
    let ate = 0;
    for (let c = 0; c < this.ms.length / 8; c++) {
      let alive = 0, far = true;
      for (let k = 0; k < 8; k++) {
        const i = c * 8 + k, m = this.ms[i];
        if (m.base.y > 50) continue;
        alive++;
        m.p.set(m.base.x + Math.sin(t * 0.8 + m.ph) * 0.3, m.base.y + Math.sin(t * 1.1 + m.ph * 2) * 0.25, m.base.z + Math.cos(t * 0.7 + m.ph) * 0.3);
        if (m.p.distanceTo(player) < 100) far = false;
        // Gentle pull toward a nearby mouth: food drifts in.
        const d = m.p.distanceTo(mouth);
        if (d < reach * 2.4) m.base.lerp(mouth, 0.04);
        if (d < reach) { m.base.y = 99; ate++; this.eaten++; }
        const pulse = 1 + 0.25 * Math.sin(t * 3 + m.ph);
        _m.compose(m.base.y > 50 ? _a.set(0, -9999, 0) : m.p, _q.identity(), _s.setScalar(pulse));
        this.mesh.setMatrixAt(i, _m);
      }
      if (alive === 0 || far) this.cluster(c, player, fwd, 30, 75);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return ate;
  }
}

/** Bubbles from the fish's mouth: a small pool of rising, wobbling spheres. */
export class Bubbles {
  readonly mesh: THREE.InstancedMesh;
  private bs: { p: THREE.Vector3; life: number; sc: number }[] = [];
  private next = 0;
  constructor(scene: THREE.Scene) {
    const n = 70;
    this.mesh = new THREE.InstancedMesh(prep(new THREE.SphereGeometry(0.06, 10, 8), "#e8fbff"), toon({ vertexColors: true, id: 10, mask: -1, emissive: 0.35, rim: 2.2, caustic: 0 }), n);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) this.bs.push({ p: new THREE.Vector3(0, -9999, 0), life: 0, sc: 1 });
    scene.add(this.mesh);
  }
  emit(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const b = this.bs[this.next];
      this.next = (this.next + 1) % this.bs.length;
      b.p.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, Math.random() * 0.15, (Math.random() - 0.5) * 0.15));
      b.life = 1;
      b.sc = 0.5 + Math.random() * 1.1;
    }
  }
  update(dt: number, t: number) {
    this.bs.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt * 0.14;
        b.p.y += dt * (1.1 + b.sc * 0.6);
        b.p.x += Math.sin(t * 6 + i) * dt * 0.25;
        if (b.p.y > -0.2) b.life = 0;
      }
      _m.compose(b.life > 0 ? b.p : _a.set(0, -9999, 0), _q.identity(), _s.set(b.sc, b.sc * (0.85 + 0.15 * Math.sin(t * 9 + i)), b.sc));
      this.mesh.setMatrixAt(i, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
