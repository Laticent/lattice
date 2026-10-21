// THE PREVIEWS' DRAW HOST, the part that is loaded on demand (the stub is docs/src/lib/preview-draw-host.ts): the draw
// host, the sanitizer, the figure's own `hydrate`, and what makes a draw fast.
//
//   - `warm(kind)` loads everything and opens the kind's frame BEFORE the first draw asks. A first draw used to wait for
//     the host's code (191 ms measured), the library fetch, pin and hash (59 ms) and the frame's start (155 ms), none of
//     which needs to wait for it: the preview builder warms when it renders a deck with a figure, and the preview
//     frame's own boot overlaps all of it.
//   - a drawing is remembered by the whole job (kind, config, size, place): an edit elsewhere in the deck re-renders the
//     preview and asks for the same plot again, and that costs nothing.
//
// WHAT COMES BACK IS SANITIZED HERE, not in the frame and not in the runtime: the runtime has no sanitizer, and a
// frame's own word about its markup is not a guard. function-plot's drawing goes through the slide sanitizer, as the
// CLI's capture page does (lib/export/locked-figures.js `WRITE`).

import hydrateMod from '../../../lib/plugins/function-plot/function-plot.hydrate.js';
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

// ── MERMAID ──────────────────────────────────────────────────────────────────────────────────────────────────────
// The preview frame's stand-in for `window.mermaid` (lib/plugins/mermaid/shared/draw-shim.mjs) sends a definition, the
// config for its palette and the font faces its text is measured in, as URLs. The frame's policy lets it load fonts from the
// engine's own font folders and nowhere else (`fontFolders` below), so it fetches the faces itself, from the HTTP cache the preview page
// has already filled; this host only checks that each URL it forwards names a file in one of those folders. What comes back is the
// library's svg text, which is sanitized here (the diagram profile) and whose gantt links are held to the schemes a link in a deck may use.
const FONT_FOLDERS = ['themes/fonts/', 'katex/fonts/'];
const FONT_FILE = /^[A-Za-z0-9_.-]+\.woff2?$/;

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
function framesFonts(asks: unknown) {
	const out: Array<{ family: string; weight: string; style: string; url: string }> = [];
	if (!Array.isArray(asks)) return out;
	for (const f of (asks as FontAsk[]).slice(0, 32)) {
		const url = engineFontUrl(f?.url);
		if (url && typeof f.family === 'string' && typeof f.weight === 'string' && /^[1-9]00$/.test(f.weight) && (f.style === 'normal' || f.style === 'italic')) out.push({ family: f.family, weight: f.weight, style: f.style, url });
	}
	return out;
}

// `/` or `\` followed by another `/` or `\` would be a protocol-relative link to another site.
const SAFE_LINK = /^(?:https?:|mailto:|#|\/(?![/\\])|\.)/i;

async function drawMermaid(job: Job): Promise<string> {
	const frameJob = { ...job, fonts: framesFonts(job.fonts) } as Parameters<typeof host.draw>[0];
	const fig = JSON.parse(await host.draw(frameJob)) as { svg: string; type: string; links: Array<[string, string]> };
	mark('sanitize-start');
	const svg = sanitizeDiagramSvg(fig.svg);
	mark('sanitize-done');
	// A URL parser drops tabs and newlines, so `/<tab>/host` is a link to another site: they leave before the check, and the cleaned link is the one kept.
	const links = (Array.isArray(fig.links) ? fig.links : [])
		.filter((l) => Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string')
		.map((l): [string, string] => [l[0], l[1].replace(/[\t\n\r]/g, '')])
		.filter((l) => SAFE_LINK.test(l[1]));
	return JSON.stringify({ svg, type: String(fig.type || ''), links });
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
	hydrateSource: () => String((hydrateMod as unknown as { hydrate: unknown }).hydrate),
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

export function draw(job: Job): Promise<string> {
	mark('draw-called');
	if (job.kind !== 'function-plot' && job.kind !== 'mermaid') return Promise.reject(new Error(`the preview draw host does not draw ${String(job.kind)} yet`));
	const key = JSON.stringify(job);
	const hit = memo.get(key);
	if (hit !== undefined) {
		memo.delete(key); // most recently used last
		memo.set(key, hit);
		mark('draw-remembered');
		return Promise.resolve(hit);
	}
	const running = inFlight.get(key);
	if (running) return running;
	const p = (job.kind === 'mermaid' ? drawMermaid(job) : host.draw(job as Parameters<typeof host.draw>[0]).then((raw) => {
			mark('sanitize-start');
			const clean = sanitizeSlideHtml(raw);
			mark('sanitize-done');
			return clean;
		}))
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
	if (kind !== 'function-plot' && kind !== 'mermaid') return;
	mark('warm');
	// A tiny draw would do the same work, but it would draw something nobody asked for; the host exposes the opening alone.
	void host.warm(kind).catch((e) => {
		if ((e as { drawUnavailable?: boolean })?.drawUnavailable) markDrawKindDown(kind);
	});
}
