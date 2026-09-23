import * as THREE from "three";
import { toon } from "./mat";
import { fishGeo } from "./geo";
import { height } from "./terrain";
import { vnoise, clamp } from "./noise";
import type { Input } from "./input";

const WHITE = new THREE.Color("#fbf6ee"), ORANGE = new THREE.Color("#ff7a2a"), BLACK = new THREE.Color("#1a1412"), BELLY = new THREE.Color("#ffc59a");

/** A clownfish-ish body: orange with three white bands, each edged in black. */
function clown(x: number, y: number, z: number): THREE.Color {
  const bands = [0.24, -0.02, -0.36];
  const w = [0.055, 0.07, 0.035];
  for (let i = 0; i < 3; i++) {
    const d = Math.abs(z - bands[i] - Math.sin(y * 8) * 0.015);
    if (d < w[i]) return WHITE.clone();
    if (d < w[i] + 0.022) return BLACK.clone();
  }
  if (z < -0.44) return BLACK.clone();
  return ORANGE.clone().lerp(BELLY, THREE.MathUtils.smoothstep(-y, 0.02, 0.16) * 0.6).multiplyScalar(1 + x * 0);
}

export class Player {
  readonly mesh: THREE.Mesh;
  readonly pos = new THREE.Vector3();
  readonly fwd = new THREE.Vector3(0, 0, 1);
  readonly mouth = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  speed = 3;
  /** Body length ≈ 1.3 × scale m: 0.27 makes a ~35 cm reef fish, so a 25 m blue whale is ~70 of you. */
  static readonly BASE = 0.27;
  scale = Player.BASE;
  distance = 0;
  /** Gallery mode: hold still unless W is pressed. */
  hover = false;
  private roll = 0;
  private phase = 0;
  private yawRate = 0;
  private mat = toon({ vertexColors: true, id: 11, mask: 1, swim: true, side: THREE.DoubleSide, rim: 1.1, caustic: 0.8 });

  constructor(scene: THREE.Scene) {
    const g = fishGeo(clown, "#ff9a4a");
    // Fins get black tips via the same colour pass: tail and fins are the 'fin' colour already.
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.rotation.order = "YXZ";
    this.pos.set(0, Math.min(-4, height(0, 0) + 6), 0);
    scene.add(this.mesh);
  }

  update(dt: number, t: number, inp: Input, auto: boolean): void {
    let steerX = 0, steerY = 0, thrust = 0;
    if (auto) {
      // Autopilot: a slowly wandering heading that stays a few metres off the floor.
      const target = (vnoise(t * 0.04, 3.3) - 0.5) * 7;
      steerX = clamp((target - this.yaw) * 0.8, -1, 1) * 0.6;
      const ahead = height(this.pos.x + this.fwd.x * 8, this.pos.z + this.fwd.z * 8);
      const want = Math.min(-3, Math.max(ahead, height(this.pos.x, this.pos.z)) + 5 + vnoise(t * 0.05, 7) * 6);
      this.pitch += (clamp((want - this.pos.y) * 0.08, -0.5, 0.5) - this.pitch) * dt * 1.5;
      thrust = 0.4;
    } else {
      const m = inp.mouseSteer();
      steerX = (inp.down("KeyA") || inp.down("ArrowLeft") ? 1 : 0) - (inp.down("KeyD") || inp.down("ArrowRight") ? 1 : 0);
      steerX += inp.touch.x + m.x;
      steerY = (inp.down("Space") || inp.down("KeyE") ? 1 : 0) - (inp.down("KeyC") || inp.down("KeyQ") || inp.down("ControlLeft") ? 1 : 0);
      steerY += inp.touch.y + m.y;
      thrust = inp.down("KeyW") || inp.down("ArrowUp") || inp.touch.active ? 1 : inp.down("KeyS") || inp.down("ArrowDown") ? -1 : 0;
    }
    this.yawRate += (steerX * 1.7 - this.yawRate) * (1 - Math.exp(-dt * 6));
    this.yaw += this.yawRate * dt;
    this.pitch = clamp(this.pitch + steerY * 1.3 * dt, -1.2, 1.2);

    const boost = !auto && (inp.down("ShiftLeft") || inp.down("ShiftRight"));
    const cruise = this.hover ? 0 : 2.2;
    const target = boost ? 8 : thrust > 0 ? 2.2 + thrust * 2.8 : thrust < 0 ? 0.4 * (this.hover ? 0 : 1) : cruise;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (target > this.speed ? 2.2 : 1.4)));

    const cp = Math.cos(this.pitch);
    this.fwd.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.pos.addScaledVector(this.fwd, this.speed * dt);
    this.distance += this.speed * dt;

    // The floor and the surface are hard limits; the fish noses away from both.
    const floor = height(this.pos.x, this.pos.z) + 0.9 * this.scale;
    if (this.pos.y < floor) { this.pos.y = floor; if (this.pitch < 0) this.pitch *= 0.85; }
    if (this.pos.y > -1.0) { this.pos.y = -1.0; if (this.pitch > 0) this.pitch *= 0.85; }

    this.roll += (-this.yawRate * 0.35 - this.roll) * (1 - Math.exp(-dt * 4));
    this.phase += dt * (5 + this.speed * 1.6);
    this.mat.uniforms.uSwimPhase.value = this.phase;
    this.mat.uniforms.uSwimAmp.value = 0.05 + Math.min(this.speed, 8) * 0.01;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-this.pitch, this.yaw, this.roll);
    this.mesh.scale.setScalar(this.scale);
    this.mouth.copy(this.pos).addScaledVector(this.fwd, 0.5 * this.scale);
  }
}
