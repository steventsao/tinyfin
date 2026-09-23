import * as THREE from "three";
import { COMMON, FX_OUT, G } from "./mat";

/** Everything at "infinite" distance follows the camera: the water volume, the surface, rays, snow. */
export class Fx {
  private back: THREE.Mesh;
  private surface: THREE.Mesh;
  private rays: THREE.Mesh;
  private snow: THREE.Points;
  readonly pxScale = { value: 400 };

  constructor(scene: THREE.Scene) {
    // Water volume: the same colour function the fog fades into, so distance has no edge.
    this.back = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { ...G },
        vertexShader: /* glsl */ `out vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `precision highp float; ${COMMON} ${FX_OUT} in vec3 vW;
          void main(){ vec3 d = normalize(vW - cameraPosition); gColor = vec4(waterColor(d, cameraPosition.y), 1.0); gNormal = vec4(0.5, 0.5, 0.0, -1.0); }`,
      }),
    );
    this.back.renderOrder = -10;
    this.back.frustumCulled = false;
    scene.add(this.back);

    // The underside of the surface: Snell's window overhead, total internal reflection beyond it.
    const sg = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    sg.rotateX(Math.PI / 2);
    this.surface = new THREE.Mesh(
      sg,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        side: THREE.DoubleSide,
        uniforms: { ...G },
        vertexShader: /* glsl */ `out vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `precision highp float; ${COMMON} ${FX_OUT} in vec3 vW;
          void main(){
            vec3 d = vW - cameraPosition; float dist = length(d); vec3 dir = d / dist;
            vec2 p = vW.xz; float t = uTime;
            vec2 g = vec2(sin(p.x * 0.35 + t * 0.9 + sin(p.y * 0.2)) + 0.5 * sin(p.x * 0.9 - p.y * 0.5 + t * 1.4),
                          cos(p.y * 0.3 - t * 0.8 + sin(p.x * 0.25)) + 0.5 * cos(p.y * 0.8 + p.x * 0.6 - t * 1.2));
            float cw = dir.y + (g.x * dir.x + g.y * dir.z) * 0.07;
            float win = smoothstep(0.6, 0.7, cw);
            float depthK = exp(cameraPosition.y * 0.025);
            // Bright wobbling light lines inside the window, cel-cut.
            float l = sin(p.x * 0.6 + g.y * 1.6 + t) * sin(p.y * 0.55 + g.x * 1.6 - t * 0.8);
            float lines = 1.0 - smoothstep(0.0, 0.12 + fwidth(l) * 1.5, abs(l));
            vec3 sky = uSurf * (1.05 + 0.35 * lines);
            vec3 sunD = normalize(vec3(uSunDir.x * 0.4, 1.0, uSunDir.z * 0.4));
            sky += uSunCol * smoothstep(0.985, 0.995, dot(dir, sunD) + g.x * 0.004) * 2.5;
            vec3 refl = waterColor(vec3(dir.x, -dir.y, dir.z), cameraPosition.y) * (0.9 + 0.2 * lines);
            vec3 edge = uSurf * 0.7 * smoothstep(0.52, 0.62, cw) * (1.0 - win);
            vec3 c = mix(refl + edge, sky, win) * mix(0.35, 1.0, depthK);
            float f = fogF(dist * 0.55);
            c = mix(c, waterColor(dir, cameraPosition.y), f);
            gColor = vec4(c, 1.0);
            gNormal = vec4(0.5, 0.5, 0.0, -1.0);
          }`,
      }),
    );
    this.surface.frustumCulled = false;
    scene.add(this.surface);

    // God rays: long additive ribbons hanging from the surface along the refracted sun.
    const N = 46;
    const base = new THREE.PlaneGeometry(1, 1, 1, 10);
    base.translate(0, -0.5, 0);
    const rg = new THREE.InstancedBufferGeometry();
    rg.index = base.index;
    rg.setAttribute("position", base.getAttribute("position"));
    const off = new Float32Array(N * 4), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      off[i * 4] = (Math.random() - 0.5) * 160;
      off[i * 4 + 1] = (Math.random() - 0.5) * 160;
      off[i * 4 + 2] = 1.5 + Math.random() * 7;
      off[i * 4 + 3] = 35 + Math.random() * 60;
      ph[i] = Math.random();
    }
    rg.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 4));
    rg.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 1));
    rg.instanceCount = N;
    this.rays = new THREE.Mesh(
      rg,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { ...G },
        vertexShader: /* glsl */ `${COMMON}
          in vec4 aOff; in float aPh; out float vA; out vec2 vUv;
          void main(){
            float R = 80.0;
            vec2 rel = mod(aOff.xy - cameraPosition.xz + R, 2.0 * R) - R;
            vec2 b = cameraPosition.xz + rel;
            vec3 top = vec3(b.x, 0.0, b.y);
            vec3 dn = normalize(vec3(-uSunDir.x * 0.35, -1.0, -uSunDir.z * 0.35));
            vec3 ctr = top + dn * (-position.y * aOff.w);
            vec3 toCam = cameraPosition - ctr;
            vec3 side = normalize(cross(dn, toCam));
            vec3 w = ctr + side * position.x * aOff.z;
            float edge = 1.0 - smoothstep(0.65 * R, R, length(rel));
            float near = smoothstep(1.5, 9.0, length(toCam));
            float flick = 0.55 + 0.45 * sin(uTime * 0.35 + aPh * 6.28) * sin(uTime * 0.23 + aPh * 11.0);
            vA = edge * near * flick * (1.0 - fogF(length(toCam)) * 0.6);
            vUv = vec2(position.x + 0.5, -position.y);
            gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
          }`,
        fragmentShader: /* glsl */ `precision highp float; ${COMMON} ${FX_OUT} in float vA; in vec2 vUv;
          void main(){
            float a = vA * sin(vUv.x * 3.14159) * pow(1.0 - vUv.y, 1.7) * smoothstep(0.0, 0.05, vUv.y);
            gColor = vec4(mix(uSurf, uSunCol, 0.5) * 0.11 * uRays, a);
            gNormal = vec4(0.0);
          }`,
      }),
    );
    this.rays.frustumCulled = false;
    this.rays.renderOrder = 10;
    scene.add(this.rays);

    // Marine snow: a box of drifting motes that wraps around the camera.
    const SN = 2600;
    const sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      sp[i * 3] = (Math.random() - 0.5) * 60;
      sp[i * 3 + 1] = (Math.random() - 0.5) * 60;
      sp[i * 3 + 2] = (Math.random() - 0.5) * 60;
      ss[i] = 0.03 + Math.random() * 0.07;
    }
    const sg2 = new THREE.BufferGeometry();
    sg2.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg2.setAttribute("aS", new THREE.BufferAttribute(ss, 1));
    this.snow = new THREE.Points(
      sg2,
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...G, uPx: this.pxScale },
        vertexShader: /* glsl */ `${COMMON} uniform float uPx; in float aS; out float vA;
          void main(){
            vec3 R = vec3(30.0);
            vec3 p = position + vec3(sin(uTime * 0.1 + position.y) * 0.6, -uTime * 0.12, cos(uTime * 0.13 + position.x) * 0.6);
            vec3 rel = mod(p - cameraPosition + R, 2.0 * R) - R;
            vec3 w = cameraPosition + rel;
            vec4 mv = viewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = max(1.0, aS * uPx / -mv.z);
            vA = (1.0 - smoothstep(14.0, 30.0, length(rel))) * step(w.y, -0.3) * smoothstep(0.5, 2.0, -mv.z);
          }`,
        fragmentShader: /* glsl */ `precision highp float; ${COMMON} ${FX_OUT} in float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.15, d) * vA;
            gColor = vec4(mix(uSurf, vec3(1.0), 0.3) * 0.45, a);
            gNormal = vec4(0.0);
          }`,
      }),
    );
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 11;
    scene.add(this.snow);
  }

  update(cam: THREE.Camera): void {
    this.back.position.copy(cam.position);
    this.surface.position.set(cam.position.x, 0, cam.position.z);
  }
}
