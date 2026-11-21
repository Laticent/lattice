// RECORDING WHAT A PLUGIN DREW, for the next reload's wait (D1, engineering/decisions/2026-11-20-plugin-reload-wait.md).
//
// wait.ts draws a listed plugin's block as its afterimage before the plugin's code loads. This half keeps those
// afterimages current: after each paint it measures every drawn plugin block (door-run.ts stamps each with the key
// `waitKey` makes) and stores its boxes as numbers, capped at AFTER_MAX blocks and BOX_MAX boxes each. It also keeps the
// registry wait.ts reads to know which fence belongs to which plugin. It loads with the door, never on the Studio's
// first load: only a Studio that holds a plugin needs it.

import { AFTER_KEY, afterimages, type Entry, n, REG_KEY, type Shot } from './wait';

const AFTER_MAX = 100;
const BOX_MAX = 150;

/** The door's plugins, by fence, kept for the next page load (door.ts `setPlugins`). */
export function rememberWaits(list: { fence: string; name: string; placement?: string; aspect?: string | null; sha256: string }[]): void {
	const next: Record<string, Entry> = {};
	for (const p of list) if (p.fence) next[p.fence] = { name: p.name, placement: p.placement || 'figure', ...(p.aspect ? { aspect: p.aspect } : {}), sha: p.sha256.slice(0, 16) };
	try {
		localStorage.setItem(REG_KEY, JSON.stringify(next));
	} catch {}
}

/** Measure each keyed plugin drawing in a painted preview document and keep its boxes. */
function capture(doc: Document): void {
	const roots = doc.querySelectorAll<HTMLElement>('[data-lattice-wait-key]');
	if (!roots.length) return;
	const all = afterimages() as Record<string, Shot>;
	let changed = false;
	for (const root of roots) {
		const rr = root.getBoundingClientRect();
		if (rr.width < 8 || rr.height < 8) continue;
		const s = 1000 / rr.width;
		const boxes: number[][] = [];
		const shapes: { box: number[]; lum: number }[] = [];
		const win = doc.defaultView;
		const lumOf = (c: string) => {
			const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c);
			return m ? (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255 : 0.5;
		};
		const rel = (r: DOMRect) => [n((r.left - rr.left) * s), n((r.top - rr.top) * s), Math.max(1, n(r.width * s)), Math.max(1, n(r.height * s))];
		for (const el of root.querySelectorAll('*')) {
			if (boxes.length + shapes.length >= BOX_MAX) break;
			const r = el.getBoundingClientRect();
			if (r.width < 1 || r.height < 1) continue;
			const cs = win?.getComputedStyle(el);
			if (!cs || cs.visibility === 'hidden' || cs.display === 'none') continue;
			const tag = el.tagName.toLowerCase();
			if (['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line'].includes(tag)) {
				shapes.push({ box: rel(r), lum: lumOf(cs.fill !== 'none' ? cs.fill : cs.stroke) });
			} else if (!(el instanceof SVGElement)) {
				const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
				const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
				if (filled || bordered) boxes.push([...rel(r), filled ? 1 : 0]);
			}
		}
		// Words: one bar per line of text, from the text nodes' own line boxes.
		const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let t = walker.nextNode(); t && boxes.length + shapes.length < BOX_MAX; t = walker.nextNode()) {
			if (!t.textContent?.trim()) continue;
			const range = doc.createRange();
			range.selectNodeContents(t);
			for (const r of range.getClientRects()) if (r.width >= 1 && r.height >= 1) boxes.push([...rel(r), 3]);
		}
		// The marks that differ most in tone from the rest (an emphasized bar) keep a step more weight.
		const lums = shapes.map((x) => x.lum).sort((a, b) => a - b);
		const median = lums[lums.length >> 1] ?? 0;
		for (const x of shapes) boxes.push([...x.box, Math.abs(x.lum - median) > 0.15 ? 2 : 1]);
		const key = root.getAttribute('data-lattice-wait-key') as string;
		all[key] = { w: n(rr.width), h: n(rr.height), b: boxes };
		changed = true;
	}
	if (!changed) return;
	const keys = Object.keys(all);
	for (const k of keys.slice(0, Math.max(0, keys.length - AFTER_MAX))) delete all[k];
	try {
		localStorage.setItem(AFTER_KEY, JSON.stringify(all));
	} catch {}
}

const watched = new WeakSet<Document>();
/** Keep the afterimages of a preview document's drawings current while it is shown (handed over by wait.ts `previewPainted`). */
export function watchAfterimages(doc: Document): void {
	if (!doc?.documentElement || watched.has(doc)) return;
	watched.add(doc);
	let pending = false;
	const run = () => {
		if (pending) return;
		pending = true;
		const raf = doc.defaultView?.requestAnimationFrame ?? ((f: FrameRequestCallback) => setTimeout(f, 16));
		raf(() =>
			raf(() => {
				pending = false;
				try {
					capture(doc);
				} catch {}
			}),
		);
	};
	run();
	try {
		// The document element, not the body: a patch can replace the body, and an observer on the old one hears nothing.
		new MutationObserver(run).observe(doc.documentElement, { childList: true, subtree: true });
	} catch {}
}

