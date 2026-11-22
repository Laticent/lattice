// THROWAWAY (probe/d1-ios-shipped, never for main): the D1 per-frame recorder, for the iOS Simulator bench of the shipped code.
const n = (v: number) => Math.round(v);
export function benchRecorder(name: string): void {
	try {
		if (window.top !== window || localStorage.getItem('lattice-d1-bench') !== '1') return;
	} catch {
		return;
	}
	const log: { rows: unknown[][]; done: boolean } = { rows: [], done: false };
	(window as unknown as { __waitBench: typeof log }).__waitBench = log;
	let drawnRun = 0;
	const rel = (r: DOMRect, s: DOMRect) => [n(r.left - s.left), n(r.top - s.top), n(r.width), n(r.height)];
	const tick = () => {
		const t = n(performance.now());
		const fr = document.querySelector<HTMLIFrameElement>('[aria-label="Live deck preview"] iframe.live');
		let state = 'blank';
		let block: number[] | null = null;
		let coda: number[] | null = null;
		try {
			const doc = fr?.contentDocument;
			const sec = doc?.querySelector('section');
			if (fr && doc && sec && getComputedStyle(fr).visibility !== 'hidden') {
				const s = sec.getBoundingClientRect();
				const drawn = doc.querySelector(`[data-lattice-plugin="${name}"]`);
				const wait = doc.querySelector('[data-lattice-plugin-wait]');
				const off = doc.querySelector(`[data-lattice-plugin-off="${name}"]`);
				const code = doc.querySelector(`code.language-${name}`);
				let el: Element | null = null;
				if (drawn) {
					const bar = drawn.querySelector('rect');
					const fill = bar && fr.contentWindow ? fr.contentWindow.getComputedStyle(bar).fill : '';
					state = /^rgb\(0, 0, 0\)$|^#000/.test(fill) ? 'bare' : 'drawn';
					el = drawn;
				} else if (wait) {
					state = wait.getAttribute('data-wait-shape') || 'box';
					el = wait;
				} else if (off) {
					state = 'off';
					el = off;
				} else if (code) {
					state = 'source';
					el = code.closest('pre') || code;
				} else state = 'slide';
				block = el ? rel(el.getBoundingClientRect(), s) : null;
				const c = doc.querySelector('.cell-coda');
				coda = c ? rel(c.getBoundingClientRect(), s) : null;
			}
		} catch {}
		log.rows.push([t, state, block, coda]);
		drawnRun = state === 'drawn' ? drawnRun + 1 : 0;
		if (drawnRun >= 30 || t > 20000) log.done = true;
		else requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
