// On-demand loader for highlight.js grammars the engine bundle does not carry.
//
// The engine bundle ships highlight.js's 36-language `common` build, while the CLI
// and marp-core both ship all 192 — so a `powershell` fence rendered 11 token spans
// in an exported PDF and 0 in the Playground, same deck, nothing logged. Shipping
// the full build closes that and nearly doubles the bundle (327 KB → 585 KB gzipped,
// measured), so the missing grammars are fetched per deck instead: one file each,
// median 1.9 KB, built by tools/build-hljs-languages.js and staged alongside the
// engine bundle in the content-hashed `playground/v/<hash>/hljs/` dir.
//
// Same classic-<script>-injection idiom as ensure-katex.ts, and deliberately so —
// these grammars must register into the singleton highlight.js the classic-script
// engine bundle holds, which an ES module import cannot reach.
//
// The division of labor is the point: `lib/playground` answers WHAT a deck is
// missing (`missingLanguages`) and performs the registration (`drainLanguages`);
// this module answers only HOW to fetch, because the asset base, the content hash
// and the service worker are the host's business and not the engine's.

/**
 * How long any single fetch here may hold up a render, in ms.
 *
 * THIS BOUND IS LOAD-BEARING, not defensive habit. `ensureFenceLanguages` is
 * awaited immediately before the synchronous `PG.render` in render-engine.ts, so
 * anything that can hang here hangs the preview. A `<script>` whose request
 * STALLS — no response rather than a refused connection — fires neither `load`
 * nor `error` until the browser's own timeout, which is minutes. ensure-katex.ts
 * bounds itself at ~10s for the same reason; matching it keeps the worst case a
 * fence rendered in plain monospace instead of an editor that stopped repainting.
 */
const LOAD_TIMEOUT_MS = 10_000;

/** Per-URL singletons, so two decks needing `dockerfile` share one fetch. */
const loaders = new Map<string, Promise<boolean>>();

/** The alias → canonical-name map, fetched once per manifest URL. */
const manifests = new Map<string, Promise<Manifest | null>>();

interface Manifest {
	languages: Record<string, { file: string; bytes: number }>;
	aliases: Record<string, string>;
}

/**
 * Derive the grammar directory from the engine bundle's URL. Both are staged into
 * the same content-hashed dir by docs/scripts/sync-playground-assets.mjs, so this
 * is one path swap — the same trick `katexProviderUrlFor` uses.
 * Returns null for a URL that isn't the expected engine bundle.
 */
export function hljsBaseFor(engineUrl: string): string | null {
	if (!engineUrl.includes('lattice-playground.js')) return null;
	return engineUrl.replace('lattice-playground.js', 'hljs/');
}

/** As `hljsBaseFor`, but reads the engine URL off the injected `<script>` tag. */
export function deriveHljsBase(): string | null {
	if (typeof document === 'undefined') return null;
	const src = document
		.querySelector<HTMLScriptElement>('script[data-lattice-engine]')
		?.getAttribute('src');
	return src ? hljsBaseFor(src) : null;
}

/** An abort signal that fires after LOAD_TIMEOUT_MS, on browsers old enough to
 *  lack `AbortSignal.timeout` too (it is Chrome 124+; the bundle targets 109). */
function timeoutSignal(): AbortSignal | undefined {
	try {
		if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(LOAD_TIMEOUT_MS);
		const c = new AbortController();
		setTimeout(() => c.abort(), LOAD_TIMEOUT_MS);
		return c.signal;
	} catch {
		return undefined; // no AbortController at all — the fetch is unbounded, as before
	}
}

async function loadManifest(base: string): Promise<Manifest | null> {
	const existing = manifests.get(base);
	if (existing) return existing;
	// AbortSignal, not a bare fetch: same stall reasoning as LOAD_TIMEOUT_MS — the
	// manifest is awaited in front of the render too, and a hung request here would
	// block every grammar behind it.
	const p = fetch(`${base}index.json`, { credentials: 'same-origin', signal: timeoutSignal() })
		.then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
		.catch(() => null)
		// A failed manifest is re-fetchable: drop the memo so a later render can
		// retry rather than leaving the preview permanently monochrome after one
		// offline moment.
		.then((m) => {
			if (!m) manifests.delete(base);
			return m;
		});
	manifests.set(base, p);
	return p;
}

/** Inject one grammar file and resolve once it has registered (or failed). */
function injectGrammar(url: string): Promise<boolean> {
	const existing = loaders.get(url);
	if (existing) return existing;

	const p = new Promise<boolean>((resolve) => {
		let settled = false;
		// Declared before `done` closes over it — `done` only ever runs from a
		// listener or the deadline, but a `const` below would put this in the
		// temporal dead zone for any future caller that fires it earlier.
		let timer: ReturnType<typeof setTimeout>;
		const done = (ok: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// Drain here rather than in the caller: the queue may hold grammars from
			// several concurrent injections, and draining on each arrival keeps a slow
			// file from holding up one that already landed.
			try {
				window.LatticePlayground?.drainLanguages?.();
			} catch {
				/* a malformed grammar costs one fence its color, never the render */
			}
			if (!ok) loaders.delete(url); // a failed fetch is retryable
			resolve(ok);
		};
		// Resolve `false` on the deadline rather than leaving the promise pending:
		// the script element stays in the DOM and may still land and register, in
		// which case a later drain picks it up. What must not happen is the render
		// waiting on it.
		timer = setTimeout(() => done(false), LOAD_TIMEOUT_MS);

		const s = document.createElement('script');
		s.src = url;
		s.async = true;
		s.setAttribute('data-lattice-hljs', '');
		s.addEventListener('load', () => done(true));
		s.addEventListener('error', () => done(false));
		document.head.appendChild(s);
	});

	loaders.set(url, p);
	return p;
}

/**
 * Make sure every grammar `markdown` asks for is registered before it is rendered.
 *
 * Resolves to whatever the FINAL drain returns, which is normally `[]` even when
 * grammars were fetched: each injection drains as it lands, so the last call finds
 * the queue already empty. The return value exists for a caller that wants to log
 * what arrived; nothing reads it today, and the useful signal is the side effect —
 * `hljs` has the grammars registered by the time this resolves. On the overwhelming
 * majority of decks nothing is fetched at all, because js/ts/python/yaml/sql/bash
 * are all in `common`.
 *
 * NEVER REJECTS. A grammar that will not load leaves its fence in plain monospace,
 * which is exactly what happens today and is not worth failing a preview over.
 *
 * @param markdown the deck source about to be rendered
 * @param base     the grammar directory; defaults to `deriveHljsBase()`
 */
export async function ensureFenceLanguages(markdown: string, base?: string | null): Promise<string[]> {
	if (typeof window === 'undefined' || typeof document === 'undefined') return [];
	const pg = window.LatticePlayground;
	if (!pg?.missingLanguages) return []; // an engine bundle older than this feature

	let missing: string[];
	try {
		missing = pg.missingLanguages(markdown);
	} catch {
		return [];
	}
	if (missing.length === 0) return [];

	const dir = base ?? deriveHljsBase();
	if (!dir) return [];
	const manifest = await loadManifest(dir);
	if (!manifest) return [];

	// Resolve each requested tag to a file. A tag may be the canonical name or one
	// of the aliases the build resolved ahead of time — `ps1` → powershell.js —
	// which is why the manifest exists at all: a grammar declares its aliases INSIDE
	// the file, so without it the browser would have to fetch speculatively to find
	// out whether the file it wants is the file it asked for.
	// `own` rather than a bare index, because `tag` is a FENCE INFO STRING — author
	// text. `manifest.languages['constructor']` is truthy on any plain object, so a
	// ```constructor fence resolved to a truthy `entry` whose `.file` is undefined
	// and injected `<script src=".../hljs/undefined">`: a 404 that fails the load,
	// drops out of the in-flight map, and is therefore retried on EVERY render —
	// once per debounced keystroke in the Studio. Same for `__proto__`, `toString`,
	// `valueOf`, `hasOwnProperty`. `hljs.getLanguage()` itself is safe on all five.
	const own = (o: Record<string, unknown>, k: string) => Object.hasOwn(o, k);
	const files = new Set<string>();
	for (const tag of missing) {
		const canonical = own(manifest.languages, tag) ? tag
			: own(manifest.aliases, tag) ? manifest.aliases[tag]
			: undefined;
		const entry = canonical && own(manifest.languages, canonical) ? manifest.languages[canonical] : undefined;
		if (entry?.file) files.add(entry.file);
	}
	if (files.size === 0) return []; // genuinely not a highlight.js language

	await Promise.all([...files].map((f) => injectGrammar(dir + f)));
	// One final drain covers a grammar whose script fired `load` before this module
	// attached its listener (a warm HTTP cache does exactly that).
	try {
		return window.LatticePlayground?.drainLanguages?.() ?? [];
	} catch {
		return [];
	}
}

/** Test seam — drop the memoized fetches so a spec can re-exercise the path. */
export function __resetHljsLoaderCaches(): void {
	loaders.clear();
	manifests.clear();
}
