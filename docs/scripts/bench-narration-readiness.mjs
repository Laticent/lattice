// Bench: what the Present readiness poll costs, whole-deck vs windowed (#1392).
//
// COMMITTED ON PURPOSE. The last two changes to this path shipped on arguments that sounded
// obviously correct and were backwards — one of them 7x slower on the state every new user is
// in — because nobody could re-run the numbers. This is that missing script.
//
// Real Chromium, real IndexedDB, the real `narration-store.js` module (loaded from source as a
// module, not re-implemented), and the real cache-key format. What it measures is the work the
// 2s poll does per tick:
//
//   1. build one content-complete key per sentence asked about   (JSON.stringify, O(asked))
//   2. `readyKeys(keys)` — ONE `getAllKeys()` over the store      (O(store))
//   3. intersect, rebuilding each key again to score per slide    (O(asked))
//
// Windowing changes the O(asked) term from the whole deck to the lookahead window. It does NOT
// change the O(store) term, and this bench shows that plainly rather than hiding it — the point
// of the change is to stop asking a question that scales with the deck, not to make the store
// read cheaper.
//
// NOT measured here: React commits, the rail's own render. Those ride the same main thread and
// were addressed separately (the quantized progress update + the memoized rail).
//
//   node scripts/bench-narration-readiness.mjs            # default matrix
//   node scripts/bench-narration-readiness.mjs --json     # machine-readable
//
// Needs the preview server for an http origin (IndexedDB is refused on about:blank):
//   npm run build:e2e && npm run preview:e2e

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ORIGIN = process.env.BENCH_ORIGIN || 'http://localhost:4321';
const STORE_SRC = fileURLToPath(new URL('../src/playground/narration-store.js', import.meta.url));

/** store records x deck sentences. The first row is the fresh device — the state every new
 *  user is in, and the one the reverted "optimization" was 7x slower on. */
const MATRIX = [
	{ store: 0, deck: 300 },
	{ store: 300, deck: 300 },
	{ store: 3000, deck: 300 },
	{ store: 5000, deck: 5000 },
];
/** Lookahead 2 (the default) + a 2-slide margin + the current slide, at ~5 sentences a slide. */
const WINDOW_SENTENCES = 25;
const REPS = 12;

const sentence = (i) => `Sentence number ${i} of a deck that says a great many things about the quarter.`;

async function main() {
	const json = process.argv.includes('--json');
	const source = readFileSync(STORE_SRC, 'utf8');
	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on('pageerror', (e) => console.error('[page]', e.message));
	await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });

	// A throwaway pass before the matrix. Without it the FIRST row pays the JIT warm-up for
	// `JSON.stringify` and the IDB connection and reads slower than a heavier row after it —
	// which would put the most important number in the table (the fresh device) in the wrong
	// place. Measured: row 1 fell from 2.6ms to in-line with its neighbours once this existed.
	const WARMUP = { store: 50, deck: 200 };
	const rows = [];
	for (const cell of [WARMUP, ...MATRIX]) {
		const r = await page.evaluate(
			async ({ source, cell, reps, windowSentences, template }) => {
				const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
				const store = await import(/* @vite-ignore */ url);
				await store.clearClips();

				// The real key shape: `cacheKeyFor` is `JSON.stringify([rung, model, voice, speed, text])`.
				const keyOf = (text) => JSON.stringify(['kokoro', 'onnx-community/Kokoro-82M-v1.0-ONNX', 'af_heart', 1, text]);
				const say = (i) => template.replace('{i}', String(i));

				// Seed the store. Half the deck's own sentences are present, so the intersection
				// does real work rather than missing everything.
				const bytes = new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' });
				for (let i = 0; i < cell.store; i++) await store.putClip(keyOf(say(i)), bytes);

				const deckSentences = Array.from({ length: cell.deck }, (_, i) => say(i));
				const windowed = deckSentences.slice(0, windowSentences);

				// One poll tick: build the keys, one store read, then score each sentence.
				const tick = async (sentences) => {
					const keys = [...new Set(sentences)].map(keyOf);
					const ready = await store.readyKeys(keys);
					let have = 0;
					for (const s of sentences) if (ready.has(keyOf(s))) have++;
					return have;
				};

				const time = async (sentences) => {
					await tick(sentences); // warm the IDB connection; never counted
					const samples = [];
					for (let n = 0; n < reps; n++) {
						const t0 = performance.now();
						await tick(sentences);
						samples.push(performance.now() - t0);
					}
					samples.sort((a, b) => a - b);
					return samples[Math.floor(samples.length / 2)]; // median
				};

				const whole = await time(deckSentences);
				const win = await time(windowed);
				URL.revokeObjectURL(url);
				return { whole, win };
			},
			{ source, cell, reps: REPS, windowSentences: WINDOW_SENTENCES, template: sentence('{i}') },
		);
		if (cell === WARMUP) continue;
		rows.push({ ...cell, wholeMs: +r.whole.toFixed(1), windowMs: +r.win.toFixed(1), speedup: +(r.whole / r.win).toFixed(1) });
		if (!json) console.log(`  store ${String(cell.store).padStart(5)}  deck ${String(cell.deck).padStart(5)}  →  whole ${rows.at(-1).wholeMs}ms   windowed ${rows.at(-1).windowMs}ms   ${rows.at(-1).speedup}x`);
	}

	await browser.close();
	if (json) {
		console.log(JSON.stringify({ window: WINDOW_SENTENCES, reps: REPS, rows }, null, 2));
	} else {
		console.log('\n| store records | deck sentences | whole-deck | windowed | |');
		console.log('|---|---|---|---|---|');
		for (const r of rows) console.log(`| ${r.store} | ${r.deck} | ${r.wholeMs} ms | ${r.windowMs} ms | **${r.speedup}x faster** |`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
