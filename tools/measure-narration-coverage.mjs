#!/usr/bin/env node
/**
 * Measure how much of each component's slide actually reaches the voice.
 *
 * The audit at engineering/decisions/2026-09-20-narration-audit.md says "every number below is
 * reproducible from a clean checkout". This is what reproduces them — it was a scratch script
 * during the audit, which made that sentence false until it was committed.
 *
 *   node tools/measure-narration-coverage.mjs            # build the deck, render, measure
 *   node tools/measure-narration-coverage.mjs --deck-only # just write the deck, skip rendering
 *
 * WHAT IT MEASURES. One deck holding all 70 components' own canonical `sample` slides, rendered
 * through the real CLI with `--captions`, then each per-slide `.vtt` stripped of cue timings and
 * compared against the source slide's character count.
 *
 * THE RATIO IS CRUDE ON PURPOSE. It is not a quality score — a narrator that computes a fact the
 * slide only draws can exceed 1.0 (funnel does, at 1.81). It is a COVERAGE signal, and its whole
 * job is that it separates the two populations with nothing in between: a component that keeps
 * its substance in HTML lands at 0.80-1.07, one that keeps it in an SVG at 0.09-0.28.
 *
 * Needs CHROME_PATH (the SessionStart hook exports it) and a built `dist/`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'narration-coverage-'));

const manifests = fs
	.readdirSync(path.join(ROOT, 'lib/components'), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.flatMap((bucket) => {
		const dir = path.join(ROOT, 'lib/components', bucket.name);
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((c) => c.isDirectory())
			.map((c) => path.join(dir, c.name, `${c.name}.manifest.json`))
			.filter((f) => fs.existsSync(f));
	})
	.sort();

const slides = [];
for (const file of manifests) {
	const m = JSON.parse(fs.readFileSync(file, 'utf8'));
	const sample = m.sample || m.skeleton;
	if (!sample) continue;
	slides.push({ bucket: m.bucket || m.function, name: m.name, source: sample.trim() });
}

const deckPath = path.join(out, 'all-components.md');
fs.writeFileSync(deckPath, ['---\ntheme: indaco\n---\n', ...slides.map((s) => `${s.source}\n`)].join('\n---\n\n'));
process.stdout.write(`${slides.length} components -> ${deckPath}\n`);
if (process.argv.includes('--deck-only')) process.exit(0);

execFileSync('node', [path.join(ROOT, 'dist/lattice-emulator.js'), deckPath, '-o', path.join(out, 'deck.pdf'), '--captions'], {
	cwd: ROOT,
	stdio: 'inherit',
});

/** A `.vtt` with its cue timings and karaoke tags stripped — just the words. */
const spokenText = (vtt) => {
	const body = vtt
		.split('\n')
		.filter((l) => l.trim() && !l.includes('-->') && !l.startsWith('WEBVTT') && !/^\d+$/.test(l.trim()));
	return body.join(' ').replace(/<\d\d:\d\d:\d\d\.\d+>/g, '').trim();
};

const rows = slides.map((s, i) => {
	// The sidecars are named from the OUTPUT path's base, not the deck's.
	const vtt = path.join(out, `deck.${String(i + 1).padStart(2, '0')}.vtt`);
	const spoken = fs.existsSync(vtt) ? spokenText(fs.readFileSync(vtt, 'utf8')) : '';
	return { ...s, src: s.source.length, spoken: spoken.length, ratio: spoken.length / Math.max(s.source.length, 1), text: spoken };
});

rows.sort((a, b) => a.ratio - b.ratio);
process.stdout.write(`\n${'component'.padEnd(26)}${'src'.padStart(6)}${'spoken'.padStart(8)}${'ratio'.padStart(8)}\n`);
for (const r of rows) {
	process.stdout.write(`${`${r.bucket}/${r.name}`.padEnd(26)}${String(r.src).padStart(6)}${String(r.spoken).padStart(8)}${r.ratio.toFixed(2).padStart(8)}\n`);
}
const mean = rows.reduce((a, r) => a + r.ratio, 0) / rows.length;
process.stdout.write(`\nmean ratio ${mean.toFixed(3)} across ${rows.length} components\nartifacts in ${out}\n`);
