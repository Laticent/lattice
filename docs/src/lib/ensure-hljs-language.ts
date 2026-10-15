// On-demand loader for the highlight.js grammars a deck's fences name.
//
// The engine bundle carries highlight.js CORE and Lattice's shell grammar, and no
// other grammar: the code plugin's browser loader loads nothing up front
// (lib/plugins/code/shared/load-grammar.browser.js), so a deck pays for exactly the
// languages it uses, as the CLI does (engineering/decisions/2026-10-15-code-plugin.md
// §4.3). Each grammar is one file, median 2.1 KB, built by tools/build-hljs-languages.js
// and staged alongside the engine bundle in the content-hashed `playground/v/<hash>/hljs/`
// dir. A grammar that embeds others (HTML's `<script>` → JavaScript) brings them too, from
// the manifest's `requires`, so the preview colors what the export colors.
//
// Same classic-<script>-injection idiom as ensure-katex.ts, and deliberately so —
// these grammars must register into the singleton highlight.js the classic-script
// engine bundle holds, which an ES module import cannot reach.
//
// The division of labor is the point: `lib/playground` answers WHAT a deck is
// missing (`missingLanguages`) and performs the registration (`drainLanguages`);
// this module answers only HOW to fetch, because the asset base, the content hash
// and the service worker are the host's business and not the engine's.
import { engineBase, engineBaseFor } from './engine-base';

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
	/** Each fetchable grammar: its file, and the grammars it embeds (`['*']` = all). */
	languages: Record<string, { file: string; bytes: number; requires?: string[] }>;
	aliases: Record<string, string>;
	/** The grammars built into the engine bundle (Lattice's shell grammar), name →
	 *  aliases. Never fetched; recorded so the manifest is a COMPLETE answer to "what
	 *  can this renderer color", which is what the language picker needs. */
	bundled?: Record<string, string[]>;
}

/**
 * Derive the grammar directory from the engine bundle's URL. Both are staged into
 * the same content-hashed dir by docs/scripts/sync-playground-assets.mjs, so this
 * is one path swap — the same trick `katexProviderUrlFor` uses.
 * Returns null for a URL that isn't the expected engine bundle.
 */
export function hljsBaseFor(engineUrl: string): string | null {
	const base = engineBaseFor(engineUrl);
	return base === null ? null : `${base}hljs/`;
}

/** As `hljsBaseFor`, for the engine this page loaded (engine-base.ts). */
export function deriveHljsBase(): string | null {
	const base = engineBase();
	return base === null ? null : `${base}hljs/`;
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
 * The grammar files to fetch for `tags`: each tag's own file, resolved through the
 * manifest's aliases, plus every grammar it embeds (`requires`; `['*']` is all of them),
 * less the ones `registered` says the engine already holds.
 *
 * `Object.hasOwn` throughout, because a tag is a FENCE INFO STRING — author text.
 * `manifest.languages['constructor']` is truthy on any plain object, so a ```constructor
 * fence once resolved to an entry whose `.file` was undefined and injected
 * `<script src=".../hljs/undefined">`: a 404 retried on every keystroke. Same for
 * `__proto__`, `toString`, `valueOf`, `hasOwnProperty`.
 */
export function languageFiles(tags: string[], manifest: Manifest, registered: (name: string) => boolean): Set<string> {
	const own = (o: Record<string, unknown>, k: string) => Object.hasOwn(o, k);
	const files = new Set<string>();
	const seen = new Set<string>();
	const add = (name: string) => {
		if (seen.has(name) || !own(manifest.languages, name)) return;
		seen.add(name);
		const entry = manifest.languages[name];
		if (!registered(name) && entry.file) files.add(entry.file);
		const requires = entry.requires ?? [];
		for (const dep of requires[0] === '*' ? Object.keys(manifest.languages) : requires) add(dep);
	};
	for (const tag of tags) {
		const canonical = own(manifest.languages, tag) ? tag : own(manifest.aliases, tag) ? manifest.aliases[tag] : undefined;
		if (canonical) add(canonical);
	}
	return files;
}

/**
 * Make sure every grammar `markdown` asks for is registered before it is rendered.
 *
 * Resolves to whatever the FINAL drain returns, which is normally `[]` even when
 * grammars were fetched: each injection drains as it lands, so the last call finds
 * the queue already empty. The return value exists for a caller that wants to log
 * what arrived; nothing reads it today, and the useful signal is the side effect —
 * `hljs` has the grammars registered by the time this resolves. For a deck with no
 * fenced code nothing is fetched at all; a deck with code fetches each
 * language it names once, and the service worker caches it after that.
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

	// Resolve each requested tag to a file through the aliases the build resolved
	// ahead of time — `ps1` → powershell.js — which is why the manifest exists at all:
	// a grammar declares its aliases INSIDE the file, so without it the browser would
	// have to fetch speculatively to find out whether the file it wants is the file it
	// asked for. `languageFiles` adds the grammars each one embeds.
	const files = languageFiles(missing, manifest, (name) => Boolean(pg.languages?.has?.(name)));
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

/**
 * The grammar manifest itself, for a caller that needs the CATALOG rather than a
 * load — today the Compose language picker, which reads it to offer every grammar
 * this renderer can apply (every fetchable one, the bundled shell grammar, and every alias).
 *
 * Shares this module's per-base memo, so the picker and the renderer make ONE
 * request between them, and returns null rather than throwing when the engine
 * bundle is not on the page yet: the picker then shows its Lattice and deck groups
 * and fills the rest in when the manifest lands.
 */
export async function loadHljsManifest(base?: string | null): Promise<Manifest | null> {
	const dir = base ?? deriveHljsBase();
	if (!dir) return null;
	return loadManifest(dir);
}

/** Test seam — drop the memoized fetches so a spec can re-exercise the path. */
export function __resetHljsLoaderCaches(): void {
	loaders.clear();
	manifests.clear();
}
