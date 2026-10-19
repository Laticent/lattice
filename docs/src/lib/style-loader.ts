// On-demand engine styles for the Playground (E3 of engineering/decisions/2026-10-18-on-demand-styles.md).
//
// `dist/lattice-min.css` is 936 KiB (117 KB gzipped) and a deck uses a median 21% of it. `dist/styles-min/`
// cuts it into 187 ordered modules, and `lib/core/style-needs-scan.mjs` says which of them a rendered
// document needs. This loader is the browser half: it fetches the index and the always-needed modules
// first, scans the HTML the engine rendered, fetches the modules that HTML needs, and hands the host
// the CSS to register as the `lattice` theme. It is a style sink (HARD RULE #22): every module is
// passed through `sanitizeStyleText` as it arrives, and the registered text reaches the frame only
// through `docStyleText`, which sanitizes the composed sheet again.
//
// THE UNION ONLY GROWS. Each scan adds modules; none is dropped within a session. Deleting a component
// from the source then re-adding it never reloads anything, and the host recomposes the sheet only when a scan
// brings in a module the base does not have yet (`ensureFor` answers `grew`), which is one more render
// in the cold case and almost never after that.
//
// HINTS ONLY WARM. `warm(markdown)` reads `_class:` / `class=` words and starts fetching the modules
// those classes name, in parallel with the engine bundle. It never adds anything to the registered
// set: the rendered HTML decides that. (Markdown alone misses modules on 6 of 9 decks; the note, §4.)
//
// Pane decks (`<lat-pane>`) are styled by selectors the engine rewrites per deck, so the raw module
// selectors cannot be asked about that document: the scan falls back to the token filter for them.

import { sanitizeStyleText } from '../../../lib/core/sanitize-style-text.mjs';
import { neededModules, scanDocument } from '../../../lib/core/style-needs-scan.mjs';

type Alt = [string[], string[], string[], string[]];
type IndexEntry = { id: string; always: boolean; alts: Alt[]; requires: number[]; defines?: string[]; sel?: (string[] | null)[] };
type Needs = {
	version: number;
	verified: boolean;
	/** Module indexes to load at start besides the always-needed ones: the modules most decks end up needing, so they load in parallel with the engine instead of after the first render (tools/style-needs-common.js). Optional. */
	floor?: number[];
	runtime: { c: string[]; a: string[] };
	modules: { id: string; file: string; bytes: number }[];
	index: IndexEntry[];
};

/** What the host puts around the slides that the engine's HTML does not carry. */
export type ScanShell = {
	/** The opening of the document, through `<body>` (the `<html>` attributes the host sets). */
	open: string;
	/** Markup the host writes before the slides inside `<body>` (the texture `<defs>`). */
	prefix: string;
	/** Classes and attributes the host's own scripts add later (the fit agent, the click agent). */
	runtime: { c?: string[]; a?: string[]; t?: string[]; i?: string[] };
};

export type StyleLoaderStats = {
	indexBytes: number;
	modulesLoaded: number;
	modulesTotal: number;
	bytesLoaded: number;
	bytesTotal: number;
	scans: number;
	lastScanMs: number;
};

export function createStyleLoader(stylesBase: string, opts: { indexName?: string; shell?: ScanShell | (() => ScanShell | undefined); wholeAbove?: number } = {}) {
	const indexName = opts.indexName || 'needs.json';
	// Past this share of the sheet's bytes, modules cost more than the one file: each is a request, and
	// small files gzip worse (the 120-slide gallery needs 75% of the sheet and measured 130 KB on the wire
	// in 105 requests, against 116 KB in one). The loader then says so and the host loads the whole sheet.
	const wholeAbove = opts.wholeAbove ?? 0.55;
	let needs: Needs | null = null;
	let indexPromise: Promise<Needs> | null = null;
	const texts = new Map<number, Promise<string>>();
	/** The same text, once it has arrived (the synchronous `css()` reads this). */
	const resolved = new Map<number, string>();
	/** Modules whose text has arrived AND that the host has been told about. */
	const included: boolean[] = [];
	let signature = '0';
	let indexBytes = 0;
	let scans = 0;
	let lastScanMs = 0;
	/** The slides the last COMPLETED scan read; a scan that threw leaves it unset so the next render retries. */
	let lastScanned = '';
	let lastSheetLength = -1;

	function loadIndex(): Promise<Needs> {
		if (!indexPromise) {
			indexPromise = fetch(stylesBase + indexName)
				.then((r) => {
					if (!r.ok) throw new Error('style index (' + r.status + ')');
					return r.text();
				})
				.then((text) => {
					indexBytes = text.length;
					const n = JSON.parse(text) as Needs;
					if (n.version !== 1 || n.modules.length !== n.index.length) throw new Error('style index: unknown shape');
					needs = n;
					return n;
				})
				.catch((e) => {
					indexPromise = null; // a transient failure must not poison later renders
					throw e;
				});
		}
		return indexPromise;
	}

	function moduleText(n: Needs, i: number): Promise<string> {
		let p = texts.get(i);
		if (!p && n.modules[i].bytes === 0) {
			// A module that minifies to nothing (an empty `_theme` stub, a component with no rules): no request.
			resolved.set(i, '');
			p = Promise.resolve('');
			texts.set(i, p);
		}
		if (!p) {
			p = fetch(stylesBase + n.modules[i].file)
				.then((r) => {
					if (!r.ok) throw new Error('style module ' + n.modules[i].id + ' (' + r.status + ')');
					return r.text();
				})
				// HARD RULE #22: CSS text becomes markup if it carries a `</style`. Neutralized per module,
				// on arrival, so nothing downstream ever holds an unguarded copy.
				.then((t) => {
					const safe = sanitizeStyleText(t);
					resolved.set(i, safe);
					return safe;
				})
				.catch((e) => {
					texts.delete(i);
					throw e;
				});
			texts.set(i, p);
		}
		return p;
	}

	function include(n: Needs, wanted: number[]): Promise<boolean> {
		const add = wanted.filter((i) => !included[i]);
		if (!add.length) return Promise.resolve(false);
		return Promise.all(add.map((i) => moduleText(n, i))).then(() => {
			for (const i of add) included[i] = true;
			signature = n.index.reduce((h, _m, i) => (included[i] ? (Math.imul(h ^ (i + 1), 16777619) >>> 0) : h), 2166136261).toString(36);
			return true;
		});
	}

	/** Fetch the index and the floor: the always-needed modules plus the ones most decks need. Idempotent. */
	async function ready(): Promise<void> {
		const n = await loadIndex();
		// The floor is closed over `requires`, like a scan: a floor module that mentions a keyframe,
		// face or property another module defines needs that module too.
		const want = new Set<number>(n.floor || []);
		n.index.forEach((m, i) => {
			if (m.always) want.add(i);
		});
		for (const i of want) for (const j of n.index[i].requires) want.add(j);
		await include(n, [...want].sort((a, b) => a - b));
	}

	/**
	 * Scan `html` (the slides the engine rendered) and load every module it needs that the base does
	 * not have. Resolves 'grew' when the base changed, so the host must register it and render again;
	 * 'whole' when the slides need so much of the sheet that the host should load all of it instead
	 * (nothing was fetched for them); 'same' when there is nothing new.
	 */
	async function ensureFor(html: string, sheetText = ''): Promise<'same' | 'grew' | 'whole'> {
		// The same slides and sheet again (a second pass): nothing new to find.
		if (html === lastScanned && sheetText.length === lastSheetLength) return 'same';
		const n = await loadIndex();
		const t0 = performance.now();
		const shell = typeof opts.shell === 'function' ? opts.shell() : opts.shell;
		const doc = new DOMParser().parseFromString((shell ? shell.open + shell.prefix : '<!doctype html><html><body>') + html + '</body></html>', 'text/html');
		const tokens = scanDocument(doc.documentElement);
		const verifiable = n.verified && !tokens.t.has('lat-pane');
		const runtime = {
			c: [...n.runtime.c, ...(shell?.runtime.c || [])],
			a: [...n.runtime.a, ...(shell?.runtime.a || [])],
			t: shell?.runtime.t || [],
			i: shell?.runtime.i || [],
		};
		// `sheetText` is the composed sheet the engine returned for these slides: the palette and the deck's own
		// CSS can MENTION a font family, keyframe or property that a lattice.css module defines (a palette that
		// sets `--font-body` to a face only lattice.css declares), and no module's text says so. Found on
		// accent-on-accent.md in WebKit: with the face missing, the text wrapped to fewer lines.
		const flags = neededModules(n.index, tokens, verifiable ? doc : undefined, { ...runtime, text: sheetText }) as boolean[];
		scans++;
		lastScanMs = performance.now() - t0;
		const total = n.modules.reduce((a, m) => a + m.bytes, 0);
		const wanted = n.modules.reduce((a, m, i) => a + (flags[i] || included[i] ? m.bytes : 0), 0);
		if (total > 0 && wanted / total > wholeAbove) return 'whole';
		const grew = await include(
			n,
			flags.flatMap((f, i) => (f ? [i] : [])),
		);
		lastScanned = html;
		lastSheetLength = sheetText.length;
		return grew ? 'grew' : 'same';
	}

	/**
	 * Start fetching the modules a Markdown source's class words name. Cache only: nothing becomes part
	 * of the base until a scan of the rendered HTML asks for it. Never throws.
	 */
	function warm(markdown: string): void {
		void loadIndex()
			.then((n) => {
				const words = new Set<string>();
				// Line by line, never one regex over the whole text: a `_class:` directive followed by tens of
				// thousands of spaces cost seconds with the single pattern (red team, 2026-10-19).
				for (const line of markdown.split('\n')) {
					if (line.length > 2000) continue;
					const at = line.indexOf('class:');
					if (at < 0) continue;
					// A comment ends at `-->` or `--!>`; the words after either are not class names. Cut with indexOf, not a regex.
					let rest = line.slice(at + 6);
					for (const end of ['-->', '--!>']) {
						const k = rest.indexOf(end);
						if (k >= 0) rest = rest.slice(0, k);
					}
					for (const w of rest.split(/\s+/)) if (w) words.add(w.replace(/['"]/g, '').toLowerCase());
				}
				const named = n.index.flatMap((m, i) => (!m.always && !included[i] && m.alts.some((alt) => alt[0].length > 0 && alt[0].every((c) => words.has(c))) ? [i] : []));
				// A deck whose words name most of the sheet will be loaded whole (`ensureFor` says so):
				// prefetching its modules one by one would be fetched twice.
				const total = n.modules.reduce((a, m) => a + m.bytes, 0);
				const held = n.modules.reduce((a, m, i) => a + (included[i] || named.includes(i) ? m.bytes : 0), 0);
				// Prefetch is a guess, and a wrong guess is bytes nobody uses: stop well short of the whole-sheet line.
				if (total > 0 && held / total > wholeAbove * 0.7) return;
				for (const i of named) void moduleText(n, i).catch(() => {});
			})
			.catch(() => {});
	}

	/** The registered base: the included modules, in `lattice.css` order, font URLs still package-relative. */
	function css(): string {
		if (!needs) return '';
		let out = '';
		for (let i = 0; i < needs.modules.length; i++) if (included[i]) out += resolved.get(i) || '';
		return out;
	}

	return {
		ready,
		ensureFor,
		warm,
		css,
		/** Changes whenever the included set does; fold it into the host's render signature. */
		signature: () => signature,
		stats(): StyleLoaderStats {
			const bytes = (pred: (i: number) => boolean) => (needs ? needs.modules.reduce((a, m, i) => a + (pred(i) ? m.bytes : 0), 0) : 0);
			return {
				indexBytes,
				modulesLoaded: included.filter(Boolean).length,
				modulesTotal: needs?.modules.length ?? 0,
				bytesLoaded: bytes((i) => !!included[i]),
				bytesTotal: bytes(() => true),
				scans,
				lastScanMs,
			};
		},
	};
}

export type StyleLoader = ReturnType<typeof createStyleLoader>;
