// Story slides (everything after the intro): stadium light banks, number reels, the season
// calendar and the final-slide fireworks. Timing lives in slides.css; this file reads it from the
// running CSS animations, so pausing the story (tap) pauses all of this too.
(() => {
  const frame = document.getElementById('frame');
  const slides = [...frame.querySelectorAll('.slide.story')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const isActive = el => el.classList.contains('active');
  const make = (className, text) => {
    const el = document.createElement('span');
    el.className = className;
    if (text != null) el.textContent = text;
    return el;
  };

  // ---------- Stadium light banks ----------
  // Each .bank becomes a grid of lamp fixtures on a dark backplate, with no outlines: at night the
  // structure only shows as a silhouette between lamps. A fixture is a dark can holding a metal
  // reflector cup and a glass lens; unlit, that's all you see. All the light sits in one layer
  // (.light) so a flicker takes the bank fully dark: the lit reflectors, white-hot faces, a tight and
  // a wide bloom per lamp, and a glare across the whole bank (additive, see .bank .glow). Aging
  // metal-halide lamps drift warm or cool and run hotter or dimmer, so every lamp gets a tint and a
  // level: dim lamps burn warmer with a smaller glow, hot ones bloom wide. slides.css turns each bank
  // in perspective and flickers .light on.
  const ORDER = [7, 2, 12, 5, 10, 0, 14, 8, 3, 11, 6, 1, 13, 4, 9];   // spreads the tints around
  const TINTS = [['#FFE6AE', '#F2C677'], ['#FFF0CF', '#F6D89A'], ['#F2F4F2', '#D3DDE4'], ['#FFE2A2', '#EFBE68'], ['#F4F6EC', '#D9E2CF']];
  const LEVELS = [1, .74, .94, .66, 1, .86, .7, .98, .9, .78, 1, .68, .88, .96, .8];
  frame.querySelectorAll('.bank').forEach((bank, b) => {
    const cols = 5, rows = 3, pitch = 20, pad = 5;
    const W = cols * pitch + pad * 2, H = rows * pitch + pad * 2, id = 'bank' + b;
    let fixtures = '', lit = '', near = '', wide = '';
    for (let i = 0; i < cols * rows; i++) {
      const x = pad + pitch * (i % cols + .5), y = pad + pitch * (Math.floor(i / cols) + .5);
      const tint = ORDER[(i + b * 4) % ORDER.length] % TINTS.length, level = LEVELS[(i + b * 3) % LEVELS.length];
      fixtures += `<rect x="${x - 8.8}" y="${y - 8.8}" width="17.6" height="17.6" rx="4" fill="url(#${id}-can)"/>` +
                  `<circle cx="${x}" cy="${y}" r="7.8" fill="url(#${id}-cup)"/>` +
                  `<circle cx="${x}" cy="${y}" r="5.9" fill="url(#${id}-lens)"/>`;
      lit += `<circle cx="${x}" cy="${y}" r="7.8" fill="url(#${id}-lit)" opacity="${(.5 + .5 * level).toFixed(2)}"/>` +
             `<circle cx="${x}" cy="${y}" r="5.9" fill="url(#${id}-face${tint})"/>` +
             (level < .85 ? `<circle cx="${x}" cy="${y}" r="5.9" fill="#E9B76C" opacity="${((.85 - level) * 2).toFixed(2)}"/>` : '');
      near += `<circle cx="${x}" cy="${y}" r="5.9" opacity="${level}"/>`;
      wide += `<circle cx="${x}" cy="${y}" r="${(5.9 * (.7 + .5 * level)).toFixed(2)}" opacity="${(level * level).toFixed(2)}"/>`;
    }
    const faceGradients = TINTS.map(([mid, edge], t) =>
      `<radialGradient id="${id}-face${t}"><stop offset="0" stop-color="#FFF"/><stop offset=".5" stop-color="#FFFEFB"/><stop offset=".8" stop-color="${mid}"/><stop offset="1" stop-color="${edge}"/></radialGradient>`).join('');
    bank.setAttribute('aria-hidden', 'true');
    bank.style.aspectRatio = `${W} / ${H}`;
    bank.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
      <defs>
        ${faceGradients}
        <radialGradient id="${id}-cup" cy=".58" r=".55"><stop offset=".55" stop-color="#2D2822"/><stop offset=".85" stop-color="#1D1915"/><stop offset="1" stop-color="#0E0C09"/></radialGradient>
        <radialGradient id="${id}-lens" fx=".36" fy=".32"><stop offset="0" stop-color="#4C463D"/><stop offset=".38" stop-color="#2E2A24"/><stop offset="1" stop-color="#1A1713"/></radialGradient>
        <radialGradient id="${id}-lit" cy=".58" r=".55"><stop offset=".7" stop-color="#FFE3A4"/><stop offset=".78" stop-color="#C79A5C"/><stop offset=".9" stop-color="#4A3B28" stop-opacity=".5"/><stop offset="1" stop-color="#4A3B28" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}-can" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#221E19"/><stop offset=".3" stop-color="#14110D"/><stop offset="1" stop-color="#090806"/></linearGradient>
        <filter id="${id}-near" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter>
        <filter id="${id}-mid" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4.5"/></filter>
        <filter id="${id}-wide" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="11"/></filter>
      </defs>
      <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="3" fill="#070605"/>
      ${fixtures}
      <g class="light">
        ${lit}
        <rect class="glow" x="${pad + 6}" y="${pad + 6}" width="${W - pad * 2 - 12}" height="${H - pad * 2 - 12}" rx="10" fill="#FFD9A0" opacity=".5" filter="url(#${id}-wide)"/>
        <g class="glow" filter="url(#${id}-mid)" fill="#FFC56C" opacity=".85">${wide}</g>
        <g class="glow" filter="url(#${id}-near)" fill="#FFFAF0" opacity=".75">${near}</g>
      </g>
    </svg>`;
  });

  // ---------- Number reels ----------
  // Adapted from adobe-block-party's score wheel (game/score-wheel.js). Every place rolls on its
  // own reel, reels stop left to right, and each lands with a .07-cell overshoot and a gentle
  // settle, with an impact pulse that grows with the number. Here the reels start blank so the
  // number rolls into view, and the CSS despawn rolls them on to blank when the slide is left.
  const reelValues = to => {
    const steps = Math.min(to, 80);
    return Array.from({ length: steps + 1 }, (_, i) => steps ? Math.round(to * i / steps) : to);
  };
  function curve(t, x1, y1, x2, y2) {
    const bezier = (p, a, b) => 3 * (1 - p) ** 2 * p * a + 3 * (1 - p) * p ** 2 * b + p ** 3;
    let low = 0, high = 1;
    for (let i = 0; i < 14; i++) {
      const p = (low + high) / 2;
      if (bezier(p, x1, x2) < t) low = p; else high = p;
    }
    return bezier((low + high) / 2, y1, y2);
  }
  function reelTravel(t, cells) {
    if (t <= 0) return 0;
    if (t >= 1) return cells;
    if (t <= .6) return (cells + .07) * curve(t / .6, .215, .61, .355, 1);
    return cells + .07 * (1 - curve((t - .6) / .4, .645, .045, .355, 1));
  }
  const impact = n => n >= 500 ? [1.14, 650] : n >= 100 ? [1.1, 580] : n >= 25 ? [1.065, 500] : [1.035, 420];

  function mountWheel(el) {
    const value = Number(el.dataset.value), pace = Number(el.dataset.pace) || 1;
    const digits = String(value);
    const vis = make('wheel-vis');
    vis.setAttribute('aria-hidden', 'true');
    el.classList.add('fx');
    el.replaceChildren(make('wheel-sr', value.toLocaleString('en-US')), vis);
    // Scoreboard rows pad with empty plates so the numbers line up
    for (let i = digits.length; i < (Number(el.dataset.slots) || 0); i++) vis.append(make('wheel-digit empty'));
    const values = reelValues(value), reels = [];
    [...digits].forEach((_, i) => {
      if (i && (digits.length - i) % 3 === 0) vis.append(make('wheel-comma', ','));
      const cells = [' ', ...values.map(n => String(n).padStart(digits.length, ' ')[i])];
      // Drop repeated cells so a place only rolls through the digits it actually shows
      const strip = cells.filter((c, k) => !k || c !== cells[k - 1]);
      const win = make('wheel-digit'), track = make('wheel-strip');
      const glyphs = [0, 1, 2].map(() => track.appendChild(make('wheel-glyph')));
      win.append(track);
      vis.append(win);
      reels.push({ strip, track, glyphs, index: -1, duration: (500 + i * 170) * pace });
    });
    [...vis.children].forEach((child, i) => child.style.setProperty('--i', i));
    const total = reels.at(-1).duration, [scale, pulse] = impact(value);
    el.style.setProperty('--sd', total + 'ms');
    el.style.setProperty('--impact', scale);
    el.style.setProperty('--pulse', pulse + 'ms');

    // sound.js voices the roll: a tick each time the ones place turns over, and a knock as the number
    // lands (the last reel's overshoot)
    const ones = reels.at(-1), landAt = ones.duration * .6;
    let shown = null;
    function render(elapsed) {
      if (elapsed === shown) return;
      const from = shown, was = ones.index;
      shown = elapsed;
      for (const r of reels) {
        const travel = reelTravel(elapsed / r.duration, r.strip.length - 1);
        const index = Math.floor(travel), fraction = travel - index;
        if (r.index !== index) {
          r.glyphs.forEach((glyph, offset) => { glyph.textContent = r.strip[index + offset - 1] ?? ' '; });
          r.index = index;
        }
        r.track.style.transform = `translateY(${-100 * (1 + fraction) / 3}%)`;
      }
      if (from == null || elapsed < from) return;   // a fresh start, not the roll moving on
      if (ones.index !== was) sound.tick(el);
      if (from < landAt && elapsed >= landAt) sound.land(el, value);
    }
    // Leaving the slide: the reels stay where they got to, with nothing below, so the despawn rolls
    // them on to blank
    function park() {
      for (const r of reels) { r.glyphs[2].textContent = ' '; r.index = -1; }
      shown = null;
    }
    render(total);
    return { el, slide: el.closest('.slide'), reels, total, render, park };
  }

  const wheels = [...frame.querySelectorAll('.story .wheel')].map(mountWheel);

  // How far into its roll a wheel is, read from its CSS clock animation (fx-wheel)
  function elapsed(w) {
    const clock = w.clock ||= w.el.getAnimations().find(a => a.animationName === 'fx-wheel');
    const progress = clock ? clock.effect.getComputedTiming().progress : null;
    return progress == null ? w.total : progress * w.total;
  }

  // ---------- Season calendar (games attended) ----------
  // Sample data: six-game home series, Tuesday to Sunday, and the 28 games this fan attended.
  // Other slides hardcode figures worked out from this. Attendance (.s-home): 252 innings (28 games),
  // 39% of home games (28 of 72) and 8 games in July. The Swig report (.s-swig): 3 of the 12 home
  // Wednesdays (Dirty Soda nights: Jun 24, Jul 8 and Jul 22). The recap (.s-final): 28 games, 252+
  // innings and 3 Dirty Soda Wednesdays. The Diamond Club passes (.s-diamond): May 16, Jul 10 and Aug 22.
  // Change one, change the others.
  const cal = frame.querySelector('.cal');
  if (cal) {
    const HOME_SERIES = [[3, 31], [4, 14], [4, 28], [5, 12], [5, 26], [6, 9], [6, 23], [7, 7], [7, 21], [8, 4], [8, 18], [9, 8]];
    const ATTENDED = {
      4: [3, 4, 17, 18], 5: [1, 2, 15, 16, 29, 30], 6: [12, 13, 24, 26, 27],
      7: [8, 9, 10, 11, 12, 22, 24, 25], 8: [7, 8, 18, 22], 9: [12],
    };
    const home = new Set();
    for (const [month, day] of HOME_SERIES) for (let k = 0; k < 6; k++) {
      const date = new Date(2026, month - 1, day + k);
      home.add(`${date.getMonth() + 1}/${date.getDate()}`);
    }
    // Each game lights up the moment the big count's ones reel passes it
    const count = wheels.find(w => w.slide === cal.closest('.slide'));
    const ones = count.reels.at(-1), cells = ones.strip.length - 1;
    const start = parseFloat(count.el.style.getPropertyValue('--d')) * 1000 || 0;
    const reach = cell => {
      let low = 0, high = 1;
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        if (reelTravel(mid, cells) >= cell - .5) high = mid; else low = mid;
      }
      return high * ones.duration;
    };
    let n = 0;
    ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].forEach((name, i) => {
      const month = i + 4, days = new Date(2026, month, 0).getDate();
      const row = make('cal-days');
      for (let day = 1; day <= 31; day++) {
        const dot = document.createElement('i');
        if (day > days) dot.className = 'x';
        else if (ATTENDED[month].includes(day)) {
          dot.className = 'a';
          n++;
          dot.style.setProperty('--t', `${Math.round(start + reach(n + 1))}ms`);
          dot.style.setProperty('--k', n);
        } else if (home.has(`${month}/${day}`)) dot.className = 'h';
        dot.style.setProperty('--day', day);
        row.append(dot);
      }
      cal.append(make('cal-m', name), row);
    });
  }

  // ---------- Fireworks over the ballpark (final slide) ----------
  // The canvases sit between the night sky and the ballpark photo, whose own sky is transparent, so
  // rockets launch from behind the stadium and burst above it. Bursts come in a few styles: peony,
  // two-tone, a tilted ring, a slow gold willow, and crackle (ends in glittering flashes). Sparks leave
  // short trails because the canvas fades a little each frame instead of clearing. Each burst also
  // glows in the sky around it and, through .ballpark-light, washes the stadium and field in its color
  // for a moment. Sparks are drawn in batches by color and brightness, so a busy sky stays cheap.
  //
  // There are two renderers of the same show. The sharp one draws straight into canvas.sharp. The soft
  // one (the last page) is blurred cheaply: it draws into a low-res offscreen scene (about one pixel per
  // five screen pixels), then a small separable blur copies the scene to canvas.soft, which the browser
  // scales up. Blurring first keeps the upscale smooth instead of blocky. mix(p) crossfades between
  // them, and only the renderers that show are drawn.
  const fireworks = (() => {
    const wrap = frame.querySelector('.fireworks');
    if (!wrap) return null;
    const canvas = wrap.querySelector('.sharp'), softCanvas = wrap.querySelector('.soft');
    const photoEl = frame.querySelector('.ballpark-photo'), lightCanvas = frame.querySelector('.ballpark-light');
    const ctx = canvas.getContext('2d'), stx = softCanvas.getContext('2d'), ltx = lightCanvas.getContext('2d');
    const scene = document.createElement('canvas'), sctx = scene.getContext('2d');
    const pass = document.createElement('canvas'), pctx = pass.getContext('2d');
    const TAPS = [[-3, 1 / 64], [-2, 6 / 64], [-1, 15 / 64], [0, 20 / 64], [1, 15 / 64], [2, 6 / 64], [3, 1 / 64]];
    const COLORS = ['255,214,120', '255,244,218', '233,185,73', '226,72,52', '255,250,244', '255,170,84'];
    const STYLES = ['peony', 'peony', 'twotone', 'ring', 'willow', 'crackle'];
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = list => list[Math.floor(Math.random() * list.length)];
    let W = 0, H = 0, horizon = .6, horizonY = 0, raf = 0, last = 0, clock = 0, next = 0, lit = false, running = false;
    let rockets = [], sparks = [], lights = [], sharpOn = true, softOn = false;

    // Find where the stadium starts in the photo (its first mostly opaque row) so rockets launch behind it
    const photo = new Image();
    photo.onload = () => {
      try {
        const w = 24, h = Math.round(w * photo.naturalHeight / photo.naturalWidth);
        const probe = document.createElement('canvas');
        probe.width = w; probe.height = h;
        const p = probe.getContext('2d');
        p.drawImage(photo, 0, 0, w, h);
        const alpha = p.getImageData(0, 0, w, h).data;
        for (let y = 0; y < h; y++) {
          let sum = 0;
          for (let x = 0; x < w; x++) sum += alpha[(y * w + x) * 4 + 3];
          if (sum / w > 90) { horizon = y / h; break; }
        }
      } catch (_) {}
      resize();
    };
    photo.src = (getComputedStyle(photoEl).backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';

    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      const dpr = Math.min(1.5, devicePixelRatio || 1), low = .18;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.width = pass.width = softCanvas.width = Math.round(W * low);
      scene.height = pass.height = softCanvas.height = Math.round(H * low);
      sctx.setTransform(low, 0, 0, low, 0, 0);
      // the light on the stadium is soft, so a quarter-resolution canvas is plenty
      lightCanvas.width = Math.ceil(W / 4); lightCanvas.height = Math.ceil(H / 4);
      ltx.setTransform(.25, 0, 0, .25, 0, 0);
      // the photo covers the slide, anchored to the bottom
      const iw = photo.naturalWidth, ih = photo.naturalHeight;
      horizonY = iw ? H - ih * Math.max(W / iw, H / ih) * (1 - horizon) : H * .62;
      wrap.style.setProperty('--hz', (horizonY / H * 100).toFixed(2) + '%');   // slides.css masks below it
      lit = true;
    }
    new ResizeObserver(resize).observe(canvas);

    // the soft renderer's blur: weighted, offset copies of the scene add up to one blurred image
    function present() {
      for (const c of [pctx, stx]) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, scene.width, scene.height);
        c.globalCompositeOperation = 'lighter';
      }
      for (const [o, k] of TAPS) { pctx.globalAlpha = k; pctx.drawImage(scene, o, 0); }
      for (const [o, k] of TAPS) { stx.globalAlpha = k; stx.drawImage(pass, 0, o); }
      pctx.globalAlpha = stx.globalAlpha = 1;
    }
    // a renderer that starts drawing again picks up the trails from the other one, so nothing pops
    function seed(dst, src) {
      if (!src.width || !dst.canvas.width) return;
      dst.save();
      dst.setTransform(1, 0, 0, 1, 0, 0);
      dst.globalAlpha = 1;
      dst.globalCompositeOperation = 'copy';
      dst.drawImage(src, 0, 0, dst.canvas.width, dst.canvas.height);
      dst.restore();
    }

    const glow = (c, x, y, r, rgb, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };

    function launch() {
      const x = W * rand(.14, .86), y = horizonY + H * .03, top = H * rand(.09, .4), g = H * .5;
      rockets.push({ x, y, vx: W * rand(-.03, .03), vy: -Math.sqrt(2 * g * Math.max(H * .12, y - top)), g,
                     style: pick(STYLES), c: Math.floor(Math.random() * COLORS.length) });
      sound.firework('launch', x / W);
    }
    function burst(r) {
      const willow = r.style === 'willow', ring = r.style === 'ring';
      const n = Math.min(willow ? 54 : ring ? 42 : 72 + Math.floor(Math.random() * 26), 1100 - sparks.length);
      const speed = H * (willow ? .19 : ring ? .24 : .27) * rand(.85, 1.15);
      const c1 = willow ? 0 : r.c, c2 = r.style === 'twotone' ? (c1 + 3) % COLORS.length : c1;
      const tilt = rand(.35, .8), roll = rand(0, Math.PI), cos = Math.cos(roll), sin = Math.sin(roll);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + (ring ? 0 : rand(-.09, .09));
        const v = speed * (ring ? 1 : .55 + .45 * Math.sqrt(Math.random()));
        let vx = Math.cos(a) * v, vy = Math.sin(a) * v;
        if (ring) { vy *= tilt; [vx, vy] = [vx * cos - vy * sin, vx * sin + vy * cos]; }
        sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx, vy, life: 1, span: willow ? rand(2.2, 3) : rand(1.1, 1.7),
                      drag: willow ? 2.3 : 1.5, c: i % 2 ? c2 : c1, thin: willow, crackle: r.style === 'crackle' });
      }
      lights.push({ x: r.x, y: r.y, rgb: COLORS[c1], t: 0 });
      sound.firework('burst', r.x / W, r.style);
    }
    function step(dt) {
      clock += dt;
      if (clock >= next) {
        launch();
        if (Math.random() < .3) launch();
        next = clock + (clock < 30 ? rand(.5, 1.2) : rand(1.2, 2.4));   // calmer once the show has run a while
      }
      for (const r of rockets) {
        r.px = r.x; r.py = r.y;
        r.vy += r.g * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        // the rocket sheds embers as it climbs, at a steady rate whatever the frame rate
        for (r.ember = (r.ember || 0) + dt * 60; r.ember >= 1; r.ember--)
          sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: W * rand(-.02, .02), vy: H * rand(.01, .05),
                        life: 1, span: rand(.25, .5), drag: 3, c: 1, thin: true });
        if (r.vy > -H * .05) { r.dead = true; burst(r); }
      }
      rockets = rockets.filter(r => !r.dead);
      const fall = H * .16 * dt;
      for (const s of sparks) {
        const k = Math.exp(-s.drag * dt);
        s.px = s.x; s.py = s.y;
        s.vx *= k; s.vy = s.vy * k + fall;
        s.x += s.vx * dt; s.y += s.vy * dt;
        s.life -= dt / s.span;
      }
      sparks = sparks.filter(s => s.life > 0);
      for (const l of lights) l.t += dt;
      lights = lights.filter(l => l.t < 2.5);
    }

    const batches = new Map();
    function draw(ctx, dt) {
      // fade what's there instead of clearing, so sparks leave trails (same length at any frame rate)
      const fade = 1 - Math.pow(.8, dt * 60);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // each burst lights the sky around it, with a flash the instant it goes off. These are redrawn
      // every frame into the fading canvas, so each draw adds `fade` of the brightness it should
      // settle at; that keeps them equally bright on 60 Hz and 120 Hz screens.
      for (const l of lights) {
        const k = Math.exp(-l.t / .45);
        if (k > .03) glow(ctx, l.x, l.y, W * .42, l.rgb, .035 * k * fade);
        if (l.t < .12) glow(ctx, l.x, l.y, W * .05, '255,248,232', .25 * (1 - l.t / .12) * fade);
      }
      // sparks, batched by weight, color and brightness
      batches.clear();
      const crackle = new Path2D();
      for (const s of sparks) {
        if (s.crackle && s.life < .4) {
          if (Math.random() < dt * 30) crackle.rect(s.x, s.y, 1.6, 1.6);
          continue;
        }
        const key = (s.thin ? 1000 : 0) + s.c * 10 + Math.ceil(Math.min(1, s.life * 1.25) ** 1.3 * 8);
        let path = batches.get(key);
        if (!path) batches.set(key, path = new Path2D());
        path.moveTo(s.px, s.py);
        path.lineTo(s.x, s.y);
      }
      ctx.lineCap = 'round';
      for (const [key, path] of batches) {
        ctx.lineWidth = key >= 1000 ? 1.3 : 1.9;
        ctx.strokeStyle = `rgba(${COLORS[Math.floor(key % 1000 / 10)]},${(key % 10) / 8})`;
        ctx.stroke(path);
      }
      ctx.fillStyle = 'rgba(255,252,240,.9)';
      ctx.fill(crackle);
      ctx.strokeStyle = 'rgba(255,240,205,.95)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (const r of rockets) { ctx.moveTo(r.px ?? r.x, r.py ?? r.y); ctx.lineTo(r.x, r.y); }
      ctx.stroke();
    }
    // the stadium and field catch each burst's light: brightest on the stands under it, fading fast
    function lightPark() {
      if (!lights.length && !lit) return;
      ltx.clearRect(0, 0, W, H);
      ltx.globalCompositeOperation = 'lighter';
      lit = false;
      for (const l of lights) {
        const k = Math.exp(-l.t / .55) + .7 * Math.exp(-l.t / .1);
        if (k < .03) continue;
        glow(ltx, l.x, horizonY - H * .04, W * .8, l.rgb, Math.min(.16, .08 * k));
        lit = true;
      }
    }

    function tick(t) {
      if (document.hidden || frame.classList.contains('paused')) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
      const dt = Math.min(.05, (t - last) / 1000);
      last = t;
      step(dt);
      if (sharpOn) draw(ctx, dt);
      if (softOn) { draw(sctx, dt); present(); }
      lightPark();
    }
    return {
      start() {
        if (running || reduce.matches) return;
        running = true;
        resize();
        for (const c of [ctx, sctx, ltx]) c.clearRect(0, 0, W, H);
        clock = 0; next = .25; rockets = []; sparks = []; lights = [];
        last = performance.now();
        if (!document.hidden && !frame.classList.contains('paused')) raf = requestAnimationFrame(tick);
      },
      stop() { running = false; cancelAnimationFrame(raf); raf = 0; },
      resume() {
        if (running && !raf && !document.hidden && !frame.classList.contains('paused')) {
          last = performance.now(); raf = requestAnimationFrame(tick);
        }
      },
      // 0 = all sharp, 1 = all soft (and a little dimmer)
      mix(p) {
        const wantSharp = p < 1, wantSoft = p > 0;
        if (wantSoft && !softOn) { seed(sctx, canvas); present(); }
        if (wantSharp && !sharpOn) seed(ctx, scene);
        sharpOn = wantSharp; softOn = wantSoft;
        canvas.style.opacity = 1 - p;
        softCanvas.style.opacity = p;
        wrap.style.opacity = 1 - .3 * p;
      },
    };
  })();

  // ---------- The last page's soft background ----------
  // One value, p, eases from 0 (sharp) to 1 (soft) and drives all of it (see slides.css): the photo
  // crossfades through a ladder of pre-blurred copies on .ballpark-blur, the fireworks crossfade from
  // their sharp canvas to their soft one, and the veil darkens. At either end a plain layer stands in for
  // the canvas, so nothing is redrawn while a page sits still.
  const soften = (() => {
    const blurCanvas = frame.querySelector('.ballpark-blur');
    if (!blurCanvas) return () => {};
    const bctx = blurCanvas.getContext('2d');
    const [sharpPhoto, softPhoto] = frame.querySelectorAll('.ballpark-photo');
    const veil = frame.querySelector('.ballpark-veil');
    const levels = ['revised-bees-background.png', 1, 2, 3, 4].map(n => {
      const img = new Image();
      img.src = typeof n === 'number' ? `blur/ballpark-blur-${n}.webp` : n;
      return img;
    });
    const T = 1300;   // ms for the whole change
    const ease = t => t < .5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2;
    let p = 0, from = 0, to = 0, start = 0, dur = 0, raf = 0, drawn = -1;

    // the photo between two neighboring blur levels, placed like the CSS background (cover, bottom)
    function drawPhoto() {
      if (p === drawn) return;
      drawn = p;
      const w = blurCanvas.width, h = blurCanvas.height, at = p * (levels.length - 1);
      const i = Math.min(levels.length - 2, Math.floor(at)), t = at - i;
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, w, h);
      bctx.globalCompositeOperation = 'lighter';   // weighted copies add up to exactly one image
      bctx.imageSmoothingQuality = 'high';
      for (const [img, a] of [[levels[i], 1 - t], [levels[i + 1], t]]) {
        if (a <= 0 || !img.naturalWidth) continue;
        const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * k, ih = img.naturalHeight * k;
        bctx.globalAlpha = a;
        bctx.drawImage(img, (w - iw) / 2, h - ih, iw, ih);
      }
    }
    new ResizeObserver(() => {
      // This canvas only crossfades already blurred photos; 3x pixels add work,
      // not visible detail. The resting sharp photo remains a full-resolution image.
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      blurCanvas.width = Math.round(blurCanvas.clientWidth * dpr);
      blurCanvas.height = Math.round(blurCanvas.clientHeight * dpr);
      drawn = -1;
      if (p > 0 && p < 1) drawPhoto();
    }).observe(blurCanvas);

    function apply() {
      const between = p > 0 && p < 1;
      if (between) drawPhoto();
      blurCanvas.style.opacity = between ? 1 : 0;
      sharpPhoto.style.opacity = p === 0 ? 1 : 0;
      softPhoto.style.opacity = p === 1 ? 1 : 0;
      veil.style.opacity = (.5 * p).toFixed(3);
      if (fireworks) fireworks.mix(p);
      sound.soften(p);   // the fireworks sound muffled too
    }
    function tick(now) {
      const k = dur ? Math.min(1, (now - start) / dur) : 1;
      p = k >= 1 ? to : from + (to - from) * ease(k);
      apply();
      raf = k < 1 ? requestAnimationFrame(tick) : 0;
    }
    const run = target => {
      if (target === to) return;
      to = target; from = p; start = performance.now();
      dur = reduce.matches ? 0 : T * Math.abs(to - from);   // a reversal midway takes only the time it needs
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    // decode the blur levels ahead of time, so the first frames of the change don't stall on it
    run.prepare = () => { for (const img of levels) if (img.decode) img.decode().catch(() => {}); };
    return run;
  })();

  // ---------- Embedded post (the favorite moment) ----------
  // Instagram's embed says how tall it is once it has laid out (a MEASURE message). It's laid out at a
  // fixed width and scaled as a whole to fit the space under the slide's title.
  frame.querySelectorAll('.embed').forEach(box => {
    const f = box.querySelector('iframe'), w = 340;
    let h = 640;
    const fit = () => {
      f.style.width = w + 'px';
      f.style.height = h + 'px';
      box.style.setProperty('--k', Math.min(1.15, box.clientWidth / w, box.clientHeight / h).toFixed(4));
    };
    addEventListener('message', e => {
      if (e.source !== f.contentWindow || typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'MEASURE' && m.details.height > 0) { h = m.details.height; fit(); }
      } catch (_) {}
    });
    new ResizeObserver(fit).observe(box);
  });

  // ---------- Despawn cascade ----------
  // Elements leave in reading order, a beat apart, unless they set their own --o
  for (const slide of slides) {
    [...slide.querySelectorAll('.body .fx')].forEach((el, i) => {
      if (!el.style.getPropertyValue('--o')) el.style.setProperty('--o', Math.min(i * 16, 150) + 'ms');
    });
  }

  // ---------- Leaving mid-spawn ----------
  // A despawn only says where it ends, so it starts from an element's finished look: leave a slide
  // while it's still spawning and everything on it would jump to fully in before going out. So just
  // before a slide is left (app.js says when), note where each of its animations has got to, and once
  // the despawns take over, start them from there. Whatever a despawn doesn't move, and anything whose
  // animation just stops, holds where it was until the slide comes back.
  const finaleBg = frame.querySelector('.finale-bg');
  const isOn = root => root === finaleBg ? frame.classList.contains('finale') : isActive(root);
  const cssAnims = root => root.getAnimations({ subtree: true }).filter(a => a instanceof CSSAnimation);
  const NOT_STYLES = new Set(['offset', 'computedOffset', 'easing', 'composite']);
  const holds = new Map();   // slide (or the finale backdrop) → the animations holding its stopped pieces
  let left = null;           // the slide being left: its animations, and element → pseudo-element → styles

  frame.addEventListener('slideleave', ({ detail: slide }) => {
    if (!slides.includes(slide)) return;
    left = { roots: isOn(finaleBg) ? [slide, finaleBg] : [slide], anims: new Set(), at: new Map() };
    for (const root of left.roots) for (const a of cssAnims(root)) {
      left.anims.add(a);
      if (a.effect.getComputedTiming().progress == null) continue;   // not showing anything right now
      const props = a.effect.getKeyframes().flatMap(Object.keys).filter(p => !NOT_STYLES.has(p) && !p.startsWith('--'));
      if (!props.length) continue;
      const { target, pseudoElement } = a.effect, style = getComputedStyle(target, pseudoElement);
      if (!left.at.has(target)) left.at.set(target, {});
      const values = left.at.get(target)[pseudoElement || ''] ||= {};
      for (const p of props) values[p] = style[p];
    }
  });

  // Runs after the slide classes change, before the next paint
  function pickUp() {
    for (const [root, held] of holds) if (isOn(root)) { held.forEach(a => a.cancel()); holds.delete(root); }
    if (!left) return;
    const { roots, anims, at } = left;
    left = null;
    for (const root of roots) {
      if (isOn(root)) continue;   // straight back on: its spawns start fresh
      const moving = new Map();   // element → its pseudo-elements ('' for itself) still animating
      for (const a of cssAnims(root)) {
        const { target, pseudoElement } = a.effect, pseudo = pseudoElement || '';
        if (!moving.has(target)) moving.set(target, new Set());
        moving.get(target).add(pseudo);
        const values = at.get(target)?.[pseudo];
        if (!values || anims.has(a)) continue;   // nothing to pick up, or the same animation carrying on
        const frames = a.effect.getKeyframes().map(({ computedOffset, ...k }) => k);
        if (frames[0].offset !== 0) frames.unshift({ offset: 0, easing: frames[0].easing });
        const moves = new Set(frames.flatMap(Object.keys));
        for (const [p, value] of Object.entries(values)) {
          if (moves.has(p)) frames[0][p] = value;
          else frames.forEach(k => { k[p] = value; });
        }
        a.effect.setKeyframes(frames);
      }
      const held = [];
      for (const [target, byPseudo] of at) if (root.contains(target)) for (const pseudo in byPseudo)
        if (!moving.get(target)?.has(pseudo)) held.push(target.animate(byPseudo[pseudo], { pseudoElement: pseudo || null, fill: 'forwards' }));
      if (held.length) holds.set(root, held);
    }
  }

  // ---------- Slide lifecycle ----------
  // The ballpark backdrop belongs to the last two slides: it shows, and the fireworks run, while either is up
  const finaleFrom = slides.findIndex(s => s.classList.contains('s-final')), lastPage = slides.at(-1);

  let wheelRaf = 0;
  function updateWheels() {
    wheelRaf = 0;
    if (document.hidden || frame.classList.contains('paused')) return;
    let pending = false;
    for (const w of wheels) {
      if (w.done) continue;
      if (!isActive(w.slide)) { w.park(); w.done = true; continue; }
      const t = elapsed(w);
      w.render(t);
      w.done = t >= w.total;   // finished rolls stop polling until their slide changes again
      pending ||= !w.done;
    }
    if (pending) wheelRaf = requestAnimationFrame(updateWheels);
  }
  function sync() {
    cancelAnimationFrame(wheelRaf);
    updateWheels();
    const finale = finaleFrom >= 0 && slides.findIndex(isActive) >= finaleFrom;
    if (finale && !frame.classList.contains('finale') && soften.prepare) soften.prepare();   // ready before the last page
    frame.classList.toggle('finale', finale);
    if (fireworks) finale ? fireworks.start() : fireworks.stop();
    soften(lastPage.classList.contains('active') ? 1 : 0);
  }
  // Class changes land before the next paint, so a slide never flashes its finished numbers
  const watch = new MutationObserver(() => { wheels.forEach(w => { w.done = false; w.clock = null; }); sync(); pickUp(); });
  slides.forEach(s => watch.observe(s, { attributes: true, attributeFilter: ['class'] }));
  const resume = () => {
    cancelAnimationFrame(wheelRaf);
    updateWheels();
    fireworks?.resume();
  };
  new MutationObserver(resume).observe(frame, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', resume);

  // "Share my wrapped" does what the share button does
  frame.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => document.getElementById('share').click()));
  sync();
})();
