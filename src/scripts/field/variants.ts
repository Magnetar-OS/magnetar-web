/**
 * The field variants the hero can draw. Each takes its look from one of the
 * reference images in magnetar-art and keeps the same contract: eight app
 * tubes that `focus` can light, and a starquake that `flare` can set off.
 */
import { Group, NormalBlending } from 'three/webgpu';
import {
  cos,
  float,
  floor,
  fract,
  length,
  mix,
  mx_fractal_noise_float,
  pow,
  screenUV,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  TUBES,
  addHalo,
  addInstanced,
  addJets,
  addLineField,
  addStar,
  focusGain,
  glowMaterial,
  rgb,
  rnd,
  screenAngle,
  softDot,
  type FieldUniforms,
  type FieldVariant,
  type V3,
} from './shared';

type Rgb = readonly [number, number, number];

/** Backdrop colours are picked in sRGB; the renderer works in linear light. */
const srgb = (c: Rgb): Rgb => [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];

/** Radial vignette from `centre` to `edge`, centred at screen point `at`. */
const vignette = (centre: Rgb, edge: Rgb, at: [number, number] = [0.5, 0.42]) =>
  vec4(mix(rgb(srgb(centre)), rgb(srgb(edge)), smoothstep(0, 0.85, length(screenUV.sub(vec2(at[0], at[1]))))), 1);

/** Particles drifting outward and fading. */
const streaks: FieldVariant = {
  id: 'streaks',
  label: 'Streaks',
  note: 'Charged particles sliding along a tilted dipole, jets sweeping like a pulsar.',
  tiltDegrees: 24,
  spinPeriod: 14,
  cameraDistance: 25,
  background: () => vignette([0.04, 0.07, 0.15], [0.016, 0.024, 0.047]),
  build({ magnet, u, particles }) {
    addLineField(magnet, u, {
      count: Math.round(particles * 0.88),
      lMin: 1.45, lMax: 11, lBias: 1.7,
      tubeShare: 0.3, tubeL: [2.7, 0.86],
      flow: 0.075, length: [0.16, 0.29], width: 0.026,
      inner: [0.75, 0.89, 1], outer: [0.22, 0.44, 1],
      gain: 0.62,
    });
    addJets(magnet, u, {
      count: Math.round(particles * 0.12),
      reach: 15, spread: 1.3, length: 0.34, width: 0.026, speed: 0.08, gain: 0.8,
      color: [0.75, 0.89, 1],
    });
    addStar(magnet, u, { radius: 1, face: [0.93, 0.97, 1], rim: [0.45, 0.72, 1] });
  },
};

/** Continuous luminous lines, symmetric and wide. */
const bloom: FieldVariant = {
  id: 'bloom',
  label: 'Bloom',
  note: 'A dense, symmetric dipole of glowing threads with bright poles.',
  tiltDegrees: 0,
  spinPeriod: 40,
  cameraDistance: 22,
  background: () => vignette([0.03, 0.06, 0.16], [0.01, 0.015, 0.035]),
  build({ magnet, u, particles }) {
    addLineField(magnet, u, {
      count: Math.round(particles * 0.9),
      lines: 150,
      lMin: 1.25, lMax: 8, lBias: 1.25,
      tubeShare: 0.2, tubeL: [2.2, 0.62],
      flow: 0.05, length: [0.12, 0.22], width: 0.03,
      inner: [0.88, 0.96, 1], outer: [0.12, 0.32, 1],
      gain: 0.55,
      squash: 0.78,
    });
    addJets(magnet, u, {
      count: Math.round(particles * 0.1),
      reach: 5, spread: 0.7, length: 0.45, width: 0.035, speed: 0.2, gain: 1,
      color: [0.8, 0.92, 1],
    });
    addStar(magnet, u, { radius: 0.9, face: [0.9, 0.95, 1], rim: [0.55, 0.78, 1], granulation: 0.3 });
    addHalo(magnet, u, 7, [0.6, 0.8, 1], 1.2);
  },
};

/** Fine white wires tangled around a fractured crust, on teal. */
const filaments: FieldVariant = {
  id: 'filaments',
  label: 'Filaments',
  note: 'Thin tangled field lines around a fractured crust, on teal.',
  tiltDegrees: 12,
  spinPeriod: 60,
  cameraDistance: 17,
  background: () => vignette([0.1, 0.24, 0.28], [0.02, 0.06, 0.08], [0.5, 0.4]),
  build({ magnet, anchor, u, particles }) {
    addLineField(magnet, u, {
      count: Math.round(particles * 0.9),
      lines: 70,
      lMin: 1.6, lMax: 5.2, lBias: 0.9,
      tubeShare: 0.14, tubeL: [2.0, 0.4],
      flow: 0.012, length: [0.05, 0.08], width: 0.011,
      inner: [0.95, 0.97, 1], outer: [0.82, 0.92, 0.95],
      gain: 0.4,
      tangle: 1.1,
      writhe: 0.08,
    });
    addHalo(anchor, u, 16, [0.45, 0.75, 0.8], 0.8);
    addStar(magnet, u, { radius: 1.1, face: [0.95, 0.93, 0.95], rim: [0.72, 0.86, 0.9], veins: [1, 0.5, 0.56] });
  },
};

/** An edge-on disk of hot dust feeding twin jets. */
const disk: FieldVariant = {
  id: 'disk',
  label: 'Disk',
  note: 'An edge-on disk of glowing dust, the apps as its orbits, jets out of both poles.',
  tiltDegrees: 0,
  spinPeriod: 0,
  cameraDistance: 24,
  background: () => vignette([0.03, 0.04, 0.07], [0.01, 0.012, 0.02]),
  build({ anchor, u, particles }) {
    const frame = new Group();
    frame.rotation.set(0.07, 0, -0.38);
    anchor.add(frame);

    const count = Math.round(particles * 0.72);
    const isTube = step(rnd(0), float(0.08));
    const tube = floor(rnd(1).mul(TUBES));
    const fieldR = float(1.6).add(pow(rnd(2), float(1.2)).mul(10.5));
    const tubeR = float(2.6).add(tube.mul(0.9)).add(rnd(3).sub(0.5).mul(0.15));
    const r = mix(fieldR, tubeR, isTube);
    const angle = rnd(4).mul(2 * Math.PI).add(u.time.mul(1.8).div(pow(r, float(1.5))));
    const thickness = rnd(5).sub(0.5).mul(float(0.05).mul(pow(r, float(1.1))));
    const puff = float(1).add(u.flare.mul(0.35).mul(rnd(6)));
    const at = (a: typeof angle): V3 => vec3(cos(a).mul(r), thickness, sin(a).mul(r)).mul(puff);
    const pos = at(angle);

    // Glowing dust.
    const glow = glowMaterial();
    glow.positionNode = pos;
    glow.rotationNode = screenAngle(pos, at(angle.add(0.05)));
    glow.scaleNode = vec2(float(0.1).add(rnd(7).mul(0.22)), float(0.04).add(rnd(8).mul(0.06)));
    const hot = smoothstep(7, 1.8, r);
    const dust = mix(vec3(0.5, 0.2, 0.08), vec3(1, 0.62, 0.3), hot);
    const color = mix(dust, u.hues.element(tube.toInt()), isTube);
    const energy = focusGain(u, isTube, tube)
      .mul(u.intensity)
      .mul(float(1).add(u.flare.mul(1.4)))
      .mul(smoothstep(1.6, 2.2, r))
      .mul(mix(float(0.3), float(0.35), isTube));
    glow.colorNode = vec4(color.mul(energy).mul(softDot()), 1);
    addInstanced(frame, glow, count);

    // Dark lanes: a sparser layer of occluding dust over the glow.
    const lanes = glowMaterial();
    lanes.blending = NormalBlending;
    const laneR = float(3).add(rnd(12).mul(8.5));
    const laneAngle = rnd(13).mul(2 * Math.PI).add(u.time.mul(1.8).div(pow(laneR, float(1.5))));
    lanes.positionNode = vec3(cos(laneAngle).mul(laneR), rnd(14).sub(0.5).mul(0.25), sin(laneAngle).mul(laneR));
    lanes.scaleNode = vec2(float(0.35).add(rnd(15).mul(0.5)));
    lanes.colorNode = vec4(0.03, 0.02, 0.02, 1);
    lanes.opacityNode = softDot().mul(0.22).mul(float(1).sub(u.focusMix.mul(0.6)));
    const laneSprite = addInstanced(frame, lanes, Math.round(particles * 0.1));
    laneSprite.renderOrder = 2;

    addJets(frame, u, {
      count: Math.round(particles * 0.12),
      reach: 20, spread: 0.5, length: 0.6, width: 0.07, speed: 0.12, gain: 1.2,
      color: [0.6, 0.82, 1],
    });

    addLineField(frame, u, {
      count: Math.round(particles * 0.06),
      lines: 18,
      lMin: 1.3, lMax: 2.6, lBias: 1,
      tubeShare: 0, tubeL: [0, 0],
      flow: 0.1, length: [0.06, 0.1], width: 0.014,
      inner: [0.8, 0.92, 1], outer: [0.5, 0.7, 1],
      gain: 0.7,
    });
    addStar(frame, u, { radius: 0.55, face: [0.95, 0.98, 1], rim: [0.6, 0.8, 1] });
    addHalo(frame, u, 5, [0.7, 0.85, 1], 1.4);
    addHalo(frame, u, 10, [1, 0.55, 0.25], 0.3);
  },
};

/** A large bright star shedding a magnetised wind across violet nebula. */
const wind: FieldVariant = {
  id: 'wind',
  label: 'Wind',
  note: 'A bright star shedding a long plasma wind across a violet nebula.',
  tiltDegrees: 18,
  spinPeriod: 30,
  cameraDistance: 22,
  background: (u: FieldUniforms) => {
    const p = screenUV.mul(vec2(1.7, 1.1));
    const cloud = mx_fractal_noise_float(vec3(p, u.time.mul(0.01)), 4, 2, 0.5);
    const base = mix(rgb(srgb([0.07, 0.07, 0.2])), rgb(srgb([0.015, 0.02, 0.05])), smoothstep(0, 1, screenUV.y.oneMinus().add(screenUV.x.mul(0.3))));
    const violet = rgb(srgb([0.36, 0.16, 0.45])).mul(smoothstep(-0.35, 0.6, cloud)).mul(smoothstep(0.1, 0.9, screenUV.x.oneMinus()));
    return vec4(base.add(violet.mul(0.9)), 1);
  },
  origin: [4.5, 2],
  build({ magnet, anchor: star, u, particles }) {
    addLineField(magnet, u, {
      count: Math.round(particles * 0.4),
      lines: 60,
      lMin: 1.9, lMax: 5.5, lBias: 1,
      tubeShare: 0.35, tubeL: [2.2, 0.42],
      flow: 0.05, length: [0.08, 0.16], width: 0.02,
      inner: [0.8, 0.92, 1], outer: [0.35, 0.55, 1],
      gain: 0.7,
      tangle: 0.7,
      writhe: 0.06,
    });

    // The wind: particles leaving the star down and to the left, spreading and
    // curling as they go.
    const material = glowMaterial();
    const dir = vec3(-0.9, -0.42, 0.12).normalize();
    const side = vec3(0.42, -0.9, 0);
    const d = fract(rnd(2).add(u.time.mul(float(0.025).add(rnd(3).mul(0.03)))));
    const reach = d.mul(26).add(1.5);
    const spread = pow(d, float(0.55)).mul(7);
    const a = rnd(4).mul(2 * Math.PI).add(d.mul(3));
    const curl = sin(d.mul(9).add(u.time.mul(0.3)).add(rnd(5).mul(2))).mul(d).mul(0.9);
    const offset = side.mul(cos(a).mul(spread).add(curl)).add(vec3(0, 0, 1).mul(sin(a).mul(spread)));
    const blow = float(1).add(u.flare.mul(0.3));
    const pos = dir.mul(reach.mul(blow)).add(offset.mul(float(0.3).add(rnd(6).mul(0.7))));
    material.positionNode = pos;
    material.rotationNode = screenAngle(pos, pos.add(dir));
    material.scaleNode = vec2(float(0.4).add(rnd(7).mul(0.8)), float(0.05).add(d.mul(0.16)));
    const color = mix(vec3(0.55, 0.75, 1), vec3(0.4, 0.3, 1), smoothstep(0.05, 0.7, d));
    const energy = smoothstep(0, 0.05, d)
      .mul(float(1).sub(d))
      .mul(u.intensity)
      .mul(float(1).add(u.flare.mul(1.5)))
      .mul(float(1).sub(u.focusMix.mul(0.75)))
      .mul(0.045);
    material.colorNode = vec4(color.mul(energy).mul(softDot()), 1);
    addInstanced(star, material, Math.round(particles * 0.6));

    addStar(magnet, u, { radius: 1.6, face: [0.82, 0.9, 1], rim: [0.45, 0.7, 1], granulation: 0.25 });
    addHalo(star, u, 13, [0.55, 0.75, 1], 1.1);
  },
};

export const variants: readonly FieldVariant[] = [streaks, bloom, filaments, disk, wind];
