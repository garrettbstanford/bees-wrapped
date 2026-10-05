// Builds public/music.mp3 from "background music.mp3": node tools/build-music.js (needs ffmpeg)
//
// The story's music starts at a section break about halfway through the song and then loops. The
// numbers below come from analyzing this song (141 BPM): it starts at 95.75s, where the bass drops out
// for a new section, and loops the 24 bars from 117.03s to 157.88s, two stretches of the song that
// match. They're sample positions at 44.1 kHz, so they only fit this track.
//
// The file runs from just before the start to just past the loop end. The last moments before the loop
// end are crossfaded into the audio before the loop start, so the audio around the two loop points is
// identical and the jump can't click, even if a browser's decoder shifts the file by a few milliseconds.
// sound.js uses the start and loop times this prints.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'background music.mp3'), OUT = path.join(__dirname, '..', 'public', 'music.mp3');
const SR = 44100;
const START = 4222577;                     // 95.750s: the section break
const LOOP_START = 5160945, LOOP_END = LOOP_START + 1801532;   // 117.028s to 157.879s: 24 bars
const FROM = START - Math.round(.2 * SR);  // a little lead-in, cut by the fade-in anyway
const SAME = 2048, FADE = 4096, TAIL = Math.round(.5 * SR);   // samples: matching run-up to the seam, crossfade, spare tail
const GAIN = .8;                           // the decoded master goes past full scale; this keeps the encode clear of clipping

const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', SRC, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
const song = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));   // interleaved L R
const len = LOOP_END + TAIL - FROM, out = new Float32Array(len * 2);
for (let n = 0; n < len; n++) {
  const s = FROM + n, twin = LOOP_START + (s - LOOP_END);   // the same moment, measured from the loop start
  const mix = s >= LOOP_END - SAME ? 1 : s >= LOOP_END - SAME - FADE ? (s - (LOOP_END - SAME - FADE)) / FADE : 0;
  for (let c = 0; c < 2; c++) out[n * 2 + c] = GAIN * (song[s * 2 + c] * (1 - mix) + (mix ? song[twin * 2 + c] * mix : 0));
}
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k', OUT],
  { input: Buffer.from(out.buffer) });
const at = x => ((x - FROM) / SR).toFixed(6);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: start ${at(START)}, loopStart ${at(LOOP_START)}, loopEnd ${at(LOOP_END)} (seconds into the file)`);
