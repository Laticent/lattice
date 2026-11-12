#!/usr/bin/env node
/**
 * Measure text-to-speech engines: time to first byte, seconds per character, the
 * concurrency at which a provider starts refusing (429), and whether packing several
 * sentences into one request is faster AND can be cut back into one clip per sentence.
 *
 * Slice S0 of engineering/decisions/2026-11-11-voice-synthesis-spine.md. The repo had no
 * committed measurement of any of these (the pacing guide says so, 2026-08-03 §95), and
 * every default the synthesis spine picks — per-engine concurrency, the packing gate —
 * comes from what this prints.
 *
 * Three phases per engine, over a fixed eight-sentence corpus (no randomness, HARD RULE #32):
 *
 *   latency  one request per sentence, one at a time. First-byte and total time, bytes,
 *            decoded audio length, and the per-character rate.
 *   ramp     the corpus again at each concurrency level (--levels, default 1,3,6). Wall time,
 *            throughput in characters per second, every status, and any Retry-After header.
 *            Each level suffixes its text so no provider cache can answer a repeat.
 *   pack     the whole corpus as ONE request. Wall time against the latency phase, then a
 *            pause detector on the decoded audio: does each expected sentence boundary land
 *            on its own pause, and how long is that pause? That is S4's gate (§5).
 *   formats  one fixed sentence in each `response_format` (--formats, default
 *            opus,aac,flac,mp3,wav,pcm): status, Content-Type, bytes, the container the
 *            first bytes actually are, decoded length and bitrate. Answers #1509: which
 *            engines hand back compressed audio, so Lattice need not encode it.
 *            Opt-in only (not in the default --phase list).
 *
 * Cloud engines go through OpenRouter's /audio/speech, the same route voice-model.js's
 * openRouterRung uses. `--kokoro-local` runs on-device Kokoro in Node through kokoro-js
 * instead (free; ramp is skipped because Kokoro is one serial model instance). It also
 * reports whether kokoro-js exposes per-phoneme durations.
 *
 * Usage:
 *   node tools/tts-bench.mjs --kokoro-local                       free, no key
 *   OPEN_ROUTER_KEY=… node tools/tts-bench.mjs [--engine a,b]      prints the plan and cost, exits 2
 *   OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/tts-bench.mjs [--engine a,b] [--max-usd 1.5]
 *   Options: --phase latency,ramp,pack[,formats]  --levels 1,3,6  --formats opus,aac,flac,mp3,wav,pcm  --timeout-ms 120000  --out <file.json>
 *   Results are written after EACH engine, so one engine that hangs cannot cost the others' numbers.
 *
 * Spends real credits on OUR key, so it is opt-in and cost-visible (HARD RULE #24): without
 * OPENROUTER_ALLOW_SPEND=1 it prints the planned characters and dollars and exits; with it,
 * it still refuses a plan above --max-usd. The key is read only from the environment and is
 * never printed. Decoding needs ffmpeg on PATH. Exit 0 = ran; 1 = a phase failed outright;
 * 2 = nothing ran (no key, no opt-in, over budget).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ttsCostPerMChars } from '../docs/src/playground/tts-cost.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/src/playground/tts-voice-catalog.json'), 'utf8'));
const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';
const RATE = 24_000; // every clip is decoded to 24 kHz mono for analysis

/** Narration-shaped sentences: short, long, a number, a question, a list, an abbreviation.
 *  Fixed text so two runs measure the same thing. */
export const CORPUS = [
  'Revenue grew eighteen percent this quarter.',
  'Most of that came from the two regions we entered last spring, and both are now profitable.',
  'Why does that matter?',
  'Because the new regions paid back their launch costs in under nine months.',
  'Churn held flat at four point two percent.',
  'We are asking for three things: more engineers, a second data center, and a pricing review.',
  'Each one is costed on the next slide.',
  'Questions are welcome at any point.',
];

// ── arguments ──────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const LOCAL_KOKORO = argv.includes('--kokoro-local');
const PHASES = new Set(String(arg('--phase', 'latency,ramp,pack')).split(','));
const LEVELS = String(arg('--levels', '1,3,6')).split(',').map(Number).filter((n) => n >= 1);
const MAX_USD = Number(arg('--max-usd', '1.5'));
const ENGINE_FILTER = arg('--engine', null)?.split(',');
const FORMATS = String(arg('--formats', 'opus,aac,flac,mp3,wav,pcm')).split(',').filter(Boolean);
/** The sentence the formats phase speaks: long enough (~5 s) for a bitrate to mean something. */
export const FORMAT_SENTENCE = CORPUS[1];
const REQUEST_TIMEOUT_MS = Number(arg('--timeout-ms', '120000'));
const OUT = arg('--out', path.join(ROOT, '.scratch/tts-bench', `${LOCAL_KOKORO ? 'kokoro-local' : 'cloud'}-${Date.now()}.json`));

// ── audio analysis (pure, exported for the unit test) ─────────────────────────────────────

/** Decode any container ffmpeg reads to Float32 mono at RATE. */
function decodeToF32(buf) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', String(RATE), 'pipe:1'], { input: buf, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${String(r.stderr).slice(0, 200)}`);
  const out = r.stdout;
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + (out.byteLength & ~3)));
}

/** Raw 16-bit little-endian PCM (Gemini's wire format) → Float32 at its own rate, resampled
 *  through ffmpeg so analysis always runs at RATE. */
function pcm16ToF32(buf, rate) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', String(RATE), 'pipe:1'], { input: buf, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('ffmpeg pcm resample failed');
  const out = r.stdout;
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + (out.byteLength & ~3)));
}

/**
 * Pauses in a clip: runs of 10 ms windows whose RMS stays under `threshold` for at least
 * `minGapMs`. Returns `{startMs, endMs}` per pause, excluding the clip's leading and trailing
 * silence (those are not between sentences).
 */
export function findPauses(samples, rate, { threshold = 0.01, minGapMs = 90, windowMs = 10 } = {}) {
  const win = Math.max(1, Math.round((rate * windowMs) / 1000));
  const quiet = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    quiet.push(Math.sqrt(sum / win) < threshold);
  }
  const first = quiet.indexOf(false);
  const last = quiet.lastIndexOf(false);
  if (first === -1) return [];
  const pauses = [];
  let runStart = -1;
  for (let w = first; w <= last; w++) {
    if (quiet[w] && runStart === -1) runStart = w;
    if (!quiet[w] && runStart !== -1) {
      if ((w - runStart) * windowMs >= minGapMs) pauses.push({ startMs: runStart * windowMs, endMs: w * windowMs });
      runStart = -1;
    }
  }
  return pauses;
}

/** Speech span of a clip: first and last window above threshold, in ms. */
export function speechSpan(samples, rate, threshold = 0.01) {
  const win = Math.round(rate / 100);
  let first = -1;
  let last = -1;
  for (let i = 0, w = 0; i + win <= samples.length; i += win, w++) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    if (Math.sqrt(sum / win) >= threshold) {
      if (first === -1) first = w;
      last = w;
    }
  }
  return first === -1 ? null : { startMs: first * 10, endMs: (last + 1) * 10 };
}

/**
 * Can a packed clip be cut back into N sentences? `soloSpeechMs[i]` is sentence i's speech
 * length when synthesized alone. The expected boundary k sits at the packed speech span scaled
 * by the solo lengths. A boundary MATCHES when exactly one pause lies within `tolerance` of the
 * shorter neighboring sentence, and each pause is used once, in order.
 */
export function matchBoundaries(pauses, packedSpan, soloSpeechMs, tolerance = 0.25) {
  const total = soloSpeechMs.reduce((a, b) => a + b, 0);
  const span = packedSpan.endMs - packedSpan.startMs;
  const rows = [];
  let acc = 0;
  let lastUsed = -1;
  for (let k = 0; k < soloSpeechMs.length - 1; k++) {
    acc += soloSpeechMs[k];
    const expectMs = packedSpan.startMs + (acc / total) * span;
    const tol = tolerance * Math.min(soloSpeechMs[k], soloSpeechMs[k + 1]) * (span / total);
    const near = pauses
      .map((p, i) => ({ i, mid: (p.startMs + p.endMs) / 2, len: p.endMs - p.startMs }))
      .filter((p) => p.i > lastUsed && Math.abs(p.mid - expectMs) <= tol);
    const pick = near.length ? near.reduce((a, b) => (b.len > a.len ? b : a)) : null;
    if (pick) lastUsed = pick.i;
    rows.push({ boundary: k + 1, expectMs: Math.round(expectMs), matched: Boolean(pick), candidates: near.length, errMs: pick ? Math.round(pick.mid - expectMs) : null, pauseMs: pick ? pick.len : null });
  }
  return { matched: rows.filter((r) => r.matched).length, of: rows.length, rows };
}

const ms = (t0) => Math.round(performance.now() - t0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/**
 * What the first bytes of an answer actually are, whatever the Content-Type claims. Pure, exported for the unit test.
 * `unknown` covers raw PCM (it has no signature) and an error body.
 * @param {Uint8Array} b
 */
export function sniffContainer(b) {
  const at = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length < 4) return 'unknown';
  if (at(0, 'OggS')) return 'ogg';
  if (at(0, 'fLaC')) return 'flac';
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'wav';
  if (at(4, 'ftyp')) return 'mp4';
  if (at(0, 'ID3')) return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac-adts'; // sync + layer 00 = ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return 'unknown';
}

// ── cloud requests ─────────────────────────────────────────────────────────────────────────

async function speak(engine, text, format = engine.audioFormat === 'wav' ? 'pcm' : 'mp3') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  const t0 = performance.now();
  const row = { chars: text.length, status: 0, firstByteMs: null, totalMs: null, bytes: 0, audioMs: null, retryAfter: null, error: null };
  try {
    const res = await fetch(SPEECH_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPEN_ROUTER_KEY}`, 'X-Title': 'Lattice tts-bench' },
      body: JSON.stringify({ model: engine.modelId, input: text, voice: engine.voice, response_format: format }),
    });
    row.status = res.status;
    row.contentType = res.headers.get('content-type');
    row.retryAfter = res.headers.get('retry-after');
    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (row.firstByteMs === null) row.firstByteMs = ms(t0);
      chunks.push(value);
    }
    row.totalMs = ms(t0);
    const buf = Buffer.concat(chunks);
    row.bytes = buf.length;
    if (!res.ok) { row.error = buf.toString('utf8').slice(0, 160); return { row, samples: null }; }
    row.container = sniffContainer(buf);
    const rate = Number(/rate=(\d+)/.exec(res.headers.get('content-type') || '')?.[1]) || 24000;
    const samples = format === 'pcm' && row.container === 'unknown' ? pcm16ToF32(buf, rate) : decodeToF32(buf);
    row.audioMs = Math.round((samples.length / RATE) * 1000);
    return { row, samples };
  } catch (e) {
    row.totalMs = ms(t0);
    row.error = e.name === 'AbortError' ? `timeout ${REQUEST_TIMEOUT_MS} ms` : e.message;
    return { row, samples: null };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ── on-device Kokoro ───────────────────────────────────────────────────────────────────────

async function kokoroEngine() {
  let mod;
  try { mod = await import('kokoro-js'); } catch {
    throw new Error('--kokoro-local needs kokoro-js: npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7');
  }
  const t0 = performance.now();
  const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  const loadMs = ms(t0);
  const voice = CATALOG.engines.kokoro?.cachedVoices?.[0] || 'af_heart';
  return {
    slug: 'kokoro-local', loadMs, voice,
    async speak(text) {
      const t = performance.now();
      const audio = await tts.generate(text, { voice });
      const totalMs = ms(t);
      const samples = audio.audio instanceof Float32Array ? audio.audio : new Float32Array(audio.audio);
      const sr = audio.sampling_rate || 24000;
      const f32 = sr === RATE ? samples : pcm16ToF32(Buffer.from(Int16Array.from(samples, (v) => Math.max(-32768, Math.min(32767, v * 32767))).buffer), sr);
      return { row: { chars: text.length, status: 200, firstByteMs: totalMs, totalMs, bytes: f32.byteLength, audioMs: Math.round((f32.length / RATE) * 1000), retryAfter: null, error: null }, samples: f32 };
    },
    durationsExposed: describeKokoroDurations(tts),
  };
}

/** Does kokoro-js hand back per-phoneme durations? It reports what it can see, never guesses. */
function describeKokoroDurations(tts) {
  const src = String(tts.generate_from_ids || tts.generate || '');
  return {
    generateMentionsDuration: /duration/i.test(src),
    modelOutputNames: tts.model?.sessions ? Object.values(tts.model.sessions).flatMap((s) => s.outputNames || []) : tts.model?.session?.outputNames || null,
  };
}

// ── phases ─────────────────────────────────────────────────────────────────────────────────

async function benchEngine(engine, say) {
  const result = { engine: engine.slug, model: engine.modelId || null, voice: engine.voice };
  const solo = [];
  if (PHASES.has('latency') || PHASES.has('pack')) {
    const rows = [];
    for (const text of CORPUS) {
      const { row, samples } = await say(text);
      rows.push(row);
      solo.push(samples ? speechSpan(samples, RATE) : null);
    }
    const ok = rows.filter((r) => r.status === 200);
    const chars = ok.reduce((a, r) => a + r.chars, 0);
    const time = ok.reduce((a, r) => a + r.totalMs, 0);
    result.latency = {
      rows, okCount: ok.length,
      medianFirstByteMs: median(ok.map((r) => r.firstByteMs)),
      medianTotalMs: median(ok.map((r) => r.totalMs)),
      sequentialWallMs: rows.reduce((a, r) => a + (r.totalMs || 0), 0),
      msPerChar: chars ? +(time / chars).toFixed(2) : null,
      realtimeFactor: ok.length ? +(ok.reduce((a, r) => a + r.audioMs, 0) / time).toFixed(2) : null,
      medianSoloLeadMs: median(solo.filter(Boolean).map((s) => s.startMs)),
    };
  }
  if (PHASES.has('ramp') && engine.slug !== 'kokoro-local') {
    result.ramp = [];
    for (const level of LEVELS) {
      const texts = CORPUS.map((t) => `${t} (${level})`);
      const t0 = performance.now();
      const rows = (await pool(texts, level, (t) => say(t))).map((r) => r.row);
      const wallMs = ms(t0);
      const ok = rows.filter((r) => r.status === 200);
      result.ramp.push({
        level, wallMs, ok: ok.length, of: rows.length,
        statuses: Object.fromEntries([...new Set(rows.map((r) => r.status))].map((s) => [s, rows.filter((r) => r.status === s).length])),
        retryAfter: rows.map((r) => r.retryAfter).filter(Boolean),
        charsPerSec: +(ok.reduce((a, r) => a + r.chars, 0) / (wallMs / 1000)).toFixed(1),
        medianTotalMs: median(ok.map((r) => r.totalMs)),
        errors: rows.filter((r) => r.error).map((r) => r.error).slice(0, 3),
      });
    }
  }
  if (PHASES.has('pack')) {
    const text = CORPUS.join(' ');
    const { row, samples } = await say(text);
    const pack = { row };
    if (samples && solo.every(Boolean)) {
      const span = speechSpan(samples, RATE);
      const pauses = findPauses(samples, RATE);
      const soloMs = solo.map((s) => s.endMs - s.startMs);
      pack.speechMs = span ? span.endMs - span.startMs : null;
      pack.soloSpeechSumMs = soloMs.reduce((a, b) => a + b, 0);
      pack.pauses = pauses.length;
      pack.cut = span ? matchBoundaries(pauses, span, soloMs) : null;
      if (result.latency) pack.speedupVsSequential = +(result.latency.sequentialWallMs / row.totalMs).toFixed(2);
    }
    result.pack = pack;
  }
  if (PHASES.has('formats') && engine.slug !== 'kokoro-local') {
    result.formats = [];
    for (const format of FORMATS) {
      const { row } = await speak(engine, FORMAT_SENTENCE, format);
      const kbps = row.audioMs ? Math.round((row.bytes * 8) / row.audioMs) : null;
      result.formats.push({ format, status: row.status, contentType: row.contentType, container: row.container ?? null, bytes: row.bytes, audioMs: row.audioMs, kbps, error: row.error });
      console.log(`  ${format.padEnd(5)} ${row.status} ${row.container ?? '—'} ${row.bytes} B ${row.audioMs ?? '—'} ms ${kbps ?? '—'} kbps${row.error ? ` — ${row.error.slice(0, 100)}` : ''}`);
    }
  }
  return result;
}

// ── plan, budget, run ──────────────────────────────────────────────────────────────────────

function charsPerEngine() {
  const c = CORPUS.join(' ').length;
  let n = 0;
  if (PHASES.has('latency') || PHASES.has('pack')) n += c;
  if (PHASES.has('ramp')) n += LEVELS.reduce((a, l) => a + c + CORPUS.length * ` (${l})`.length, 0);
  if (PHASES.has('pack')) n += c;
  if (PHASES.has('formats')) n += FORMATS.length * FORMAT_SENTENCE.length;
  return n;
}

async function cloudEngines() {
  const res = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech');
  if (!res.ok) throw new Error(`HTTP ${res.status} listing OpenRouter speech models`);
  const live = new Map(((await res.json()).data || []).map((m) => [m.id, m]));
  const out = [];
  for (const [slug, def] of Object.entries(CATALOG.engines)) {
    if (!def.modelId || (ENGINE_FILTER && !ENGINE_FILTER.includes(slug))) continue;
    const m = live.get(def.modelId);
    if (!m) { console.log(`⊘ ${slug}: ${def.modelId} is not on OpenRouter's live speech list, skipped`); continue; }
    const perM = ttsCostPerMChars({ promptPerM: m.pricing ? Number(m.pricing.prompt) * 1e6 : null, completionPerM: m.pricing ? Number(m.pricing.completion) * 1e6 : null });
    out.push({ slug, modelId: def.modelId, voice: def.cachedVoices?.[0] || def.featuredVoices?.[0], audioFormat: def.audioFormat, usdPerMChars: perM });
  }
  return out;
}

async function main() {
  const which = spawnSync('ffmpeg', ['-version']);
  if (which.status !== 0) { console.error('tts-bench needs ffmpeg on PATH to decode audio'); process.exit(2); }
  const results = { at: new Date().toISOString(), corpus: CORPUS, phases: [...PHASES], levels: LEVELS, engines: [] };

  if (LOCAL_KOKORO) {
    const k = await kokoroEngine();
    console.log(`kokoro-local: model loaded in ${k.loadMs} ms; durations exposed: ${JSON.stringify(k.durationsExposed)}`);
    const r = await benchEngine(k, (t) => k.speak(t));
    r.loadMs = k.loadMs;
    r.durationsExposed = k.durationsExposed;
    results.engines.push(r);
  } else {
    if (!process.env.OPEN_ROUTER_KEY) { console.error('no OPEN_ROUTER_KEY in env; nothing ran'); process.exit(2); }
    const engines = await cloudEngines();
    const chars = charsPerEngine();
    let usd = 0;
    for (const e of engines) {
      const cost = e.usdPerMChars == null ? null : (chars / 1e6) * e.usdPerMChars;
      if (cost != null) usd += cost;
      console.log(`  ${e.slug.padEnd(18)} ${chars} chars  ${cost == null ? 'no published price' : `~$${cost.toFixed(4)}`}`);
    }
    console.log(`plan: ${engines.length} engine(s), ${chars * engines.length} chars, ~$${usd.toFixed(3)} (priced engines only)`);
    if (process.env.OPENROUTER_ALLOW_SPEND !== '1') { console.error('This SPENDS real OpenRouter credits on OUR key. Re-run with OPENROUTER_ALLOW_SPEND=1 to proceed.'); process.exit(2); }
    if (usd > MAX_USD) { console.error(`plan exceeds --max-usd ${MAX_USD}; narrow with --engine or --levels`); process.exit(2); }
    for (const e of engines) {
      console.log(`▶ ${e.slug}`);
      results.engines.push(await benchEngine(e, (t) => speak(e, t)));
      save(results);
    }
  }

  save(results);
  printSummary(results);
  console.log(`\nraw results: ${path.relative(ROOT, OUT)}`);
}

function save(results) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
}

function printSummary({ engines }) {
  console.log('\n| engine | ok | median first byte ms | median total ms | ms/char | realtime x | ramp chars/s by level (429s) | pack speedup | cuts matched | median boundary pause ms |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const e of engines) {
    const L = e.latency || {};
    const ramp = (e.ramp || []).map((r) => `${r.level}:${r.charsPerSec}${r.statuses[429] ? ` (${r.statuses[429]})` : ''}`).join(' ') || '—';
    const cut = e.pack?.cut;
    const pauseMs = cut ? median(cut.rows.filter((r) => r.matched).map((r) => r.pauseMs)) : null;
    console.log(`| ${e.engine} | ${L.okCount ?? '—'}/${CORPUS.length} | ${L.medianFirstByteMs ?? '—'} | ${L.medianTotalMs ?? '—'} | ${L.msPerChar ?? '—'} | ${L.realtimeFactor ?? '—'} | ${ramp} | ${e.pack?.speedupVsSequential ?? '—'} | ${cut ? `${cut.matched}/${cut.of}` : '—'} | ${pauseMs ?? '—'} |`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
