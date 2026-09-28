/**
 * The stage behind the page: renderer, camera, frame loop, and whichever
 * field variant is showing. three.js' WebGPU renderer drops to WebGL 2 on its
 * own when WebGPU is missing.
 *
 * Frames: drift (follows the page) → anchor (the star's spot) → spin (turns
 * about the spin axis) → magnet (the dipole, tilted off the spin axis).
 */
import {
  AdditiveBlending,
  Color,
  Group,
  PerspectiveCamera,
  Scene,
  WebGPURenderer,
  type Material,
  type Mesh,
} from 'three/webgpu';
import { asin, cos, float, pow, sin, vec2, vec3, vec4 } from 'three/tsl';
import { addInstanced, glowMaterial, makeUniforms, rnd, softDot, type FieldVariant } from './shared';
import { variants } from './variants';

export { variants };

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Flux tube colours, one per app, in suite order. */
  tubeHues: readonly string[];
  particles: number;
  reducedMotion: boolean;
  variant: string;
}

export interface Stage {
  backend: 'WebGPU' | 'WebGL 2';
  particles: number;
  variant: FieldVariant;
  /** Swap the field for another variant; returns the one now showing. */
  show(id: string): FieldVariant;
  /** Light one app's flux tube, or pass -1 to show the whole field. */
  focus(index: number): void;
  /** A starquake: the field blows outward and settles back. */
  flare(): void;
  /** 0 = hero framing, 1 = star parked to the side behind reading text. */
  setDrift(value: number): void;
  /** Whether the field can be seen at all; while it can't, no frames are drawn. */
  setActive(value: boolean): void;
}

const pick = (id: string): FieldVariant => variants.find((v) => v.id === id) ?? variants[0]!;

export async function createStage(opts: StageOptions): Promise<Stage> {
  const { canvas, tubeHues, particles, reducedMotion } = opts;

  const renderer = new WebGPURenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  await renderer.init();
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  const u = makeUniforms(tubeHues.map((h) => new Color(h)), reducedMotion);

  const drift = new Group();
  scene.add(drift);

  // Distant stars, shared by every variant.
  const sky = glowMaterial();
  const lon = rnd(21).mul(2 * Math.PI);
  const lat = asin(rnd(22).mul(2).sub(1));
  sky.positionNode = vec3(cos(lat).mul(cos(lon)), sin(lat), cos(lat).mul(sin(lon))).mul(80);
  sky.scaleNode = vec2(float(0.1).add(pow(rnd(23), float(6)).mul(0.35)));
  const twinkle = float(0.6).add(sin(u.time.mul(0.7).add(rnd(24).mul(40))).mul(0.4));
  sky.colorNode = vec4(vec3(0.7, 0.8, 1).mul(softDot()).mul(twinkle).mul(0.5), 1);
  sky.blending = AdditiveBlending;
  const skyGroup = new Group();
  scene.add(skyGroup);
  addInstanced(skyGroup, sky, 1400);

  let variant = pick(opts.variant);
  let anchor = new Group();
  let spin = new Group();

  const dispose = (root: Group) => {
    root.traverse((o) => {
      // Every Sprite shares one module-level quad, so only meshes own theirs.
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
      ((o as Partial<Mesh>).material as Material | undefined)?.dispose();
    });
    root.removeFromParent();
  };

  let resize = () => {};

  const show = (id: string): FieldVariant => {
    dispose(anchor);
    variant = pick(id);
    anchor = new Group();
    spin = new Group();
    const magnet = new Group();
    magnet.rotation.z = (variant.tiltDegrees * Math.PI) / 180;
    spin.rotation.y = 0.9;
    const [ox, oy] = variant.origin ?? [0, 0];
    anchor.position.set(ox, oy, 0);
    anchor.add(spin);
    spin.add(magnet);
    drift.add(anchor);
    variant.build({ anchor, spin, magnet, u, particles });
    scene.backgroundNode = variant.background(u);
    resize();
    return variant;
  };

  // --- loop ----------------------------------------------------------------
  let focusTarget = 0;
  let flare = 0;
  let driftTarget = 0;
  let driftNow = 0;
  let pointerX = 0;
  let pointerY = 0;
  let camX = 0;
  let camY = 1.4;
  let dirty = true;

  resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole field in frame on narrow screens.
    camera.position.z = variant.cameraDistance * (w < h ? Math.min(1.9, h / w) : 1);
    camera.position.y = camY;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  };

  if (!reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      pointerX = e.clientX / window.innerWidth - 0.5;
      pointerY = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  let last = performance.now();
  const frame = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    const ease = (rate: number) => (reducedMotion ? 1 : 1 - Math.exp(-dt * rate));
    u.focusMix.value += (focusTarget - u.focusMix.value) * ease(5);
    driftNow += (driftTarget - driftNow) * ease(3);
    flare = Math.max(0, flare - dt * 0.55);
    u.flare.value = flare * flare * (3 - 2 * flare);

    // With reduced motion, time stands still and a frame is drawn only on change.
    if (reducedMotion && !dirty) return;
    dirty = false;

    if (!reducedMotion) {
      u.time.value += dt;
      if (variant.spinPeriod > 0) spin.rotation.y += (dt * 2 * Math.PI) / variant.spinPeriod;
      camX += (pointerX * 3 - camX) * ease(2);
      camY += (1.4 - pointerY * 2.4 - camY) * ease(2);
      camera.position.x = camX;
      camera.position.y = camY;
      camera.lookAt(0, 0, 0);
    }

    // Parked: slide the star right on wide screens, and dim it under the text.
    const wide = canvas.clientWidth >= 900;
    const [ox] = variant.origin ?? [0, 0];
    drift.position.x = driftNow * (wide ? (8.5 * variant.cameraDistance) / 25 - ox * 0.6 : 0);
    // Portrait: lift the star into the space above the hero text.
    drift.position.y = canvas.clientWidth < canvas.clientHeight ? 7 * (1 - driftNow) : 0;
    u.intensity.value = 1 - driftNow * (wide ? 0.45 : 0.72);

    renderer.render(scene, camera);
  };

  // With motion, draw every frame while the field can be seen. With reduced
  // motion nothing moves on its own, so draw one frame per change instead of
  // keeping a loop ticking. Either way, draw nothing while it can't be seen.
  let active = true;
  let queued = false;
  function schedule() {
    if (!reducedMotion) {
      renderer.setAnimationLoop(active ? frame : null);
    } else if (active && dirty && !queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        frame();
      });
    }
  }
  function invalidate() {
    dirty = true;
    if (reducedMotion) schedule();
  }

  new ResizeObserver(() => resize()).observe(canvas);
  show(variant.id);
  schedule();

  return {
    backend,
    particles,
    get variant() {
      return variant;
    },
    show,
    focus(index) {
      if (index >= 0) u.focus.value = index;
      focusTarget = index >= 0 ? 1 : 0;
      invalidate();
    },
    flare() {
      if (!reducedMotion) flare = 1;
    },
    setDrift(value) {
      driftTarget = value;
      invalidate();
    },
    setActive(value) {
      if (value === active) return;
      active = value;
      // Resume from now, so the first frame back doesn't count the pause.
      if (active) last = performance.now();
      schedule();
    },
  };
}
