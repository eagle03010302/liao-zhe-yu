// Experimental electroacoustic voice, built around rhythm that never settles.
// Each drum pattern is read from the edges in a row of the photo: y picks the rows, x rotates
// them, and speed warps time and throws in fills, so moving keeps breaking the pulse.
// Under it: granulated raw pixels, sine pairs at the Chladni n:m ratio, and a metallic comb.
import { audio } from './audio';

const F0 = 41.2;
const LENGTHS = [16, 11, 7, 13]; // polymeter: the voices drift against each other
const DENSITY = [.25, .32, .38, .16];
const MASKS = [[1, 1, 0, 0], [1, 1, 1, 1], [0, 1, 1, 1], [1, 0, 0, 1], [1, 0, 1, 0], [0, 1, 0, 1]];
const HANN = Float32Array.from({ length: 32 }, (_, i) => Math.sin(Math.PI * i / 31) ** 2);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Pattern = { vel: Float32Array; lag: Float32Array };

// Hits sit on the strongest brightness edges along a row; pixel value becomes micro-timing.
function patternFrom(grid: Float32Array, cols: number, row: number, len: number, density: number): Pattern {
  const value = (i: number) => grid[row * cols + Math.floor(i / len * cols)];
  const edges = Array.from({ length: len }, (_, i) => ({ i, d: Math.abs(value(i) - value((i + len - 1) % len)) }));
  const wanted = Math.max(2, Math.round(len * density));
  const strong = edges.filter((e) => e.d > .015).sort((a, b) => b.d - a.d).slice(0, wanted);
  const vel = new Float32Array(len), lag = new Float32Array(len);
  for (const e of strong) vel[e.i] = .55 + Math.min(.45, e.d * 1.5);
  // Dark, edgeless rows would go silent: fall back to an evenly spread pattern.
  if (strong.length < 2) for (let i = 0; i < wanted; i++) vel[Math.floor(i * len / wanted)] = .6;
  for (let i = 0; i < len; i++) lag[i] = value(i) - .5;
  return { vel, lag };
}

export function createVoice(grids: Float32Array[], cols: number, rows: number) {
  const { ac, input, dry } = audio();
  let work = 0;

  const buffers = grids.map((grid) => {
    const buf = ac.createBuffer(1, grid.length, ac.sampleRate);
    const out = buf.getChannelData(0);
    let mean = 0, peak = .001;
    for (const v of grid) mean += v / grid.length;
    for (let i = 0; i < grid.length; i++) { out[i] = grid[i] - mean; peak = Math.max(peak, Math.abs(out[i])); }
    for (let i = 0; i < grid.length; i++) out[i] /= peak;
    return buf;
  });

  // Tone stage: everything passes through it, which is what keeps the top end from biting.
  const shelf = ac.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 2800;
  shelf.gain.value = -10;
  const top = ac.createBiquadFilter();
  top.frequency.value = 6000;
  top.Q.value = -3;
  const dryPath = ac.createGain(), wetPath = ac.createGain();
  dryPath.gain.value = .9;
  wetPath.gain.value = .16;
  shelf.connect(top);
  top.connect(dryPath).connect(dry);
  top.connect(wetPath).connect(input);

  const gate = ac.createGain();
  gate.gain.value = 0;
  gate.connect(shelf);
  const send = ac.createGain();

  // Dark echo, re-timed by the rhythm. It sits after the gate, so hits still trail off on release.
  const echoL = ac.createDelay(2), echoR = ac.createDelay(2), echoFb = ac.createGain(), echoLp = ac.createBiquadFilter(), echoOut = ac.createChannelMerger(2);
  echoFb.gain.value = .42;
  echoLp.frequency.value = 1500;
  echoLp.Q.value = -3;
  send.connect(echoL).connect(echoR).connect(echoLp).connect(echoFb).connect(echoL);
  echoL.connect(echoOut, 0, 0);
  echoR.connect(echoOut, 0, 1);
  const echoGain = ac.createGain();
  echoGain.gain.value = .5;
  echoOut.connect(echoGain).connect(shelf);

  // Metallic comb tuned by the mode, excited only by the data stabs.
  const combIn = ac.createGain(), combDelay = ac.createDelay(.2), combLp = ac.createBiquadFilter(), combSat = ac.createWaveShaper(), combFb = ac.createGain(), combOut = ac.createGain();
  combIn.gain.value = .3;
  combFb.gain.value = .84;
  combLp.frequency.value = 2000;
  combLp.Q.value = -6; // no resonant peak: a peak above unity gain would make the loop diverge
  combSat.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(i / 511.5 - 1));
  combOut.gain.value = .4;
  combIn.connect(combDelay).connect(combLp).connect(combSat).connect(combFb).connect(combDelay);
  combSat.connect(combOut).connect(shelf);

  // Low sine pair at n:m, beating slowly. This is the room's body, not a melody.
  const sineGain = ac.createGain();
  sineGain.gain.value = 0;
  sineGain.connect(gate);
  const sines = [0, 1].map(() => {
    const o = ac.createOscillator();
    o.connect(sineGain);
    o.start();
    return o;
  });

  const textureBus = ac.createGain();
  textureBus.gain.value = .22;
  const textureLp = ac.createBiquadFilter();
  textureLp.frequency.value = 2600;
  textureLp.Q.value = -3;
  textureBus.connect(textureLp).connect(gate);

  const noiseBuf = ac.createBuffer(1, ac.sampleRate * .2, ac.sampleRate);
  noiseBuf.getChannelData(0).forEach((_, i, d) => { d[i] = Math.random() * 2 - 1; });

  const envelope = (when: number, peak: number, decay: number) => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + .003);
    g.gain.exponentialRampToValueAtTime(.0005, when + decay);
    return g;
  };
  const panned = (node: AudioNode, pan: number) => {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    node.connect(p).connect(gate);
    return p;
  };

  let n = 2, m = 3, px = .5, py = .5, spd = 0;

  // The four voices of the kit.
  const thud = (when: number, v: number) => {
    const o = ac.createOscillator(), g = envelope(when, .8 * v, .24);
    o.frequency.setValueAtTime(F0 * 3, when);
    o.frequency.exponentialRampToValueAtTime(F0 * 1.3, when + .05);
    o.connect(g).connect(gate);
    o.start(when);
    o.stop(when + .26);
  };
  const knock = (when: number, v: number, pan: number) => {
    const f = F0 * Math.max(n, m) * [1, 1.5, 2][Math.floor(rand(0, 3))] * .75 + 70;
    const out = envelope(when, .34 * v, .1);
    [[f, 1], [f * 1.52, .45]].forEach(([freq, level]) => {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = freq;
      og.gain.value = level;
      o.connect(og).connect(out);
      o.start(when);
      o.stop(when + .12);
    });
    panned(out, pan).connect(send);
  };
  const tick = (when: number, v: number, pan: number) => {
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = envelope(when, .3 * v, .03);
    src.buffer = noiseBuf;
    bp.type = 'bandpass';
    bp.frequency.value = rand(700, 1900);
    bp.Q.value = 4;
    src.connect(bp).connect(g);
    panned(g, pan);
    src.start(when, rand(0, .15), .05);
  };
  // A short slice of the photo itself, as a pitched hit.
  const readAt = () => (Math.floor((1 - py) * (rows - 1)) * cols + Math.floor(px * (cols - 1))) / ac.sampleRate;
  const stab = (when: number, v: number, pan: number) => {
    const buf = buffers[work % buffers.length];
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), len = rand(.05, .11), g = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = rand(.45, 1.1);
    lp.frequency.value = rand(900, 2400);
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(HANN.map((h) => h * .55 * v), when, len);
    src.connect(lp).connect(g);
    const out = panned(g, pan);
    out.connect(send);
    out.connect(combIn);
    src.start(when, Math.min(buf.duration - .2, readAt()), .2);
    src.stop(when + len + .01);
  };
  const grain = (when: number) => {
    const buf = buffers[work % buffers.length];
    const src = ac.createBufferSource(), env = ac.createGain(), pan = ac.createStereoPanner(), len = rand(.04, .16);
    src.buffer = buf;
    src.playbackRate.value = rand(.35, 1.5);
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(HANN, when, len);
    pan.pan.value = rand(-.8, .8);
    src.connect(env).connect(pan).connect(textureBus);
    const at = Math.max(0, Math.min(buf.duration - .3, readAt() + rand(-.05, .05) * buf.duration));
    src.start(when, at, len * 2);
    src.stop(when + len + .01);
  };
  const VOICES = [
    (w: number, v: number) => thud(w, v),
    (w: number, v: number) => knock(w, v, rand(-.5, .5)),
    (w: number, v: number) => tick(w, v, rand(-.8, .8)),
    (w: number, v: number) => stab(w, v, rand(-.6, .6)),
  ];

  let down = false, patterns: Pattern[] = [], lastRow = -99;
  let step = 0, nextStep = 0, baseStep = .19, mask = MASKS[0], sectionLeft = 4, silence = 0;
  let nextGrain = 0, sinceFill = 9, still = 0;

  const rebuild = (row: number) => {
    lastRow = row;
    const grid = grids[work % grids.length];
    patterns = LENGTHS.map((len, v) => patternFrom(grid, cols, (row + v * Math.floor(rows / 5)) % rows, len, DENSITY[v]));
  };
  const tune = () => {
    const now = ac.currentTime;
    sines[0].frequency.setTargetAtTime(F0 * n, now, .08);
    sines[1].frequency.setTargetAtTime(F0 * m + rand(.15, 1.4), now, .08);
    combDelay.delayTime.setTargetAtTime(1 / (F0 * Math.max(n, m) * 1.5), now, .08);
  };
  const cut = (when: number, value: number) => {
    gate.gain.cancelScheduledValues(when);
    gate.gain.setValueAtTime(gate.gain.value, when);
    gate.gain.linearRampToValueAtTime(value, when + .004);
  };
  const retime = () => {
    const now = ac.currentTime;
    echoL.delayTime.setTargetAtTime(baseStep * 3, now, .1);
    echoR.delayTime.setTargetAtTime(baseStep * 2, now, .1);
  };
  const fill = (when: number) => {
    const count = 3 + Math.floor(rand(0, 4));
    let t = when, gap = rand(.05, .09);
    const voice = Math.random() < .6 ? 1 : 3;
    for (let i = 0; i < count; i++) {
      VOICES[voice](t, .5 + i * .08);
      t += gap;
      gap *= rand(.72, 1.15);
    }
    if (import.meta.env.DEV) (window as any).__fills = ((window as any).__fills ?? 0) + 1;
  };

  tune();
  retime();

  return {
    setWork(i: number) { work = i; lastRow = -99; },
    press(x: number, y: number) {
      down = true;
      px = x; py = y;
      silence = 0;
      still = 0;
      step = 0;
      baseStep = rand(.16, .24);
      mask = MASKS[Math.floor(rand(0, MASKS.length))];
      sectionLeft = rand(3, 7);
      const now = ac.currentTime;
      nextStep = nextGrain = now + .01;
      rebuild(Math.floor((1 - y) * (rows - 1)));
      retime();
      tune();
      cut(now, 1);
      sineGain.gain.setTargetAtTime(.07, now, .3);
      thud(now + .005, 1);
    },
    release() {
      if (!down) return;
      down = false;
      const now = ac.currentTime;
      sineGain.gain.setTargetAtTime(0, now, .25);
      gate.gain.cancelScheduledValues(now);
      gate.gain.setValueAtTime(gate.gain.value, now);
      gate.gain.setTargetAtTime(0, now + .25, .25);
      stab(now, .9, 0);
    },
    modeChanged(a: number, b: number) {
      n = a; m = b;
      tune();
      if (!down) return;
      // Crossing into a new figure pushes the pulse off its grid.
      nextStep += baseStep * rand(.2, .7);
      step += Math.floor(rand(1, 4));
    },
    update(dt: number, x: number, y: number, speed: number) {
      if (!down) return;
      px = x; py = y; spd = speed;
      const now = ac.currentTime;
      sectionLeft -= dt;
      sinceFill += dt;
      still = speed < .02 ? still + dt : 0;

      if (silence > 0) {
        silence -= dt;
        if (silence <= 0) { cut(now, 1); nextStep = nextGrain = now + .01; }
        return;
      }
      if (sectionLeft <= 0) {
        sectionLeft = rand(3, 8);
        mask = MASKS[Math.floor(rand(0, MASKS.length))];
        baseStep = rand(.13, .27);
        retime();
        tune();
        if (import.meta.env.DEV) (window as any).__sections = ((window as any).__sections ?? 0) + 1;
        if (Math.random() < .25) {
          silence = rand(.1, .4);
          cut(now, 0);
          return;
        }
      }

      const row = Math.floor((1 - y) * (rows - 1));
      if (Math.abs(row - lastRow) >= rows / 20) rebuild(row);
      const rotate = Math.floor(x * 16);
      if (speed > .3 && sinceFill > .45) {
        sinceFill = 0;
        fill(Math.max(now, nextStep));
        nextStep += baseStep * rand(.3, 1.2);
      }
      // Holding still lets a groove form, and it slowly mutates by itself.
      if (still > 2.5 && Math.random() < dt * .6) {
        const p = patterns[Math.floor(rand(0, patterns.length))];
        const i = Math.floor(rand(0, p.vel.length));
        p.vel[i] = p.vel[i] > 0 ? 0 : .6;
      }

      const horizon = now + .12;
      while (nextStep < horizon) {
        const dur = baseStep * (1 - .5 * speed) * (1 + .14 * Math.sin(now * .5));
        patterns.forEach((p, v) => {
          if (!mask[v]) return;
          const i = (step + rotate) % p.vel.length;
          if (p.vel[i] <= 0) return;
          const when = Math.max(now, nextStep + p.lag[i] * dur * .55);
          VOICES[v](when, p.vel[i]);
          if (import.meta.env.DEV) ((window as any).__hits ??= []).push(+when.toFixed(3));
        });
        step++;
        nextStep += dur;
      }
      const rate = 5 + speed * 14;
      while (nextGrain < horizon) {
        grain(Math.max(now, nextGrain));
        nextGrain += -Math.log(1 - Math.random()) / rate;
      }
    },
  };
}
