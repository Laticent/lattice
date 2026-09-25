const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// THE LTT CONFORMANCE FIXTURES, AGAINST THE COPY THE PLAYER SHIPS.
//
// docs/src/lib/ltt/position.test.ts runs the same fixtures against the TypeScript source. That
// is not the code a recipient runs: the exported player carries `positionAt`, `makeCursor` and
// `unpackTrack` as SOURCE TEXT, serialized with `.toString()` and evaluated in a scope that holds
// nothing else. And the Studio's copy of that text comes out of the docs site's PRODUCTION bundle,
// which is minified — the docs bundle has broken an inlined kernel through minifier renames before
// (player-core.mjs `playerJs`). So this file minifies the ltt package the way a production bundle
// does, inlines each kernel exactly as `playerJs` does, and runs every fixture through the result
// (2026-09-24-lattice-timing-track.md §5, "Inlining").

const ROOT = path.join(__dirname, '../../..');
const FIXTURES = path.join(ROOT, 'docs/src/lib/ltt/conformance');

/** `var name = <source>` in an empty scope — the player's kernel block, verbatim in shape. */
function inline(fn, name) {
	return new Function(`"use strict"; var ${name} = ${fn.toString()}; return ${name};`)();
}

/** The ltt package, bundled and MINIFIED by esbuild, then imported. Renamed module-scope bindings
 *  are exactly what this exercises: a kernel that leans on one breaks here the way it would in a
 *  Studio export. esbuild is not the docs site's minifier (Vite 8 minifies with rolldown/Oxc), but
 *  it is the one installed at the root, where this suite runs; any minifier renames module-scope
 *  bindings. docs/src/lib/ltt/inlined.test.ts runs the same fixtures through rolldown itself, in
 *  the docs workspace where rolldown is installed. */
async function minifiedLtt() {
	const esbuild = require('esbuild');
	const out = await esbuild.build({
		entryPoints: [path.join(ROOT, 'docs/src/lib/ltt/index.ts')],
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: ['chrome109'],
		write: false,
		tsconfigRaw: '{}',
	});
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltt-min-'));
	const file = path.join(dir, 'ltt.min.mjs');
	fs.writeFileSync(file, out.outputFiles[0].text);
	try {
		return await import(file);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

const fixtures = fs
	.readdirSync(FIXTURES)
	.filter((f) => f.endsWith('.json'))
	.map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8')));

for (const [label, load] of [
	['unminified', () => import('@laticent/ltt')],
	['minified', minifiedLtt],
]) {
	test(`the inlined ${label} kernels pass every conformance fixture`, async () => {
		const ltt = await load();
		const makeCursor = inline(ltt.makeCursor, 'makeCursor');
		const positionAt = inline(ltt.positionAt, 'positionAt');
		const unpackTrack = inline(ltt.unpackTrack, 'unpackTrack');
		assert.ok(fixtures.length >= 3, 'the fixtures are there to run');
		let probes = 0;
		for (const f of fixtures) {
			// The track goes through the PACKED encoding and back through the inlined decoder,
			// because that is the only way a track reaches the player.
			const packed = ltt.pack(f.ltt);
			for (const p of f.probes) {
				const raw = packed.segments.find((s) => s.id === p.segment);
				const seg = raw.track ? { ...raw, track: unpackTrack(raw.track) } : raw;
				// The player always passes its own cursor, aligned as its clips decode: here, every
				// clip that carries a measurement, as `positionAt`'s own default does.
				let cursor;
				if (seg.track) {
					cursor = makeCursor(seg.track);
					for (const c of seg.audio?.clips ?? []) {
						if (c.measuredMs > 0) cursor.align(c.cue, cursor.track().cues[c.cue].startMs, Math.max(1, c.measuredMs - (c.leadMs || 0)));
					}
				}
				const got = positionAt(seg, p.localMs, cursor);
				assert.deepEqual(
					{ phase: got.phase, cueIndex: got.cueIndex, wordIndex: got.wordIndex, trackMs: got.trackMs },
					{ phase: p.phase, cueIndex: p.cueIndex, wordIndex: p.wordIndex, trackMs: p.trackMs },
					`${f.name} › ${p.segment} @ ${p.localMs} ms — ${p.why}`,
				);
				if (p.due !== undefined) assert.equal(got.due.length, p.due, `${f.name} › ${p.segment} @ ${p.localMs} ms — actions due`);
				probes++;
			}
		}
		assert.ok(probes >= 30, `every probe ran (${probes})`);
	});
}

test('positionAt without a cursor is NOT inlinable — the player must always pass one', async () => {
	// The one module-scope reference in positionAt sits in the branch that builds its own cursor.
	// Pin both halves, as inlinable-kernels.test.js does for keyAction's keymap default.
	const ltt = await minifiedLtt();
	const positionAt = inline(ltt.positionAt, 'positionAt');
	const seg = fixtures[0].ltt.segments[0];
	assert.throws(() => positionAt(seg, 100), ReferenceError, 'no cursor → a renamed module binding → ReferenceError');
	assert.equal(positionAt(seg, 100, inline(ltt.makeCursor, 'makeCursor')(seg.track)).phase, 'cue');
});
