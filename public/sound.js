// Sound: the background music and every sound effect, through one Web Audio graph. Nothing plays on the
// start screen; the music starts on the tap that starts the story (browsers only let audio start from a
// tap), and the mute button stays up through the intro. app.js runs it: begin(), pause(), mute() and end().
// The effects are synthesized here, so there are no sound files to load. Most are cued by the slides'
// own CSS animations (animationstart), which keeps them in step with the motion and paused with it;
// slides.js cues the number reels and the fireworks. Each effect is panned to where its element sits.
//
// The music is music.mp3, cut from "background music.mp3" by tools/build-music.js: it starts at the
// section break about halfway through the song (95.75s), fades in, and then loops a 24-bar stretch of it
// (117.03s to 157.88s, 141 BPM) whose two ends match. The seam is crossfaded in the file, so the loop
// points below land on identical audio and the jump can't click.
//
// To hear one effect on its own, run sound.preview('card') in the console (names are in FX below), and
// set sound.log = true to see each effect named as it plays.
window.sound = (() => {
  const MUSIC = { src: 'music.mp3', start: .2, loopStart: 21.478186, loopEnd: 62.329252, fadeIn: 3.5 };
  const LEVEL = { music: .5, fx: .55, duck: .12 };   // duck: the music's share while a video plays
  const frame = document.getElementById('frame');
  const finaleBg = frame.querySelector('.finale-bg');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;   // no effects: everything spawns at once
  const RATE = 44100;   // the music's own rate: the live context runs at it too, so the track plays without resampling
  let ctx = null, kit = null, bus = null, fxBus = null, muteGain = null, pauseGain = null, musicBus = null;
  let track = null, music = null, begun = false, paused = false, muted = false, suspendTimer = 0, soft = 0, lastTick = 0;

  // The music loads and decodes behind the start screen, so it can start the moment the story does.
  // Decoding needs a context, and an offline one is allowed before any tap.
  const bytes = fetch(MUSIC.src).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  const decode = c => bytes.then(b => b && new Promise((ok, fail) => c.decodeAudioData(b, ok, fail)))
    .then(buf => { track = buf; startMusic(); })
    .catch(() => {});
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Offline) decode(new Offline(2, 1, RATE));

  // ---------- Building blocks ----------
  // A kit is what the effects draw on: a context, a loop of white noise and a small room to play in
  function makeKit(c, out) {
    const rate = c.sampleRate, noise = c.createBuffer(1, rate * 2, rate), n = noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    // the room: decaying noise that darkens as it fades, after a short gap (the first reflection)
    const len = Math.round(rate * 1.6), ir = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        lp += (Math.random() * 2 - 1 - lp) * (.55 - .45 * t / 1.6);
        d[i] = t < .012 ? 0 : lp * Math.exp(-t / .3);
      }
    }
    const room = c.createConvolver();
    room.buffer = ir;
    const roomOut = c.createGain();
    roomOut.gain.value = .5;
    room.connect(roomOut).connect(out);
    return { c, noise, room };
  }

  // One effect's output: its level, where it sits left to right, and how much of it reaches the room
  function voice(k, dest, { gain = 1, pan = 0, wet = .15 } = {}) {
    const g = k.c.createGain();
    g.gain.value = gain;
    let o = g;
    if (pan && k.c.createStereoPanner) {
      const p = k.c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      o = p;
    }
    o.connect(dest);
    if (wet) {
      const send = k.c.createGain();
      send.gain.value = wet;
      o.connect(send).connect(k.room);
    }
    return g;
  }

  // A gain that rises to `peak` in `a` seconds, holds, then dies away (time constant `d`)
  function env(k, dest, t, a, peak, d, hold = 0) {
    const g = k.c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0, t + a + hold, d);
    g.connect(dest);
    return g;
  }

  // An oscillator, optionally gliding to `to` over `glide` seconds
  function tone(k, dest, t, { type = 'sine', f, to, glide = .1, a = .002, peak = .3, d = .08, hold = 0 }) {
    const o = k.c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + glide);
    o.connect(env(k, dest, t, a, peak, d, hold));
    o.start(t);
    o.stop(t + a + hold + d * 7);
    return o;
  }

  // Filtered noise, optionally sweeping the filter to `to` over `glide` seconds
  function hiss(k, dest, t, { type = 'bandpass', f = 2000, to, glide = .2, q = 1, a = .002, peak = .3, d = .03, hold = 0 }) {
    const s = k.c.createBufferSource(), fl = k.c.createBiquadFilter();
    s.buffer = k.noise;
    s.loop = true;
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + glide);
    s.connect(fl).connect(env(k, dest, t, a, peak, d, hold));
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + hold + d * 7);
    return fl;
  }

  // CSS keyframes ([offset, value] pairs, eased in and out between them) as a curve for an AudioParam
  function curveOf(frames, scale = 1, n = 120) {
    const ease = t => t * t * (3 - 2 * t);
    return Float32Array.from({ length: n }, (_, i) => {
      const x = i / (n - 1);
      let j = 1;
      while (frames[j][0] < x) j++;
      const [x0, y0] = frames[j - 1], [x1, y1] = frames[j];
      return scale * (y0 + (y1 - y0) * ease((x - x0) / (x1 - x0 || 1)));
    });
  }
  const FLICKER = curveOf([[0, 0], [.16, .8], [.28, 0], [.48, 1], [.58, .65], [.74, 1], [1, 1]]);   // fx-flicker in slides.css
  const rand = (a, b) => a + Math.random() * (b - a);
  const PENTA = [0, 2, 4, 7, 9];

  // ---------- The effects ----------
  // Each one is (kit, output, start time, options). Levels are set so they sit just over the music.
  const FX = {
    // something popping into place, with a glint for the big script words
    pop(k, dest, t, { pan = 0, pitch = 1, big = false, gain = .4 }) {
      const v = voice(k, dest, { gain, pan, wet: .18 });
      tone(k, v, t, { f: 640 * pitch, to: 210 * pitch, glide: .07, peak: .55, d: .045 });
      hiss(k, v, t, { type: 'highpass', f: 2500, a: .001, peak: .22, d: .006 });
      if (big) { tone(k, v, t + .01, { f: 2093, peak: .07, d: .12 }); tone(k, v, t + .05, { f: 3136, peak: .04, d: .1 }); }
    },
    // a ticket dealt onto the pile: a paper swish, then a soft slap as it lands
    deal(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .5, pan, wet: .12 });
      hiss(k, v, t, { f: 3800, to: 1400, glide: .25, q: .7, a: .03, peak: .5, hold: .08, d: .07 });
      hiss(k, v, t + .36, { type: 'lowpass', f: 2400, q: .5, a: .001, peak: .32, d: .015 });
      tone(k, v, t + .36, { f: 170, to: 120, glide: .05, a: .001, peak: .2, d: .03 });
    },
    // a Diamond Club pass dealt out, chiming as it lands, a step higher for each one
    pass(k, dest, t, { pan = 0, n = 0 }) {
      FX.deal(k, dest, t, { pan });
      FX.pip(k, dest, t + .36, { pan, n });
    },
    // a bank of stadium lights powering on: two contactor clunks and an electrical hum that follows the
    // flicker (fx-flicker), then fades as the lamps settle
    lights(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .55, pan, wet: .3 });
      for (const [at, s] of [[.01, 1], [.6, .8]]) {
        tone(k, v, t + at, { f: 75, to: 40, glide: .12, a: .002, peak: .6 * s, d: .07 });
        hiss(k, v, t + at, { f: 1100, q: 1.5, a: .001, peak: .3 * s, d: .02 });
        tone(k, v, t + at + .005, { f: 1870, peak: .04 * s, d: .12 });
        tone(k, v, t + at + .005, { f: 2650, peak: .025 * s, d: .09 });
      }
      const level = k.c.createGain(), lp = k.c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      level.gain.setValueCurveAtTime(FLICKER.map(x => x * .1), t, 2);
      level.gain.setTargetAtTime(0, t + 2.3, .7);
      lp.connect(level).connect(v);
      for (const [type, f, g] of [['sawtooth', 60, 1], ['sawtooth', 120.4, .6], ['square', 180.2, .12]]) {
        const o = k.c.createOscillator(), og = k.c.createGain();
        o.type = type;
        o.frequency.value = f;
        og.gain.value = g;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + 6);
      }
    },
    // a sunburst opening behind a slide: a low swell of air
    swell(k, dest, t, { gain = .4 }) {
      const v = voice(k, dest, { gain, wet: .35 });
      hiss(k, v, t, { type: 'lowpass', f: 250, to: 2600, glide: .9, q: .7, a: .5, peak: .45, hold: .1, d: .35 });
      tone(k, v, t, { f: 55, to: 48, glide: 1, a: .35, peak: .35, d: .4 });
    },
    // a calendar dot filling in: a mallet note, climbing a pentatonic scale as the games add up
    plink(k, dest, t, { pan = 0, n = 1 }) {
      const i = Math.round((n - 1) * 11 / 27), semis = 12 * Math.floor(i / 5) + PENTA[i % 5];
      const f = 293.66 * 2 ** (semis / 12), v = voice(k, dest, { gain: .38, pan, wet: .22 });
      tone(k, v, t, { f, peak: .32, d: .09 });
      tone(k, v, t, { f: f * 4, a: .001, peak: .07, d: .02 });
    },
    // a number reel clicking over
    tick(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .4, pan, wet: .04 });
      hiss(k, v, t, { f: 3400, q: 3, a: .0005, peak: .5, d: .004 });
      tone(k, v, t, { f: 2100, a: .0005, peak: .08, d: .008 });
    },
    // a number landing: a knock for small ones, a bell for the big ones
    land(k, dest, t, { pan = 0, value = 0 }) {
      const v = voice(k, dest, { gain: .45, pan, wet: .25 });
      if (value >= 100) {
        tone(k, v, t, { f: 880, peak: .24, d: .35 });
        tone(k, v, t, { f: 2428, peak: .08, d: .15 });
        tone(k, v, t, { f: 4752, peak: .04, d: .08 });
        tone(k, v, t, { f: 90, to: 55, glide: .1, peak: .4, d: .08 });
      } else {
        const f = value >= 25 ? 520 : 620;
        tone(k, v, t, { f, to: f * .77, glide: .04, a: .001, peak: .38, d: value >= 25 ? .07 : .05 });
        tone(k, v, t, { f: f * 2, a: .001, peak: .07, d: .04 });
        hiss(k, v, t, { f: 1500, q: 2, a: .001, peak: .2, d: .01 });
      }
    },
    // a scoreboard plate flapping down
    flap(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .55, pan, wet: .1 });
      hiss(k, v, t, { f: 2300, q: 1.4, a: .001, peak: .5, d: .008 });
      tone(k, v, t, { f: 320, to: 260, glide: .03, a: .001, peak: .22, d: .025 });
    },
    // the MVP card flipping over: a rising sweep, then a shimmering chord and sparkles as it faces you
    card(k, dest, t) {
      const v = voice(k, dest, { gain: .9, wet: .45 });
      hiss(k, v, t, { f: 450, to: 2800, glide: .7, q: .8, a: .45, peak: .5, hold: .05, d: .12 });
      for (const f of [659.3, 830.6, 987.8, 1318.5]) {
        tone(k, v, t + .75, { f, a: .015, peak: .07, d: .45 });
        tone(k, v, t + .75, { f: f * 1.004, a: .02, peak: .035, d: .4 });
      }
      for (let i = 0; i < 8; i++) {
        const s = voice(k, dest, { gain: .5, pan: rand(-.6, .6), wet: .5 });
        tone(k, s, t + .75 + i * .07 + rand(0, .04), { f: rand(2600, 5200), a: .001, peak: .05, d: .05 });
      }
    },
    // soda pouring into the cup: the stream, fizz, bubbles and a couple of ice clinks
    pour(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .85, pan, wet: .2 });
      const wobble = k.c.createGain();
      wobble.gain.setValueCurveAtTime(Float32Array.from({ length: 40 }, () => rand(.6, 1)), t, 1.3);
      wobble.connect(v);
      hiss(k, wobble, t, { f: 750, q: .6, a: .06, peak: .35, hold: 1.1, d: .18 });
      hiss(k, v, t, { type: 'highpass', f: 5500, a: .4, peak: .07, hold: .8, d: .3 });
      for (let i = 0; i < 16; i++) {
        const f = rand(500, 1300);
        tone(k, v, t + rand(.1, 1.4), { f, to: f * 1.8, glide: .03, peak: .09, d: .015 });
      }
      for (const [at, f] of [[.05, 2650], [.22, 2890]]) {
        tone(k, v, t + at, { f, peak: .06, d: .07 });
        tone(k, v, t + at, { f: f * 1.5, peak: .04, d: .05 });
      }
    },
    // the donut chart drawing round: a tone rising with it and a soft ding as it closes
    fill(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .7, pan, wet: .3 });
      tone(k, v, t, { type: 'triangle', f: 330, to: 700, glide: 1.1, a: .25, peak: .1, hold: .7, d: .12 });
      tone(k, v, t + 1.1, { f: 1318.5, peak: .12, d: .25 });
    },
    // a bobblehead body dropping into its case and bouncing (fx-drop lands at 45%, 80% and 100%)
    drop(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .55, pan, wet: .12 });
      for (const [at, s] of [[.495, 1], [.88, .45], [1.1, .2]]) {
        tone(k, v, t + at, { f: 120, to: 48, glide: .12, peak: .6 * s, d: .06 });
        hiss(k, v, t + at, { type: 'lowpass', f: 700, q: .5, a: .001, peak: .35 * s, d: .02 });
      }
    },
    // its head on the spring, wobbling at the same rate as fx-bobble-in
    boing(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .5, pan, wet: .15 });
      const o = k.c.createOscillator(), lfo = k.c.createOscillator(), depth = k.c.createGain(), lp = k.c.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = 230;
      lfo.frequency.value = 4.4;
      depth.gain.setValueAtTime(60, t);
      depth.gain.setTargetAtTime(0, t, .45);
      lfo.connect(depth).connect(o.frequency);
      lp.type = 'lowpass';
      lp.frequency.value = 2200;
      o.connect(lp).connect(env(k, v, t, .005, .25, .45));
      tone(k, v, t, { f: 520, to: 230, glide: .06, peak: .12, d: .04 });
      for (const x of [o, lfo]) { x.start(t); x.stop(t + 3.5); }
    },
    // a rubber stamp hitting the case (fx-stamp lands just past half way)
    stamp(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .48, pan, wet: .2 });
      t += .3;
      tone(k, v, t, { f: 95, to: 42, glide: .16, a: .001, peak: .7, d: .08 });
      hiss(k, v, t, { type: 'lowpass', f: 1300, q: .6, a: .001, peak: .45, d: .03 });
      hiss(k, v, t, { f: 1900, q: 1.2, a: .001, peak: .2, d: .012 });
    },
    // a Diamond Club gem appearing: a bright, shimmering ring
    shing(k, dest, t, { pan = 0, pitch = 1 }) {
      const v = voice(k, dest, { gain: .7, pan, wet: .5 });
      for (const f of [1568, 2093, 2637, 3136].map(f => f * pitch)) {
        tone(k, v, t, { f, a: .004, peak: .05, d: .5 });
        tone(k, v, t, { f: f * 1.004, a: .004, peak: .03, d: .45 });
      }
      hiss(k, v, t, { type: 'highpass', f: 6000, a: .002, peak: .12, d: .12 });
      tone(k, v, t, { f: 300, to: 150, glide: .05, peak: .25, d: .04 });
    },
    // a sparkle on the gem
    ting(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .8, pan, wet: .45 });
      tone(k, v, t, { f: 3520, peak: .07, d: .09 });
      tone(k, v, t, { f: 5274, peak: .035, d: .05 });
    },
    // a chime, a step up a major arpeggio for each n
    pip(k, dest, t, { pan = 0, n = 0 }) {
      const f = [1046.5, 1318.5, 1568][n % 3], v = voice(k, dest, { gain: .35, pan, wet: .3 });
      tone(k, v, t, { f, peak: .3, d: .12 });
      tone(k, v, t, { type: 'triangle', f: f * 2, peak: .05, d: .04 });
    },
    // the pennant unfurling: fluttering cloth and a snap as it pulls taut
    unfurl(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .8, pan, wet: .18 });
      const flutter = k.c.createGain(), lfo = k.c.createOscillator(), depth = k.c.createGain();
      flutter.gain.value = .55;
      lfo.type = 'square';
      lfo.frequency.value = 15;
      depth.gain.value = .45;
      lfo.connect(depth).connect(flutter.gain);
      flutter.connect(v);
      lfo.start(t);
      lfo.stop(t + 1.2);
      hiss(k, flutter, t, { f: 1100, q: .9, a: .12, peak: .5, hold: .25, d: .1 });
      hiss(k, v, t + .52, { type: 'highpass', f: 1800, a: .001, peak: .35, d: .012 });
      tone(k, v, t + .52, { f: 240, to: 180, glide: .03, peak: .15, d: .02 });
    },
    // the big baseball rolling in from the right: a bumpy rumble and the air it pushes
    roll(k, dest, t) {
      const v = voice(k, dest, { gain: 1.1, wet: .15 });
      const out = k.c.createStereoPanner ? k.c.createStereoPanner() : k.c.createGain();
      if (out.pan) { out.pan.setValueAtTime(.7, t); out.pan.linearRampToValueAtTime(.1, t + 1.3); }
      out.connect(v);
      const bumps = k.c.createGain(), lfo = k.c.createOscillator(), depth = k.c.createGain();
      bumps.gain.value = .65;
      lfo.frequency.setValueAtTime(12, t);
      lfo.frequency.linearRampToValueAtTime(5, t + 1.4);
      depth.gain.value = .35;
      lfo.connect(depth).connect(bumps.gain);
      bumps.connect(out);
      lfo.start(t);
      lfo.stop(t + 2);
      hiss(k, bumps, t, { type: 'lowpass', f: 380, q: .7, a: .15, peak: .6, hold: .9, d: .2 });
      hiss(k, out, t, { f: 2400, to: 600, glide: 1, q: .9, a: .2, peak: .25, hold: .3, d: .2 });
    },
    // a scouting-report bar growing: a short rising zip, a step higher for each bar
    zip(k, dest, t, { pan = 0, n = 0 }) {
      const f = 380 * (1 + n * .12), v = voice(k, dest, { gain: .6, pan, wet: .2 });
      tone(k, v, t, { type: 'triangle', f, to: f * 2, glide: .45, a: .02, peak: .14, hold: .25, d: .1 });
    },
    // the ballpark coming up behind the last slides: a slow rising swell
    night(k, dest, t) {
      const v = voice(k, dest, { gain: .4, wet: .4 });
      hiss(k, v, t, { type: 'lowpass', f: 200, to: 1800, glide: 1.6, q: .7, a: 1, peak: .3, hold: .2, d: .5 });
      tone(k, v, t, { f: 49, a: .8, peak: .25, d: .6 });
    },
    // fireworks: a thump and a fizz at launch; a boom, its rumble and a crack at the burst, a little late
    // since it's far off. Crackle bursts end in a scatter of snaps; willows sizzle.
    launch(k, dest, t, { pan = 0 }) {
      const v = voice(k, dest, { gain: .3, pan, wet: .3 });
      tone(k, v, t, { f: 150, to: 70, glide: .08, peak: .4, d: .05 });
      hiss(k, v, t, { f: 600, q: .8, a: .001, peak: .25, d: .03 });
      hiss(k, v, t, { type: 'highpass', f: 3500, a: .02, peak: .07, hold: .3, d: .15 });
    },
    burst(k, dest, t, { pan = 0, style = 'peony' }) {
      const v = voice(k, dest, { gain: .28, pan, wet: .45 });
      t += rand(.08, .3);
      tone(k, v, t, { f: 80, to: 34, glide: .5, a: .004, peak: .7, d: .35 });
      hiss(k, v, t, { type: 'lowpass', f: 1600, to: 250, glide: 1, q: .4, a: .004, peak: .6, d: .3 });
      hiss(k, v, t, { type: 'highpass', f: 1200, a: .001, peak: .35, d: .02 });
      if (style === 'crackle') for (let i = 0; i < 26; i++) {
        const s = voice(k, dest, { gain: .45, pan: pan + rand(-.25, .25), wet: .4 });
        hiss(k, s, t + .55 + rand(0, .9), { type: 'highpass', f: 3000, a: .0005, peak: .25, d: .006 });
      }
      if (style === 'willow') hiss(k, v, t + .1, { type: 'highpass', f: 5000, a: .3, peak: .08, hold: .8, d: .6 });
    },
  };

  // ---------- The graph ----------
  //   music → fade → level ─┐
  //   effects → slide group → effects level ─┼→ mute → pause → limiter → speakers
  //   (effects also send to the room) ───────┘
  function build() {
    const limiter = ctx.createDynamicsCompressor();   // catches the moments where effects pile onto the music
    limiter.threshold.value = -4;
    limiter.knee.value = 4;
    limiter.ratio.value = 10;
    limiter.attack.value = .003;
    limiter.release.value = .2;
    pauseGain = ctx.createGain();
    muteGain = ctx.createGain();
    muteGain.gain.value = muted ? 0 : 1;
    bus = ctx.createGain();
    bus.connect(muteGain).connect(pauseGain).connect(limiter).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = LEVEL.music;
    musicBus.connect(bus);
    fxBus = ctx.createGain();
    fxBus.gain.value = LEVEL.fx;
    fxBus.connect(bus);
    kit = makeKit(ctx, fxBus);
  }

  // Effects play through a group per slide, so leaving a slide cuts off whatever it still had coming
  // (a stamp due to land, a ringing bell). The fireworks' group can also be muffled for the last page.
  const groups = new Map();
  function group(key) {
    let g = groups.get(key);
    if (g) return g.in;
    const level = ctx.createGain();
    g = { in: level, level };
    if (key === finaleBg) {
      g.filter = ctx.createBiquadFilter();
      g.filter.type = 'lowpass';
      level.connect(g.filter).connect(fxBus);
    } else level.connect(fxBus);
    groups.set(key, g);
    if (g.filter) applySoft();
    return g.in;
  }
  function release(key) {
    const g = groups.get(key);
    if (!g || !ctx) return;
    groups.delete(key);
    g.level.gain.setTargetAtTime(0, ctx.currentTime, .04);
    setTimeout(() => g.level.disconnect(), 500);
  }
  // muffled and quieter as the last page softens (p from 0 to 1), like its blurred backdrop
  function applySoft() {
    const g = groups.get(finaleBg);
    if (!g) return;
    g.filter.frequency.setTargetAtTime(18000 * (600 / 18000) ** soft, ctx.currentTime, .1);
    g.level.gain.setTargetAtTime(1 - .45 * soft, ctx.currentTime, .1);
  }

  const live = () => ctx && begun && !muted && !reduceMotion && ctx.state === 'running';
  function play(name, key, opts = {}) {
    if (!live()) return;
    if (api.log) console.log('sound:', name, opts);
    FX[name](kit, group(key), ctx.currentTime + .005, opts);
  }

  // ---------- Music ----------
  function startMusic() {
    if (!track || !begun || music) return;
    const src = ctx.createBufferSource(), fade = ctx.createGain();
    src.buffer = track;
    src.loop = true;
    src.loopStart = MUSIC.loopStart;
    src.loopEnd = MUSIC.loopEnd;
    const t = ctx.currentTime + .05;
    fade.gain.setValueAtTime(0, t);
    fade.gain.setValueCurveAtTime(Float32Array.from({ length: 64 }, (_, i) => (i / 63) ** 2), t, MUSIC.fadeIn);
    src.connect(fade).connect(musicBus);
    src.start(t, MUSIC.start);
    music = { src, fade };
  }
  function stopMusic(seconds) {
    if (!music) return;
    const { src, fade } = music, t = ctx.currentTime;
    music = null;
    if (fade.gain.cancelAndHoldAtTime) fade.gain.cancelAndHoldAtTime(t);
    else { fade.gain.cancelScheduledValues(t); fade.gain.setValueAtTime(fade.gain.value, t); }
    fade.gain.linearRampToValueAtTime(0, t + seconds);
    src.stop(t + seconds + .05);
  }

  // ---------- Videos ----------
  // A story slide's video plays its sound through the graph too, so mute and pause cover it. Each one is
  // only open while its slide is up, and the music ducks under it.
  const videos = new Map();   // video → its gain
  function attach(v) {
    if (videos.has(v)) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    try { ctx.createMediaElementSource(v).connect(g).connect(bus); } catch (_) { return; }
    videos.set(v, g);
  }
  // iPhone only plays a video with sound if it was first started from a tap. On the tap that starts the
  // story, each one starts (silently, since its sound isn't open) and stops again at once.
  function prime() {
    for (const v of frame.querySelectorAll('.slide.story video')) {
      attach(v);
      v.muted = false;
      const p = v.play();
      if (p) p.then(() => { if (!v.closest('.slide').classList.contains('active')) { v.pause(); v.currentTime = 0; } }).catch(() => {});
    }
  }

  // ---------- Cues ----------
  const slideOf = el => el.closest('.slide') || (finaleBg.contains(el) ? finaleBg : null);
  const isOn = key => key === finaleBg ? frame.classList.contains('finale') : key.classList.contains('active');
  // where an element sits across the frame, as a stereo position (kept off the far edges)
  function panOf(el) {
    const f = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
    return f.width ? Math.max(-1, Math.min(1, ((r.left + r.width / 2 - f.left) / f.width * 2 - 1) * .7)) : 0;
  }
  const nth = el => [...el.parentElement.children].indexOf(el);
  function cue(name, el, opts = {}) {
    const key = slideOf(el);
    if (key && isOn(key)) play(name, key, { pan: panOf(el), ...opts });
  }

  // What each slides.css spawn sounds like as it starts. Plain text fading or rising in stays quiet,
  // and so do the despawns and the slide changes.
  const CUES = {
    'fx-flicker': (el, e) => !e.pseudoElement && cue('lights', el),
    'fx-deal': el => el.matches('.pass') ? cue('pass', el, { n: nth(el) }) : cue('deal', el),
    'fx-pop': (el, e) => e.pseudoElement ? null : el.matches('.gem') ? cue('shing', el, { pitch: el.matches('.r') ? 1.26 : 1 }) : cue('pop', el, { big: el.matches('.script') }),
    'fx-burst-in': el => cue('swell', el),
    'fx-dot-on': el => cue('plink', el, { n: +el.style.getPropertyValue('--k') || 1 }),
    'fx-hang': el => cue('flap', el),
    'fx-flip': el => cue('card', el),
    'fx-fill': el => cue('pour', el),
    'fx-draw': el => cue('fill', el),
    'fx-drop': el => cue('drop', el),
    'fx-bobble-in': el => cue('boing', el),
    'fx-stamp': el => cue('stamp', el),
    'fx-twinkle': el => cue('ting', el),
    'fx-unfurl': el => cue('unfurl', el),
    'fx-roll-in': el => cue('roll', el),
    'fx-grow': el => cue('zip', el, { n: nth(el.closest('li')) }),
    'fx-reveal': el => cue('night', el),
  };
  frame.addEventListener('animationstart', e => {
    const c = live() && CUES[e.animationName];
    if (c) c(e.target, e);
  });

  // Leaving a slide cuts off whatever it had left to play
  frame.addEventListener('slideleave', e => release(e.detail));
  new MutationObserver(() => { if (!frame.classList.contains('finale')) release(finaleBg); })
    .observe(frame, { attributes: true, attributeFilter: ['class'] });

  // A hidden tab goes quiet; coming back (or any tap, if the phone suspended the audio) picks up again
  const wake = () => { if (ctx && !paused && !document.hidden && ctx.state !== 'running') ctx.resume().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (ctx && document.hidden) ctx.suspend().catch(() => {}); else wake(); });
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  // Gets audio going; only works inside a tap (or after one)
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      // iPhone: play like a video does, even with the ringer switched off
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
      try { ctx = new AC({ sampleRate: RATE }); } catch (_) { ctx = new AC(); }
      build();
      if (!Offline) decode(ctx);
    }
    const blip = ctx.createBufferSource();   // a silent sample, which is what unlocks audio on iOS
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
    ctx.resume().catch(() => {});
  }

  const api = {
    log: false,
    // On the tap that starts the story: the music fades in (as soon as it's decoded) and the effects start
    begin() {
      unlock();
      if (!ctx) return;
      begun = true;
      prime();
      stopMusic(.05);
      startMusic();
    },
    // Back to the start screen: the music fades out and everything stops
    end() {
      if (!ctx) return;
      begun = false;
      stopMusic(paused ? 0 : .6);
      for (const key of [...groups.keys()]) release(key);
    },
    // Paused with the story: a quick fade, then the whole graph stops, so the music and any effect
    // in flight pick up exactly where they were
    pause(p) {
      if (!ctx || p === paused) return;
      paused = p;
      clearTimeout(suspendTimer);
      pauseGain.gain.setTargetAtTime(p ? 0 : 1, ctx.currentTime, p ? .03 : .06);
      if (p) suspendTimer = setTimeout(() => ctx.suspend().catch(() => {}), 150);
      else wake();
    },
    // From app.js: the video now showing, or null
    showing(v) {
      if (!ctx) return;
      const t = ctx.currentTime, on = v && videos.has(v) && !v.error;
      for (const [el, g] of videos) g.gain.setTargetAtTime(el === v ? 1 : 0, t, .05);
      musicBus.gain.setTargetAtTime(LEVEL.music * (on ? LEVEL.duck : 1), t, on ? .25 : .5);
    },
    mute(m) {
      muted = m;
      if (ctx) muteGain.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, .05);
    },
    // From slides.js: a reel's ones place turning over, a number landing, the fireworks
    tick(el) {
      if (!live() || el.closest('.s-games') || ctx.currentTime - lastTick < .03) return;   // the games count is voiced by its calendar dots
      lastTick = ctx.currentTime;
      cue('tick', el);
    },
    land(el, value) { if (live()) cue('land', el, { value }); },
    firework(kind, x, style) { if (isOn(finaleBg)) play(kind, finaleBg, { pan: (x * 2 - 1) * .8, style }); },
    soften(p) { soft = p; if (ctx) applySoft(); },
    // Hear one effect now, from the console
    preview(name, opts = {}) {
      unlock();
      ctx.resume();
      FX[name](kit, fxBus, ctx.currentTime + .05, opts);
    },
    // Render one effect offline (for checking levels): resolves to an AudioBuffer
    render(name, opts = {}, seconds = 3, rate = 48000) {
      const c = new OfflineAudioContext(2, Math.round(seconds * rate), rate), out = c.createGain();
      out.gain.value = LEVEL.fx;
      out.connect(c.destination);
      FX[name](makeKit(c, out), out, 0, opts);
      return c.startRendering();
    },
    names: Object.keys(FX),
  };
  return api;
})();
