// THE PREVIEWS' DRAW HOST, the part that is loaded on demand (the stub is docs/src/lib/preview-draw-host.ts): the draw
// host, the sanitizers, each plugin's own host-page half, and what makes a draw fast.
//
//   - `warm(kind)` loads everything and opens the kind's frame BEFORE the first draw asks. A first draw used to wait for
//     the host's code (191 ms measured), the library fetch, pin and hash (59 ms) and the frame's start (155 ms), none of
//     which needs to wait for it: the preview builder warms when it renders a deck with a figure, and the preview
//     frame's own boot overlaps all of it.
//   - a drawing is remembered by the whole job (kind, config, size, place): an edit elsewhere in the deck re-renders the
//     preview and asks for the same plot again, and that costs nothing.
//
// THIS FILE NAMES NO PLUGIN. A plugin that draws in a frame declares `draw` in its manifest; the registry build writes the kinds
// (lib/plugins/draw-kinds.generated.mjs) and each plugin's host-page half (`<name>.draw-host.mjs`, lib/plugins/draw-host-adapters.generated.mjs),
// and this file runs them: `prepare(job, env)` before a job crosses to the frame, `finish(raw, env)` on what comes back.
//
// WHAT COMES BACK IS SANITIZED HERE, not in the frame and not in the runtime: the runtime has no sanitizer, and a
// frame's own word about its markup is not a guard. A plugin with no `finish` has its answer put through the slide sanitizer, the
// safe default; a plugin whose answer is a figure with its own structure (Mermaid's svg, which needs `<style>` and `<foreignObject>`)
// says so in its `finish`, which receives both sanitizers.

import { DRAW_HOST_ADAPTERS } from '../../../lib/plugins/draw-host-adapters.generated.mjs';
import { DRAW_KINDS } from '../../../lib/plugins/draw-kinds.generated.mjs';
import { createDrawHost } from './code-packages/draw-host';
import { engineBase, sameOriginAsset } from './engine-base';
import { markDrawKindDown } from './preview-draw-host';
import { sanitizeDiagramSvg } from './sanitize-diagram-svg.js';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';

type Job = { kind: string } & Record<string, unknown>;

const mark = (name: string) => {
	try {
		performance.mark(`lattice-draw:${name}`);
	} catch {
		/* no performance timeline */
	}
};

// ── FONTS ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A job may carry `fonts`: the faces its text is measured in, so a label's box fits the face the deck paints it in. The frame has no
// network, so a face reaches it two ways, and nothing else: a URL naming a file directly inside the engine's own font folders (the frame's
// policy lets it load those itself, from the HTTP cache the preview page has already filled), or the face's own bytes as a `data:` URL
// (a deck's or a theme's `@font-face` that carries its font), checked here for its type, its characters and its size. The host sends
// each face to a frame once (docs/src/lib/code-packages/draw-host.ts).
const FONT_FOLDERS = ['themes/fonts/', 'katex/fonts/'];
const FONT_FILE = /^[A-Za-z0-9_.-]+\.woff2?$/;
const DATA_FONT = /^data:font\/(?:woff2|woff|ttf|otf);base64,[A-Za-z0-9+/=]+$/;
/** The most characters one embedded face may be (about 525 KB of font), how many a job may carry, and the most they may total. */
const DATA_FONT_MAX = 700_000;
const DATA_FONTS_MAX = 8;
const DATA_FONTS_TOTAL_MAX = 2_000_000;

function fontFolders(): string[] {
	const base = engineBase();
	return base ? FONT_FOLDERS.map((dir) => sameOriginAsset(base, dir)?.href).filter((href): href is string => !!href) : [];
}

/** The URL of a face when it names a file directly inside one of the engine's font folders, else null. */
function engineFontUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	try {
		const url = new URL(raw);
		for (const dir of fontFolders()) if (url.href.startsWith(dir) && FONT_FILE.test(url.href.slice(dir.length))) return url.href;
	} catch {
		/* not a URL */
	}
	return null;
}

type FontAsk = { family?: unknown; weight?: unknown; style?: unknown; url?: unknown };
type Face = { family: string; weight: string; style: string; url?: string; data?: string };
/** The faces of a font list the frame may load: an engine file or a well-formed, small `data:` font, and nothing else. */
function framesFonts(asks: unknown): Face[] {
	const out: Face[] = [];
	if (!Array.isArray(asks)) return out;
	let dataFaces = 0;
	let dataChars = 0;
	for (const f of (asks as FontAsk[]).slice(0, 32)) {
		if (!f || typeof f.family !== 'string' || typeof f.weight !== 'string' || !/^[1-9]00$/.test(f.weight) || (f.style !== 'normal' && f.style !== 'italic')) continue;
		const face = { family: f.family, weight: f.weight, style: f.style };
		const url = engineFontUrl(f.url);
		if (url) {
			out.push({ ...face, url });
		} else if (typeof f.url === 'string' && f.url.length <= DATA_FONT_MAX && DATA_FONT.test(f.url) && dataFaces < DATA_FONTS_MAX && dataChars + f.url.length <= DATA_FONTS_TOTAL_MAX) {
			dataFaces++;
			dataChars += f.url.length;
			out.push({ ...face, data: f.url });
		}
	}
	return out;
}

/** What each plugin's host-page half receives. */
const env = Object.freeze({ fonts: framesFonts, sanitize: Object.freeze({ slide: sanitizeSlideHtml, diagram: sanitizeDiagramSvg }) });
type HostHalf = { prepare?: (job: Job, env: unknown) => Job; finish?: (raw: string, env: unknown) => string };
const halves = new Map<string, Promise<HostHalf>>();
/** A kind's host-page half, loaded the first time the kind is drawn; a kind with none gets the safe defaults (no prepare, slide-sanitized answer). */
function halfFor(kind: string): Promise<HostHalf> {
	let p = halves.get(kind);
	if (!p) {
		p = Object.hasOwn(DRAW_HOST_ADAPTERS, kind) ? (DRAW_HOST_ADAPTERS as Record<string, () => Promise<HostHalf>>)[kind]() : Promise.resolve({});
		halves.set(kind, p);
		p.catch(() => halves.delete(kind)); // a chunk that failed to load is tried again, not remembered
	}
	return p;
}

async function drawKind(job: Job): Promise<string> {
	const half = await halfFor(job.kind);
	const sent = half.prepare ? half.prepare(job, env) : job;
	const raw = await host.draw(sent as Parameters<typeof host.draw>[0]);
	mark('sanitize-start');
	const clean = half.finish ? half.finish(raw, env) : sanitizeSlideHtml(raw);
	mark('sanitize-done');
	return clean;
}

const host = createDrawHost({
	libraryUrl: (file) => {
		const base = engineBase();
		return (base && sameOriginAsset(base, file)?.href) || null;
	},
	fontFolders,
	folderUrl: (dir) => {
		const base = engineBase();
		const url = base && sameOriginAsset(base, dir);
		return url ? url.href : null;
	},
});

/** The most drawings remembered, and the most characters they hold between them. */
const MEMO_MAX = 64;
const MEMO_CHARS_MAX = 8_000_000;
const MEMO_KEY_MAX = 100_000;
const memo = new Map<string, string>();
let memoChars = 0;
// A draw already on its way is shared: two previews of one deck ask for the same plot at once.
const inFlight = new Map<string, Promise<string>>();

function remember(key: string, drawing: string) {
	while (memo.size && (memo.size >= MEMO_MAX || memoChars + drawing.length > MEMO_CHARS_MAX)) {
		const oldest = memo.keys().next().value as string;
		memoChars -= memo.get(oldest)?.length ?? 0;
		memo.delete(oldest);
	}
	memo.set(key, drawing);
	memoChars += drawing.length;
}

/** Is this a kind the registry says a frame can draw for? */
const offered = (kind: unknown): kind is string => typeof kind === 'string' && (DRAW_KINDS as readonly string[]).includes(kind);

export function draw(job: Job): Promise<string> {
	mark('draw-called');
	if (!offered(job.kind)) return Promise.reject(new Error(`the preview draw host does not draw ${String(job.kind)}`));
	// A face's bytes stay out of the key (they would make it huge and are fixed by the face's name and length).
	const key = JSON.stringify(Array.isArray(job.fonts) ? { ...job, fonts: (job.fonts as Array<Record<string, unknown>>).map((f) => [f.family, f.weight, f.style, typeof f.url === 'string' ? `${f.url.length}:${f.url.slice(-48)}` : 0]) } : job);
	const hit = memo.get(key);
	if (hit !== undefined) {
		memo.delete(key); // most recently used last
		memo.set(key, hit);
		mark('draw-remembered');
		return Promise.resolve(hit);
	}
	const running = inFlight.get(key);
	if (running) return running;
	const p = drawKind(job)
		.then((clean) => {
			// A key holds the whole definition: a job too big to keep is drawn again next time rather than held.
			if (key.length <= MEMO_KEY_MAX) remember(key, clean);
			return clean;
		})
		.catch((e) => {
			// A frame that could not open leaves the kind to the page itself, from the next preview on.
			if ((e as { drawUnavailable?: boolean })?.drawUnavailable) markDrawKindDown(job.kind);
			throw e;
		})
		.finally(() => {
			inFlight.delete(key);
			mark('draw-returned');
		});
	inFlight.set(key, p);
	return p;
}

/** Fetch and pin the kind's library and open its frame now, so the first draw finds both ready. Never rejects. */
export function warm(kind: string): void {
	if (!offered(kind)) return;
	mark('warm');
	// A tiny draw would do the same work, but it would draw something nobody asked for; the host exposes the opening alone.
	void host.warm(kind).catch((e) => {
		if ((e as { drawUnavailable?: boolean })?.drawUnavailable) markDrawKindDown(kind);
	});
}
