/**
 * Measure inline sparks in the live preview and name the ones too big for the space they sit in.
 *
 * WHY THIS IS MEASURED, NOT LINTED. Whether `~{…}:lg` fits depends on the layout it lands in (a
 * table column, a kpi support row, a card), which lint-core cannot see. The Studio's preview frame
 * is same-origin, so the Studio reads the rendered sparks directly — no engine change, no message
 * channel. Each spark carries its own source text as `data-src` (lib/core/inline-sparks.js), so a
 * report names the exact span, and lint-core's `sparkFitFindings` turns it into a warning with a
 * one-click resize. Spec: engineering/decisions/2026-09-28-inline-sparks.md.
 */

export type SparkSize = 'sm' | 'md' | 'lg';
export type SparkFitReport = {
	/** The span text, as the author wrote it (the host's `data-src`). */
	src: string;
	/** `wide`: it reaches past its space. `tall`: it stands more than TALL_LINES of its line. */
	why: 'wide' | 'tall';
	/** The largest size that fits, or `sm` when nothing does. */
	to: SparkSize;
	/** `wide`: how far past its space it reaches, in slide pixels. `tall`: its height in lines. */
	over: number;
	/** True when even `sm` is too wide, so the fix only helps. */
	stillOver: boolean;
};

/**
 * Width at each size relative to `md`, per kind. A framed tile scales its whole box
 * (base.modifiers.css `--spark-frame-scale`); a bare spark uses fixed em widths (3 / 4.5 /
 * 7.5em), and a bare ring is as wide as it is tall (0.8 / 1.1 / 1.7em).
 */
type Kind = 'framed' | 'bare' | 'bareRing';
const WIDTH: Record<Kind, Record<SparkSize, number>> = {
	framed: { sm: 0.85, md: 1, lg: 1.6 },
	bare: { sm: 3 / 4.5, md: 1, lg: 7.5 / 4.5 },
	bareRing: { sm: 0.8 / 1.1, md: 1, lg: 1.7 / 1.1 },
};
/** Height at each size relative to `md` (bare heights are 0.8 / 1 / 1.7em). */
const HEIGHT: Record<Kind, Record<SparkSize, number>> = {
	framed: WIDTH.framed,
	bare: { sm: 0.8, md: 1, lg: 1.7 },
	bareRing: WIDTH.bareRing,
};

/**
 * A spark taller than this many lines of the text around it pushes its row or paragraph apart.
 * Measured on the demo deck: `md` stands 1.2–1.35 lines in a table cell or kpi line, `lg`
 * 1.9–2.1, and `lg` under a big number 1.06 — so 1.5 flags a large spark in a row and never
 * the default.
 */
export const TALL_LINES = 1.5;

const SIZES_DOWN: SparkSize[] = ['lg', 'md', 'sm'];

/**
 * The largest size, no bigger than the current one, whose width fits `available`.
 * Null when the current size already fits.
 */
export function fitSize(
	width: number,
	available: number,
	size: SparkSize,
	kind: Kind,
	dim: 'width' | 'height' = 'width',
	fixed = 0,
): { to: SparkSize; stillOver: boolean } | null {
	if (width <= available + 1) return null;
	const ratio = (dim === 'width' ? WIDTH : HEIGHT)[kind];
	// `fixed` is the part that does NOT scale with size — the outer gap to the neighbors
	// (`--spark-pad-out`, 0.15em each side). Only the rest steps by the ratios.
	const per = Math.max(0, width - fixed) / ratio[size];
	for (const s of SIZES_DOWN) {
		if (ratio[s] > ratio[size] || s === size) continue;
		if (fixed + per * ratio[s] <= available + 1) return { to: s, stillOver: false };
	}
	return size === 'sm' ? null : { to: 'sm', stillOver: true };
}

/** The right edge of an element's CONTENT box, in viewport pixels. */
function contentRight(el: Element): number {
	const r = el.getBoundingClientRect();
	const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
	if (!cs) return r.right;
	return r.right - (Number.parseFloat(cs.paddingRight) || 0) - (Number.parseFloat(cs.borderRightWidth) || 0);
}

/** Every spark in `doc` that reaches past its space, one report per distinct span text. */
export function measureSparkFit(doc: Document): SparkFitReport[] {
	const view = doc.defaultView;
	if (!view) return [];
	const out = new Map<string, SparkFitReport>();
	for (const el of doc.querySelectorAll<HTMLElement>('section[data-lattice-slide] .lat-spark[data-src]')) {
		// Running chrome repeats on every slide, and a `:fill` spark is full-width by design.
		if (el.closest('header, footer') || el.hasAttribute('data-fill')) continue;
		const section = el.closest('section');
		const r = el.getBoundingClientRect();
		if (!section || !r.width) continue;
		// The preview scales the slide to fit; report in the slide's own pixels.
		const scale = section.getBoundingClientRect().width / (section.offsetWidth || 1) || 1;
		const box = el.closest('td, th, li, p, dd, dt, figcaption, blockquote') || section;
		const limit = Math.min(contentRight(box), contentRight(section));
		const framed = view.getComputedStyle(el, '::before').content !== 'none';
		const kind: Kind = framed ? 'framed' : el.dataset.type === 'ring' ? 'bareRing' : 'bare';
		const size = (el.dataset.size as SparkSize) || 'md';
		const src = el.dataset.src || '';
		let report: SparkFitReport | null = null;
		// Too WIDE: it reaches past its container's content box (or the slide's).
		const over = (r.right - limit) / scale;
		// The outer gap is 0.15em of the text each side and does not change with size.
		const fixed = 0.3 * (Number.parseFloat(view.getComputedStyle(el).fontSize) || 16);
		const wide = over > 1 ? fitSize(r.width / scale, r.width / scale - over, size, kind, 'width', fixed) : null;
		if (wide) report = { src, why: 'wide', to: wide.to, over, stillOver: wide.stillOver };
		// Too TALL: more than TALL_LINES of the text around it, which spreads the row apart.
		if (!report) {
			const cs = view.getComputedStyle(box);
			const fs = Number.parseFloat(cs.fontSize) || 16;
			const line = cs.lineHeight === 'normal' ? 1.2 * fs : Number.parseFloat(cs.lineHeight) || 1.2 * fs;
			const h = r.height / scale;
			const tall = fitSize(h, TALL_LINES * line, size, kind, 'height');
			if (tall) report = { src, why: 'tall', to: tall.to, over: h / line, stillOver: tall.stillOver };
		}
		if (!report) continue;
		const prev = out.get(src);
		if (!prev || (prev.why === report.why && prev.over < report.over) || (prev.why === 'tall' && report.why === 'wide')) out.set(src, report);
	}
	return [...out.values()];
}
