#!/usr/bin/env node
/**
 * absorption-bakeoff — score the five competing slide-absorption cost models over real
 * decks, so the choice between them is made on measurements rather than on taste.
 *
 * THE QUESTION IT ANSWERS. Narration today advances the instant the voice stops, and the
 * arrival beat is a flat constant (`SLIDE_PAUSE_MS`), so a diagram gets the shortest
 * narration on the slide with the most to look at. `lib/core/slide-absorption.mjs` proposes
 * five ways to price "how long does this slide need to be looked at"; they share one spend
 * rule and differ only in the cost function. This tool renders each deck, measures every
 * slide, computes what the narration actually costs in time, and prints what each model
 * would do about it.
 *
 * WHAT TO READ IN THE OUTPUT. The per-model summary is not the interesting part — every
 * model can be scaled to any mean. The interesting columns are:
 *   · media exit    the beat a chart/diagram/image slide gets after its narration ends.
 *                   Today this is 0 for every slide in the tree. A model that leaves it
 *                   near 0 has not fixed the stated complaint.
 *   · prose exit    the same for text slides. A model that inflates this is padding a
 *                   slide the voice already covered — the failure mode in the other
 *                   direction.
 *   · spread        max/min arrive beat across the deck. A flat model (spread ~1) is what
 *                   we already have; the whole point is to differentiate.
 *
 * On-demand diagnostic, NOT a gate: it renders decks and prints a table, and nothing in the
 * build depends on it. Mirrors `bench`/`quality` in that respect.
 *
 * Usage:
 *   node tools/absorption-bakeoff.js                  # gallery + a curated deck set
 *   node tools/absorption-bakeoff.js --deck a.md b.md # explicit decks
 *   node tools/absorption-bakeoff.js --json           # machine-readable
 *   node tools/absorption-bakeoff.js --slides         # per-slide detail for every deck
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** The default deck set: the gallery (every component, one deck) plus decks chosen to span
 *  the failure the models disagree about — heavy diagrams, heavy charts, dense tables, and
 *  a prose-only deck as the control. */
const DEFAULT_DECKS = [
	'test/integration/baseline-decks/gallery.md',
	'examples/diagram-narration.md',
	'examples/chart-narration.md',
	'examples/chart-family-coverage.md',
];

function parseArgs(argv) {
	const opts = { decks: [], json: false, slides: false };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--json') opts.json = true;
		else if (a === '--slides') opts.slides = true;
		else if (a === '--deck') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.decks.push(argv[++i]); }
		else if (a === '--help' || a === '-h') opts.help = true;
	}
	return opts;
}

/** Render a deck and hand back its slide `<section>` nodes, parsed. */
function sectionsOf(source, JSDOM, engine) {
	const theme = (source.match(/^theme:[ \t]*(\S+)/m) || [])[1] || 'cuoio';
	const { html } = engine.render(source, theme, { preview: true });
	const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
	return { dom, sections: [...dom.window.document.querySelectorAll('article.lattice > section')] };
}

/** component → bucket, read from the component tree's own directory layout (the bucket IS
 *  the directory, per CLAUDE.md's 13-bucket list). Node-side only; the kernel takes it
 *  injected precisely so it never has to read the filesystem itself. */
function buildBucketMap() {
	const map = new Map();
	const compRoot = path.join(ROOT, 'lib/components');
	for (const bucket of fs.readdirSync(compRoot)) {
		const dir = path.join(compRoot, bucket);
		if (!fs.statSync(dir).isDirectory()) continue;
		for (const name of fs.readdirSync(dir)) {
			if (fs.existsSync(path.join(dir, name, `${name}.manifest.json`))) map.set(name, bucket);
		}
	}
	return map;
}

/** The density catalog the kernel scores model B from — the same generated artifact the
 *  runtime's Fix-Me drill-down reads, so B is scored against the calibrated budgets and not
 *  a second copy of them. */
function loadCatalog() {
	const p = path.join(ROOT, 'lib/runtime/axis-dom-catalog.generated.js');
	return fs.existsSync(p) ? require(p) : {};
}

async function main() {
	const opts = parseArgs(process.argv);
	if (opts.help) {
		console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
		return;
	}

	const { JSDOM } = require('jsdom');
	const engine = require('../lib/engine');
	const { buildTrack } = require('@workwel/cadenza');
	const { projectDeckToSpeech } = await import('../lib/transformers/prose-projection.mjs');
	const absorption = await import('../lib/core/slide-absorption.mjs');
	const { measureSlide, scoreDeck, ABSORPTION_MODELS } = absorption;

	const catalog = loadCatalog();
	const buckets = buildBucketMap();
	const bucketOf = (name) => buckets.get(name) || null;

	const deckPaths = (opts.decks.length ? opts.decks : DEFAULT_DECKS).filter((p) =>
		fs.existsSync(path.resolve(ROOT, p)),
	);
	if (!deckPaths.length) {
		console.error('absorption-bakeoff: no decks found to score.');
		process.exitCode = 1;
		return;
	}

	const modelIds = Object.keys(ABSORPTION_MODELS);
	const perDeck = [];

	for (const rel of deckPaths) {
		const source = fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
		const { dom, sections } = sectionsOf(source, JSDOM, engine);
		if (!sections.length) { dom.window.close(); continue; }

		// The narration each slide actually gets today — the same projection the export and
		// live Present both run, timed by the same Cadenza estimate the player uses. This is
		// the number the residual is charged against, so it has to be the real one.
		const speech = projectDeckToSpeech(sections);
		const narrationMs = speech.map((t) => (t ? buildTrack(t).durationMs : 0));

		const measures = sections.map((s, i) =>
			measureSlide(s, { index: i, total: sections.length, catalog, bucketOf }),
		);
		dom.window.close();

		const scored = {};
		for (const id of modelIds) {
			scored[id] = scoreDeck(measures, id, {
				narrationFor: (m) => narrationMs[m.index] || 0,
				floorMs: 1400, // today's flat `SLIDE_PAUSE_MS` — no slide may get a SHORTER arrival
			});
		}
		perDeck.push({ deck: rel, slides: sections.length, narrationMs, measures, scored });
	}

	if (opts.json) {
		console.log(JSON.stringify({ decks: perDeck }, null, 2));
		return;
	}

	report(perDeck, modelIds, ABSORPTION_MODELS, opts);
}

/** Mean of the finite numbers in `xs` (0 for an empty set). */
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

function report(perDeck, modelIds, MODELS, opts) {
	const totalSlides = perDeck.reduce((n, d) => n + d.slides, 0);
	const mediaCount = perDeck.reduce((n, d) => n + d.measures.filter((m) => m.isMedia).length, 0);

	console.log(`\nSLIDE-ABSORPTION BAKE-OFF — ${perDeck.length} decks, ${totalSlides} slides (${mediaCount} media)\n`);
	console.log('Today: every slide gets a flat 1.4s arrival beat and a 0s exit hold.\n');

	const head = ['model', 'arrive avg', 'spread', 'exit avg', 'prose exit', 'MEDIA EXIT', 'media w/ beat'];
	const rows = [];

	for (const id of modelIds) {
		const all = perDeck.flatMap((d) => d.scored[id]);
		const arrive = all.map((s) => s.arriveMs);
		const media = all.filter((s) => s.isMedia);
		const prose = all.filter((s) => !s.isMedia);
		const spread = Math.min(...arrive) > 0 ? Math.max(...arrive) / Math.min(...arrive) : 0;
		const withBeat = media.filter((s) => s.exitMs > 0).length;
		rows.push([
			MODELS[id].label,
			fmt(mean(arrive)),
			`${spread.toFixed(1)}x`,
			fmt(mean(all.map((s) => s.exitMs))),
			fmt(mean(prose.map((s) => s.exitMs))),
			fmt(mean(media.map((s) => s.exitMs))),
			media.length ? `${withBeat}/${media.length}` : '—',
		]);
	}

	const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
	const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
	console.log(line(head));
	console.log(widths.map((w) => '-'.repeat(w)).join('  '));
	for (const r of rows) console.log(line(r));

	if (opts.slides) {
		for (const d of perDeck) {
			console.log(`\n── ${d.deck}`);
			const h = ['#', 'component', 'role', 'w', 'marks', 'narr', ...modelIds.map((i) => MODELS[i].label.split(' ')[0])];
			console.log(h.join('\t'));
			d.measures.forEach((m, i) => {
				const cells = modelIds.map((id) => {
					const s = d.scored[id][i];
					return `${fmt(s.arriveMs)}+${fmt(s.exitMs)}`;
				});
				console.log([i, m.component || '—', m.role, m.words, m.svgMarks + m.cells + m.items,
					fmt(d.narrationMs[i] || 0), ...cells].join('\t'));
			});
		}
	}
	console.log('');
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
