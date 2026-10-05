// The drink is drawn at 30 fps in cup coordinates. Cream filters are baked into image
// assets; ice and bubbles share one canvas instead of hundreds of masked SVG animations.
import scene from './swig-data.js';

const frame = document.getElementById('frame');
const slide = frame.querySelector('.s-swig');
const cup = slide.querySelector('.cup-hybrid');
const fluid = cup.querySelector('.cup-fluid');
const water = cup.querySelector('.cup-condensation');
const ctx = fluid.getContext('2d');
const wet = water.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const W = 866, H = 1816, TOP = 440, HEIGHT = H - TOP;
const shape = new Path2D(scene.shape);
// Ice can emerge above the soda, up underneath the photographed lid. Keep the
// tapered cup walls, but don't give floating nuggets the liquid's flat upper edge.
const iceBounds = new Path2D('M96 460Q434 440 770 460L666 1675Q662 1716 620 1734Q437 1808 234 1735Q203 1724 200 1684Z');
const scratch = document.createElement('canvas');
const iceCtx = scratch.getContext('2d');
const opacity = [.46, .43, .42];
const clamp = n => Math.max(0, Math.min(1, n));
const mix = (a, b, p) => a + (b - a) * p;
const cycle = (t, duration, phase = 0) => ((t + phase) % duration) / duration;
const smooth = p => p * p * (3 - 2 * p);
let scale = .5, ready = false, raf = 0, last = 0, drawnAt = 0, wetAt = 0, clock = 0;
let active = false, restart = false, images, cream, base, absorption, shading, sheen, masks;

// Match the existing fill easing, sampled once instead of solving a cubic for every frame.
const easeTable = Array.from({ length: 257 }, (_, i) => {
  const x = i / 256;
  let lo = 0, hi = 1;
  for (let j = 0; j < 15; j++) {
    const t = (lo + hi) / 2;
    const at = 3 * (1 - t) ** 2 * t * .4 + 3 * (1 - t) * t * t * .2 + t ** 3;
    if (at < x) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  return 3 * (1 - t) * t * t + t ** 3;
});
function ease(p) {
  p = clamp(p) * 256;
  const i = Math.min(255, Math.floor(p));
  return mix(easeTable[i], easeTable[i + 1], p - i);
}
function load(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}
function bitmap(img, width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  c.getContext('2d').drawImage(img, 0, 0, width, height);
  return c;
}
function gradient(c, points, stops) {
  const g = c.createLinearGradient(...points);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}
function texture(paint) {
  const c = document.createElement('canvas');
  c.width = fluid.width; c.height = fluid.height;
  const p = c.getContext('2d');
  p.setTransform(scale, 0, 0, scale, 0, -TOP * scale);
  paint(p);
  return c;
}
function coat(c, points, stops) {
  c.fillStyle = gradient(c, points, stops);
  c.fill(shape);
}
function cacheLayers() {
  base = texture(c => coat(c, [100, 502, 180, 1768], [[0,'#B58048'],[.16,'#8A4923'],[.42,'#412013'],[.7,'#160B07'],[1,'#090503']]));
  absorption = texture(c => coat(c, [0,500,0,1740], [[0,'#8D4F204D'],[.35,'#49200975'],[.75,'#1B0A04A3'],[1,'#0B0402BD']]));
  shading = texture(c => {
    coat(c, [100,0,766,0], [[0,'#3A1B0E5C'],[.12,'#E6B46C29'],[.35,'#DA9C551F'],[.68,'#50230914'],[.9,'#34150859'],[1,'#FFC07840']]);
    coat(c, [0,1030,0,1750], [[0,'#09040100'],[.6,'#09040142'],[1,'#05030299']]);
  });
  sheen = gradient(ctx, [0,505,0,618], [[0,'#F5D6A04D'],[.35,'#DAAD702B'],[1,'#BC854900']]);
  masks = [
    texture(c => {
      c.fillStyle = gradient(c,[0,720,0,1490],[[0,'#FFFFFF'],[.5,'#FFFFFFCC'],[.75,'#FFFFFF99'],[1,'#FFFFFF00']]);
      c.fillRect(80,690,710,800);
    }),
    texture(c => {
      c.fillStyle = gradient(c,[0,500,0,945],[[0,'#FFFFFF'],[.35,'#FFFFFF'],[.7,'#FFFFFFAA'],[1,'#FFFFFF00']]);
      c.fillRect(0,TOP,W,990-TOP);
    })
  ];
}
function resize() {
  // Limit both pixel density and absolute size: 3x phone screens must not triple the work.
  const width = Math.min(600, Math.max(240, Math.round(cup.clientWidth * Math.min(1.5, devicePixelRatio || 1))));
  // A canvas starts at 300px wide, which is also a common phone cup size.
  // The first visit still needs its textures and correct height initialized.
  if (fluid.width === width && base) return;
  scale = width / W;
  for (const c of [fluid, water, scratch]) { c.width = width; c.height = Math.round(HEIGHT * scale); }
  cacheLayers();
  if (ready && active) draw(reduce.matches ? 4 : clock, true);
}
function clear(c) {
  c.setTransform(1,0,0,1,0,0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0,0,fluid.width,fluid.height);
  c.setTransform(scale,0,0,scale,0,-TOP * scale);
}
function layer(c, image) { c.drawImage(image,0,TOP,W,HEIGHT); }

// Interpolate the original wave shape only during filling. Idle keeps a settled meniscus.
const waves = [
  [60,538,184,517,306,554,434,538,682,521,806,540],
  [60,549,188,570,307,507,434,529,680,568,806,531],
  [60,527,184,550,309,545,434,522,680,554,806,552],
  [60,533,187,510,307,524,434,550,680,540,806,528],
  [60,538,184,524,306,523,434,524,682,525,806,540]
];
const settled = new Path2D('M60 538C184 524 306 523 434 524S682 525 806 540V1850H60Z');
function wave(p) {
  if (p >= 1) return settled;
  const n = clamp(p) * 4, i = Math.min(3, Math.floor(n)), k = smooth(n - i);
  const v = waves[i].map((x,j) => mix(x,waves[i+1][j],k));
  return new Path2D(`M${v[0]} ${v[1]}C${v.slice(2,8).join(' ')}S${v.slice(8).join(' ')}V1850H60Z`);
}
const iceFrames = [[0,-.45,.25,-.4],[.25,.3,-.4,.25],[.55,1,1,1],[.8,-.15,.5,-.15],[1,-.45,.25,-.4]];
function drawIce(deep, t, rise) {
  clear(iceCtx);
  for (const nugget of scene.ice) {
    if (nugget.deep !== deep) continue;
    const p = cycle(t,nugget.time,nugget.phase);
    let i = 0;
    while (iceFrames[i+1][0] < p) i++;
    const a = iceFrames[i], b = iceFrames[i+1], k = smooth((p-a[0])/(b[0]-a[0]));
    const tx = nugget.x * mix(a[1],b[1],k), ty = nugget.y * mix(a[2],b[2],k);
    const angle = nugget.turn * mix(a[3],b[3],k) * Math.PI/180;
    const co = Math.cos(angle), si = Math.sin(angle), m = nugget.m;
    const x = 7 + tx - 7*co + 7*si, y = 7 + ty - 7*si - 7*co;
    iceCtx.setTransform(scale*(m[0]*co+m[2]*si),scale*(m[1]*co+m[3]*si),scale*(-m[0]*si+m[2]*co),scale*(-m[1]*si+m[3]*co),scale*(m[0]*x+m[2]*y+m[4]),scale*(m[1]*x+m[3]*y+m[5]-TOP));
    iceCtx.globalAlpha = opacity[nugget.image];
    iceCtx.drawImage(images[nugget.image],-6,-6,26,26);
  }
  iceCtx.setTransform(1,0,0,1,0,0);
  iceCtx.globalAlpha = 1;
  iceCtx.globalCompositeOperation = 'destination-in';
  iceCtx.drawImage(masks[deep ? 0 : 1],0,0);
  ctx.drawImage(scratch,0,TOP+rise,W,HEIGHT);
}
function drawCream(t) {
  const poured = ease((t-.65)/2.6);
  ctx.save();
  ctx.translate(0,390*(1-poured));
  ctx.rotate(8*(1-poured)*Math.PI/180);
  ctx.scale(mix(.95,1,poured),mix(.86,1,poured));
  for (let i=0; i<2; i++) {
    const k = .5-.5*Math.cos(cycle(t,i ? 14 : 17,i ? 2 : 4)*2*Math.PI);
    ctx.save();
    const x = i ? mix(28,-36,k) : mix(-24,32,k), y = i ? mix(38,-54,k) : mix(-46,48,k);
    const pivotX = i ? 469 : 437, pivotY = i ? 895 : 864;
    ctx.translate(pivotX+x,pivotY+y);
    ctx.rotate((i ? mix(6,-7,k) : mix(-6,6,k))*Math.PI/180);
    ctx.scale(i ? mix(1.06,.93,k) : mix(.95,1.05,k), i ? mix(.96,1.08,k) : mix(1.06,.96,k));
    ctx.globalAlpha = (i ? mix(.6,.86,k) : mix(.64,.88,k))*mix(.55,1,poured);
    ctx.drawImage(cream[i],-pivotX,-pivotY,W,H);
    ctx.restore();
  }
  ctx.restore();
}
const bubble = document.createElement('canvas');
bubble.width = bubble.height = 24;
{
  const b = bubble.getContext('2d'), g = b.createRadialGradient(8,7,0,12,12,10);
  g.addColorStop(0,'#FFF0CACC'); g.addColorStop(.35,'#E6BA790A'); g.addColorStop(1,'#F9DEA98C');
  b.fillStyle=g; b.strokeStyle='#FFE0B085'; b.lineWidth=1.3;
  b.beginPath(); b.arc(12,12,9,0,Math.PI*2); b.fill(); b.stroke();
}
function drawBubbles(t) {
  for (const [x,y,r,rise,drift,time,delay] of scene.bubbles) {
    const p = cycle(t,time,-delay), travel = p*p*(1.3-.3*p);
    const size = r*mix(.55,1.12,p)*2.65;
    ctx.globalAlpha = Math.min(p/.12,(1-p)/.08,1)*.7;
    ctx.drawImage(bubble,x+drift*travel-size/2,y+rise*travel-size/2,size,size);
  }
  ctx.globalAlpha=1;
}

// Sample six winding paths once, then grow their wakes and move larger beads along them.
const runs = scene.water.map(run => {
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',run.path);
  const length = path.getTotalLength();
  return {...run,points:Array.from({length:101},(_,i)=>{const p=path.getPointAtLength(i/100*length);return [p.x,p.y];})};
});
const bead = document.createElement('canvas');
bead.width = 40; bead.height = 64;
{
  const b = bead.getContext('2d'); b.translate(20,29); b.scale(3,3);
  const g=b.createRadialGradient(-2,0,0,0,4,9);
  g.addColorStop(0,'#FFFDF585');g.addColorStop(.25,'#F2E5D00F');g.addColorStop(.7,'#27150B52');g.addColorStop(1,'#FFF3DA6B');
  b.fillStyle=g;b.fill(new Path2D('M0-9C-1-5-5 0-5 5C-5 12 5 12 5 5C5 0 1-5 0-9Z'));
  b.strokeStyle='#FFFCEFA6';b.lineWidth=1.1;b.lineCap='round';b.stroke(new Path2D('M-2.6 1Q-4.1 5-2.1 7'));
  b.strokeStyle='#1A0B0559';b.lineWidth=.8;b.stroke(new Path2D('M2.8 3Q4.2 7 1.5 8.8'));
}
const waterFrames = [[0,0,0,0],[.08,.015,.12,.55],[.28,.12,.35,.75],[.42,.18,.42,.8],[.66,.52,.55,.88],[.86,.87,.48,.7],[.94,1,.34,0],[1,1,0,0]];
function drawWater(t) {
  clear(wet); wet.save(); wet.clip(shape);
  wet.lineCap='round';wet.lineJoin='round';
  for (const run of runs) {
    const p=cycle(t,run.time,run.phase);
    let i=0;while(waterFrames[i+1][0]<p)i++;
    const a=waterFrames[i],b=waterFrames[i+1],k=(p-a[0])/(b[0]-a[0]);
    const distance=mix(a[1],b[1],k)*100,at=Math.min(99,Math.floor(distance));
    const x=mix(run.points[at][0],run.points[at+1][0],distance-at),y=mix(run.points[at][1],run.points[at+1][1],distance-at);
    wet.save();wet.translate(run.x,run.y);
    wet.beginPath();wet.moveTo(0,0);
    for(let n=1;n<=at;n++)wet.lineTo(...run.points[n]);
    wet.lineTo(x,y);
    wet.globalAlpha=mix(a[2],b[2],k);
    wet.strokeStyle='#1F100833';wet.lineWidth=5.2;wet.stroke();
    wet.strokeStyle='#FFF7E638';wet.lineWidth=2.6;wet.stroke();
    wet.translate(-1,0);wet.strokeStyle='#FFF9E947';wet.lineWidth=1.3;wet.stroke();
    wet.globalAlpha=mix(a[3],b[3],k);
    wet.drawImage(bead,x-6.67*run.scale,y-9.67*run.scale,13.33*run.scale,21.33*run.scale);
    wet.restore();
  }
  wet.restore();
}
function draw(t, forceWater=false) {
  const progress=clamp((t-.65)/2.3),rise=720*(1-ease(progress)),iceRise=1-ease((t-.95)/2.5);
  const surface=wave(progress);
  const clipLiquid=()=>{
    ctx.clip(shape);
    ctx.translate(0,rise);ctx.clip(surface);ctx.translate(0,-rise);
  };
  clear(ctx);ctx.save();ctx.clip(iceBounds);
  ctx.save();clipLiquid();
  layer(ctx,base);
  drawIce(true,t,100*iceRise);
  ctx.restore();
  // Draw the floating nuggets whole, then tint only their submerged portions.
  drawIce(false,t,720*iceRise);
  ctx.save();clipLiquid();
  layer(ctx,absorption);
  drawCream(t);
  layer(ctx,shading);
  drawBubbles(t);
  ctx.translate(0,rise);
  ctx.fillStyle=sheen;ctx.fill(surface);
  ctx.restore();ctx.restore();
  // Condensation is very slow; 15 fps is enough for its subpixel motion.
  if(forceWater || t-wetAt>=1/15){drawWater(t);wetAt=t;}
}
function tick(now) {
  raf=0;
  clock += Math.min(.1,(now-last)/1000);last=now;
  const interval=1000/30, elapsed=now-drawnAt;
  if(elapsed>=interval-.5){draw(clock);drawnAt=now-Math.max(0,elapsed-interval)%interval;}
  raf=requestAnimationFrame(tick);
}
function sync() {
  const on=slide.classList.contains('active');
  if(on && (!active || restart)){clock=0;wetAt=-1;drawnAt=0;}
  active=on;restart=false;
  cancelAnimationFrame(raf);raf=0;
  if(!ready || !on)return;
  if(reduce.matches){draw(4,true);return;}
  if(frame.classList.contains('paused') || document.hidden)return;
  last=performance.now();raf=requestAnimationFrame(tick);
}
frame.addEventListener('slideleave',e=>{if(e.detail===slide)restart=true;});
const watch=new MutationObserver(sync);
watch.observe(slide,{attributes:true,attributeFilter:['class']});
watch.observe(frame,{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',sync);
reduce.addEventListener('change',sync);
new ResizeObserver(resize).observe(cup);

async function prepare() {
  try {
    const loaded=await Promise.all(['a','b','c'].map(k=>load(`swig-ice-${k}.webp`)).concat(['back','front'].map(k=>load(`swig-cream-${k}.webp`))));
    images=loaded.slice(0,3).map(img=>bitmap(img,128,128));
    cream=loaded.slice(3).map(img=>bitmap(img,520,1090));
    resize();ready=true;sync();
  } catch(error) { console.error('Unable to prepare the Swig artwork:',error); }
}
// Prepare while the opening screen is up, without competing with its first paint.
if('requestIdleCallback' in window)requestIdleCallback(prepare,{timeout:800});else setTimeout(prepare,0);
