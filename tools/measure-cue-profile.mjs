#!/usr/bin/env node
/**
 * measure-cue-profile.mjs — the listenability of an emitted caption track, measured.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * Narration work carries a caveat nothing in this repo could close: "nobody has
 * listened." It is a real limit — the shipped voices are a cloud engine (barred
 * from the per-PR path by HARD RULE #24) or on-device Kokoro (WebGPU, browser), so
 * no sandbox here can hear the artifact.
 *
 * But "nobody has listened" was doing too much work as a caveat. Some of what an
 * ear catches is not about SOUND at all — it is about the SHAPE of the track, and
 * the shape is in the bytes:
 *
 *   · a cue too long to follow in one breath (and, since a cue is also one TTS
 *     clip, one long un-scrubbable utterance);
 *   · a cue so short it chops;
 *   · timings that go backwards, overlap, or put a karaoke word outside its own cue.
 *
 * This measures those. It found a real defect the first time it ran: a THIRTEEN-
 * SECOND, 39-word cue on the state-chart hazards slide, because the machine-shape
 * narrator joined six clauses with semicolons into one sentence and the segmenter
 * makes one cue per sentence. Splitting the shape into two sentences took the
 * longest cue to 10.1s / 28 words and p90 from 7.6s to 6.9s.
 *
 * ── WHAT IT DOES NOT TELL YOU ────────────────────────────────────────────────
 *
 * Whether the words are the RIGHT words, and whether the voice sounds good. It is a
 * shape check, not a hearing aid, and a track can score perfectly here while saying
 * something false. It narrows the un-listened caveat; it does not close it.
 *
 * Usage:
 *   node tools/measure-cue-profile.mjs <file.vtt> [more.vtt …]
 *   node tools/measure-cue-profile.mjs out/deck.[0-9][0-9].vtt
 *
 * Exits non-zero if any STRUCTURAL problem is found (a backwards or overlapping
 * timing), which is a defect at any length. Length itself is reported, not gated:
 * the right ceiling is a judgment about the deck, not a constant.
 */

import fs from 'node:fs';
// The fixed-point tag stripper every kernel here uses — see `spokenText` below.
import { createRequire } from 'node:module';

const { stripTags } = createRequire(import.meta.url)('../lib/core/plain-text.js');

/** `00:01:02.345` → milliseconds. */
function ms(stamp) {
  const [h, m, rest] = stamp.split(':');
  const [sec, milli] = rest.split('.');
  return Number(h) * 3600000 + Number(m) * 60000 + Number(sec) * 1000 + Number(milli);
}

/**
 * The cue's words, with the karaoke tags stripped.
 *
 * STRIP FIRST, ALWAYS. A `<00:00:04.120>` tag sits BETWEEN the words of a cue, so
 * any measurement that counts or greps the raw body is measuring the tags too. This
 * exact mistake already produced a true conclusion by an unsound route once in this
 * repo's history; it is worth a helper rather than a comment.
 *
 * IT USES THE SHARED `stripTags`, and the first draft of this file did not — it
 * carried two local one-pass regexes, which CodeQL flagged high
 * (js/incomplete-multi-character-sanitization) within minutes of the push. Correct,
 * and the rule is not academic: removing a tag can splice a NEW one together out of
 * the text either side of it, so one pass is not a fixed point. `lib/core/plain-text.js`
 * loops until stable and has done since it was written; reaching for it is HARD
 * RULE #15, and writing a local copy of a kernel this repo already documents as the
 * answer is exactly what that rule is for.
 */
function spokenText(body) {
  return stripTags(body).replace(/\s+/g, ' ').trim();
}

function readCues(file) {
  const text = fs.readFileSync(file, 'utf8');
  const cues = [];
  const problems = [];
  let previousEnd = -1;
  for (const block of text.split(/\n\n+/)) {
    const timing = block.split('\n').find((l) => l.includes('-->'));
    if (!timing) continue;
    const [from, to] = timing.split('-->').map((s) => s.trim().split(' ')[0]);
    const start = ms(from);
    const end = ms(to);
    const body = block
      .split('\n')
      .filter((l) => !l.includes('-->') && l.trim() && !/^(WEBVTT|NOTE)/.test(l))
      .join(' ');
    const spoken = spokenText(body);

    if (end <= start) problems.push(`${file}: cue at ${from} ends before it starts`);
    if (start < previousEnd) problems.push(`${file}: cue at ${from} overlaps the one before it`);
    previousEnd = end;

    const tags = [...body.matchAll(/<(\d\d:\d\d:\d\d\.\d\d\d)>/g)].map((m) => ms(m[1]));
    for (let i = 1; i < tags.length; i++) {
      if (tags[i] < tags[i - 1]) problems.push(`${file}: karaoke timing runs backwards in the cue at ${from}`);
    }
    if (tags.length && (tags[0] < start || tags[tags.length - 1] > end)) {
      problems.push(`${file}: a karaoke tag falls outside its own cue at ${from}`);
    }

    const words = spoken.split(/\s+/).filter(Boolean).length;
    cues.push({ file, start, duration: end - start, words, spoken });
  }
  return { cues, problems };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function main(files) {
  if (!files.length) {
    console.error('usage: node tools/measure-cue-profile.mjs <file.vtt> [more.vtt …]');
    process.exit(64);
  }
  const cues = [];
  const problems = [];
  for (const f of files) {
    const r = readCues(f);
    cues.push(...r.cues);
    problems.push(...r.problems);
  }
  if (!cues.length) {
    console.error('no cues found — are these WebVTT files?');
    process.exit(64);
  }

  const durations = cues.map((c) => c.duration).sort((a, b) => a - b);
  const rates = cues.map((c) => c.words / (c.duration / 1000)).filter(Number.isFinite).sort((a, b) => a - b);
  const byLength = [...cues].sort((a, b) => b.duration - a.duration);

  console.log(`cues          ${cues.length} across ${files.length} file(s)`);
  console.log(
    `duration ms   min ${durations[0]}  p50 ${percentile(durations, 0.5)}  ` +
      `p90 ${percentile(durations, 0.9)}  max ${durations[durations.length - 1]}`,
  );
  console.log(
    `words/sec     min ${rates[0].toFixed(2)}  p50 ${percentile(rates, 0.5).toFixed(2)}  ` +
      `max ${rates[rates.length - 1].toFixed(2)}`,
  );
  console.log(`words/cue     min ${Math.min(...cues.map((c) => c.words))}  max ${Math.max(...cues.map((c) => c.words))}`);

  console.log('\nLONGEST — one breath, and one un-scrubbable TTS clip:');
  for (const c of byLength.slice(0, 3)) {
    console.log(`  ${(c.duration / 1000).toFixed(1)}s ${String(c.words).padStart(3)}w  ${c.spoken.slice(0, 100)}…`);
  }
  console.log('\nSHORTEST — the choppy end:');
  for (const c of byLength.slice(-3)) {
    console.log(`  ${(c.duration / 1000).toFixed(1)}s ${String(c.words).padStart(3)}w  ${JSON.stringify(c.spoken.slice(0, 70))}`);
  }

  console.log(`\nSTRUCTURAL PROBLEMS: ${problems.length}`);
  for (const p of problems) console.log(`  ! ${p}`);
  process.exit(problems.length ? 1 : 0);
}

main(process.argv.slice(2));
