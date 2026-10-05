(() => {
  const frame = document.getElementById('frame');
  const slides = [...frame.querySelectorAll('.slide')];
  const nav = document.getElementById('progress');
  const toast = document.getElementById('toast');
  let cur = 0, elapsed = 0, last = null, paused = false, muted = false, closed = false;
  let tickRaf = 0;
  let introAnims = [], idleAnims = [], introRunning = false, awaitingScroll = false;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Shared links ----------
  // Every story slide has a key, its s-… class (the intro shares the season cover). A shared link is
  // /?s=<key>.<expiry>.<signature>, signed at the edge (infra/access.js); opening one shows just that slide,
  // marked as someone else's. Locally there's no edge, so links are plain /?s=<key>.
  const keyOf = s => (s.className.match(/\bs-([a-z0-9-]+)/) || [, 'pregame'])[1];
  const sharedKey = (new URLSearchParams(location.search).get('s') || '').split('.')[0];
  const sharedIndex = /^[a-z0-9-]{1,24}$/.test(sharedKey) ? slides.findIndex(s => s.classList.contains('s-' + sharedKey)) : -1;
  const shared = sharedIndex > 0;
  const shareTokens = {};   // key -> signed token ('' when this server can't sign, e.g. the local dev server)
  function mintShareLink(key) {
    if (shared || key in shareTokens) return;
    shareTokens[key] = '';
    fetch('/__share?slide=' + key, { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && j.token) shareTokens[key] = j.token; })
      .catch(() => { delete shareTokens[key]; });   // offline: try again next time
  }
  function shareUrl() {
    if (shared) { const u = new URL(location.href); u.searchParams.delete('c'); return u.href; }
    const key = keyOf(slides[cur]);
    return location.origin + '/?s=' + (shareTokens[key] || key);
  }

  const segs = slides.map((_, i) => {
    const b = document.createElement('button');
    b.className = 'seg';
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    b.innerHTML = '<span class="fill"></span>';
    b.addEventListener('click', e => { e.stopPropagation(); go(i); });
    nav.appendChild(b);
    return b;
  });
  const fills = segs.map(s => s.querySelector('.fill'));

  const videoOf = i => slides[i].querySelector('video:not(.hit-clip)');   // the intro clip is run by the intro
  // Decode a slide's images ahead of time, so a big one (like the MVP card) doesn't decode in the middle
  // of its slide's entrance animation, and start loading its embeds (an Instagram post takes a moment)
  const warm = s => {
    if (!s) return;
    s.querySelectorAll('img').forEach(img => img.decode && img.decode().catch(() => {}));
    s.querySelectorAll('iframe[data-src]').forEach(f => { f.src = f.dataset.src; f.removeAttribute('data-src'); });
  };

  function go(i) {
    if (shared && i !== sharedIndex) return;   // a shared link shows its one slide
    if (introRunning) {
      if (awaitingScroll && i === cur + 1) finishIntro(i);
      return;
    }
    if (i < 0 || i >= slides.length) return;
    frame.dispatchEvent(new CustomEvent('slideleave', { detail: slides[cur] }));   // slides.js notes where it got to
    watch(null);
    const old = videoOf(cur); if (old) old.pause();
    cur = i; elapsed = 0; last = null;
    slides.forEach((s, k) => {
      s.classList.toggle('before', k < cur);
      s.classList.remove('active');
    });
    void frame.offsetWidth;                 // restart the slide's animations
    slides[cur].classList.add('active');
    warm(slides[cur]); warm(slides[cur + 1]);
    segs.forEach((s, k) => {
      s.classList.toggle('done', k < cur);
      s.classList.toggle('current', k === cur);
      fills[k].style.transform = 'scaleY(0)';
    });
    frame.classList.toggle('light', slides[cur].dataset.tone === 'light');
    frame.classList.toggle('hold', slides[cur].hasAttribute('data-hold'));   // stays up, no progress bar
    if (!introRunning) mintShareLink(keyOf(slides[cur]));   // a link to this slide, ready for the share button
    tip.slideChanged();
    sky.showing(cur === 0);
    setPaused(false);
    const v = videoOf(cur);
    // a phone that won't play it with sound still shows it, silently
    if (v) { v.currentTime = 0; v.muted = muted; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    sound.showing(v);   // its sound comes up, and the music ducks under it
  }

  const pauseAnims = (anims, p) => anims.forEach(a => {
    if (p && a.playState === 'running') a.pause();
    if (!p && a.playState === 'paused') a.play();
  });

  function setPaused(p) {
    paused = p;
    frame.classList.toggle('paused', p);
    pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
    if (introRunning) pauseAnims(introAnims, p);
    pauseAnims(idleAnims, p);
    tip.pause(p);
    sound.pause(p || !!watching);
    if (introRunning && hitPlaying) p ? clipEl.pause() : clipEl.play().catch(() => {});
    const v = videoOf(cur);
    if (v) p ? v.pause() : v.play().catch(() => {});
    if (p) { cancelAnimationFrame(tickRaf); tickRaf = 0; last = null; }
    else requestTick();
  }

  function requestTick() {
    if (!tickRaf && !paused && !closed && !document.hidden) tickRaf = requestAnimationFrame(tick);
  }

  function tick(t) {
    tickRaf = 0;
    if (paused || closed || document.hidden) { last = null; return; }
    const dt = last == null ? 0 : Math.min(t - last, 100); last = t;   // capped: a frame after the page was hidden counts as one frame
    let prog = 0;
    const v = videoOf(cur);
    if (v && isFinite(v.duration) && v.duration > 0) {
      prog = v.currentTime / v.duration;
      if (v.ended) prog = 1;
    } else if (slides[cur].hasAttribute('data-hold')) {
      prog = 0;                             // a held slide stays until the viewer moves on
    } else {
      if (!paused && !closed && !introRunning && !watching) elapsed += dt;
      prog = elapsed / (+slides[cur].dataset.duration || 6000);
    }
    if (prog >= 1) {
      prog = 1;
      if (cur < slides.length - 1) go(cur + 1);
      else if (!paused) setPaused(true);
    }
    fills[cur].style.transform = `scaleY(${prog})`;
    if (!slides[cur].hasAttribute('data-hold') || v) requestTick();
  }

  // Tap to pause, swipe up/down to move between slides
  let startY = null, startX = null;
  frame.addEventListener('pointerdown', e => {
    if (closed || e.target.closest('button, a')) return;
    startY = e.clientY; startX = e.clientX;
  });
  frame.addEventListener('pointerup', e => {
    if (startY == null) return;
    const dy = e.clientY - startY, dx = e.clientX - startX;
    startY = null;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) go(dy < 0 ? cur + 1 : cur - 1);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (watching || performance.now() < backAt) watch(null);   // a tap back from an embed only resumes the story
      else if (!frame.classList.contains('hold')) setPaused(!paused);
    }
  });

  // ---------- Watching an embed ----------
  // The favorite-moment slide embeds an Instagram reel, which is Instagram's own page in a frame: this page
  // can't see its video play or stop, and can't pause it. What it can see is a tap going into the frame
  // (the page loses focus to it). From then until the viewer taps back on the story or moves on, the
  // slide's timer stops and the music pauses. Coming back reloads the post, the one way to stop its video.
  let watching = null, backAt = 0;   // the frame being watched; until when a tap counts as coming back
  function watch(f) {
    if (f === watching) return;
    if (watching) watching.src = watching.src;
    watching = f;
    sound.pause(paused || !!watching);
  }
  addEventListener('blur', () => {
    const f = document.activeElement;
    if (!closed && f && f.tagName === 'IFRAME' && slides[cur].contains(f)) watch(f);
  });
  addEventListener('focus', () => { if (watching) { watch(null); backAt = performance.now() + 600; } });

  // Mouse wheel / trackpad scroll
  let wheelLock = false;
  frame.addEventListener('wheel', e => {
    e.preventDefault();
    if (closed || wheelLock || Math.abs(e.deltaY) < 20) return;
    wheelLock = true;
    go(e.deltaY > 0 ? cur + 1 : cur - 1);
    setTimeout(() => wheelLock = false, 700);
  }, { passive: false });

  document.addEventListener('keydown', e => {
    if (closed) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    if (e.key === ' ' && !e.target.closest('button, a') && !frame.classList.contains('hold')) { e.preventDefault(); setPaused(!paused); }
  });

  function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  const pauseBtn = document.getElementById('pause');
  pauseBtn.addEventListener('click', () => setPaused(!paused));

  const muteBtn = document.getElementById('mute');
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    slides.forEach((_, i) => { const v = videoOf(i); if (v) v.muted = muted; });
    muteBtn.querySelector('.on').style.display = muted ? 'none' : '';
    muteBtn.querySelector('.off').style.display = muted ? '' : 'none';
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    sound.mute(muted);
    showToast(muted ? 'Sound off' : 'Sound on');
  });

  // ---------- Share ----------
  // Where the device can share files, the share button sends a story-sized "Season Wrapped" image. Images are
  // what bring up Instagram (Stories, Feed, Messages), Messages and Photos in the share sheet; a bare link
  // doesn't. Otherwise it shares the link, or copies it. The image is made ahead of time, because phones only
  // allow share() straight from a tap.
  const shareCard = (() => {
    let file = null, making = null;
    const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
    const value = (sel, fallback) => { const el = frame.querySelector(sel); return el ? Number(el.dataset.value).toLocaleString('en-US') : fallback; };
    const GOLD = '#E9B949', CREAM = '#F4EAD5', COND = 'extra-condensed';

    async function make() {
      const W = 1080, H = 1920, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      await Promise.all([`900 ${COND} 100px Archivo`, '800 40px Archivo', '700 40px Archivo']
        .map(f => document.fonts.load(f).catch(() => {})));
      const [wordmark, logo] = await Promise.all([load('bees-wordmark.png'), load('bees-circle-logo.png')]);

      // The season, read off the slides so the image always matches the story
      const recap = [...frame.querySelectorAll('.att-recap .wheel')].map(w => Number(w.dataset.value).toLocaleString('en-US'));
      const stats = [
        [value('.s-games .wheel', '28'), 'Games'],
        [recap[0] || '252', 'Innings'],
        [recap[2] || '62', 'Home runs'],
        [value('.s-numbers .board li.gold .wheel', '17'), 'Bees wins'],
      ];
      const mvp = (frame.querySelector('.s-mvp')?.getAttribute('aria-label') || 'Your MVP: Niko Kavadas').split(': ').pop();
      const fan = 'The ' + (frame.querySelector('.pn-word')?.dataset.word || 'Regulars');

      // text helpers: wide-tracked caps (drawn letter by letter, since canvas letter-spacing isn't everywhere)
      // and condensed display type that shrinks to fit
      function tracked(text, x, y, size, color, weight = 800, track = .3) {
        g.font = `${weight} ${size}px Archivo`; g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        const chars = [...text.toUpperCase()], gap = size * track;
        const w = chars.reduce((sum, ch) => sum + g.measureText(ch).width, 0) + gap * (chars.length - 1);
        let cx = x - w / 2;
        for (const ch of chars) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + gap; }
      }
      function display(text, x, y, size, color, maxW) {
        g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        let s = size;
        do { g.font = `900 ${COND} ${s}px Archivo`; s -= 4; } while (g.measureText(text).width > maxW && s > 20);
        g.fillText(text, x, y);
      }

      // background: near-black, a gold glow up top, a fine gold frame
      g.fillStyle = '#0A0806'; g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W / 2, 560, 0, W / 2, 560, 900);
      glow.addColorStop(0, 'rgba(233,185,73,.30)'); glow.addColorStop(1, 'rgba(233,185,73,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(233,185,73,.55)'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(48, 48, W - 96, H - 96, 40); g.stroke();

      // the wordmark, tinted gold (the PNG is black on clear)
      const mw = 760, mh = mw * wordmark.height / wordmark.width, tint = document.createElement('canvas');
      tint.width = mw; tint.height = mh;
      const t = tint.getContext('2d');
      t.drawImage(wordmark, 0, 0, mw, mh); t.globalCompositeOperation = 'source-in'; t.fillStyle = GOLD; t.fillRect(0, 0, mw, mh);
      g.drawImage(tint, (W - mw) / 2, 150);
      tracked('2026 Season Wrapped', W / 2, 150 + mh + 74, 40, CREAM);

      // the Bees logo, with a soft halo
      g.save(); g.shadowColor = 'rgba(233,185,73,.45)'; g.shadowBlur = 80;
      g.drawImage(logo, W / 2 - 220, 470, 440, 440); g.restore();

      // the four stats in a panel
      g.fillStyle = 'rgba(255,255,255,.05)'; g.strokeStyle = 'rgba(233,185,73,.28)'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(110, 990, W - 220, 470, 36); g.fill(); g.stroke();
      g.fillStyle = 'rgba(233,185,73,.22)'; g.fillRect(W / 2 - 1, 1030, 2, 390); g.fillRect(150, 1224, W - 300, 2);
      stats.forEach(([n, label], i) => {
        const x = W / 2 + (i % 2 ? 215 : -215), y = 1030 + (i > 1 ? 215 : 0);
        display(n, x, y + 140, 150, GOLD, 380);
        tracked(label, x, y + 186, 30, CREAM, 700, .22);
      });

      // MVP and fan type
      tracked('MVP', W / 2, 1560, 30, GOLD, 800, .4);
      display(mvp.toUpperCase(), W / 2, 1650, 96, CREAM, W - 240);
      tracked('Fan type', W / 2, 1730, 30, GOLD, 800, .4);
      display(fan.toUpperCase(), W / 2, 1812, 82, CREAM, W - 240);

      const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
      return new File([blob], 'bees-wrapped-2026.png', { type: 'image/png' });
    }

    return {
      prepare() { return making ||= make().then(f => (file = f)).catch(() => null); },
      get file() { return file; },
    };
  })();

  document.getElementById('share').addEventListener('click', async () => {
    tip.hide();
    // Hold the story while the share sheet is up (and while they're off in another app posting it), then pick
    // up where it was. If they'd paused it themselves, it stays paused.
    const wasPaused = paused;
    setPaused(true);
    // the link opens the slide being shared; the image (when the device can send one) is for Instagram and co.
    const title = 'My Salt Lake Bees Wrapped', url = shareUrl(), file = shareCard.file;
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file], url })) await navigator.share({ files: [file], url, title });
      else if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); showToast('Link copied'); }
    } catch (e) {
      if (e && e.name !== 'AbortError') showToast('Sharing isn’t available here');   // AbortError: they closed the sheet
    }
    if (document.hidden) await new Promise(ok => document.addEventListener('visibilitychange', ok, { once: true }));
    if (!wasPaused && !closed) setPaused(false);
    shareCard.prepare();   // in case it wasn't ready yet
  });

  // ---------- Fan-type pennant lettering ----------
  // Real felt pennants taper their lettering with the felt: big at the pole, smaller toward the tip. Each
  // letter is sized to the pennant's height where it sits and set on its gently drooping middle, using the
  // real glyph widths once the font has loaded, so any fan-type name fits.
  (async () => {
    const word = frame.querySelector('.pn-word');
    if (!word) return;
    try { await document.fonts.ready; } catch (_) {}
    const NS = 'http://www.w3.org/2000/svg';
    const [x0, top0, bot0, tipX, tipY] = [72, 5, 255, 624, 140];   // the felt body's edges, in its viewBox units
    const top = x => top0 + (x - x0) * (tipY - top0) / (tipX - x0);
    const bot = x => bot0 + (x - x0) * (tipY - bot0) / (tipX - x0);
    const END = x0 + .7 * (tipX - x0);   // the word ends ~70% along, so the taper stays gentle and the tail letters stay big
    // Lay the word out with every letter's size a fixed share k of the pennant's height where it sits
    function layout(k) {
      word.textContent = '';
      let x = 92;
      for (const ch of word.dataset.word.toUpperCase()) {
        const t = document.createElementNS(NS, 'tspan');
        t.textContent = ch;
        word.append(t);
        let size = k * (bot(x) - top(x)), w = 0;
        for (let i = 0; i < 3; i++) {                                 // settle on the size at the letter's middle
          t.setAttribute('font-size', size.toFixed(2));
          w = t.getComputedTextLength();
          size = k * (bot(x + w / 2) - top(x + w / 2));
        }
        t.setAttribute('font-size', size.toFixed(2));
        w = t.getComputedTextLength();
        t.setAttribute('x', x.toFixed(1));
        t.setAttribute('y', ((top(x + w / 2) + bot(x + w / 2)) / 2 + size * .35).toFixed(1));   // centered on the middle line
        x += w + size * .03;
      }
      return x;
    }
    // ...and pick the share that lands the word's end at END (never more than the felt allows)
    let lo = .2, hi = .74;
    for (let i = 0; i < 14; i++) { const k = (lo + hi) / 2; if (layout(k) > END) hi = k; else lo = k; }
    layout(lo);
  })();

  // ---------- "Share your story here!" tip ----------
  // A white bubble that springs up over the share button (which hops along with it) the first time
  // the games slide shows. It leaves a few seconds later, or straight away if the viewer moves on
  // or taps share.
  const tip = (() => {
    const el = document.getElementById('share-tip'), btn = document.getElementById('share');
    const slide = frame.querySelector('.s-games');
    const IN = 2600, STAY = 3200;   // ms after the slide opens; ms it stays up
    let anims = [], shown = false;
    const clear = () => { anims.forEach(a => a.cancel()); anims = []; };

    function show() {
      shown = true;
      anims = [
        el.animate([{ opacity: 0, transform: 'translateY(10px) scale(.6)' }, { opacity: 1, transform: 'translateY(0px) scale(1)' }],
          { duration: 450, delay: IN, easing: 'cubic-bezier(.3,1.5,.55,1)', fill: 'both' }),
        btn.animate([{ transform: 'none' }, { transform: 'translateY(-5px) scale(1.15)', offset: .35 }, { transform: 'none' }],
          { duration: 520, delay: IN, easing: 'ease-out' }),
      ];
      const stay = frame.animate([], { duration: IN + 450 + STAY });
      anims.push(stay);
      stay.finished.then(hide).catch(() => {});
      if (paused) pauseAnims(anims, true);
    }

    function hide() {
      if (!anims.length) return;
      const cs = getComputedStyle(el);
      if (+cs.opacity < .01) return clear();   // it hadn't shown yet
      const out = el.animate([{ opacity: cs.opacity, transform: cs.transform }, { opacity: 0, transform: 'translateY(6px) scale(.85)' }],
        { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      clear();
      anims = [out];
      out.finished.then(clear).catch(() => {});
    }

    return {
      slideChanged() { if (shared) return; if (slides[cur] === slide) { if (!shown) show(); } else hide(); },
      hide,
      pause: p => pauseAnims(anims, p),
      reset: clear,
    };
  })();

  // ---------- Intro ----------
  // HEYYYYYY sweep → Hey → there → the greeting lifts and the batter clip rises in under it →
  // the hit → both whisk off → a beat of black → the baseball rolls in and flies → its title → scroll cue
  const sweepEl = frame.querySelector('.sweep');
  const greetEl = frame.querySelector('.greeting');
  const heyEl = frame.querySelector('.hey > span');
  const nameEl = frame.querySelector('.name > span');
  const cueEl = frame.querySelector('.cue > span');
  const hitEl = frame.querySelector('.intro-hit');      // the clip plus its impact drawings; moves as one
  const clipEl = frame.querySelector('.hit-clip');
  const burstEl = frame.querySelector('.hit-burst');
  const flashEl = frame.querySelector('.intro-flash');
  const ballEl = frame.querySelector('.intro-ball');
  const seamsEl = frame.querySelector('.ball-seams');
  const floatEl = frame.querySelector('.ball-float');
  const titleEl = frame.querySelector('.intro-title');
  const logoEl = frame.querySelector('.ball-logo');
  const GOLD = '#E9B949', WHITE = '#FFFFFF';
  const HIT = { contact: 42 / 24, whiskAt: 42 / 24 };   // seconds into big-hit.mp4; the batter flicks away on contact
  let introRun = 0, hitPlaying = false;

  // Impact starbursts: three hand-drawn-looking variations, gold spikes with white ones inside
  const bursts = (() => {
    let seed = 11;
    const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const star = (spikes, inner, outer, turn) => {
      let d = '';
      for (let i = 0; i < spikes * 2; i++) {
        const tip = i % 2 === 0;
        const a = (i + (tip ? rand() * .6 - .3 : 0)) / (spikes * 2) * Math.PI * 2 + turn;
        const r = tip ? outer * (.55 + rand() * .45) : inner * (.75 + rand() * .5);
        d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1);
      }
      return d + 'Z';
    };
    return [0, 1, 2].map(k => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = `<path class="gold" d="${star(15, 24, 100, k * .7)}"/><path class="white" d="${star(11, 14, 66, k * .7 + .2)}"/>`;
      burstEl.append(g);
      return g;
    });
  })();

  // Runs cues against the clip's own clock, frame by frame: each fires once, the moment the clip
  // shows its time (or as soon as the clip ends)
  function watchHit(run, cues) {
    const perFrame = 'requestVideoFrameCallback' in clipEl;
    const next = () => perFrame ? clipEl.requestVideoFrameCallback(check) : requestAnimationFrame(() => check());
    function check(_, meta) {
      if (run !== introRun) return;
      const t = meta ? meta.mediaTime : clipEl.currentTime;
      while (cues.length && (t >= cues[0].at - .01 || clipEl.ended)) cues.shift().fn();
      if (cues.length) next();
    }
    next();
  }

  // Speed lines: streaks of sky streaming past as the camera flies after the ball. Their motion is
  // the camera's, read off the screen every frame. The sky is still, so while the batter's scene
  // whisks away the lines move exactly with it. The ball flies right at CRUISE, so while it rolls
  // in they move like the ball minus that flight (fast and angled as the camera catches up,
  // easing to level), and once it's in place they stream straight past at CRUISE. In the black
  // beat between, the camera coasts.
  const sky = (() => {
    const canvas = frame.querySelector('.sky-lines');
    const ctx = canvas.getContext('2d');
    const CRUISE = 1.8, MAX = 5;   // the ball's flying speed and the camera's top speed, in screen widths a second
    const rand = (a, b) => a + Math.random() * (b - a);
    const shift = el => { const t = getComputedStyle(el).transform; const m = t === 'none' ? new DOMMatrix() : new DOMMatrix(t); return [m.e, m.f]; };
    let W = 0, H = 0, raf = 0, last = 0, lines = [], vx = 0, vy = 0, goal = [0, 0];
    let prevHit, prevBall, ballStart, ballMoving = false, settled = false, offAt = 0;

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    new ResizeObserver(resize).observe(canvas);

    const streak = speed => Math.min(.55 * W, Math.max(.06 * W, speed * .11));   // longer streaks the faster we go

    // Somewhere on screen, or (upstream) just off the edge the motion will carry it in from
    function place(l, upstream) {
      l.x = rand(0, W); l.y = rand(0, H);
      const s = Math.hypot(vx, vy);
      if (!upstream || s < 1) return;
      const ux = vx / s, uy = vy / s;
      const back = Math.min(ux > 0 ? l.x / ux : ux < 0 ? (l.x - W) / ux : Infinity,
                            uy > 0 ? l.y / uy : uy < 0 ? (l.y - H) / uy : Infinity) + streak(s) * l.lk;   // just off screen
      l.x -= ux * back; l.y -= uy * back;
    }

    function step(dt) {
      let t = null;
      if (settled) t = [-CRUISE * W, 0];   // the ball is in place: steady flight, nothing left to read
      else {
        const hit = shift(hitEl), ball = shift(ballEl);
        ballMoving ||= Math.hypot(ball[0] - ballStart[0], ball[1] - ballStart[1]) > .5;
        if (ballMoving) t = [(ball[0] - prevBall[0]) / dt - CRUISE * W, (ball[1] - prevBall[1]) / dt];
        else if (hit[0] !== prevHit[0] || hit[1] !== prevHit[1]) t = [(hit[0] - prevHit[0]) / dt, (hit[1] - prevHit[1]) / dt];
        settled = ballMoving && !ball[0] && !ball[1];
        prevHit = hit; prevBall = ball;
      }
      if (t) { const s = Math.hypot(t[0], t[1]), k = Math.min(1, MAX * W / (s || 1)); goal = [t[0] * k, t[1] * k]; }
      const ease = 1 - Math.exp(-dt / .08);   // smooths out frame-to-frame jitter
      vx += (goal[0] - vx) * ease; vy += (goal[1] - vy) * ease;
      for (const l of lines) {
        l.x += vx * l.k * dt; l.y += vy * l.k * dt;
        const off = l.x < -.6 * W || l.x > 1.6 * W || l.y < -.6 * W || l.y > H + .6 * W;
        const ahead = (l.x - W / 2) * vx + (l.y - H / 2) * vy > 0;   // past the middle, going away
        if (off && ahead || l.x < -2 * W || l.x > 3 * W || l.y < -2 * W || l.y > H + 2 * W) place(l, true);
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const s = Math.hypot(vx, vy);
      if (s < 1) return;
      const ux = vx / s, uy = vy / s, len = streak(s);
      ctx.lineCap = 'round';
      for (const l of lines) {
        const tail = len * l.lk, tx = l.x - ux * tail, ty = l.y - uy * tail;
        const g = ctx.createLinearGradient(tx, ty, l.x, l.y);
        g.addColorStop(0, l.gold ? 'rgba(233,185,73,0)' : 'rgba(255,255,255,0)');
        g.addColorStop(1, l.gold ? 'rgba(233,185,73,.7)' : 'rgba(255,255,255,.5)');
        ctx.strokeStyle = g; ctx.lineWidth = l.w;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(l.x, l.y); ctx.stroke();
      }
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(.05, (now - last) / 1000);
      last = now;
      if (offAt && now > offAt) { cancelAnimationFrame(raf); raf = 0; return; }   // slide 1 has slid away: stop
      if (!dt || frame.classList.contains('paused')) return;
      step(dt); draw();
    }

    return {
      start() {   // call once the whisk and the ball's roll-in are set up
        if (reduceMotion) return;
        cancelAnimationFrame(raf);
        resize();
        vx = vy = 0; goal = [0, 0]; ballMoving = settled = false; offAt = 0;
        prevHit = shift(hitEl); prevBall = ballStart = shift(ballEl);
        lines = Array.from({ length: 14 }, (_, i) => {
          const l = { k: rand(.75, 1.3), lk: rand(.7, 1.3), w: rand(1.4, 2.4), gold: i % 3 === 0 };   // k: depth, lk: length
          place(l, false);
          return l;
        });
        last = performance.now();
        raf = requestAnimationFrame(tick);
      },
      stop() { cancelAnimationFrame(raf); raf = 0; lines = []; ctx.clearRect(0, 0, W, H); },
      // go() says whether the first slide is up. Leaving it, the lines keep streaming through the
      // 0.6s slide transition and then stop; coming back, they pick up again.
      showing(on) {
        if (!lines.length) return;   // not started yet (or stopped for a restart)
        if (!on) { offAt ||= performance.now() + 700; return; }
        offAt = 0;
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      },
    };
  })();

  async function runIntro() {
    introAnims.forEach(a => a.cancel());
    idleAnims.forEach(a => a.cancel());
    introAnims = []; idleAnims = [];
    sky.stop();
    const run = ++introRun;
    clipEl.pause(); clipEl.currentTime = 0; hitPlaying = false;
    introRunning = true; awaitingScroll = false;
    frame.classList.add('intro');
    try { await document.fonts.ready; } catch (_) {}
    if (run !== introRun) return;

    const W = frame.clientWidth, H = frame.clientHeight;
    const pos = { // offsets from center
      heyMid:    [-0.035 * W, 0.008 * H],   // quick in-between hop, a little off the straight path
      heyFinal:  [-0.15 * W, -0.048 * H],
      nameStart: [-0.05 * W,  0.10 * H],
      nameMid:   [-0.01 * W,  0.094 * H],
      nameFinal: [ 0.12 * W,  0.044 * H],
      cue:       [ 0,         0.335 * H],   // under the baseball
    };
    const lift = `translateY(${-0.29 * H}px)`;   // where the greeting moves to make room for the clip
    const t = (x, y, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;
    const add = (el, kf, opts) => { const a = el.animate(kf, { fill: 'both', ...opts }); introAnims.push(a); return a; };
    let at = 1000; // after the start screen fades to black

    if (!reduceMotion) {
      // 1. HEYYYYYY sweeps in from the right and all the way off the left
      const travel = W + sweepEl.offsetWidth + sweepEl.offsetHeight * .2; // extra so the skewed edge clears
      add(sweepEl, [
        { transform: 'translate(0, -50%) skewX(-6deg)' },
        { transform: `translate(${-travel}px, -50%) skewX(-6deg)` }
      ], { duration: 2000, delay: at, easing: 'cubic-bezier(.7,0,1,.4)' });
      at += 2000 + 40;
    }
    const beesFrom = at;   // the bees arrive as HEYYYYYY clears

    // Bees: a few dart and jerk around like real bees through "Hey, there", then zip off when the
    // batter clip comes up. Every run is a fresh random flight. Each bee is one animation (its
    // heading follows its path; the image points head-up), so pausing holds them too.
    function bees(from, until) {
      const rand = (a, b) => a + Math.random() * (b - a);
      const tf = (x, y, r) => `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg)`;
      const face = (dx, dy, prev) => {   // heading toward (dx, dy), kept within half a turn of the last one
        let a = Math.atan2(dx, -dy) * 180 / Math.PI;
        while (a - prev > 180) a -= 360;
        while (a - prev < -180) a += 360;
        return a;
      };
      const span = until - from;
      const all = frame.querySelectorAll('.intro-bee');
      all.forEach((el, n) => {
        const a0 = n / all.length * Math.PI * 2 + rand(-.5, .5);   // each comes in from its own side
        let x = Math.cos(a0) * .9 * W, y = Math.sin(a0) * .8 * H, r = face(-x, -y, 0);
        let t = n * 70 + rand(0, 260);
        const kf = [[0, x, y, r, 'linear'], [t, x, y, r, 'linear']];   // wait just off screen
        while (t < span) {
          const nx = rand(-.36, .36) * W, ny = rand(-.28, .28) * H;   // a spot around the greeting
          r = face(nx - x, ny - y, r);
          t += 90;                                                     // snap to face it...
          kf.push([t, x, y, r, 'cubic-bezier(.2,.9,.3,1)']);
          t += Math.min(420, 170 + Math.hypot(nx - x, ny - y) * .42);  // ...dart there...
          x = nx; y = ny;
          kf.push([t, x, y, r, 'ease-in-out']);
          for (let k = 0, step = rand(80, 200); k < 3; k++) {          // ...and hover with little jerks
            t += step;
            kf.push([t, x + rand(-5, 5), y + rand(-5, 5), r + rand(-14, 14), 'ease-in-out']);
          }
        }
        // the batter's coming up: turn away from the middle and zip off, speeding up
        const out = Math.atan2(y, x) + rand(-.6, .6), ex = x + Math.cos(out) * 1.3 * H, ey = y + Math.sin(out) * 1.3 * H;
        t = Math.max(t, span) + 50;
        r = face(ex - x, ey - y, r);
        kf.push([t, x, y, r, 'cubic-bezier(.55,0,.9,.4)']);
        t += rand(480, 640);
        kf.push([t, ex, ey, r, 'linear']);
        add(el, kf.map(([tm, kx, ky, kr, easing]) => ({ offset: tm / t, transform: tf(kx, ky, kr), opacity: 1, easing })),
          { duration: t, delay: from });
      });
    }

    const snap = (el, x, y, color = WHITE) => add(el, [
      { opacity: 1, transform: t(x, y), color },
      { opacity: 1, transform: t(x, y), color }
    ], { duration: 1, delay: at, fill: 'forwards' });
    const pop = (el, x, y) => add(el, [
      { opacity: 0, transform: t(x, y, .4), color: GOLD },
      { opacity: 1, transform: t(x, y, 1.12), color: GOLD, offset: .6 },
      { opacity: 1, transform: t(x, y, 1), color: GOLD }
    ], { duration: 220, delay: at, easing: 'cubic-bezier(.2,.8,.2,1)' });

    // Idle pulse: grows and shrinks in place. Kept out of introAnims (in idleAnims) so it
    // follows the pause state on its own.
    const pulse = (el, x, y) => idleAnims.push(el.animate([
      { transform: t(x, y) },
      { transform: t(x, y, 1.06) }
    ], { duration: 800, delay: at, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));

    // 2. Gold "Hey" pops in at center, hops a step off, then snaps up-left in white
    pop(heyEl, 0, 0);
    at += 220 + 50;
    snap(heyEl, ...pos.heyMid, GOLD);
    at += 70;
    snap(heyEl, ...pos.heyFinal);
    at += 30;

    // 3. Gold "there" pops in low-left, hops a step off, then snaps to center-right in white
    pop(nameEl, ...pos.nameStart);
    at += 220 + 80;
    snap(nameEl, ...pos.nameMid, GOLD);
    at += 70;
    snap(nameEl, ...pos.nameFinal);
    at += 80;

    // Both words start their idle pulse together
    if (!reduceMotion) { pulse(heyEl, ...pos.heyFinal); pulse(nameEl, ...pos.nameFinal); }

    // 4. A beat later the greeting lifts and the batter clip rises in under it, already playing.
    //    The clip itself drives what comes next (see watchHit).
    at += 700;
    let whisked = false;
    const whisk = () => { if (!whisked && run === introRun) { whisked = true; outro(); } };
    if (reduceMotion) {
      // The hit flashes and shakes, so it's skipped: hold the greeting a moment, then move on
      const hold = frame.animate([], { duration: at + 1200 });
      introAnims.push(hold);
      hold.finished.then(whisk).catch(() => {});
    } else {
      bees(beesFrom, at + 60);   // they buzz until the batter clip starts coming up
      add(greetEl, [{ transform: 'translateY(0px)' }, { transform: lift }],
        { duration: 550, delay: at, easing: 'cubic-bezier(.3,.9,.3,1)' });
      add(hitEl, [{ opacity: 1, transform: 'translateY(105%)' }, { opacity: 1, transform: 'translateY(0%)' }],
        { duration: 800, delay: at + 60, easing: 'cubic-bezier(.15,.8,.25,1)' });
      const start = frame.animate([], { duration: at + 160 });
      const watchdog = frame.animate([], { duration: at + 160 + (HIT.whiskAt + 3) * 1000 });   // clip stalled or missing
      introAnims.push(start, watchdog);
      start.finished.then(() => {
        if (run !== introRun) return;
        hitPlaying = true;
        clipEl.play().catch(e => { if (e.name !== 'AbortError') whisk(); });
        watchHit(run, [{ at: HIT.contact, fn: impact }, { at: HIT.whiskAt, fn: whisk }]);
      }).catch(() => {});
      watchdog.finished.then(whisk).catch(() => {});
    }
    if (paused) { pauseAnims(introAnims, true); pauseAnims(idleAnims, true); }

    // The impact, over the clip's held contact frame. Stop-motion timing: every drawing is held for
    // two frames. Frame 0 shows the contact, 1-2 flash white, 3-10 are four starbursts with a shake
    // and a zoom punch. The batter flicks away on frame 0, so the bursts go flying off with him.
    function impact() {
      const F = 1000 / 24;
      const hold = (el, steps, from, to) => add(el, [
        ...steps.map(([f, kf]) => ({ ...kf, offset: (f - from) / (to - from), easing: 'steps(1, end)' })),
        { ...steps.at(-1)[1], offset: 1 }
      ], { duration: (to - from) * F, delay: from * F, fill: 'none' });
      hold(flashEl, [[1, { opacity: 1 }]], 1, 3);
      for (const word of [heyEl, nameEl]) hold(word, [[1, { color: '#000' }]], 1, 3);   // dark on the white
      [[3, bursts[0], 'none'], [5, bursts[1], 'none'], [7, bursts[2], 'none'], [9, bursts[0], 'rotate(24deg)']]
        .forEach(([f, g, transform]) => hold(g, [[f, { opacity: 1, transform }]], f, f + 2));
      hold(burstEl, [[3, { scale: .7 }], [5, { scale: 1 }], [7, { scale: 1.12 }], [9, { scale: 1.2 }]], 3, 11);
      hold(hitEl, [[3, { scale: 1.06 }], [5, { scale: 1.035 }], [7, { scale: 1.015 }], [9, { scale: 1 }]], 3, 11);
      const a = .022 * W;
      const shake = [[3, a, -.7 * a], [5, -.9 * a, .5 * a], [7, .6 * a, -.4 * a], [9, -.3 * a, .2 * a]]
        .map(([f, x, y]) => [f, { translate: `${x}px ${y}px` }]);
      hold(hitEl, shake, 3, 11);
      hold(greetEl, shake, 3, 11);
    }

    function outro() {
      at = 0;

      // 5. On impact the camera whips right and up: the batter and the greeting flick away down
      //    and to the left, speeding up all the way off screen
      const away = (el, from, delay) => add(el, reduceMotion
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ transform: from }, { transform: `${from} translate(${-1.5 * W}px, ${0.35 * H}px) skewX(14deg)` }],
        { duration: reduceMotion ? 300 : 160, delay, easing: 'cubic-bezier(.45,.05,.9,.35)', fill: 'forwards' });
      if (!reduceMotion) away(hitEl, 'translateY(0%)', 0).finished
        .then(() => { clipEl.pause(); hitPlaying = false; }).catch(() => {});
      away(greetEl, lift, 20).finished.then(() => {
        // the words are off screen now, so their pulse can stop
        idleAnims = idleAnims.filter(a => {
          const word = a.effect.target === heyEl || a.effect.target === nameEl;
          if (word) a.cancel();
          return !word;
        });
      }).catch(() => {});
      // Speed lines stream past from the moment the camera whips, through the black, and on
      add(frame.querySelector('.sky-lines'), [{ opacity: 0 }, { opacity: 1 }], { duration: 150, delay: 0 });
      at += 180 + 300;   // the exit (160ms + the greeting's 20ms lag), then a beat of black

      // 6. The baseball rolls in from the right, dropping a little, to the center, spinning very fast
      //    clockwise the whole time
      const roll = { duration: reduceMotion ? 500 : 420, delay: at, easing: 'cubic-bezier(.15,.75,.3,1)' };
      add(ballEl, reduceMotion ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 1, transform: `translate(${W}px, ${-0.15 * H}px)` }, { opacity: 1, transform: 'translate(0px, 0px)' }], roll);
      if (!reduceMotion) idleAnims.push(seamsEl.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 350, delay: at, iterations: Infinity }));
      sky.start();   // now that the whisk and the roll-in exist, the speed lines can follow them
      // Once the ball is centered, the Bees logo fades in over it (it never spins), then pulses
      const landed = at + roll.duration;
      add(logoEl, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 450, delay: landed, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (!reduceMotion) idleAnims.push(logoEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }],
        { duration: 800, delay: landed + 450, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
      // ...and it starts flying: a gentle bob and streaks off its back (the streaks loop in CSS,
      // and are off for reduced motion)
      // (the bob starts at rest from where the ball landed, so there's no jump)
      if (!reduceMotion) idleAnims.push(floatEl.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-0.022 * H}px)` }],
        { duration: 950, delay: landed, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
      add(frame.querySelector('.ball-trail'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: landed });
      at += roll.duration + 100;

      // 7. "The season flew by" slides in from the left above the ball
      add(titleEl, reduceMotion ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: `translateX(${-0.08 * W}px)` }, { opacity: 1, transform: 'translateX(0px)' }],
        { duration: 550, delay: at, easing: 'cubic-bezier(.2,.8,.2,1)' });
      at += 550 + 700;   // the title's slide-in, then a short beat before the cue

      // 8. Once that's had time to land, the scroll cue, and the viewer can move on
      const [cx, cy] = pos.cue;
      add(cueEl, [
        { opacity: 0, transform: `translate(${cx}px, ${cy + 14}px)` },
        { opacity: 1, transform: `translate(${cx}px, ${cy}px)` }
      ], { duration: 450, delay: at, easing: 'cubic-bezier(.2,.8,.2,1)' });

      const done = frame.animate([], { duration: at + 650 });
      introAnims.push(done);
      if (paused) { pauseAnims(introAnims, true); pauseAnims(idleAnims, true); }
      done.finished.then(() => { awaitingScroll = true; }).catch(() => {});
    }
  }

  // The viewer scrolled: bring in the UI and move on to the next slide
  function finishIntro(next) {
    setTimeout(() => shareCard.prepare(), 1500);   // make the share image once the intro's animations are done
    introAnims.forEach(a => a.finish());
    // The scroll cue fades out as the slide goes, then is put away for good
    const fade = cueEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    introAnims.push(fade);
    fade.finished.then(() => introAnims.filter(a => a.effect && a.effect.target === cueEl).forEach(a => a.cancel())).catch(() => {});
    clipEl.pause(); hitPlaying = false;
    introRunning = false; awaitingScroll = false;
    revealUI();
    go(next);
  }

  function revealUI() {
    frame.classList.remove('intro');
    elapsed = 0;
    const ease = 'cubic-bezier(.2,.8,.2,1)';
    const anim = (el, kf, delay, duration = 320) => el.animate(kf, { duration, delay, easing: ease, fill: 'backwards' });
    anim(frame.querySelector('.logo'), [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], 0);
    anim(document.getElementById('close'), [{ opacity: 0, transform: 'scale(.3) rotate(-90deg)' }, { opacity: 1, transform: 'none' }], 30);
    segs.forEach((sg, i) => anim(sg, [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], 60 + i * 30, 260));
    frame.querySelectorAll('.bottom .btn:not(#mute)').forEach((b, i) =>   // the mute button stayed up through the intro
      anim(b, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], 90 + i * 40));
  }

  // ---------- Start screen honeycomb ----------
  // Gray cells whose brightness drifts slowly with a smooth noise field.
  const comb = (() => {
    const canvas = frame.querySelector('.comb-bg');
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, R = 16, running = false, raf = 0, t0 = 0;

    // smooth 3D value noise (x, y, time)
    const perm = new Uint8Array(512);
    (() => { const p = [...Array(256).keys()];
      for (let i = 255; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
    const h = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255;
    const sm = t => t * t * t * (t * (t * 6 - 15) + 10); // quintic: no visible kinks
    const lerp = (a, b, t) => a + (b - a) * t;
    function noise(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const c = (dx, dy, dz) => h(xi + dx, yi + dy, zi + dz);
      return lerp(
        lerp(lerp(c(0,0,0), c(1,0,0), u), lerp(c(0,1,0), c(1,1,0), u), v),
        lerp(lerp(c(0,0,1), c(1,0,1), u), lerp(c(0,1,1), c(1,1,1), u), v), w);
    }

    let img, dither, bgR, bgG, bgB, depth;
    const DRIFT_X = 14, DRIFT_Y = 10;   // px per second the grid travels up and to the left
    const S3 = Math.sqrt(3);

    function layout() {
      W = Math.round(canvas.clientWidth); H = Math.round(canvas.clientHeight);
      if (!W || !H) return;
      canvas.width = W; canvas.height = H;
      img = ctx.createImageData(W, H);
      R = Math.max(12, W / 22);
      dither = new Float32Array(W * H);
      for (let i = 0; i < dither.length; i++) dither[i] = Math.random() - .5;
      // per row (screen space): faint gold wash from the top, cells darker toward the bottom
      bgR = new Float32Array(H); bgG = new Float32Array(H); bgB = new Float32Array(H); depth = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        const f = y / H;
        const a = f < .3 ? .13 - (.09 * f / .3) : f < .65 ? .04 * (1 - (f - .3) / .35) : 0;
        bgR[y] = 233 * a; bgG[y] = 185 * a; bgB[y] = 73 * a;
        depth[y] = .3 + .7 * Math.pow(1 - f, 1.3);
      }
    }

    // Brightness for one cell, sampled at its position in the (scrolling) world, so the
    // light and dark patches travel with the grid.
    function cellValue(cx, cy, t) {
      const scale = 1 / (R * 5);
      // Two noise layers, each travelling diagonally through the noise volume, so cells
      // never all ease to a stop at the same moment.
      const u = cx * scale, v = cy * scale, T = t * 1.1;
      const n1 = noise(u + .31 * T, v - .17 * T, .23 * u + .41 * v + .5 * T);
      const n2 = noise(1.7 * v + .21 * T + 5.3, 1.7 * u - .27 * T, .37 * v - .19 * u + .45 * T + 9.1);
      const n = Math.min(1, Math.max(0, (n1 * .6 + n2 * .4 - .5) * 1.6 + .5));
      return .03 + .06 * n;
    }

    // Drawn per pixel with dithering: at these dark levels a screen has only a few gray steps,
    // and dithering lets a cell cross each step a few pixels at a time, so fades stay smooth.
    function draw(now) {
      if (!img) return;
      const t = (now - t0) / 1000;
      const Ox = DRIFT_X * t, Oy = DRIFT_Y * t;           // world offset: content moves up-left
      const inr = R * .9 * S3 / 2;

      // brightness for every cell currently on screen
      const rMin = Math.floor(Oy / (1.5 * R)) - 2, rMax = Math.ceil((Oy + H) / (1.5 * R)) + 2;
      const qMin = Math.floor((S3 / 3 * Ox - (Oy + H) / 3) / R) - 2;
      const qMax = Math.ceil((S3 / 3 * (Ox + W) - Oy / 3) / R) + 2;
      const QN = qMax - qMin + 1;
      const vals = new Float32Array(QN * (rMax - rMin + 1));
      for (let r = rMin; r <= rMax; r++) for (let q = qMin; q <= qMax; q++)
        vals[(r - rMin) * QN + (q - qMin)] = cellValue(R * S3 * (q + r / 2), R * 1.5 * r, t);

      const d = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        const wy = y + .5 + Oy;
        const br = bgR[y], bg = bgG[y], bb = bgB[y], dep = depth[y];
        const fr = (2 / 3 * wy) / R;
        for (let x = 0; x < W; x++, i++) {
          const wx = x + .5 + Ox;
          // world pixel -> nearest pointy-top hex (cube rounding)
          const fq = (S3 / 3 * wx - wy / 3) / R, fs = -fq - fr;
          let q = Math.round(fq), r = Math.round(fr);
          const s2 = Math.round(fs);
          const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s2 - fs);
          if (dq > dr && dq > ds) q = -r - s2; else if (dr > ds) r = -q - s2;
          // soft anti-aliased edge: distance from the cell center to its border
          const ox = wx - R * S3 * (q + r / 2), oy = wy - R * 1.5 * r;
          const dist = Math.max(Math.abs(ox), Math.abs(ox * .5 + oy * S3 / 2), Math.abs(ox * .5 - oy * S3 / 2));
          const cov = inr - dist + .5;
          const a = cov <= 0 ? 0 : vals[(r - rMin) * QN + (q - qMin)] * dep * (cov >= 1 ? 1 : cov);
          const n = dither[i], o = i * 4;
          d[o]     = br + a * (200 - br) + n;
          d[o + 1] = bg + a * (200 - bg) + n;
          d[o + 2] = bb + a * (200 - bb) + n;
          d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    let lastDraw = 0;
    function loop(now) {
      if (!running || document.hidden) { raf = 0; return; }
      // The grid drifts less than half a pixel per 30 Hz frame. Avoid running the
      // full per-pixel noise pass 120 times a second on high-refresh displays.
      const interval = 1000 / 30, delta = now - lastDraw;
      if (delta >= interval - .5) { draw(now); lastDraw = now - Math.max(0, delta - interval) % interval; }
      raf = requestAnimationFrame(loop);
    }

    new ResizeObserver(() => {
      if (frame.classList.contains('is-picking')) { layout(); draw(performance.now()); }
    }).observe(canvas);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf); raf = 0;
      if (running && !document.hidden) raf = requestAnimationFrame(loop);
    });

    return {
      start() {
        if (running) return;
        layout();
        t0 = t0 || performance.now();
        draw(performance.now());
        if (reduceMotion) return;
        running = true;
        raf = requestAnimationFrame(loop);
      },
      stop() { running = false; cancelAnimationFrame(raf); }
    };
  })();

  function openPicker() {
    closed = true; setPaused(true);
    sound.end();
    tip.reset();
    frame.classList.add('is-picking');
    comb.start();
    frame.querySelector('.choice').focus({ preventScroll: true });
  }
  document.getElementById('close').addEventListener('click', openPicker);
  frame.querySelectorAll('.choice').forEach(btn => btn.addEventListener('click', () => {
    // Straight back to the start: .snap turns the slide transition off, so the slides in between
    // don't sweep past on the way. It stays on until the next frame, which is when the finale
    // backdrop (slides.js) has gone too.
    sound.begin();   // the music starts with the story (browsers only let audio start from a tap like this one)
    frame.classList.add('intro', 'snap');
    introRunning = false;
    closed = false;
    go(0);
    requestAnimationFrame(() => { void frame.offsetWidth; frame.classList.remove('snap'); });
    frame.classList.remove('is-picking');
    setTimeout(comb.stop, 700);
    runIntro();
  }));

  document.addEventListener('touchstart', () => {}, { passive: true });
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-hidden', document.hidden);
    last = null;
    if (document.hidden) { cancelAnimationFrame(tickRaf); tickRaf = 0; }
    else requestTick();
  });
  if (shared) {
    // Someone else's slide: straight to it, held there (no auto-advance, no progress bar, no start screen)
    slides[sharedIndex].setAttribute('data-hold', '');
    frame.classList.add('shared');
    history.replaceState(null, '', shareUrl());   // tidy the address (the edge adds c=1 on the way in)
    closed = false;
    go(sharedIndex);
    setTimeout(() => shareCard.prepare(), 1500);
  } else {
    go(0);
    openPicker();
  }
  requestTick();
})();
