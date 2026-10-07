// THE STUDIO'S SANDBOX FOR ONE CODE PACKAGE (portable-packages phase 6, step 4; contract note §9).
//
// A code package is a component whose `transform.js` someone else wrote. In the Studio it runs in
// a hidden `<iframe sandbox="allow-scripts">`, and nowhere else:
//   - WITHOUT `allow-same-origin`, so the frame has an opaque origin: no IndexedDB, no cookies, no
//     storage, and no reach into the Studio page or the user's OpenRouter key (HARD RULE #24);
//     without `allow-popups`, `allow-forms` or `allow-top-navigation`, so Chromium refuses a popup,
//     a form post and a navigation of the Studio;
//   - under the SAME content-security policy as the CLI's locked page (code-door-core.mjs
//     `sandboxCsp`): `default-src 'none'`, script only by the hash of the frame's one script;
//   - and the package itself runs in a WORKER that script makes, never in the frame's document:
//     a sandboxed frame may always navigate ITSELF, and nothing but a realm with no `location`
//     stops a transform sending the slide to a server that way. The worker inherits the frame's
//     policy, so fetch, WebSocket, `importScripts`, `import()` and nested workers reach nothing,
//     and WebRTC, which no policy governs, does not exist in a worker.
// The frame's script is the CLI's, byte for byte (FRAME_BOOTSTRAP), so the two doors run a package
// the same way (HARD RULE #1). What the package returns is sanitized by the caller (door.ts).

import { FRAME_BOOTSTRAP, inlineScript, MAX_OUTPUT_CHARS, sandboxCsp } from '../../../../lib/packages/code-door-core.mjs';
import { checkedWorkerScript } from '../../../../lib/packages/code-syntax.mjs';

// `facts` is the slide's plain content (lib/packages/slide-facts.mjs), read by the door, never by the package.
export type CodeSlide = { html: string; facts?: unknown; index: number; idPrefix?: string; baseUrl?: string };
export type PackageFrame = { run: (slide: CodeSlide, ms: number) => Promise<string>; close: () => void; readonly closed: boolean };

let frameDocLoad: Promise<string> | null = null;

/** The frame's document: the policy, and the bootstrap it allows by hash. The same for every package. */
function frameDoc(): Promise<string> {
	if (!frameDocLoad) {
		frameDocLoad = (async () => {
			const script = inlineScript(FRAME_BOOTSTRAP);
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
			const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
			return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${sandboxCsp(hash)}"></head><body><script>${script}</script></body></html>`;
		})();
	}
	return frameDocLoad;
}

type Reply = { t?: string; id?: number; out?: unknown; error?: unknown };

/**
 * Open a sandboxed frame for one package and load its code into the frame's worker. Rejects if the
 * frame or the package does not load within `loadMs` (the bundle's top level runs at load).
 */
export async function openPackageFrame(code: string, { loadMs = 5000 }: { loadMs?: number } = {}): Promise<PackageFrame> {
	// Refused here too, for its syntax: a record saved before the import checked it still never runs.
	const text = checkedWorkerScript(code);
	const doc = await frameDoc();
	const frame = document.createElement('iframe');
	frame.setAttribute('sandbox', 'allow-scripts');
	frame.setAttribute('aria-hidden', 'true');
	frame.setAttribute('tabindex', '-1');
	frame.title = 'code package sandbox';
	frame.dataset.latticeCodeSandbox = '';
	frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden';
	let closed = false;
	let seq = 0;
	let queue: Promise<unknown> = Promise.resolve();
	const waiting = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	let onReady: ((r: Reply) => void) | null = null;
	const listener = (e: MessageEvent) => {
		// Only this frame speaks to us, and only in the shapes below.
		if (e.source !== frame.contentWindow) return;
		const r = (e.data ?? {}) as Reply;
		if ((r.t === 'ready' || r.t === 'loaded') && onReady) return onReady(r);
		if (r.t !== 'result' || typeof r.id !== 'number') return;
		const w = waiting.get(r.id);
		if (!w) return;
		waiting.delete(r.id);
		clearTimeout(w.timer);
		if (typeof r.error === 'string') return w.reject(new Error(r.error));
		// The frame's runner checks these too; the frame is ours, but this side takes nothing unchecked.
		if (typeof r.out !== 'string') return w.reject(new TypeError(`the transform returned ${r.out === null ? 'null' : typeof r.out}, not a string`));
		if (r.out.length > MAX_OUTPUT_CHARS) return w.reject(new RangeError(`the transform returned ${r.out.length} characters, past the ${MAX_OUTPUT_CHARS}-character limit`));
		w.resolve(r.out);
	};
	const close = () => {
		if (closed) return;
		closed = true;
		window.removeEventListener('message', listener);
		for (const [, w] of waiting) {
			clearTimeout(w.timer);
			w.reject(new Error('the package was stopped'));
		}
		waiting.clear();
		frame.remove();
	};
	window.addEventListener('message', listener);
	const step = (want: string) =>
		new Promise<Reply>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`the package did not finish loading within ${loadMs} ms`)), loadMs + 1000);
			onReady = (r) => {
				if (r.t !== want) return;
				clearTimeout(timer);
				onReady = null;
				resolve(r);
			};
		});
	try {
		const ready = step('ready');
		frame.srcdoc = doc;
		document.body.appendChild(frame);
		await ready;
		const loaded = step('loaded');
		frame.contentWindow?.postMessage({ t: 'load', text, ms: loadMs }, '*');
		const r = await loaded;
		if (typeof r.error === 'string') throw new Error(r.error);
	} catch (e) {
		close();
		throw e;
	}
	const frameApi: PackageFrame = {
		get closed() {
			return closed;
		},
		close,
		run(slide, ms) {
			// One at a time from this side too: the frame queues runs and starts a slide's clock when
			// the worker gets it, so this side's backstop must not start while the slide waits.
			const next = queue.then(() => runOne(slide, ms));
			queue = next.catch(() => {});
			return next;
		},
	};
	return frameApi;
	function runOne(slide: CodeSlide, ms: number): Promise<string> {
			if (closed) return Promise.reject(new Error('the package was stopped'));
			const id = ++seq;
			return new Promise<string>((resolve, reject) => {
				// The frame ends the worker at `ms`; this later deadline is for a frame that stops answering.
				const timer = setTimeout(() => {
					waiting.delete(id);
					reject(new Error(`the transform did not finish within ${ms} ms`));
					close();
				}, ms + 1000);
				waiting.set(id, { resolve, reject, timer });
				frame.contentWindow?.postMessage({ t: 'run', id, slide: { html: String(slide.html), facts: slide.facts ?? null, index: slide.index, idPrefix: slide.idPrefix ?? '', baseUrl: slide.baseUrl ?? '' }, ms }, '*');
			}).catch((e: Error) => {
				// A run past its time ends the worker, so this frame is spent; the caller opens another.
				if (/did not finish within|was stopped|not loaded/.test(e.message)) close();
				throw e;
			});
	}
}
