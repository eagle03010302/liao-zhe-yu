// Plumbing for the home page: one work on screen at a time, moved with wheel,
// arrows or the next button, and small WebGL helpers.
export function gallery(count: number, onChange: (i: number, prev: number) => void, swipe = true) {
  const caps = [...document.querySelectorAll<HTMLElement>('.cap')];
  let i = 0, locked = false, wheel = 0, sx = 0, sy = 0;
  const show = () => caps.forEach((c, n) => c.classList.toggle('on', n === i));
  const go = (d: number) => {
    if (locked) return;
    const prev = i;
    i = (i + d + count) % count;
    locked = true;
    setTimeout(() => (locked = false), 1300);
    show();
    onChange(i, prev);
  };
  addEventListener('wheel', (e) => {
    wheel += e.deltaY + e.deltaX;
    if (Math.abs(wheel) < 50) return;
    go(Math.sign(wheel));
    wheel = 0;
  }, { passive: true });
  addEventListener('keydown', (e) => {
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) go(1);
    if (['ArrowUp', 'ArrowLeft'].includes(e.key)) go(-1);
  });
  addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = sx - t.clientX, dy = sy - t.clientY;
    const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (Math.abs(d) > 40) go(Math.sign(d));
  }, { passive: true });
  document.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', () => go(1)));
  show();
}

export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export function program(gl: WebGLRenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  gl.useProgram(p);
  return Object.assign((name: string) => gl.getUniformLocation(p, name), { use: () => gl.useProgram(p) });
}

export function fit(gl: WebGLRenderingContext) {
  const c = gl.canvas as HTMLCanvasElement;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 1.5);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    gl.viewport(0, 0, c.width, c.height);
  };
  addEventListener('resize', resize);
  resize();
}

export type Tex = { tex: WebGLTexture; aspect: number };

export function loadAll(gl: WebGLRenderingContext, srcs: string[]) {
  return Promise.all(srcs.map((src) => new Promise<Tex>((done) => {
    const img = new Image();
    img.onload = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      done({ tex, aspect: img.naturalWidth / img.naturalHeight });
    };
    img.src = src;
  })));
}

export function bind(gl: WebGLRenderingContext, unit: number, t: Tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
}

export const srcs = () => [...document.querySelectorAll<HTMLElement>('.cap')].map((c) => c.dataset.src!);

export const QUAD_VS = `attribute vec2 s; varying vec2 v; void main(){ v=s*.5+.5; gl_Position=vec4(s,0.,1.); }`;

export const NOISE = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=.5; } return s; }
`;

export const COVER = `
vec2 cov(vec2 u,float r,float rs){ float k=rs/r;
  return k>1. ? vec2(u.x,(u.y-.5)/k+.5) : vec2((u.x-.5)*k+.5,u.y); }
`;
