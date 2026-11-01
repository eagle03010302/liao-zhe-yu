// One AudioContext per page: everything feeds `input`, which goes dry and through a long
// synthetic room, then a limiter. Browsers only allow it to start from a user gesture.
let engine: ReturnType<typeof build> | undefined;

function build() {
  const ac = new AudioContext();
  const input = ac.createGain();
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 12;

  const room = ac.createConvolver();
  const seconds = 3.6;
  const impulse = ac.createBuffer(2, ac.sampleRate * seconds, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = impulse.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3.2;
  }
  room.buffer = impulse;
  const wet = ac.createGain();
  wet.gain.value = 0.42;

  input.connect(limiter);
  input.connect(room).connect(wet).connect(limiter);
  limiter.connect(ac.destination);

  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  limiter.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const level = () => {
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const v of buf) s += v * v;
    return Math.sqrt(s / buf.length);
  };
  if (import.meta.env.DEV) {
    (window as any).__level = level;
    (window as any).__analyser = analyser;
  }
  return { ac, input, dry: limiter as AudioNode, level, analyser };
}

export function audio() {
  engine ??= build();
  engine.ac.resume();
  return engine;
}

// Reads an image into a luminance grid, so pages can turn a photo's pixels into sound.
export function pixels(src: string, w: number, h: number) {
  return new Promise<Float32Array>((done) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      const r = img.naturalWidth / img.naturalHeight, k = (w / h) / r;
      const sw = k > 1 ? img.naturalWidth : img.naturalWidth * k;
      const sh = k > 1 ? img.naturalHeight / k : img.naturalHeight;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const out = new Float32Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) / 255;
      done(out);
    };
    img.src = src;
  });
}
