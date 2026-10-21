// THE STUDIO'S DRAW HOST: it owns the sandboxed frames that draw a first-party plugin's figures for the previews, so no such
// library runs in the page that holds the deck (owner decisions 14 and 15; D1 A, 2026-10-20). It names no plugin: the kinds it can draw
// are the entries of the registry the build writes from the plugins' manifests (lib/plugins/draw-frame-libraries.generated.mjs).
//
// A frame is the pool's sandbox (`sandbox="allow-scripts"`, no `allow-same-origin`, no network) around the library and the
// bootstrap in lib/packages/draw-frame-core.mjs: ONE inline script for a small library (pinned by SHA-256, checked here before it
// is inlined), or a MODULE GRAPH for a big one (Mermaid: a boot module and an import map whose `integrity` pins every file). A frame needs a screen, which the pool's
// worker has not, so it is a document of its own and not a worker. Frames are opened on the first draw of their kind and
// STAY OPEN: Mermaid's script costs about 2 s to open and about 50 ms per draw after that. A frame that times out is
// spent and replaced on the next draw.
//
// Loaded lazily, by whoever installs the host (the previews, in the next step), so the Studio's first load does not pay
// for it (docs/route-budget.json).

import { checkDrawReply, drawFrameDocument, drawFrameEsmDocument, drawFrameEsmScripts, drawFrameScript } from '../../../../lib/packages/draw-frame-core.mjs';
import { DRAW_FRAME_LIBRARIES } from '../../../../lib/plugins/draw-frame-libraries.generated.mjs';

/** A plugin's name: the key of a frame the registry knows. */
export type DrawKind = string;
/** What one kind's registry entry says (the kernel's `DrawMeta`, plus the library's file and pin). */
export type DrawLibrary = { file: string; sha256: string; global: string; unsafeEval?: boolean; adapter: string; hydrateSource?: string; esm?: { dir: string; entry: string; integrity: Record<string, string>; preload: string[] } };
/** A job is whatever its plugin's `draw-frame.js` takes; the host only needs to know which kind it is for. */
export type DrawJob = { kind: DrawKind } & Record<string, unknown>;
export type DrawHost = {
	/** Draw one figure, answering its SVG as text, or rejecting with why it did not draw. */
	draw: (job: DrawJob, ms?: number, again?: boolean) => Promise<string>;
	/** Fetch and pin the kind's library and open its frame now, so a later draw finds both ready. Rejects with why it could not. */
	warm: (kind: DrawKind) => Promise<void>;
	/** Close every frame. The host is not used again. */
	close: () => void;
};
export type DrawHostDeps = {
	/** Where a library's staged file is, or null when no asset directory is known yet. */
	libraryUrl: (file: string) => string | null;
	/** The absolute URL of a staged folder (a kind's module graph, `frames/<plugin>/`), ending in a slash, or null when it is not known yet. */
	folderUrl?: (dir: string) => string | null;
	/** The absolute URLs of the folders a module-loaded frame may load fonts from (the engine's own), each ending in a slash. */
	fontFolders?: () => string[];
	/** The kinds a frame can be built for. Default: the registry the build writes; a test passes its own. */
	libraries?: Record<string, DrawLibrary>;
	fetchText?: (url: string) => Promise<string>;
	doc?: Document;
	subtle?: SubtleCrypto;
};

/** A named point on the page's timeline (`performance.getEntriesByType('mark')`), so a slow first draw can be read phase by phase. */
const mark = (name: string) => {
	try {
		performance.mark(`lattice-draw:${name}`);
	} catch {
		/* no performance timeline: nothing to mark */
	}
};
const OPEN_MS = 30_000;
/** A draw that never reached its frame because the frame was closed first (an earlier draw overran): it is safe to send again to a fresh one. */
class NotSent extends Error {}

const DRAW_MS = 15_000;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

type Frame = { frame: HTMLIFrameElement; closed: boolean; faces: Set<string>; queue: Promise<unknown>; seq: number; waiting: Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>; close: () => void };

/**
 * A job may carry `fonts`, the faces its text is measured in (the kernel's `env.faces`). A frame keeps a face once it has it, so each face is
 * sent to a frame once: the same job a second time carries none of them, and a face's bytes (a deck's own font) do not cross again on every draw.
 */
function withFreshFaces(f: Frame, job: DrawJob): DrawJob {
	if (!Array.isArray(job.fonts)) return job;
	const fresh = (job.fonts as Array<Record<string, unknown>>).filter((face) => {
		const src = String(face.data ?? face.url ?? '');
		const key = `${face.family}|${face.weight}|${face.style}|${src.length}|${src.slice(-48)}`;
		if (f.faces.has(key)) return false;
		f.faces.add(key);
		return true;
	});
	return { ...job, fonts: fresh };
}

export function createDrawHost(deps: DrawHostDeps): DrawHost {
	const doc = deps.doc ?? document;
	const subtle = deps.subtle ?? crypto.subtle;
	const fetchText = deps.fetchText ?? (async (url: string) => (await fetch(url, { credentials: 'omit' })).text());
	const registry = deps.libraries ?? (DRAW_FRAME_LIBRARIES as unknown as Record<string, DrawLibrary>);
	const libraries = new Map<DrawKind, Promise<string>>();
	const frames = new Map<DrawKind, Promise<Frame>>();
	let done = false;

	/** The library's staged text, held to the pin in the manifest before a frame is built from it. */
	function library(kind: DrawKind): Promise<string> {
		let p = libraries.get(kind);
		if (!p) {
			const pin = Object.hasOwn(registry, kind) ? registry[kind] : undefined;
			p = (async () => {
				if (!pin) throw new Error(`no library is pinned for ${kind}`);
				const url = deps.libraryUrl(pin.file);
				if (!url) throw new Error(`${pin.file} has no staged address yet`);
				mark('library-fetch-start');
				const text = await fetchText(url);
				mark('library-fetched');
				const digest = hex(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
				if (digest !== pin.sha256) throw new Error(`${pin.file} as staged does not match its pin, so it is not run`);
				mark('library-pinned');
				return text;
			})();
			// A load that failed is tried again on the next draw, not remembered for the page's life.
			p.catch(() => libraries.delete(kind));
			libraries.set(kind, p);
		}
		return p;
	}

	/** The document of a kind whose library is a module graph: two small inline scripts and the directory the modules load from. */
	async function esmDocument(kind: DrawKind): Promise<string | null> {
		const meta = registry[kind];
		const esm = meta?.esm;
		if (!esm) return null;
		const base = deps.folderUrl?.(esm.dir);
		if (!base) throw new Error(`${esm.dir} has no staged address yet`);
		const { boot, importMap } = drawFrameEsmScripts({ kind, meta, base });
		const [bootHash, mapHash] = await Promise.all([boot, importMap].map(async (t) => b64(await subtle.digest('SHA-256', new TextEncoder().encode(t)))));
		return drawFrameEsmDocument({ kind, meta, base, boot, importMap, bootHash, mapHash, fontBases: deps.fontFolders?.() ?? [] });
	}

	async function openFrame(kind: DrawKind): Promise<Frame> {
		let html: string | null;
		try {
			html = await esmDocument(kind);
			if (html === null) {
				const script = drawFrameScript({ kind, library: await library(kind), meta: registry[kind] });
				const hash = b64(await subtle.digest('SHA-256', new TextEncoder().encode(script)));
				html = drawFrameDocument({ kind, script, hash, meta: registry[kind] });
			}
		} catch (e) {
			// A library that could not be fetched or did not match its pin leaves the kind to the page itself, as a frame that could not open does.
			if (e instanceof Error) (e as Error & { drawUnavailable?: boolean }).drawUnavailable = true;
			throw e;
		}
		mark('script-hashed');
		const frame = doc.createElement('iframe');
		frame.setAttribute('sandbox', 'allow-scripts');
		frame.setAttribute('aria-hidden', 'true');
		frame.setAttribute('tabindex', '-1');
		frame.title = `${kind} draw frame`;
		frame.dataset.latticeDrawFrame = kind;
		// Laid out, not `display:none`: the libraries measure text, which a frame with no layout cannot.
		frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
		const f: Frame = {
			frame,
			closed: false,
			faces: new Set(),
			queue: Promise.resolve(),
			seq: 0,
			waiting: new Map(),
			close: () => {
				if (f.closed) return;
				f.closed = true;
				window.removeEventListener('message', listener);
				for (const [, w] of f.waiting) {
					clearTimeout(w.timer);
					w.reject(new Error('the draw frame was stopped'));
				}
				f.waiting.clear();
				frame.remove();
			},
		};
		let onReady: (() => void) | null = null;
		let onFailed: (() => void) | null = null;
		const listener = (e: MessageEvent) => {
			// Only this frame speaks to us, and only in the shapes checkDrawReply reads.
			if (e.source !== frame.contentWindow) return;
			const r = checkDrawReply(e.data);
			if ('ready' in r) return onReady?.();
			if ('failed' in r) return onFailed?.();
			if ('ignore' in r) return;
			const w = f.waiting.get(r.id);
			if (!w) return;
			f.waiting.delete(r.id);
			clearTimeout(w.timer);
			mark('draw-answered');
			if ('error' in r) {
				// A module that fails to load after the frame is ready leaves the kind to the page, as a frame that never opened does.
				w.reject('loadFailed' in r ? Object.assign(new Error(r.error), { drawUnavailable: true }) : new Error(r.error));
				// A module that failed to load (offline, a stale deploy) stays failed for the frame's life, because a browser keeps the failed import: the next draw opens a fresh frame.
				if ('loadFailed' in r) f.close();
			} else w.resolve(r.out);
		};
		window.addEventListener('message', listener);
		try {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`the ${kind} draw frame did not open within ${OPEN_MS} ms`)), OPEN_MS);
				onReady = () => {
					clearTimeout(timer);
					resolve();
				};
				onFailed = () => {
					clearTimeout(timer);
					reject(new Error(`the ${kind} draw frame could not load its library`));
				};
				frame.srcdoc = html;
				doc.body.appendChild(frame);
			});
		} catch (e) {
			f.close();
			// The page may draw this kind itself: a frame that could not open says so.
			if (e instanceof Error) (e as Error & { drawUnavailable?: boolean }).drawUnavailable = true;
			throw e;
		}
		mark('frame-ready');
		return f;
	}

	/** The kind's open frame, or a fresh one when there is none, it failed to open, or it was spent by a timeout. */
	async function frameFor(kind: DrawKind): Promise<Frame> {
		const open = frames.get(kind);
		if (open) {
			try {
				const f = await open;
				if (!f.closed) return f;
			} catch {
				/* it failed to open, or was stopped: a fresh one below */
			}
			// Another draw may have replaced it while this one waited.
			const again = frames.get(kind);
			if (again && again !== open) return frameFor(kind);
		}
		const fresh = openFrame(kind);
		frames.set(kind, fresh);
		// A frame that failed to open is forgotten, so the next draw tries again.
		fresh.catch(() => {
			if (frames.get(kind) === fresh) frames.delete(kind);
		});
		return fresh;
	}

	const self: DrawHost = {
		async draw(job, ms = DRAW_MS, again = true): Promise<string> {
			if (done) throw new Error('the draw host is closed');
			const kind = job.kind;
			if (!Object.hasOwn(registry, kind)) throw new Error(`no draw frame for ${String(kind)}`);
			const f = await frameFor(kind);
			// One at a time, so a draw's clock starts when the frame gets it, not while it waits behind another.
			const next = f.queue.then(
				() =>
					new Promise<string>((resolve, reject) => {
						if (f.closed) return reject(new NotSent('the draw frame was stopped'));
						const id = ++f.seq;
						const timer = setTimeout(() => {
							f.waiting.delete(id);
							reject(new Error(`the ${kind} draw did not finish within ${ms} ms`));
							// A frame that overran may be wedged: it is spent, and the next draw opens a fresh one. (A sandboxed same-site frame shares the page's
						// thread in Chromium, so a drawing that is CPU-bound for longer than this blocks the page itself and this timer fires only afterward.)
							f.close();
						}, ms);
						f.waiting.set(id, { resolve, reject, timer });
						mark('draw-sent');
						f.frame.contentWindow?.postMessage({ t: 'draw', id, ...withFreshFaces(f, job) }, '*');
					}),
			);
			f.queue = next.catch(() => {});
			try {
				return await next;
			} catch (e) {
				// One bad drawing closed the frame it shared with this one: this one goes to a fresh frame.
				if (e instanceof NotSent && again && !done) return self.draw(job, ms, false);
				throw e;
			}
		},
		async warm(kind) {
			if (done) throw new Error('the draw host is closed');
			if (!Object.hasOwn(registry, kind)) throw new Error(`no draw frame for ${String(kind)}`);
			await frameFor(kind);
		},
		close() {
			done = true;
			for (const p of frames.values()) p.then((f) => f.close()).catch(() => {});
			frames.clear();
		},
	};
	return self;
}
