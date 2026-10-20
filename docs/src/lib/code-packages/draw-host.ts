// THE STUDIO'S DRAW HOST: it owns the sandboxed frames that draw Mermaid and function-plot for the previews, so neither
// library runs in the page that holds the deck (owner decisions 14 and 15; D1 A, 2026-10-20).
//
// A frame is the pool's sandbox (`sandbox="allow-scripts"`, no `allow-same-origin`, no network) around ONE script: the
// library, pinned by SHA-256, then the bootstrap in lib/packages/draw-frame-core.mjs. A frame needs a screen, which the pool's
// worker has not, so it is a document of its own and not a worker. Frames are opened on the first draw of their kind and
// STAY OPEN: Mermaid's script costs about 2 s to open and about 50 ms per draw after that. A frame that times out is
// spent and replaced on the next draw.
//
// Loaded lazily, by whoever installs the host (the previews, in the next step), so the Studio's first load does not pay
// for it (docs/route-budget.json).

import { checkDrawReply, DRAW_KINDS, drawFrameDocument, drawFrameScript } from '../../../../lib/packages/draw-frame-core.mjs';
import { DRAW_FRAME_LIBRARIES } from '../../../../lib/plugins/draw-frame-libraries.generated.mjs';

export type DrawKind = keyof typeof DRAW_KINDS;
export type DrawJob =
	| { kind: 'mermaid'; definition: string; svgId: string; config: Record<string, unknown> }
	| { kind: 'function-plot'; configB64: string; configText: string; width: number; height: number; index: number };
export type DrawHost = {
	/** Draw one figure, answering its SVG as text, or rejecting with why it did not draw. */
	draw: (job: DrawJob, ms?: number) => Promise<string>;
	/** Close every frame. The host is not used again. */
	close: () => void;
};
export type DrawHostDeps = {
	/** Where a library's staged file is, or null when no asset directory is known yet. */
	libraryUrl: (file: string) => string | null;
	/** function-plot's `hydrate` function as text (the registry's own, so the plot is the one every surface draws). */
	hydrateSource: () => string;
	fetchText?: (url: string) => Promise<string>;
	doc?: Document;
	subtle?: SubtleCrypto;
};

const OPEN_MS = 30_000;
const DRAW_MS = 15_000;
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

type Frame = { frame: HTMLIFrameElement; closed: boolean; queue: Promise<unknown>; seq: number; waiting: Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>; close: () => void };

export function createDrawHost(deps: DrawHostDeps): DrawHost {
	const doc = deps.doc ?? document;
	const subtle = deps.subtle ?? crypto.subtle;
	const fetchText = deps.fetchText ?? (async (url: string) => (await fetch(url, { credentials: 'omit' })).text());
	const libraries = new Map<DrawKind, Promise<string>>();
	const frames = new Map<DrawKind, Promise<Frame>>();
	let done = false;

	/** The library's staged text, held to the pin in the manifest before a frame is built from it. */
	function library(kind: DrawKind): Promise<string> {
		let p = libraries.get(kind);
		if (!p) {
			const pin = (DRAW_FRAME_LIBRARIES as Record<string, { file: string; sha256: string }>)[kind];
			p = (async () => {
				if (!pin) throw new Error(`no library is pinned for ${kind}`);
				const url = deps.libraryUrl(pin.file);
				if (!url) throw new Error(`${pin.file} has no staged address yet`);
				const text = await fetchText(url);
				const digest = hex(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
				if (digest !== pin.sha256) throw new Error(`${pin.file} as staged does not match its pin, so it is not run`);
				return text;
			})();
			// A load that failed is tried again on the next draw, not remembered for the page's life.
			p.catch(() => libraries.delete(kind));
			libraries.set(kind, p);
		}
		return p;
	}

	async function openFrame(kind: DrawKind): Promise<Frame> {
		const script = drawFrameScript({ kind, library: await library(kind), ...(kind === 'function-plot' ? { hydrateSource: deps.hydrateSource() } : {}) });
		const hash = b64(await subtle.digest('SHA-256', new TextEncoder().encode(script)));
		const html = drawFrameDocument({ kind, script, hash });
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
		const listener = (e: MessageEvent) => {
			// Only this frame speaks to us, and only in the shapes checkDrawReply reads.
			if (e.source !== frame.contentWindow) return;
			const r = checkDrawReply(e.data);
			if ('ready' in r) return onReady?.();
			if ('ignore' in r) return;
			const w = f.waiting.get(r.id);
			if (!w) return;
			f.waiting.delete(r.id);
			clearTimeout(w.timer);
			if ('error' in r) w.reject(new Error(r.error));
			else w.resolve(r.out);
		};
		window.addEventListener('message', listener);
		try {
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`the ${kind} draw frame did not open within ${OPEN_MS} ms`)), OPEN_MS);
				onReady = () => {
					clearTimeout(timer);
					resolve();
				};
				frame.srcdoc = html;
				doc.body.appendChild(frame);
			});
		} catch (e) {
			f.close();
			throw e;
		}
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

	return {
		async draw(job, ms = DRAW_MS) {
			if (done) throw new Error('the draw host is closed');
			const kind = job.kind;
			if (!Object.hasOwn(DRAW_KINDS, kind)) throw new Error(`no draw frame for ${String(kind)}`);
			const f = await frameFor(kind);
			// One at a time, so a draw's clock starts when the frame gets it, not while it waits behind another.
			const next = f.queue.then(
				() =>
					new Promise<string>((resolve, reject) => {
						if (f.closed) return reject(new Error('the draw frame was stopped'));
						const id = ++f.seq;
						const timer = setTimeout(() => {
							f.waiting.delete(id);
							reject(new Error(`the ${kind} draw did not finish within ${ms} ms`));
							// A frame that overran may be wedged: it is spent, and the next draw opens a fresh one.
							f.close();
						}, ms);
						f.waiting.set(id, { resolve, reject, timer });
						f.frame.contentWindow?.postMessage({ t: 'draw', id, ...job }, '*');
					}),
			);
			f.queue = next.catch(() => {});
			return next;
		},
		close() {
			done = true;
			for (const p of frames.values()) p.then((f) => f.close()).catch(() => {});
			frames.clear();
		},
	};
}
