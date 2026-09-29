import { drawnLibraryUrls } from '../../../../lib/plugins/drawn-library.mjs';
import type { Warmable } from './lazy-panel';

// The Studio's idle warm-up queue. StudioShell loads this module with `import()` after mount, so
// none of it rides the startup bundle.
//
// NO STATIC IMPORT of anything the startup bundle already has. A module both this chunk and the
// startup closure import gets split into a chunk of its own, which is then a startup chunk: the
// first cut imported `studio-panels` here and moved 3.2KB gz INTO startup to save 1.9KB. So
// StudioShell hands over what it already holds (`WarmUpInputs`); only type imports appear here.
//
// It fetches Compose, Present, the reading view and Fabricate (StudioShell warms the six panels
// itself, at mount, so their warm-up never depends on this chunk arriving), because the service
// worker caches a chunk only once it has been fetched (`docs/public/sw.js` has no precache
// list): without the warm-up, a user who goes offline before opening one gets the chunk-load card
// — for Compose, a primary tab on a phone, over the whole Studio.
//
// Each surface warms its WHOLE on-demand path, not just its chunk: once open, Present's narration
// and the reading view load player-core and player-prune, and the KaTeX provider for a deck with
// math (fetched, not run, and only when the deck on screen at startup has math). The projections
// name those imports once and export the warm functions used here.
//
// Mermaid (856KB gz, more than Compose, Present and the reading view together) warms only for a
// browser that has shown a diagram or opened Fabricate, and never under Save-Data. Fetched, not run,
// like KaTeX. A deck on screen with a diagram loads the bundle anyway (the diagram check), so what
// this adds is a diagram met LATER: another deck opened offline, or Fabricate's Diagram specimen.
//
// Not warmed: the voice model (`read-aloud.ts`). Neural read-aloud needs its weights too, which are
// far larger, and without them the module offline does nothing the browser voice cannot.
//
// Compose, Present and the reading view warm for everyone EXCEPT under Save-Data: unlike the six
// panels, no visitor downloaded them at startup before, so these are new bytes, and Save-Data is a
// request not to spend them. Fabricate warms only for a browser that has opened it before: a
// visitor who never fabricates never pays for it, and one who does can still open it offline after
// a deploy renames its chunks. Measured costs per surface, and the trade a failed warm-up makes:
// engineering/decisions/2026-09-26-studio-panel-lazy-loading.md § Warming Present, Fabricate and
// the reading view.

/**
 * A chunk the warm-up should fetch that is not a `LazyPanel` — a `React.lazy` surface such as
 * Present. Loads once; a failure is swallowed, because the surface's own `React.lazy` import is
 * what reports it, through its error boundary, when someone opens it.
 */
export function warmable(loader: () => Promise<unknown>): Warmable {
	let inflight: Promise<void> | null = null;
	return {
		load: () => {
			inflight ??= loader().then(
				() => {},
				() => {},
			);
			return inflight;
		},
	};
}

// The venue clip notice (#2410) renders in a Suspense with no error boundary of its own, so a
// failed load reaches the Studio-wide boundary. It is 1.7KB gz, so it warms even under Save-Data.
const clipNoticeWarm = warmable(() => import('./ClipNotice'));
const composeWarm = warmable(() => import('./ComposeView'));
const presentWarm = warmable(() => Promise.all([import('./PresentOverlay'), import('./narration-projection').then((m) => m.warmNarrationProjection())]));
const readArticleWarm = warmable(() => Promise.all([import('./ReadArticle'), import('./article-projection').then((m) => m.warmArticleProjection())]));
const fabricateWarm = warmable(() => Promise.all([import('./Fabricate'), import('./library/gallery-gate')]));
let katexWarm: Warmable | null = null;
let diagramLibWarm: Warmable | null = null;

export type WarmUpInputs = {
	/** `lazy-panel.tsx` › warmPanels: the idle scheduling. */
	warmPanels: (queue: ReadonlyArray<Warmable>) => () => void;
	/** The KaTeX provider's URL when the deck on screen has math, else null. */
	katexUrl: string | null;
	/** The runtime's URL when this browser has shown a diagram or opened Fabricate, else null: the
	 *  diagram library (the Mermaid plugin's payload) is staged beside it, and this warms that file. */
	diagramRuntimeUrl: string | null;
	/** Whether Fabricate has been opened in this browser (`FABRICATE_USED_KEY`). */
	fabricateUsed: boolean;
};

/** Start the warm-up. Returns a cancel function. */
export function startStudioWarmUp({ warmPanels, katexUrl, diagramRuntimeUrl, fabricateUsed }: WarmUpInputs): () => void {
	const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
	if (katexUrl) katexWarm ??= warmable(() => fetch(katexUrl));
	// Every runtime-drawn plugin's library (Mermaid's today), beside the runtime — the files the
	// preview frames' plugin host loads, so the first diagram reads them from cache.
	const diagramLibs = diagramRuntimeUrl ? drawnLibraryUrls(diagramRuntimeUrl) : [];
	if (diagramLibs.length) diagramLibWarm ??= warmable(() => Promise.all(diagramLibs.map((u) => fetch(u))));
	const surfaces = saveData
		? []
		: [composeWarm, presentWarm, readArticleWarm, ...(katexUrl && katexWarm ? [katexWarm] : []), ...(diagramLibs.length && diagramLibWarm ? [diagramLibWarm] : [])];
	return warmPanels([clipNoticeWarm, ...surfaces, ...(fabricateUsed ? [fabricateWarm] : [])]);
}
