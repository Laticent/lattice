// @vitest-environment node
// The conformance fixtures against the kernels AS THE STUDIO SHIPS THEM: bundled and minified by
// rolldown, the bundler and minifier Vite 8 runs for the docs site's production build, then
// serialized with `.toString()` and evaluated in an empty scope, exactly as `playerJs` inlines
// them (lib/export/player-core.mjs). test/unit/export/ltt-conformance.test.js does the same at the
// root with esbuild, because rolldown is installed only here.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { describe, expect, it } from 'vitest';

type Fn = (...args: never[]) => unknown;
// biome-ignore lint/suspicious/noExplicitAny: the inlined kernels are untyped source text by design
type Any = any;
const inline = (fn: Fn, name: string): Any => new Function(`"use strict"; var ${name} = ${fn.toString()}; return ${name};`)();

const dir = join(__dirname, 'conformance');
const fixtures = readdirSync(dir)
	.filter((f) => f.endsWith('.json'))
	.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

describe('the ltt kernels, minified by rolldown and inlined', () => {
	it('pass every conformance fixture', async () => {
		const out = await build({ input: join(__dirname, 'index.ts'), write: false, output: { format: 'esm', minify: true } });
		const tmp = mkdtempSync(join(tmpdir(), 'ltt-rolldown-'));
		const file = join(tmp, 'ltt.min.mjs');
		writeFileSync(file, (out.output[0] as { code: string }).code);
		let ltt: Any;
		try {
			ltt = await import(/* @vite-ignore */ pathToFileURL(file).href);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
		const makeCursor = inline(ltt.makeCursor, 'makeCursor');
		const positionAt = inline(ltt.positionAt, 'positionAt');
		const unpackTrack = inline(ltt.unpackTrack, 'unpackTrack');
		let probes = 0;
		for (const f of fixtures) {
			const packed = ltt.pack(f.ltt);
			for (const p of f.probes) {
				const raw = packed.segments.find((s: Any) => s.id === p.segment);
				const seg = raw.track ? { ...raw, track: unpackTrack(raw.track) } : raw;
				let cursor: Any;
				if (seg.track) {
					cursor = makeCursor(seg.track);
					for (const c of seg.audio?.clips ?? []) {
						if (c.measuredMs > 0) cursor.align(c.cue, cursor.track().cues[c.cue].startMs, Math.max(1, c.measuredMs - (c.leadMs || 0)));
					}
				}
				const got = positionAt(seg, p.localMs, cursor);
				expect({ phase: got.phase, cueIndex: got.cueIndex, wordIndex: got.wordIndex, trackMs: got.trackMs }, `${f.name} › ${p.segment} @ ${p.localMs} — ${p.why}`).toEqual({
					phase: p.phase,
					cueIndex: p.cueIndex,
					wordIndex: p.wordIndex,
					trackMs: p.trackMs,
				});
				probes++;
			}
		}
		expect(probes).toBeGreaterThanOrEqual(30);
		// And the minifier really did rename: the no-cursor branch's module reference is gone.
		expect(() => positionAt(fixtures[0].ltt.segments[0], 100)).toThrow(ReferenceError);
	});
});
