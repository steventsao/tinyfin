import * as THREE from "three";
import { toon } from "./mat";
import { biome, height } from "./terrain";
import { coralGeos, grassGeo, kelpGeo, rockGeo } from "./geo";
import { mulberry32, smoothstep, vnoise } from "./noise";

export const CHUNK = 56;
const SEG = 28;
const RADIUS = 2;

const CORAL_COLS = ["#ff7a8a", "#ff9f5a", "#ffd166", "#c77dff", "#6fe0c0", "#ff5d8f", "#f6a5c0", "#8fc8ff", "#ff6b4a"].map((c) => new THREE.Color(c));
const SAND = new THREE.Color("#ead9ac"), REEF_SAND = new THREE.Color("#f0d3b6"), KELP_SAND = new THREE.Color("#c3c08f");
const ROCK = new THREE.Color("#7f8b86"), DEEP = new THREE.Color("#34445a"), DEEP_ROCK = new THREE.Color("#252f40");

interface Chunk { group: THREE.Group; terrain: THREE.BufferGeometry; inst: THREE.InstancedMesh[] }

/** An endless seafloor: 5×5 chunks around the fish, built from position, recycled by distance. */
export class World {
  private chunks = new Map<string, Chunk>();
  private queue: [number, number][] = [];
  private terrainMat = toon({ vertexColors: true, id: 2, mask: 0.55, rim: 0.15 });
  private kelp = { geo: kelpGeo(), mat: toon({ vertexColors: true, id: 3, mask: 0.6, sway: 1.3, side: THREE.DoubleSide, caustic: 0.4 }) };
  private grass = { geo: grassGeo(), mat: toon({ vertexColors: true, id: 4, mask: -1, sway: 0.18, side: THREE.DoubleSide, caustic: 0.5 }) };
  private corals = coralGeos().map((c) => ({ geo: c.geo, mat: toon({ vertexColors: true, id: 5, mask: 1, sway: c.sway, side: c.sway ? THREE.DoubleSide : THREE.FrontSide, rim: 0.8 }) }));
  private rocks = [rockGeo(1), rockGeo(2)].map((g) => ({ geo: g, mat: toon({ vertexColors: true, color: "#8d958e", id: 6, mask: 0.9, rim: 0.3 }) }));

  constructor(private scene: THREE.Scene) {}

  get programs(): THREE.Material[] {
    return [this.terrainMat, this.kelp.mat, this.grass.mat, ...this.corals.map((c) => c.mat), ...this.rocks.map((r) => r.mat)];
  }

  update(x: number, z: number, budget = 2): void {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (const [k, c] of this.chunks) {
      const [ix, iz] = k.split(",").map(Number);
      if (Math.abs(ix - cx) > RADIUS + 1 || Math.abs(iz - cz) > RADIUS + 1) {
        this.scene.remove(c.group);
        c.terrain.dispose();
        c.inst.forEach((m) => m.dispose());
        this.chunks.delete(k);
      }
    }
    this.queue.length = 0;
    for (let dz = -RADIUS; dz <= RADIUS; dz++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const k = `${cx + dx},${cz + dz}`;
        if (!this.chunks.has(k)) this.queue.push([cx + dx, cz + dz]);
      }
    this.queue.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cz) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2));
    for (let i = 0; i < Math.min(budget, this.queue.length); i++) this.build(this.queue[i][0], this.queue[i][1]);
  }

  private build(ix: number, iz: number): void {
    const x0 = ix * CHUNK, z0 = iz * CHUNK;
    const group = new THREE.Group();
    const inst: THREE.InstancedMesh[] = [];

    // Terrain, with analytic normals so neighbouring chunks meet without a seam.
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    g.translate(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
    const p = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const h = height(x, z);
      p.setY(i, h);
      const e = 0.6;
      n.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
      const b = biome(x, z);
      c.copy(SAND).lerp(REEF_SAND, b.reef).lerp(KELP_SAND, b.kelp * 0.8);
      c.lerp(ROCK, smoothstep(0.82, 0.62, n.y));
      c.lerp(DEEP, b.trench * 0.85);
      c.lerp(DEEP_ROCK, b.trench * smoothstep(0.85, 0.6, n.y));
      c.multiplyScalar(0.92 + vnoise(x / 3, z / 3, 4) * 0.16);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.deleteAttribute("uv");
    group.add(new THREE.Mesh(g, this.terrainMat));

    const rnd = mulberry32((ix * 73856093) ^ (iz * 19349663));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const place = (tries: number, accept: (x: number, z: number) => number, set: (x: number, y: number, z: number, list: { m: THREE.Matrix4; c: THREE.Color }[]) => void) => {
      const list: { m: THREE.Matrix4; c: THREE.Color }[] = [];
      for (let i = 0; i < tries; i++) {
        const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
        if (rnd() > accept(x, z)) continue;
        set(x, height(x, z), z, list);
      }
      return list;
    };
    const emit = (geo: THREE.BufferGeometry, mat: THREE.Material, list: { m: THREE.Matrix4; c: THREE.Color }[]) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((e, i) => { im.setMatrixAt(i, e.m); im.setColorAt(i, e.c); });
      im.computeBoundingSphere();
      if (im.boundingSphere) im.boundingSphere.radius += 3;
      group.add(im);
      inst.push(im);
    };

    // Kelp forests: tall, in stands.
    emit(this.kelp.geo, this.kelp.mat, place(160, (x, z) => { const b = biome(x, z); return b.kelp * 0.9 * smoothstep(0.35, 0.6, vnoise(x / 18, z / 18, 8)) + b.reef * 0.03; }, (x, y, z, l) => {
      const h = 9 + rnd() * 14;
      q.setFromAxisAngle(up, rnd() * 6.28);
      s.set(1 + rnd() * 0.6, Math.min(h, -y - 2), 1 + rnd() * 0.6);
      l.push({ m: new THREE.Matrix4().compose(v.set(x, y - 0.2, z), q, s), c: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.3) });
    }));

    // Seagrass meadows on sand.
    emit(this.grass.geo, this.grass.mat, place(260, (x, z) => { const b = biome(x, z); return (b.flats * 0.7 + b.kelp * 0.5 + b.reef * 0.25) * smoothstep(0.4, 0.62, vnoise(x / 9, z / 9, 12)); }, (x, y, z, l) => {
      q.setFromAxisAngle(up, rnd() * 6.28);
      const k = 0.9 + rnd() * 1.1;
      s.set(k * 1.4, k, k * 1.4);
      l.push({ m: new THREE.Matrix4().compose(v.set(x, y - 0.05, z), q, s), c: new THREE.Color(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.4) });
    }));

    // Coral: dense on the reef, sparse elsewhere, never in the deep.
    this.corals.forEach((cg, k) => {
      const weight = [0.55, 0.4, 0.35, 0.35, 0.3][k];
      emit(cg.geo, cg.mat, place(110, (x, z) => { const b = biome(x, z); return (b.reef * weight + b.kelp * 0.03 + b.flats * 0.02) * (0.4 + 0.6 * smoothstep(0.3, 0.6, vnoise(x / 11, z / 11, 20 + k))); }, (x, y, z, l) => {
        q.setFromAxisAngle(up, rnd() * 6.28);
        const sc = (k === 1 ? 0.8 : 1.1) * (0.6 + rnd() * 1.4) * (k === 2 ? 1.8 : 1);
        s.set(sc, sc * (0.8 + rnd() * 0.5), sc);
        const cc = CORAL_COLS[Math.floor(rnd() * CORAL_COLS.length)].clone().multiplyScalar(0.85 + rnd() * 0.3);
        l.push({ m: new THREE.Matrix4().compose(v.set(x, y - 0.1, z), q, s), c: cc });
      }));
    });

    // Rocks everywhere; bigger and darker in the deep.
    this.rocks.forEach((rg, k) => {
      emit(rg.geo, rg.mat, place(10, (x, z) => 0.5 + biome(x, z).trench * 0.5, (x, y, z, l) => {
        const b = biome(x, z);
        q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4));
        const sc = (0.5 + rnd() * 2.2) * (1 + b.trench * 1.5) * (k ? 1 : 0.7);
        s.set(sc * (1 + rnd() * 0.6), sc * (0.6 + rnd() * 0.6), sc);
        const cc = new THREE.Color(1, 1, 1).lerp(new THREE.Color("#8fa0b8"), b.trench).multiplyScalar(0.75 + rnd() * 0.35);
        l.push({ m: new THREE.Matrix4().compose(v.set(x, y - sc * 0.2, z), q, s), c: cc });
      }));
    });

    m.identity();
    this.scene.add(group);
    this.chunks.set(`${ix},${iz}`, { group, terrain: g, inst });
  }
}
