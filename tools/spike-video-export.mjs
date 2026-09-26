// Spike for LTT step 3 (engineering/decisions/2026-09-25-video-export.md): a narrated HTML
// export -> MP4 (H.264 + Opus) + .vtt, rendered from the LTT embedded in that file over
// `timeline` + `positionAt`. The encoder is headless Chromium's WebCodecs and the muxer is
// mediabunny (pure JS, MPL-2.0). No ffmpeg.
//
// COMMITTED so the note's numbers can be re-measured. It is NOT the video exporter: it is the
// measurement that picked the encoder, muxer and frame rate, and it checks the MP4 it writes by
// decoding it back — every caption start against the tone onset in the muxed audio, and every
// slide change against `timeline()`. The clips are test tones of 0.8-1.25x each sentence's
// estimate, with 40 ms of declared lead, so `measuredMs` and lead trim both matter.
//
// mediabunny is not a dependency until the owner rules on the note's forks, so install it
// without saving first:   npm i --no-save mediabunny@1.60.0
// Run:  node tools/spike-video-export.mjs [--deck=test/fixtures/q3-board-review.md] [--fps=30] [--mode=dark] [--voice=tone|espeak|kokoro] [--lead=encoder]
// `--voice=espeak` needs espeak-ng on PATH (apt-get install espeak-ng); `--voice=kokoro` needs
// kokoro-js (npm i --no-save kokoro-js@1.2.1) and downloads the Studio's model once.
// Writes .scratch/out/video/ (the MP4, the .vtt, a report JSON).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';


const ROOT = path.resolve(import.meta.dirname, '..');
process.chdir(ROOT);
const require = createRequire(path.join(ROOT, 'package.json'));
const { buildPlayerHtml } = require('./lib/export/html-player.js');
const { buildTrack } = require('@laticent/cadenza');
const { timeline, positionAt, unpack } = require('@laticent/ltt');
const puppeteer = require('puppeteer-core');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const DECK = args.deck || 'test/fixtures/q3-board-review.md';
const FPS = Number(args.fps || 30);
const SCALE = Number(args.scale || 1.5); // 1280x720 canvas -> 1920x1080
const MODE = args.mode || 'dark';
const OUT = path.resolve('.scratch/out/video');
let MB_BUNDLE;
try {
  MB_BUNDLE = path.join(path.dirname(require.resolve('mediabunny')), 'mediabunny.min.cjs');
} catch {
  console.error('mediabunny is not installed. Run: npm i --no-save mediabunny@1.60.0');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const T = {};
const tic = (k) => { T[k] = -performance.now(); };
const toc = (k) => { T[k] += performance.now(); };

// ---- 1. A narrated export, built the way the verifier builds its demo -------------------------
const LEAD = 40; // ms of encoder-style leading silence in every clip, declared as leadMs
function wav(ms, lead = LEAD, rate = 24000) {
  const n = Math.round((rate * (ms + lead)) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const l = Math.round((rate * lead) / 1000);
  // A 5 ms fade at each end: a tone that starts and stops at full swing clicks at every boundary.
  const fade = Math.round(rate * 0.005);
  for (let i = l; i < n; i++) {
    const env = Math.min(1, (i - l) / fade, (n - 1 - i) / fade);
    buf.writeInt16LE(Math.round(6000 * env * Math.sin((2 * Math.PI * 330 * i) / rate)), 44 + i * 2);
  }
  return `data:audio/wav;base64,${buf.toString('base64')}`;
}
tic('export');
const base = path.join(OUT, 'deck');
execFileSync(process.execPath, ['lattice-emulator.js', DECK, base, '--quiet', '--captions'], { stdio: 'pipe' });
// Folded like every deck read (#1349): a BOM or a CRLF would defeat the `^---` anchor below.
const source = readFileSync(DECK, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const docHtml = readFileSync(`${base}.html`, 'utf8');
// EVERY slide's narration, as the Studio and the CLI resolve it: the inline caption, then the
// front-matter caption, then the slide's own content projected to speech. The emulator's
// `--captions` run writes that merged text as one WebVTT per narrated slide, so the spike reads it
// back from there. (The first spike read the inline captions alone, so the 9 slides narrated from
// their content went silent and flashed past on their hold: the owner caught it.)
const slideCount = (docHtml.match(/<section[^>]*data-lattice-slide=/g) || []).length;
const pad = Math.max(2, String(slideCount).length);
const texts = Array.from({ length: slideCount }, (_, i) => {
  let vttText;
  try {
    vttText = readFileSync(`${base}.${String(i + 1).padStart(pad, '0')}.vtt`, 'utf8');
  } catch {
    return '';
  }
  return vttText
    .split(/\n\n+/)
    .slice(1)
    // The sidecar's only markup is its word timestamps (`<00:00:01.230>`): remove exactly those,
    // then drop any angle bracket left, so no tag-shaped text survives into the caption track.
    .map((block) =>
      block
        .split('\n')
        .slice(1)
        .join(' ')
        .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
        .replace(/[<>]/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join(' ');
});
// The deck's own timing inputs, exactly as the emulator parses them. Emphasis spans are not
// carried (the sidecar holds text only), so a bolded phrase times as ordinary here.
const { acronymSpokenMap, frontMatterLang, lexiconMap } = await import('../lib/core/resolve-captions.mjs');
const trackOpts = { pace: 'moderate', acronyms: acronymSpokenMap(source), lexicon: lexiconMap(source), lang: frontMatterLang(source) };
// THE VOICE. `--voice=espeak` speaks every cue with espeak-ng (a real, if robotic, voice: real
// pauses inside a sentence, real leading and trailing silence). The default `tone` is a 330 Hz tone
// per cue at 0.8-1.25x the estimate, deterministic, for a machine with no speech engine.
const VOICE = args.voice || 'tone';
/** Where speech really starts and stops inside a clip, in ms: the first and last sample above
 *  2% of full scale. A caption must start at the first and the next cue must wait past the clip. */
const trails = new Map(); // `${slide}:${cue}` -> trailing silence (ms) after the last spoken sample
function speak(text) {
  const tmp = path.join(OUT, 'espeak.wav');
  execFileSync('espeak-ng', ['-v', 'en-us', '-s', '165', '-w', tmp, text], { stdio: 'pipe' });
  const buf = readFileSync(tmp);
  const rate = buf.readUInt32LE(24);
  const data = buf.indexOf('data') + 8;
  const n = (buf.length - data) >> 1;
  let first = n, last = 0;
  for (let i = 0; i < n; i++) if (Math.abs(buf.readInt16LE(data + i * 2)) > 655) { if (i < first) first = i; last = i; }
  return { uri: `data:audio/wav;base64,${buf.toString('base64')}`, leadMs: Math.round((first / rate) * 1000), trailMs: Math.round(((n - 1 - last) / rate) * 1000) };
}
// `--voice=kokoro`: the Studio's own on-device voice (onnx-community/Kokoro-82M-v1.0-ONNX, q8,
// voice af_heart) through kokoro-js, and the Studio bake's own MP3 encoder (lamejs at 64 kb/s,
// and the bake's leadMs rule: encoder delay plus `speechOnsetMs`). So the clips are the bytes a
// real narrated export ships, and the MP3 decode path is exercised. Kokoro's OWN leading silence
// stays in the clip, as it does in a real bake, and `leadMs` skips it; the report measures what is
// left (`voiceLeadMs`). `--lead=encoder` declares the encoder's delay alone, as before. Cached
// under .scratch/out/video/kokoro-cache by text, because loading the model takes about a minute.
// Needs kokoro-js resolvable: `npm i --no-save kokoro-js@1.2.1` (it downloads the model once).
const voiceLeads = new Map(); // `${slide}:${cue}` -> ms of the voice's own silence before speech
let kokoro = null;
async function kokoroClip(text) {
  const { encodeMp3, encoderLeadMs, speechOnsetMs } = await import('../docs/src/playground/narration-encode.js');
  const dir = path.join(OUT, 'kokoro-cache');
  mkdirSync(dir, { recursive: true });
  const key = path.join(dir, `${createHash('sha256').update(text).digest('hex').slice(0, 16)}.pcm`);
  let pcm;
  let rate = 24000;
  try {
    pcm = new Float32Array(readFileSync(key).buffer.slice(0));
  } catch {
    if (!kokoro) {
      const { KokoroTTS } = require('kokoro-js');
      kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
    }
    const a = await kokoro.generate(text, { voice: 'af_heart' });
    pcm = a.audio;
    rate = a.sampling_rate;
    writeFileSync(key, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  }
  let first = pcm.length, last = 0;
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) > 0.02) { if (i < first) first = i; last = i; }
  const int16 = Int16Array.from(pcm, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
  const mp3 = await encodeMp3(int16, rate, 1, 64);
  // `leadMs` is what the Studio's bake records (`compressClip`): the encoder's delay plus the
  // voice's own silence before its first word. `--lead=encoder` reproduces the bake before
  // 2026-09-26, which declared the encoder's delay alone. `voiceLeadMs` is the silence LEFT
  // after the trim, so the report reads 0 (well, the 10 ms pre-roll) when the bake trims it all.
  const trim = args.lead === 'encoder' ? 0 : speechOnsetMs(int16, rate);
  return { uri: `data:audio/mpeg;base64,${Buffer.from(mp3).toString('base64')}`, leadMs: encoderLeadMs(rate) + trim, voiceLeadMs: Math.round((first / rate) * 1000 - trim), trailMs: Math.round(((pcm.length - 1 - last) / rate) * 1000) };
}
// Clip lengths deliberately NOT the estimate: 0.8x-1.25x, deterministic, so measuredMs matters.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const slides = [];
for (let si = 0; si < texts.length; si++) {
  const text = texts[si];
  if (!text) {
    slides.push(null);
    continue;
  }
  const track = buildTrack(text, trackOpts);
  const clips = [];
  for (let k = 0; k < track.cues.length; k++) {
    const c = track.cues[k];
    // The voices read the SPOKEN form Cadenza timed ("forty-eight point six million dollars"), not "$48.6M".
    const said = c.words.map((w) => w.spoken).join(' ');
    const v =
      VOICE === 'kokoro'
        ? await kokoroClip(said)
        : VOICE === 'espeak'
          ? speak(said)
          : { uri: wav(Math.round((c.endMs - c.startMs) * (0.8 + 0.45 * rnd()))), leadMs: LEAD, trailMs: 0 };
    trails.set(`${si}:${k}`, v.trailMs);
    voiceLeads.set(`${si}:${k}`, v.voiceLeadMs ?? 0);
    clips.push({ audio: v.uri, clip: `sha256:${createHash('sha256').update(v.uri).digest('hex')}`, leadMs: v.leadMs });
  }
  slides.push({ text, track, clips });
}
const { html } = await buildPlayerHtml({ docHtml, source, title: 'Q3 board review', now: 0,
  narration: { voice: VOICE === 'kokoro' ? { model: 'onnx-community/Kokoro-82M-v1.0-ONNX', voice: 'af_heart', speed: 1 } : VOICE === 'espeak' ? { model: 'espeak-ng', voice: 'en-us', speed: 1 } : { model: 'spike/tone', voice: '330hz', speed: 1 }, captions: false, slides }, theme: { name: 'indaco', mode: MODE } });
const exportFile = path.join(OUT, `export-${MODE}.html`);
writeFileSync(exportFile, html);
toc('export');

// ---- 2. Read the LTT and the clips back OUT OF THE EXPORTED FILE -----------------------------
const lttBlock = /<script type="application\/[^"]*" data-lp-ltt="">([\s\S]*?)<\/script>/.exec(html)[1];
const ltt = unpack(JSON.parse(lttBlock));
const audioBlocks = {};
for (const m of html.matchAll(/<script type="[^"]*" data-lp-audio="(\d+)">([\s\S]*?)<\/script>/g)) audioBlocks[m[1]] = JSON.parse(m[2]);
const clipUri = (src) => { const m = /^#lp-audio\/(\d+)\/(\d+)$/.exec(src); return m ? audioBlocks[m[1]][m[2]] : src; };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

const estimateMs = timeline(ltt).durationMs;
// ---- 3. Decode every clip to fill measuredMs (the export records none) -----------------------
tic('decode');
const enc = await browser.newPage();
await enc.goto(`file://${path.join(ROOT, 'package.json')}`); // any file:// page is a secure context
await enc.addScriptTag({ content: readFileSync(MB_BUNDLE, 'utf8').replace(/^/, 'var module={exports:{}},exports=module.exports;') + ';window.MB=module.exports;' });
const allClips = [];
ltt.segments.forEach((s, i) => {
  for (const c of s.audio?.clips || []) allClips.push({ seg: i, cue: c.cue, uri: clipUri(c.src), leadMs: c.leadMs || 0 });
});
const durations = await enc.evaluate(async (uris) => {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  window.__buf = [];
  const out = [];
  for (const u of uris) {
    try {
      const b = await ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());
      window.__buf.push(b);
      out.push(b.duration * 1000);
    } catch {
      out.push(null); // rule 4: a clip that will not decode plays as a cue with no clip
    }
  }
  window.__buf = window.__buf.filter(Boolean);
  return out;
}, allClips.map((c) => c.uri));
// A failed decode DROPS the clip entry before layout, so positionAt applies the silent-cue floor
// (rule 4) exactly as the live player does after its fallback.
const failed = allClips.filter((_c, n) => durations[n] == null);
for (const c of failed) { const a = ltt.segments[c.seg].audio; a.clips = a.clips.filter((x) => x.cue !== c.cue); }
const decoded = allClips.filter((_c, n) => durations[n] != null);
decoded.forEach((c) => { c.measuredMs = durations[allClips.indexOf(c)]; ltt.segments[c.seg].audio.clips.find((x) => x.cue === c.cue).measuredMs = Math.round(c.measuredMs); });
allClips.length = 0; allClips.push(...decoded);
toc('decode');

// ---- 4. The simulated transport: timeline + positionAt --------------------------------------
const tl = timeline(ltt);
const durMs = tl.durationMs;
const nFrames = Math.ceil((durMs * FPS) / 1000);
const frameSeg = new Int32Array(nFrames);
for (let f = 0, s = 0; f < nFrames; f++) {
  const t = (f * 1000) / FPS;
  while (s < tl.segments.length - 1 && tl.segments[s + 1].startMs <= t) s++;
  frameSeg[f] = s;
}
// Every cue's absolute onset and played length — the same numbers drive the audio mix and the .vtt.
const cues = [];
ltt.segments.forEach((seg, i) => {
  if (seg.kind !== 'slide' || !seg.track?.cues?.length) return;
  const p = positionAt(seg, 0);
  seg.track.cues.forEach((c, k) => {
    cues.push({ seg: i, cue: k, text: c.display, startMs: tl.segments[i].startMs + p.onsets[k], playedMs: p.played[k] });
  });
});
const fmt = (ms) => { const t = Math.round(ms); const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(t % 1000).padStart(3, '0')}`; };
const vtt = `WEBVTT\n\n${cues.map((c, n) => `${n + 1}\n${fmt(c.startMs)} --> ${fmt(c.startMs + c.playedMs)}\n${c.text}\n`).join('\n')}`;
writeFileSync(path.join(OUT, `deck-${MODE}${VOICE === 'tone' ? '' : `-${VOICE}`}.vtt`), vtt);

// ---- 5. Frames: one screenshot per slide (no Anima in 1.0, so a slide is still between changes) --
tic('capture');
const pg = await browser.newPage();
await pg.setViewport({ width: 1360, height: 800, deviceScaleFactor: SCALE }); // 40px fit inset each side -> the stage fits at 1.0
await pg.goto(`file://${exportFile}`);
await pg.waitForSelector('.lp-frame');
await pg.addStyleTag({ content: '*{transition:none!important;animation:none!important} #lp-bar,.lp-bar,[class*="lp-bar"]{display:none!important}' });
await pg.evaluate(() => { window.dispatchEvent(new Event('resize')); document.documentElement.style.setProperty('--lp-fit-present', '1'); for (const e of document.querySelectorAll('[style*="--lp-fit"]')) e.style.setProperty('--lp-fit-present', '1'); });
await new Promise((r) => setTimeout(r, 100));
const shots = [];
await pg.evaluate(() => document.fonts.ready);
const shotSizes = new Set();
for (let i = 0; i < ltt.segments.length; i++) {
  // The player re-runs its fit on every navigation (it makes room for the nav row), so the
  // scale is pinned again on EVERY slide, and every capture's size is recorded and asserted.
  await pg.evaluate(() => { document.documentElement.style.setProperty('--lp-fit-present', '1'); for (const e of document.querySelectorAll('[style*="--lp-fit"]')) e.style.setProperty('--lp-fit-present', '1'); return document.fonts.ready; });
  await new Promise((r) => setTimeout(r, 60));
  const el = await pg.$('.lp-frame.lp-active');
  const png = Buffer.from(await el.screenshot({ type: 'png' }));
  shotSizes.add(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  shots.push(Buffer.from(png).toString('base64'));
  await pg.keyboard.press('ArrowRight');
}
if (shotSizes.size !== 1) throw new Error(`captures differ in size: ${[...shotSizes].join(', ')}`);
writeFileSync(path.join(OUT, 'slide-04.png'), Buffer.from(shots[3], 'base64'));
toc('capture');

// ---- 6. Encode + mux in the page: H.264 frames, the audio mixed on the same timeline ----------
tic('encode');
const place = allClips.map((c) => ({ at: (tl.segments[c.seg].startMs + positionAt(ltt.segments[c.seg], 0).onsets[c.cue] - c.leadMs) / 1000 }));
const mp4b64 = await enc.evaluate(async ({ shots, frameSeg, FPS, place, durMs, vtt }) => {
  const { Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, VideoSample, AudioBufferSource, TextSubtitleSource } = window.MB;
  const bitmaps = await Promise.all(shots.map(async (b64) => createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())));
  const W = bitmaps[0].width & ~1, H = bitmaps[0].height & ~1;
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d');
  const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new VideoSampleSource({ codec: 'avc', bitrate: 4e6, keyFrameInterval: 2, latencyMode: 'quality' });
  const audio = new AudioBufferSource({ codec: 'opus', bitrate: 96e3 });
  out.addVideoTrack(video, { frameRate: FPS });
  out.addAudioTrack(audio);
  let sub = null;
  if (out.format.getSupportedCodecs().includes('webvtt')) { sub = new TextSubtitleSource('webvtt'); out.addSubtitleTrack(sub, { languageCode: 'eng' }); }
  await out.start();
  // audio: every clip placed at onset - leadMs on one 48 kHz mono track
  const mix = new OfflineAudioContext(1, Math.ceil((durMs / 1000) * 48000), 48000);
  window.__buf.forEach((b, n) => { const s = mix.createBufferSource(); s.buffer = b; s.connect(mix.destination); s.start(Math.max(0, place[n].at), Math.max(0, -place[n].at)); });
  const rendered = await mix.startRendering();
  const aP = audio.add(rendered);
  let last = -1;
  for (let f = 0; f < frameSeg.length; f++) {
    if (frameSeg[f] !== last) { g.drawImage(bitmaps[frameSeg[f]], 0, 0, W, H); last = frameSeg[f]; }
    const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    const s = new VideoSample(vf);
    await video.add(s, f === 0 || frameSeg[f] !== frameSeg[f - 1] ? { keyFrame: true } : undefined);
    s.close();
  }
  await aP;
  if (sub) await sub.add(vtt);
  await out.finalize();
  const bytes = new Uint8Array(out.target.buffer);
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), W, H, subtitle: !!sub };
}, { shots, frameSeg: Array.from(frameSeg), FPS, place, durMs, vtt });
const mp4 = path.join(OUT, `deck-${MODE}${VOICE === 'tone' ? '' : `-${VOICE}`}.mp4`);
writeFileSync(mp4, Buffer.from(mp4b64.b64, 'base64'));
toc('encode');

// ---- 7. Check the MP4 against the LTT: decode it back, independently -------------------------
tic('verify');
const check = await enc.evaluate(async ({ b64, shots, mids }) => {
  const { Input, ALL_FORMATS, BufferSource, AudioBufferSink, VideoSampleSink } = window.MB;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const dur = await input.computeDuration();
  const vt = await input.getPrimaryVideoTrack();
  const at = await input.getPrimaryAudioTrack();
  const tracks = await input.getTracks();
  // audio: find every tone onset (silence -> sound) in the decoded track
  const pcm = [];
  let rate = 48000;
  for await (const { buffer } of new AudioBufferSink(at).buffers()) { rate = buffer.sampleRate; pcm.push(buffer.getChannelData(0).slice()); }
  const all = new Float32Array(pcm.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of pcm) { all.set(a, o); o += a.length; }
  const win = Math.round(rate * 0.002); const onsets = []; const ends = []; let loud = false; let quiet = 0; let lastLoud = 0;
  for (let i = 0; i + win < all.length; i += win) {
    let e = 0; for (let j = i; j < i + win; j++) e = Math.max(e, Math.abs(all[j]));
    if (!loud && e > 0.02) { loud = true; onsets.push((i / rate) * 1000); quiet = 0; lastLoud = ((i + win) / rate) * 1000; }
    else if (loud && e < 0.008) { if (++quiet > 10) { loud = false; ends.push(lastLoud); } }
    else if (loud) { quiet = 0; lastLoud = ((i + win) / rate) * 1000; }
  }
  // video: per-frame luminance signature; a slide change is a jump between consecutive frames
  // WHICH slide each frame shows: the screenshots, reduced the same way, are the reference.
  const thumb = document.createElement('canvas'); thumb.width = 64; thumb.height = 36;
  const tg = thumb.getContext('2d', { willReadFrequently: true });
  const refs = [];
  for (const b64 of shots) { tg.drawImage(await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob()), 0, 0, 64, 36); refs.push(tg.getImageData(0, 0, 64, 36).data.slice()); }
  const nearest = (d) => { let best = -1; let bestDiff = Infinity; refs.forEach((r, i) => { let diff = 0; for (let j = 0; j < r.length; j++) diff += Math.abs(r[j] - d[j]); if (diff < bestDiff) { bestDiff = diff; best = i; } }); return best; };
  const sink = new VideoSampleSink(vt);
  const sig = []; const c = new OffscreenCanvas(64, 36); const g = c.getContext('2d', { willReadFrequently: true });
  for await (const s of sink.samples()) { s.draw(g, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; sig.push({ t: s.timestamp * 1000, d }); s.close(); }
  const shown = mids.map((t) => { let k = 0; while (k < sig.length - 1 && sig[k + 1].t <= t) k++; return nearest(sig[k].d); });
  const changes = [];
  for (let i = 1; i < sig.length; i++) { let diff = 0; for (let j = 0; j < sig[i].d.length; j++) diff += Math.abs(sig[i].d[j] - sig[i - 1].d[j]); if (diff / sig[i].d.length > 1.5) changes.push(sig[i].t); }
  if (loud) ends.push(lastLoud);
  return { dur, frames: sig.length, ends, shown, codecs: await Promise.all(tracks.map(async (t) => `${t.type}:${await t.getCodecParameterString?.() ?? t.codec}`)), onsets, changes };
}, { b64: mp4b64.b64, shots, mids: tl.segments.map((g) => g.startMs + g.lengthMs / 2) });
toc('verify');
await browser.close();

// caption start vs tone onset in the muxed audio
// A voice's OWN leading silence (Kokoro's, not the encoder's) delays the speech past the caption by
// exactly that much in every player; the check expects it, and the report says how large it is.
const pair = cues.map((c) => { const at = c.startMs + (voiceLeads.get(`${c.seg}:${c.cue}`) ?? 0); const hit = check.onsets.reduce((b, t) => (Math.abs(t - at) < Math.abs(b - at) ? t : b), Infinity); return hit - at; });
const vl = [...voiceLeads.values()].sort((a, b) => a - b);
const absErr = pair.map(Math.abs);
if (process.env.SPIKE_DEBUG) console.error("onset errors:", pair.map((e) => Math.round(e)).join(" "));
// ...and the END: a tone stops when its clip does, so a wrong measuredMs, lead trim or played
// length shows here even when every onset still lines up.
const endPair = cues.map((c) => { const e = c.startMs + c.playedMs - (trails.get(`${c.seg}:${c.cue}`) ?? 0); const hit = check.ends.reduce((b, t) => (Math.abs(t - e) < Math.abs(b - e) ? t : b), Infinity); return hit - e; });
// slide change frames vs timeline (skip slides that look identical to the one before? none here)
const bounds = tl.segments.slice(1).map((s) => s.startMs);
const slideErr = bounds.map((b) => { const hit = check.changes.reduce((x, t) => (Math.abs(t - b) < Math.abs(x - b) ? t : x), Infinity); return hit - b; });
const report = {
  deck: DECK, mode: MODE, voice: VOICE, fps: FPS, size: `${mp4b64.W}x${mp4b64.H}`, subtitleTrackMuxed: mp4b64.subtitle,
  segments: ltt.segments.length, cues: cues.length, clips: allClips.length,
  timelineMs: durMs, estimateTimelineMs: estimateMs, mp4DurationMs: Math.round(check.dur * 1000), frames: check.frames, expectedFrames: nFrames, codecs: check.codecs,
  bytes: statSync(mp4).size,
  captionVsAudio: { matched: absErr.filter((e) => e < 1000).length, maxAbsMs: Math.max(...absErr).toFixed(1), meanMs: (pair.reduce((a, b) => a + b, 0) / pair.length).toFixed(1), withinOneFrame: absErr.filter((e) => e <= 1000 / FPS).length, onsetsFound: check.onsets.length },
  captionEndVsAudioEnd: { maxAbsMs: Math.max(...endPair.map(Math.abs)).toFixed(1), withinOneFrame: endPair.filter((e) => Math.abs(e) <= 1000 / FPS).length, of: endPair.length },
  clipsThatFailedToDecode: failed.length,
  voiceLeadMs: vl.length ? { min: vl[0], median: vl[vl.length >> 1], max: vl[vl.length - 1] } : null,
  slideShownMidSegment: { right: check.shown.filter((k, i) => k === i).length, of: check.shown.length },
  slideChangeVsTimeline: { boundaries: bounds.length, detected: check.changes.length, maxAbsMs: Math.max(...slideErr.map(Math.abs)).toFixed(1), withinOneFrame: slideErr.filter((e) => Math.abs(e) <= 1000 / FPS + 0.5).length, errs: slideErr.map((e) => Math.round(e)) },
  measuredVsEstimate: allClips.map((c) => Math.round(c.measuredMs - c.leadMs)).reduce((a, b) => a + b, 0) + ' ms measured speech',
  wallMs: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])),
};
writeFileSync(path.join(OUT, `report-${MODE}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// The checks confirm the FILE matches the layout. They cannot confirm the layout is right: that is
// what the conformance fixtures and test/unit/export/ltt-player-transport.test.js pin.
const frame = 1000 / FPS;
const failures = [
  absErr.some((e) => e > frame) && 'a caption start is more than one frame from its audio',
  endPair.some((e) => Math.abs(e) > frame) && 'a caption end is more than one frame from its audio',
  slideErr.some((e) => Math.abs(e) > frame + 0.5) && 'a slide change is more than one frame from timeline()',
  check.shown.some((k, i) => k !== i) && 'a segment shows the wrong slide',
  Math.abs(report.mp4DurationMs - durMs) > frame && 'the MP4 is not as long as the timeline',
].filter(Boolean);
for (const f of failures) console.error(`FAIL  ${f}`);
if (failures.length) process.exitCode = 1;
