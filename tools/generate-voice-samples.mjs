#!/usr/bin/env node
/**
 * Pre-generates the "Play sample" audio the Studio's TTS settings panel plays for
 * every CURATED voice on a paid cloud engine (requiresAsset: true in
 * docs/src/playground/tts-voice-catalog.json — today: grok, gemini, orpheus) and
 * commits them as repo assets under docs/public/voice-samples/<engine>/<voice-id>.<ext>.
 * docs/src/components/studio/read-aloud.ts's previewTtsVoice() then plays the cached
 * file directly instead of hitting the live OpenRouter endpoint on every click — no
 * per-click spend, no timeout risk, instant playback (HARD RULE #24 §OpenRouter
 * budget; see the asset-caching section of
 * engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md).
 *
 * Most engines return mp3 directly. A model can instead declare
 * `"audioFormat": "wav"` in the catalog (today: gemini, whose speech endpoint 400s
 * on response_format:"mp3" and only returns raw PCM) — for those, this requests
 * response_format:"pcm", reads the actual sample rate/channels off the response's
 * Content-Type header (never hardcoded — a model-specific quirk, not assumed
 * universal), and wraps the PCM in a WAV container so the file is still directly
 * playable by a plain <audio> element with no decoding library.
 *
 * Kokoro is deliberately excluded — it's on-device and free, so it never spends
 * credits and doesn't need this cache (see the "kokoro" engine's _note in the
 * catalog JSON).
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
  .filter(([, def]) => def.requiresAsset && def.modelId && def.voices.length)
  .filter(([slug]) => !ENGINE_FILTER || slug === ENGINE_FILTER);

if (!engines.length) {
  console.error(ENGINE_FILTER ? `no requiresAsset engine named "${ENGINE_FILTER}"` : 'no requiresAsset engines in the catalog — nothing to generate');
  process.exit(2);
}

let jobs = [];
for (const [slug, def] of engines) {
  for (const voice of def.voices) jobs.push({ slug, modelId: def.modelId, voice: voice.id, format: def.audioFormat === 'wav' ? 'wav' : 'mp3' });
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
  if (format === 'wav') {
    const { buf, contentType } = await speechRequest(modelId, voice, 'pcm');
    const { rate, channels } = parsePcmContentType(contentType);
    return pcmToWav(buf, rate, channels);
  }
  const { buf } = await speechRequest(modelId, voice, 'mp3');
  return buf;
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
    const file = path.join(dir, `${job.voice}.${job.format}`);
    try {
      const buf = await synth(job.modelId, job.voice, job.format);
      fs.writeFileSync(file, buf);
      written++;
      console.log(`✓ ${job.slug}/${job.voice}.${job.format} (${buf.length} bytes)`);
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
