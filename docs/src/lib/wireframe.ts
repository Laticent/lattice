// A slide as a handful of boxes: the cheapest tile the Playground's map rail can draw.
//
// Veduta's fidelity ladder runs live, poster, wireframe, placeholder (docs/src/lib/veduta). A wireframe says
// what a slide is made of (a title, some lines of text, a list, a picture, a chart, code, a table) without
// rendering it, so the rail can show every slide in a deck of any length at the cost of one parse each. It is
// read from the engine's own markup, so it follows the deck: a slide that gains a bullet gains a bar.
//
// Pure: a string in, plain data out. `DOMParser` is the only global it reads (an inert document: nothing
// loads, nothing runs), so it works wherever the Playground does and under jsdom.

export type WireBlock =
	| { k: 'title' }
	| { k: 'text'; n: number }
	| { k: 'list'; n: number }
	| { k: 'cards'; n: number }
	| { k: 'media' }
	| { k: 'chart' }
	| { k: 'code'; n: number }
	| { k: 'table'; rows: number }
	| { k: 'quote' }
	| { k: 'math' };

/** What a slide looks like in the map: its blocks in reading order, at most `MAX_BLOCKS`. */
/** `label` is the slide's component class (`kpi`, `funnel`, `title`), the word a reader scans the map by. */
export type Wireframe = { blocks: WireBlock[]; empty: boolean; label: string };

const MAX_BLOCKS = 6;
const cap = (n: number, hi: number) => Math.max(1, Math.min(hi, n));
const memo = new Map<string, Wireframe>();
const MEMO_CAP = 600;

/** The wireframe of one rendered section. Memoized by its markup, so an edit re-derives only the slide it touched. */
export function wireframeOf(sectionHtml: string): Wireframe {
	const hit = memo.get(sectionHtml);
	if (hit) return hit;
	const out = derive(sectionHtml);
	if (memo.size >= MEMO_CAP) memo.clear();
	memo.set(sectionHtml, out);
	return out;
}

function derive(sectionHtml: string): Wireframe {
	if (typeof DOMParser === 'undefined') return { blocks: [], empty: true, label: '' };
	const doc = new DOMParser().parseFromString(`<!doctype html><body>${sectionHtml}`, 'text/html');
	const root = doc.querySelector('section') ?? doc.body;
	const blocks: WireBlock[] = [];
	const seen = new Set<Element>();
	const push = (b: WireBlock, el?: Element) => {
		if (el) seen.add(el);
		if (blocks.length < MAX_BLOCKS) blocks.push(b);
	};
	const inside = (el: Element) => {
		for (let p = el.parentElement; p && p !== root; p = p.parentElement) if (seen.has(p)) return true;
		return false;
	};
	// Reading order is document order, so one walk in order is enough; a block claims its subtree.
	for (const el of Array.from(root.querySelectorAll('h1, h2, h3, ul, ol, p, pre, table, blockquote, svg, img, picture, figure, .katex, .katex-display'))) {
		if (inside(el) || el.closest('.marker-rail, .cell-footer, [aria-hidden="true"], template')) continue;
		const tag = el.tagName.toLowerCase();
		if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
			if (!blocks.some((b) => b.k === 'title')) push({ k: 'title' }, el);
		} else if (tag === 'ul' || tag === 'ol') {
			const items = Array.from(el.querySelectorAll(':scope > li'));
			// A list whose items carry their own sub-list or a bold lead is a row of cards (a KPI, a pricing
			// tier, a stat), not bullets: draw it as a grid.
			const cards = items.length >= 2 && items.filter((li) => li.querySelector(':scope > ul, :scope > ol, :scope > strong')).length >= Math.ceil(items.length / 2);
			push(cards ? { k: 'cards', n: cap(items.length, 6) } : { k: 'list', n: cap(items.length, 5) }, el);
		} else if (tag === 'pre') {
			push({ k: 'code', n: cap((el.textContent ?? '').split('\n').length, 6) }, el);
		} else if (tag === 'table') {
			push({ k: 'table', rows: cap(el.querySelectorAll('tr').length, 5) }, el);
		} else if (tag === 'blockquote') {
			push({ k: 'quote' }, el);
		} else if (tag === 'svg') {
			push({ k: 'chart' }, el);
		} else if (tag === 'img' || tag === 'picture') {
			push({ k: 'media' }, el);
		} else if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
			push({ k: 'math' }, el);
		} else if (tag === 'p' || tag === 'figure') {
			const len = (el.textContent ?? '').trim().length;
			if (len > 0) push({ k: 'text', n: cap(Math.ceil(len / 70), 3) }, el);
		}
	}
	const label = (root.getAttribute('data-class') || root.getAttribute('class') || '').split(/\s+/).find((w) => w && !['form', 'silent', 'print'].includes(w)) ?? '';
	return { blocks, empty: blocks.length === 0, label };
}

/** Test-only: forget every memoized wireframe. */
export function __clearWireframeMemo(): void {
	memo.clear();
}
