// jsdom never parses an iframe's `srcdoc`, so a live preview frame never fires `load`. A browser's does, and
// single-slide-render.ts relies on it: a render that starts while an earlier full write is still loading WAITS for that
// load (bounded, 30 s) so it can patch the new document instead of writing a second one. A jsdom test that renders
// several times in a row would then wait out the bound on every render.
//
// `loadFramesOnWrite()` makes each srcdoc write "load" on the next microtask, as a fast browser's would. The document is
// still empty (jsdom has nothing to parse), so every render still takes the full-write path, as these tests expect. A
// test about the wait itself (single-slide-render.adopt-bake.test.ts) fires `load` by hand instead and must not use it.

/** Fire every iframe's `onload` on the microtask after its `srcdoc` is written. Returns the restore function. */
export function loadFramesOnWrite(): () => void {
	const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
	if (!d?.set || !d.get) throw new Error('jsdom has no srcdoc accessor to wrap');
	const { get, set } = d;
	Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
		configurable: true,
		get,
		set(this: HTMLIFrameElement, v: string) {
			set.call(this, v);
			queueMicrotask(() => this.onload?.(new Event('load')));
		},
	});
	return () => Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', d);
}
