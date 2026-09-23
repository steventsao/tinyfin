import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const FS_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Scene → MRT (colour, normal/id/mask, depth) → [water wobble + paint filter + ink] → bloom →
 * [grade, vignette, paper grain, sRGB] → CAS sharpen.
 */
export class Post {
  readonly mrt: THREE.WebGLRenderTarget;
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private ink: ShaderPass;
  private grade: ShaderPass;
  private sharpen: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number, opts: { kuwahara: boolean; msaa: number }) {
    const pr = renderer.getPixelRatio();
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.mrt = new THREE.WebGLRenderTarget(W, H, {
      count: 2,
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(W, H, THREE.UnsignedIntType),
      samples: opts.msaa,
    });
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);

    this.ink = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tColor: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        uRes: { value: new THREE.Vector2(W, H) },
        uNear: { value: 0.1 },
        uFar: { value: 1500 },
        uWidth: { value: Math.max(1, H / 1080) * 1.3 },
        uKuwa: { value: opts.kuwahara ? 1 : 0 },
        uTime: { value: 0 },
        uInk: { value: new THREE.Color("#0a1a2c") },
      },
      vertexShader: FS_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tNormal, tDepth;
        uniform vec2 uRes; uniform float uNear, uFar, uWidth, uKuwa, uTime; uniform vec3 uInk;
        varying vec2 vUv;
        float linz(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
        float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
        // Scrub NaN/Inf and negatives from the scene target: one bad pixel must not blacken the frame.
        vec3 safe(vec3 c){ return (c.r >= 0.0 && c.r < 1e4 && c.g >= 0.0 && c.g < 1e4 && c.b >= 0.0 && c.b < 1e4) ? c : vec3(0.0); }
        vec3 samp(vec2 uv){ return safe(texture2D(tColor, uv).rgb); }
        vec4 kuwahara(vec2 uv){
          vec2 px = 1.0 / uRes;
          vec3 m[4]; float s[4];
          for (int k = 0; k < 4; k++){
            vec2 dir = vec2(k == 1 || k == 2 ? -1.0 : 1.0, k >= 2 ? -1.0 : 1.0);
            vec3 sum = vec3(0.0); float sq = 0.0;
            for (int j = 0; j <= 2; j++) for (int i = 0; i <= 2; i++){
              vec3 c = samp(uv + vec2(float(i), float(j)) * dir * px);
              sum += c; float l = lum(c); sq += l * l;
            }
            vec3 mean = sum / 9.0; float lm = lum(mean);
            m[k] = mean; s[k] = sq / 9.0 - lm * lm;
          }
          vec3 best = m[0]; float bs = s[0];
          for (int k = 1; k < 4; k++) if (s[k] < bs) { bs = s[k]; best = m[k]; }
          return vec4(best, bs);
        }
        void main(){
          // Underwater: the whole picture breathes a little.
          vec2 uv = vUv + vec2(sin(vUv.y * 17.0 + uTime * 1.3), cos(vUv.x * 13.0 + uTime * 1.1)) * 0.0011;
          vec2 px = uWidth / uRes;
          vec3 col = samp(uv);
          float dC = linz(texture2D(tDepth, uv).r);
          float iC = 1.0 / dC;
          vec4 nC = texture2D(tNormal, uv);
          float eD = 0.0, eN = 0.0, eI = 0.0, mask = max(nC.a, 0.0);
          vec2 offs[4];
          offs[0] = vec2(1.0, 0.0); offs[1] = vec2(0.0, 1.0); offs[2] = vec2(0.7071, 0.7071); offs[3] = vec2(0.7071, -0.7071);
          for (int i = 0; i < 4; i++){
            vec2 o = offs[i] * px;
            vec4 n1 = texture2D(tNormal, uv + o), n2 = texture2D(tNormal, uv - o);
            if (n1.a < 0.0 || n2.a < 0.0) continue;
            float i1 = 1.0 / linz(texture2D(tDepth, uv + o).r);
            float i2 = 1.0 / linz(texture2D(tDepth, uv - o).r);
            // Laplacian of 1/z is zero on planes: only creases and silhouettes light up.
            eD = max(eD, abs(i1 + i2 - 2.0 * iC) / iC);
            eN = max(eN, length(n1.xy - nC.xy) + length(n2.xy - nC.xy));
            eI = max(eI, step(0.01, abs(n1.z - nC.z)) + step(0.01, abs(n2.z - nC.z)));
            mask = max(mask, max(n1.a, n2.a));
          }
          if (nC.a < 0.0) mask = 0.0;
          float e = max(smoothstep(0.05, 0.18, eD), smoothstep(0.6, 1.05, eN));
          e = max(e, min(eI, 1.0));
          if (uKuwa > 0.5) {
            float wK = 0.55 * smoothstep(4.0, 30.0, dC) * (1.0 - clamp(e * 1.5, 0.0, 1.0));
            if (wK > 0.02) {
              vec4 k = kuwahara(uv);
              wK *= 1.0 - smoothstep(0.0015, 0.012, k.a);
              col = mix(col, k.rgb, wK);
            }
          }
          e *= clamp(mask, 0.0, 1.0) * (1.0 - smoothstep(25.0, 110.0, dC) * 0.85);
          vec3 inkCol = mix(col * 0.25, uInk, 0.55);
          col = mix(col, inkCol, clamp(e, 0.0, 1.0) * 0.9);
          gl_FragColor = vec4(clamp(safe(col), 0.0, 32.0), 1.0);
        }`,
    });
    // ShaderPass clones uniforms and render-target textures don't clone: bind them afterwards.
    this.ink.uniforms.tColor.value = this.mrt.textures[0];
    this.ink.uniforms.tNormal.value = this.mrt.textures[1];
    this.ink.uniforms.tDepth.value = this.mrt.depthTexture;
    this.composer.addPass(this.ink);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.42, 0.5, 0.85);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(W, H) }, uSat: { value: 1.08 } },
      vertexShader: FS_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uSat;
        varying vec2 vUv;
        float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
        vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          if (!(c.r >= 0.0 && c.r < 1e4 && c.g >= 0.0 && c.g < 1e4 && c.b >= 0.0 && c.b < 1e4)) c = vec3(0.0);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          // Split tone: deep blue-teal shadows, soft aqua-cream highlights.
          c *= mix(vec3(0.92, 1.0, 1.08), vec3(1.02, 1.0, 0.93), smoothstep(0.08, 0.8, l));
          c = c / (1.0 + max(c - 0.85, 0.0) * 0.8);
          vec3 s = toSRGB(c);
          vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
          s *= mix(1.0, 0.72, smoothstep(0.4, 1.05, length(q)));
          vec2 fc = gl_FragCoord.xy;
          float paper = vn(fc * 0.35) * 0.5 + vn(fc * 0.09 + 7.0) * 0.5;
          float fib = vn(vec2(fc.x * 0.02, fc.y * 0.6));
          s *= 0.975 + paper * 0.04 + fib * 0.012;
          s += (h12(fc) - 0.5) * 0.012;
          gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
        }`,
    });
    this.composer.addPass(this.grade);

    this.sharpen = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) } },
      vertexShader: FS_VS,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform vec2 uTexel;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
          vec3 s = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
          vec3 w = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
          vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
          vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
          vec3 wgt = -amp * 0.15;
          gl_FragColor = vec4(clamp((c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0), 1.0);
        }`,
    });
    this.composer.addPass(this.sharpen);
  }

  setSize(w: number, h: number): void {
    const pr = this.renderer.getPixelRatio();
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.mrt.setSize(W, H);
    // The composer keeps its own pixel ratio: without this, a resolution change leaves black blocks.
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.setSize(Math.floor(W / 2), Math.floor(H / 2));
    this.ink.uniforms.uRes.value.set(W, H);
    this.ink.uniforms.uWidth.value = Math.max(1, H / 1080) * 1.3;
    this.grade.uniforms.uRes.value.set(W, H);
    this.sharpen.uniforms.uTexel.value.set(1 / W, 1 / H);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): void {
    const rd = this.renderer;
    this.ink.uniforms.uNear.value = camera.near;
    this.ink.uniforms.uFar.value = camera.far;
    this.ink.uniforms.uTime.value = time;
    rd.setRenderTarget(this.mrt);
    rd.clear();
    rd.render(scene, camera);
    rd.setRenderTarget(null);
    this.composer.render();
  }
}
