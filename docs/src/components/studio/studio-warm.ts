import emojiFacesCore from '../../../../lib/fonts/emoji-faces.js';
import iconFacesCore from '../../../../lib/fonts/icon-faces.js';
import textFacesCore from '../../../../lib/fonts/text-faces.js';
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
// The FONTS the preview frame has not loaded yet (#3076) go last. Since #3074 the frame waits only for the faces its
// visible slide uses, so the first emoji, the first code block, `finish: sketch` or a new weight fetched its file on
// that edit and the text swapped once from a fallback face. This puts every face the base sheet declares into the HTTP
// cache instead, one file per queue step (so `warmPanels` yields to the idle scheduler between files), at low fetch
// priority, after every warm-up above. The URLs are the frame's own: `theme-fetch.ts` rewrites the sheet's
// `url(fonts/<file>.woff2)` to `<themeBase>fonts/<file>.woff2`, and a `fetch` from this page uses the same mode
// (`cors`) and credentials (`same-origin`) as the srcdoc frame's font request, so the frame's later request is a cache
// hit, measured with a real Chromium in #3076. A `<link rel=preload as=font>` without `crossorigin` is a no-cors
// request, and the browser does not reuse it for a font load, which is the likely cause of the miss the #3074 spike saw.
// KaTeX's faces are left out: the sheet carries them only once a deck has math, and
// `ensureKatexFaces` loads them then. Never under Save-Data: it is about 2.7MB, 2.2MB of it the emoji slices.
// Where the service worker controls the page (`docs/public/sw.js` serves `/playground/v/<hash>/` cache-first), these
// fetches land in its Cache Storage instead, and the frame's request is answered from there: the 2.7MB is then kept on
// the device until the next deploy renames the folder, and the fonts work offline. The worker's own network fetch on a
// miss does not carry `priority: 'low'`; the one-at-a-time idle queue is what keeps it off the startup path.
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
// Hide Slide / Show Slide's edit code (StudioShell `opHide` loads it on the click): a few hundred bytes, warmed even
// under Save-Data so the click still works offline.
const hideOpsWarm = warmable(() => import('./hide-ops'));
const composeWarm = warmable(() => import('./ComposeView'));
const presentWarm = warmable(() => Promise.all([import('./PresentOverlay'), import('./narration-projection').then((m) => m.warmNarrationProjection())]));
const readArticleWarm = warmable(() => Promise.all([import('./ReadArticle'), import('./article-projection').then((m) => m.warmArticleProjection())]));
const fabricateWarm = warmable(() => Promise.all([import('./Fabricate'), import('./library/gallery-gate')]));
let katexWarm: Warmable | null = null;
let fontWarms: { base: string; queue: Warmable[] } | null = null;

type FaceList = ReadonlyArray<{ file: string }>;
/** Every face file the base sheet declares outside KaTeX, smallest-use-first: text, icons, then the emoji slices. */
export const WARM_FONT_FILES: ReadonlyArray<string> = [
	...(textFacesCore as { TEXT_FACES: FaceList }).TEXT_FACES,
	...(iconFacesCore as { ICON_FACES: FaceList }).ICON_FACES,
	...(emojiFacesCore as { EMOJI_SLICES: FaceList }).EMOJI_SLICES,
].map((f) => f.file);

/** One warmable per font file under `<themeBase>fonts/`, each fetched once at low priority and read to the end. */
function fontWarmsFor(themeBase: string, after: Promise<unknown>, quiet: () => Promise<unknown>): Warmable[] {
	if (fontWarms?.base === themeBase) return fontWarms.queue;
	const queue = WARM_FONT_FILES.map((file) =>
		warmable(async () => {
			// Belt and braces over StudioShell's gate: no font request may compete with the first slide.
			await after;
			// And a quiet moment before EACH file: no input, no source edit (a tour's typing included) for 2 s.
			await quiet();
			const res = await fetch(`${themeBase}fonts/${file}.woff2`, { priority: 'low' } as RequestInit);
			// Read the body, so the whole file lands in the cache rather than a cancelled stream.
			await res.blob();
		}),
	);
	fontWarms = { base: themeBase, queue };
	return queue;
}
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
	/** The page's `…/playground/v/<hash>/themes/` URL, under which the frame loads `fonts/<file>.woff2`; null skips the fonts. */
	themeBase?: string | null;
	/** Resolves once the first slide is on screen (`first-slide.ts` › firstSlideShown). Passed in, not imported: a
	 *  static import of a startup module would split it into a chunk of its own (see the header). */
	firstSlide?: Promise<unknown>;
	/** Resolves at the next quiet moment (`first-slide.ts` › whenQuiet). Passed in for the same reason. */
	quiet?: () => Promise<unknown>;
};

/** Start the warm-up. Returns a cancel function. */
export function startStudioWarmUp({ warmPanels, katexUrl, diagramRuntimeUrl, fabricateUsed, themeBase = null, firstSlide = Promise.resolve(), quiet = () => Promise.resolve() }: WarmUpInputs): () => void {
	const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
	if (katexUrl) katexWarm ??= warmable(() => fetch(katexUrl));
	// Every runtime-drawn plugin's library (Mermaid's today), beside the runtime — the files the
	// preview frames' plugin host loads, so the first diagram reads them from cache.
	const diagramLibs = diagramRuntimeUrl ? drawnLibraryUrls(diagramRuntimeUrl) : [];
	if (diagramLibs.length) diagramLibWarm ??= warmable(() => Promise.all(diagramLibs.map((u) => fetch(u))));
	const surfaces = saveData
		? []
		: [composeWarm, presentWarm, readArticleWarm, ...(katexUrl && katexWarm ? [katexWarm] : []), ...(diagramLibs.length && diagramLibWarm ? [diagramLibWarm] : [])];
	const fonts = !saveData && themeBase ? fontWarmsFor(themeBase, firstSlide, quiet) : [];
	return warmPanels([clipNoticeWarm, hideOpsWarm, ...surfaces, ...(fabricateUsed ? [fabricateWarm] : []), ...fonts]);
}
