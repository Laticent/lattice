#!/usr/bin/env node
/**
 * Pre-generates the "Play sample" audio the Studio's TTS settings panel plays for
 * every FEATURED voice on a paid cloud engine (requiresAsset: true in
 * docs/src/playground/tts-voice-catalog.json's engines — the featured subset is
 * that engine's `cachedVoices` list, a bounded slice of the model's real, live
 * roster) and commits them as repo assets under
 * docs/public/voice-samples/<engine>/<voice-id>.<ext>. The full roster itself
 * (which voices exist at all) is NOT in this JSON — it's fetched live from
 * OpenRouter's own `supported_voices` field; this script only decides which of
 * those get a pre-generated sample. docs/src/components/studio/read-aloud.ts's
 * previewTtsVoice() then plays the cached file directly instead of hitting the
 * live OpenRouter endpoint on every click — no per-click spend, no timeout risk,
 * instant playback (HARD RULE #24 §OpenRouter budget; see the redesign section of
 * engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md).
 *
 * EVERY COMMITTED SAMPLE IS AN MP3, whatever the provider returned. `audioFormat`
 * in the catalog describes THE WIRE, not the file on disk: most engines return mp3
 * directly, and a model can declare `"audioFormat": "wav"` (today: gemini, whose
 * speech endpoint 400s on response_format:"mp3" and only returns raw PCM) — for
 * those, this requests response_format:"pcm", reads the actual sample rate/channels
 * off the response's Content-Type header (never hardcoded — a model-specific quirk,
 * not assumed universal), and ENCODES it to mp3 before writing.
 *
 * That split matters because the two facts used to be one field and they are not the
 * same fact. Committing gemini's PCM as a WAV made its samples 132 KB where the mp3
 * roster is 11–29 KB for the same 35-character sentence — 3.9 MB of the asset set,
 * and, worse, the byte-rate table the export panel quotes from is DERIVED from these
 * files (narration-bake.ts's ENGINE_BYTES_PER_CHAR), so an uncompressed sample set
 * taught the quote that uncompressed audio is what ships. It no longer is: the rung
 * compresses the same PCM the same way before it is cached or baked
 * (docs/src/playground/narration-encode.js), so these files and the shipped artifact
 * are once again the same codec at the same bitrate — which is the only reason
 * measuring one to predict the other is honest.
 *
 * Kokoro is currently excluded (requiresAsset: false) — on-device it's free and
 * doesn't need caching; hosted as a cloud model it technically would benefit, but
 * the hosted endpoint was observed consistently timing out during this round of
 * generation (provider-side instability, not a per-voice defect) — see the
 * engine's own `_note` in the catalog JSON.
 *
 * Guards against a voice/model disappearing from OpenRouter's live catalog: before
 * spending on an engine, this checks the engine's modelId against
 * GET /api/v1/models?output_modalities=speech and SKIPS (not fails) an engine whose
 * model isn't live, so a discontinued model can't silently corrupt the asset set —
 * it just leaves the existing cached files in place and reports the skip.
 *
 * Usage:  OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1 node tools/generate-voice-samples.mjs [--engine <slug>] [--limit <n>]
 *   Spends real credits on OUR key — opt-in only. Without OPENROUTER_ALLOW_SPEND=1 it prints the
 *   planned spend and exits. Validate on --limit 1 first; set a per-key spend cap at
 *   https://openrouter.ai/settings/keys. (HARD RULE #24 — see engineering/workflow.md §OpenRouter budget.)
 * The key is read ONLY from the environment and never printed. Exit 0 = every planned
 * sample was written; 1 = a sample failed after retries; 2 = no key / nothing to do (skipped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BITRATE_KBPS, encodeMp3 } from '../docs/src/playground/narration-encode.js';

/** The bitrate committed samples are encoded at — the SAME default the rung compresses
 *  narration to, deliberately shared rather than re-picked here. These files are what
 *  ENGINE_BYTES_PER_CHAR is measured from, so a sample encoded at a different rate than the
 *  audio it predicts would make the export panel's size quote wrong by exactly that ratio. */
const SAMPLE_BITRATE_KBPS = DEFAULT_BITRATE_KBPS;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = path.join(ROOT, 'docs/src/playground/tts-voice-catalog.json');
const OUT_DIR = path.join(ROOT, 'docs/public/voice-samples');
const SAMPLE_TEXT = 'This is how your slides will sound.';

const KEY = process.env.OPEN_ROUTER_KEY;
if (!KEY) {
  console.error('no OPEN_ROUTER_KEY in env — sample generation skipped');
  process.exit(2);
}

const argv = process.argv.slice(2);
const ENGINE_FILTER = argv.includes('--engine') ? argv[argv.indexOf('--engine') + 1] : null;
const LIMIT = argv.includes('--limit') ? Math.max(1, Number(argv[argv.indexOf('--limit') + 1]) || 1) : null;

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const engines = Object.entries(catalog.engines)
  .filter(([, def]) => def.requiresAsset && def.modelId && def.cachedVoices.length)
  .filter(([slug]) => !ENGINE_FILTER || slug === ENGINE_FILTER);

if (!engines.length) {
  console.error(ENGINE_FILTER ? `no requiresAsset engine named "${ENGINE_FILTER}"` : 'no requiresAsset engines in the catalog — nothing to generate');
  process.exit(2);
}

let jobs = [];
for (const [slug, def] of engines) {
  // `format` is what to ASK THE WIRE for, not what to write — every sample is written as mp3.
  for (const voice of def.cachedVoices) jobs.push({ slug, modelId: def.modelId, voice, format: def.audioFormat === 'wav' ? 'pcm' : 'mp3' });
}
if (LIMIT) jobs = jobs.slice(0, LIMIT);

// Budget guardrail (HARD RULE #24): spending OUR OPEN_ROUTER_KEY is opt-in and
// cost-visible, never accidental. Print the plan up front; require an explicit
// OPENROUTER_ALLOW_SPEND=1. Validate on a tiny sample (--limit 1) and set a per-key
// spend cap at https://openrouter.ai/settings/keys before an at-scale run.
if (process.env.OPENROUTER_ALLOW_SPEND !== '1') {
  console.error(
    'This SPENDS real OpenRouter credits on OUR key.\n' +
    `  plan: ${jobs.length} sample(s) across ${engines.length} engine(s) (${engines.map(([s]) => s).join(', ')}), ` +
    `~${SAMPLE_TEXT.length} chars of text each.\n` +
    '  Validate first on a tiny sample: --limit 1. Set a per-key spend cap at https://openrouter.ai/settings/keys.\n' +
    '  Re-run with OPENROUTER_ALLOW_SPEND=1 to proceed.',
  );
  process.exit(2);
}

async function liveSpeechModelIds() {
  const res = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech', {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} listing live TTS models`);
  const body = await res.json();
  return new Set((body.data || []).map((m) => m.id));
}

async function speechRequest(modelId, voice, responseFormat) {
  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
      'HTTP-Referer': 'https://lattice.dev',
      'X-Title': 'Lattice voice-sample generator',
    },
    body: JSON.stringify({ model: modelId, input: SAMPLE_TEXT, voice, response_format: responseFormat }),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch {}
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('empty audio response');
  return { buf, contentType: res.headers.get('content-type') || '' };
}

/** Wraps raw 16-bit PCM in a standard 44-byte WAV header — no encoding library
 *  needed, just the RIFF/fmt/data chunk layout a browser <audio> element reads
 *  directly. */
function pcmToWav(pcm, sampleRate, channels) {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Content-Type looks like "audio/pcm;rate=24000;channels=1" — read the real
 *  values rather than assume a rate, since it's a per-model quirk. Falls back to
 *  a conservative default only if the header is missing/unparseable. */
function parsePcmContentType(contentType) {
  const rate = Number(/rate=(\d+)/.exec(contentType)?.[1]) || 24000;
  const channels = Number(/channels=(\d+)/.exec(contentType)?.[1]) || 1;
  return { rate, channels };
}

async function synth(modelId, voice, format) {
  if (format === 'pcm') {
    const { buf, contentType } = await speechRequest(modelId, voice, 'pcm');
    const { rate, channels } = parsePcmContentType(contentType);
    // COMPRESS rather than commit the PCM as a WAV. Every sample on disk is mp3 now, whatever
    // the wire returned — see the `audioFormat` note in the header. The WAV wrap survives as
    // the fallback for a rate MPEG has no table for, because a large sample that plays is
    // strictly better than a small one that plays at the wrong speed.
    const mp3 = await encodeMp3(pcmToInt16(buf), rate, channels, SAMPLE_BITRATE_KBPS);
    if (mp3) return Buffer.from(mp3);
    console.warn(`  ! ${modelId}/${voice}: could not encode ${rate} Hz PCM to mp3 — committing WAV`);
    return pcmToWav(buf, rate, channels);
  }
  const { buf } = await speechRequest(modelId, voice, 'mp3');
  return buf;
}

/** Raw little-endian 16-bit PCM → Int16Array, copied (not viewed) so an unaligned or
 *  odd-length response can't throw on construction. Twin of voice-model.js's `pcmToInt16`. */
function pcmToInt16(buf) {
  const usable = buf.byteLength & ~1;
  return new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + usable));
}

// A voice id can contain characters invalid in a Windows filename (MAI-Voice-2's
// ids carry a literal ":", e.g. "en-US-Harper:MAI-Voice-2") — sanitize before
// writing to disk. Mirrored EXACTLY in tts-voice-catalog.ts's cachedSampleUrl (a
// tiny pure function, duplicated rather than shared across the Node/browser
// runtime boundary — same pattern as this file's own orPricePerM twin in
// voice-model.js) so a generated filename and its runtime lookup URL always agree.
function safeFilename(voiceId) {
  return voiceId.replace(/:/g, '_');
}

async function main() {
  const live = await liveSpeechModelIds();
  const skippedEngines = new Set(engines.filter(([, def]) => !live.has(def.modelId)).map(([slug]) => slug));
  for (const slug of skippedEngines) {
    console.log(`⊘ ${slug} — model no longer on OpenRouter's live speech catalog, skipping (existing cached files untouched)`);
  }

  let written = 0;
  const failures = [];
  for (const job of jobs) {
    if (skippedEngines.has(job.slug)) continue;
    const dir = path.join(OUT_DIR, job.slug);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${safeFilename(job.voice)}.${job.format}`;
    const file = path.join(dir, filename);
    try {
      const buf = await synth(job.modelId, job.voice, job.format);
      fs.writeFileSync(file, buf);
      written++;
      console.log(`✓ ${job.slug}/${filename} (${buf.length} bytes)`);
    } catch (e) {
      failures.push(`${job.slug}/${job.voice}: ${e.message}`);
      console.log(`✗ ${job.slug}/${job.voice} — ${e.message}`);
    }
  }

  console.log(`\n${written}/${jobs.length - [...skippedEngines].reduce((n, s) => n + jobs.filter((j) => j.slug === s).length, 0)} sample(s) written` +
    (skippedEngines.size ? `, ${skippedEngines.size} engine(s) skipped (catalog drift)` : ''));
  if (failures.length) {
    console.log(`FAILURES:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
