/**
 * Building blocks shared by the field variants.
 *
 * All particles are placed analytically in the vertex stage from nothing but
 * their instance index, so there are no buffers and no compute pass, and the
 * same code runs on the WebGPU and WebGL 2 backends.
 *
 * A dipole field line is the curve r = L·sin²θ at a fixed azimuth φ, where L
 * is the distance at which the line crosses the magnetic equator. It leaves
 * the star's surface (radius 1) where sin²θ = 1/L.
 */
import {
  AdditiveBlending,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  type Color,
  type Group,
} from 'three/webgpu';
import {
  Fn,
  PI,
  abs,
  asin,
  atan,
  cos,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  length,
  mix,
  modelViewMatrix,
  mx_worley_noise_float,
  normalView,
  positionLocal,
  positionView,
  pow,
  rotate,
  sin,
  smoothstep,
  sqrt,
  step,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

export type F = Node<'float'>;
export type V3 = Node<'vec3'>;
type Rgb = readonly [number, number, number];

export const makeUniforms = (hues: Color[], reducedMotion: boolean) => ({
  time: uniform(reducedMotion ? 37 : 0),
  /** 0‥1, a starquake decaying back to rest. */
  flare: uniform(0),
  /** Index of the lit app tube; meaningful only while focusMix > 0. */
  focus: uniform(-1),
  focusMix: uniform(0),
  /** Dimmed when the star is parked behind reading text. */
  intensity: uniform(1),
  hues: uniformArray<'color'>(hues, 'color'),
});

export type FieldUniforms = ReturnType<typeof makeUniforms>;

export interface FieldContext {
  /** The star's position; does not spin. */
  anchor: Group;
  /** Turns about the spin axis. */
  spin: Group;
  /** Tilted dipole frame inside `spin`. */
  magnet: Group;
  u: FieldUniforms;
  particles: number;
}

export interface FieldVariant {
  id: string;
  label: string;
  /** What the variant is drawn from, for the switcher's description. */
  note: string;
  tiltDegrees: number;
  /** Seconds per turn, or 0 when the frame holds still. */
  spinPeriod: number;
  cameraDistance: number;
  /** Where the star sits in the hero, in world units from the centre. */
  origin?: [x: number, y: number];
  build(ctx: FieldContext): void;
  /** Screen-space backdrop, drawn behind everything. */
  background(u: FieldUniforms): Node;
}

export const TUBES = 8;

/** Uniform random number in [0, 1) for this instance and stream `k`. */
export const rnd = (k: number): F => hash(instanceIndex.mul(7).add(k));

/** Uniform random number in [0, 1) seeded by a node, for per-line values. */
export const rndOf = (seed: F, k: number): F => hash(seed.mul(13).add(k));

export const rgb = (c: Rgb): V3 => vec3(c[0], c[1], c[2]);

/** Position on the dipole line (L, φ) at colatitude θ, in the magnetic frame. */
export const fieldPoint = (L: F, phi: F, theta: F): V3 => {
  const s = sin(theta);
  const r = L.mul(s).mul(s);
  return vec3(r.mul(s).mul(cos(phi)), r.mul(cos(theta)), r.mul(s).mul(sin(phi)));
};

/** Soft round falloff over a sprite's quad; stretched quads give soft streaks. */
export const softDot = (): F => smoothstep(1, 0, length(uv().sub(0.5).mul(2)));

/** Additive sprite material with the defaults every particle layer uses. */
export const glowMaterial = () =>
  new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });

export const addInstanced = (parent: Group, material: SpriteNodeMaterial, count: number): Sprite => {
  const sprite = new Sprite(material);
  sprite.count = count;
  sprite.frustumCulled = false;
  parent.add(sprite);
  return sprite;
};

/** Camera-facing angle of the segment a→b, for orienting a stretched sprite. */
export const screenAngle = (a: V3, b: V3): F =>
  Fn(() => {
    const pa = modelViewMatrix.mul(vec4(a, 1)).xy;
    const pb = modelViewMatrix.mul(vec4(b, 1)).xy;
    const t = pb.sub(pa);
    return atan(t.y, t.x);
  })() as F;

/** 1 when this particle is in the lit tube, blended in by focusMix. */
export const focusGain = (u: FieldUniforms, isTube: F, tube: F, dimOthers = 0.16, boost = 2.6): F => {
  const lit = isTube.mul(step(abs(tube.sub(u.focus)), float(0.5)));
  return mix(float(1), mix(float(dimOthers), float(boost), lit), u.focusMix);
};

export interface LineFieldOptions {
  count: number;
  /** Quantise particles onto this many discrete lines, so they read as threads. */
  lines?: number;
  lMin: number;
  lMax: number;
  /** >1 packs lines towards the star. */
  lBias: number;
  /** Share of particles on the eight app tubes. */
  tubeShare: number;
  tubeL: [first: number, step: number];
  /** Speed along the line. */
  flow: number;
  /** Sprite length and width, world units. */
  length: [min: number, max: number];
  width: number;
  inner: Rgb;
  outer: Rgb;
  gain: number;
  /** Radians of random tilt per line: tangles the field. */
  tangle?: number;
  /** Radians of slow sway per line. */
  writhe?: number;
  /** Squash the field vertically (1 = true dipole). */
  squash?: number;
}

/**
 * Closed dipole field: particles sliding along field lines, with a share of
 * them on eight app-coloured flux tubes that `focus` can light.
 */
export const addLineField = (parent: Group, u: FieldUniforms, o: LineFieldOptions) => {
  const material = glowMaterial();

  const isTube = step(rnd(0), float(o.tubeShare));
  const tube = floor(rnd(1).mul(TUBES));

  // A line is either this particle's own (continuous cloud) or one of `lines`.
  const line = o.lines ? floor(rnd(2).mul(o.lines)) : float(0);
  const lineRnd = (k: number): F => (o.lines ? rndOf(line, k) : rnd(10 + k));

  // As threads, each tube is three lines; as a cloud, a loose bundle.
  const tubeLine = floor(rnd(3).mul(3)).add(tube.mul(7));
  const tubeJitter = o.lines ? rndOf(tubeLine, 5) : rnd(3);

  const fieldL = float(o.lMin).add(pow(lineRnd(0), float(o.lBias)).mul(o.lMax - o.lMin));
  const tubeL = float(o.tubeL[0]).add(tube.mul(o.tubeL[1])).add(tubeJitter.sub(0.5).mul(0.2));
  const L = mix(fieldL, tubeL, isTube);
  const fieldPhi = lineRnd(1).mul(2 * Math.PI);
  const tubePhi = tube.mul((2 * Math.PI) / TUBES).add(0.35).add((o.lines ? rndOf(tubeLine, 6) : rnd(4)).sub(0.5).mul(0.18));
  const phi = mix(fieldPhi, tubePhi, isTube);

  const theta0 = asin(sqrt(float(1).div(L)));
  const speed = float(o.flow).mul(float(0.7).add(rnd(5).mul(0.6)));
  const forward = fract(rnd(6).add(u.time.mul(speed).div(sqrt(L))));
  const s = mix(forward, float(1).sub(forward), step(0.5, rnd(7)));
  const theta = mix(theta0, PI.sub(theta0), s);
  const blow = float(1).add(u.flare.mul(0.5).mul(rnd(8).add(0.3)));

  let pos = fieldPoint(L, phi, theta).mul(blow);
  let ahead = fieldPoint(L, phi, theta.add(0.02)).mul(blow);
  if (o.squash !== undefined) {
    const k = vec3(1, o.squash, 1);
    pos = pos.mul(k);
    ahead = ahead.mul(k);
  }
  if (o.tangle || o.writhe) {
    const sway = sin(u.time.mul(0.25).add(lineRnd(4).mul(40))).mul(o.writhe ?? 0);
    const euler = vec3(
      lineRnd(2).sub(0.5).mul(o.tangle ?? 0).add(sway),
      0,
      lineRnd(3).sub(0.5).mul(o.tangle ?? 0).sub(sway),
    );
    pos = rotate(pos, euler) as V3;
    ahead = rotate(ahead, euler) as V3;
  }

  material.positionNode = pos;
  material.rotationNode = screenAngle(pos, ahead);
  const near = float(1).div(length(pos).add(0.2));
  material.scaleNode = vec2(
    float(o.length[0]).add(rnd(9).mul(o.length[1] - o.length[0])),
    float(o.width).add(near.mul(o.width * 0.7)),
  );

  const fieldColor = mix(rgb(o.outer), rgb(o.inner), smoothstep(0.05, 0.6, near).mul(0.85).add(rnd(11).mul(0.15)));
  const color = mix(fieldColor, u.hues.element(tube.toInt()), isTube);
  const fade = smoothstep(0, 0.07, s).mul(smoothstep(1, 0.93, s));
  const energy = fade
    .mul(focusGain(u, isTube, tube))
    .mul(float(1).add(u.flare.mul(1.6)))
    .mul(u.intensity)
    .mul(float(0.55).add(near.mul(0.9)))
    .mul(o.gain);

  material.colorNode = vec4(color.mul(energy).mul(softDot()), 1);
  return addInstanced(parent, material, o.count);
};

export interface JetOptions {
  count: number;
  reach: number;
  spread: number;
  length: number;
  width: number;
  speed: number;
  gain: number;
  color: Rgb;
}

/** Open field lines streaming out along the magnetic axis, both poles. */
export const addJets = (parent: Group, u: FieldUniforms, o: JetOptions) => {
  const material = glowMaterial();
  const d = fract(rnd(2).add(u.time.mul(float(o.speed).mul(float(0.6).add(rnd(4).mul(0.8))))));
  const pole = step(0.5, rnd(6)).mul(2).sub(1);
  const spread = d.mul(d).mul(o.spread).mul(rnd(3));
  const angle = rnd(5).mul(2 * Math.PI);
  const dist = float(1.05).add(d.mul(o.reach)).mul(float(1).add(u.flare.mul(0.4)));
  const pos = vec3(cos(angle).mul(spread), pole.mul(dist), sin(angle).mul(spread));

  material.positionNode = pos;
  material.rotationNode = screenAngle(pos, pos.add(vec3(0, pole, 0)));
  material.scaleNode = vec2(float(o.length).mul(float(0.6).add(rnd(8).mul(0.8))), o.width);
  const fade = float(1).sub(d).mul(smoothstep(0, 0.04, d));
  const color = mix(rgb(o.color), vec3(1, 1, 1), float(1).sub(d));
  const energy = fade.mul(u.intensity).mul(float(1).add(u.flare.mul(1.6))).mul(float(1).sub(u.focusMix.mul(0.7))).mul(o.gain);
  material.colorNode = vec4(color.mul(energy).mul(softDot()), 1);
  return addInstanced(parent, material, o.count);
};

export interface StarOptions {
  radius: number;
  face: Rgb;
  rim: Rgb;
  /** Draw a crust of glowing fractures. */
  veins?: Rgb;
  /** Mottled surface brightness. */
  granulation?: number;
}

export const addStar = (parent: Group, u: FieldUniforms, o: StarOptions) => {
  const material = new MeshBasicNodeMaterial();
  const rim = float(1).sub(abs(normalView.dot(positionView.normalize().negate())));
  let color = mix(rgb(o.face), rgb(o.rim), pow(rim, float(1.6)));
  if (o.granulation) {
    const cells = mx_worley_noise_float(positionLocal.mul(3.5).add(u.time.mul(0.05)));
    color = color.mul(float(1).sub(cells.mul(o.granulation)));
  }
  if (o.veins) {
    // Worley F1 is near zero at a cell's centre and peaks along its borders.
    const edge = smoothstep(0.62, 0.8, mx_worley_noise_float(positionLocal.mul(3.2)));
    color = mix(color, rgb(o.veins), edge.mul(0.55));
  }
  material.colorNode = color.mul(float(1).add(u.flare.mul(0.8)));
  const star = new Mesh(new SphereGeometry(o.radius, 64, 40), material);
  parent.add(star);
  return star;
};

export const addHalo = (parent: Group, u: FieldUniforms, size: number, color: Rgb, strength = 1) => {
  const material = glowMaterial();
  const r = length(uv().sub(0.5).mul(2));
  const glow = pow(smoothstep(1, 0, r), float(3.2)).mul(0.45).add(pow(smoothstep(0.3, 0, r), float(2)).mul(0.3));
  material.colorNode = vec4(rgb(color).mul(glow).mul(u.intensity).mul(float(1).add(u.flare.mul(2))).mul(strength), 1);
  const halo = new Sprite(material);
  halo.scale.setScalar(size);
  parent.add(halo);
  return halo;
};
