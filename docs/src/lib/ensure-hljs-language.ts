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

async function loadManifest(base: string): Promise<Manifest | null> {
	const existing = manifests.get(base);
	if (existing) return existing;
	const p = fetch(`${base}index.json`, { credentials: 'same-origin' })
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
		const done = (ok: boolean) => {
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
 * Resolves to the canonical names newly registered — empty on the overwhelming
 * majority of decks, because js/ts/python/yaml/sql/bash are all in `common`, so
 * nothing is fetched and nothing is awaited beyond one synchronous check.
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
	const files = new Set<string>();
	for (const tag of missing) {
		const canonical = manifest.languages[tag] ? tag : manifest.aliases[tag];
		const entry = canonical ? manifest.languages[canonical] : undefined;
		if (entry) files.add(entry.file);
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
