// Metric metadata — the single source of truth behind the performance overlay's
// rows AND their detail cards. One table so a row's label, formatter, budget
// colour, and its plain-language explanation can never drift apart.
//
// Three groups, mirroring what the overlay measures:
//   • vitals  — Google Core Web Vitals (page load, one-shot).
//   • runtime — live browser health while the overlay is shown.
//   • render  — the Lattice edit→preview pipeline (fed by render-metrics.js).
//
// Ratings are computed here from `bands` (not from web-vitals) so every group
// colours the same way and the detail card can draw one consistent budget
// scale. `dir` says which way is better; MEM overrides with a custom rate() (it
// rates by fraction-of-heap-limit, not an absolute MB band).

export type Rating = 'good' | 'needs-improvement' | 'poor';
export type MetricGroup = 'vitals' | 'runtime' | 'render';

export type Bands = {
	/** Upper edge of the "good" zone. */
	good: number;
	/** Upper edge of the "needs work" zone; beyond it is "poor". */
	ni: number;
	/** Which direction is better. Default 'lower' (smaller = better). */
	dir?: 'lower' | 'higher';
};

export type MetricMeta = {
	key: string;
	/** Short label shown in the row (e.g. "LCP"). */
	label: string;
	/** Full human name for the detail header (e.g. "Largest Contentful Paint"). */
	title: string;
	group: MetricGroup;
	/** Format the raw number for display. */
	format: (v: number) => string | number;
	/** Unit suffix — a string, or a fn for size units that switch (B/KB). */
	unit: string | ((v: number) => string);
	/** One sentence: what this number measures, in plain words. */
	what: string;
	/** One sentence: why it matters / what a bad value means. */
	why: string;
	/** Budget thresholds; absent → the row shows a neutral dot (no rating). */
	bands?: Bands;
	/** Override rating (MEM rates by heap fraction, passed as `extra`). */
	rate?: (v: number, extra?: number) => Rating | null;
	/** True for a proxy metric (CPU≈) — the detail card flags the approximation. */
	approximate?: boolean;
};

const ms = (v: number) => Math.round(v);
const round3 = (v: number) => v.toFixed(3);

// Human-readable budget line for the detail card, e.g. "good < 50ms · ok < 100ms".
export function bandLabel(m: MetricMeta): string | null {
	if (!m.bands) return null;
	const u = typeof m.unit === 'function' ? '' : m.unit;
	const { good, ni, dir = 'lower' } = m.bands;
	const cmp = dir === 'lower' ? '<' : '>';
	return `good ${cmp} ${good}${u} · ok ${cmp} ${ni}${u}`;
}

export function rateByBands(bands: Bands, v: number): Rating {
	const { good, ni, dir = 'lower' } = bands;
	if (dir === 'higher') return v >= good ? 'good' : v >= ni ? 'needs-improvement' : 'poor';
	return v < good ? 'good' : v < ni ? 'needs-improvement' : 'poor';
}

/** Rating for a metric+value (uses meta.rate override, else bands, else null). */
export function rateMetric(m: MetricMeta, v: number, extra?: number): Rating | null {
	if (m.rate) return m.rate(v, extra);
	if (m.bands) return rateByBands(m.bands, v);
	return null;
}

// ── The registry ────────────────────────────────────────────────────────────

export const VITALS: MetricMeta[] = [
	{
		key: 'LCP', label: 'LCP', title: 'Largest Contentful Paint', group: 'vitals',
		format: ms, unit: 'ms', bands: { good: 2500, ni: 4000 },
		what: 'Time until the biggest thing on screen — a heading or hero image — has painted.',
		why: "Google's core measure of how fast the page feels loaded.",
	},
	{
		key: 'CLS', label: 'CLS', title: 'Cumulative Layout Shift', group: 'vitals',
		format: round3, unit: '', bands: { good: 0.1, ni: 0.25 },
		what: 'How much the page jumped around as it loaded — 0 is rock-steady.',
		why: 'Layout jank: content shifting under the reader’s eye or finger.',
	},
	{
		key: 'INP', label: 'INP', title: 'Interaction to Next Paint', group: 'vitals',
		format: ms, unit: 'ms', bands: { good: 200, ni: 500 },
		what: 'The delay between you interacting — a tap or keystroke — and the screen updating.',
		why: 'The honest measure of how responsive typing and taps feel.',
	},
	{
		key: 'FCP', label: 'FCP', title: 'First Contentful Paint', group: 'vitals',
		format: ms, unit: 'ms', bands: { good: 1800, ni: 3000 },
		what: 'Time until the first text or image appears.',
		why: 'When the page stops looking blank.',
	},
	{
		key: 'TTFB', label: 'TTFB', title: 'Time to First Byte', group: 'vitals',
		format: ms, unit: 'ms', bands: { good: 800, ni: 1800 },
		what: 'How long the server took to send the first byte of the page.',
		why: 'Network + server latency before anything can even start loading.',
	},
];

export const RUNTIME: MetricMeta[] = [
	{
		key: 'FPS', label: 'FPS', title: 'Frames per second', group: 'runtime',
		format: ms, unit: 'fps', bands: { good: 50, ni: 30, dir: 'higher' },
		what: 'Frames drawn per second right now.',
		why: 'Below ~50 feels choppy — scrolling and animation start to stutter.',
	},
	{
		key: 'MEM', label: 'MEM', title: 'JavaScript heap', group: 'runtime',
		format: ms, unit: 'MB',
		// Rated by fraction of the heap limit (passed as `extra`), not absolute MB.
		rate: (_v, frac) => (frac == null ? null : frac <= 0.5 ? 'good' : frac <= 0.8 ? 'needs-improvement' : 'poor'),
		what: 'JavaScript memory in use (Chrome only).',
		why: 'Climbing steadily across a session is a hint at a memory leak.',
	},
	{
		key: 'CPU', label: 'CPU', title: 'Main-thread busy (approx.)', group: 'runtime',
		format: ms, unit: '%', bands: { good: 20, ni: 50 }, approximate: true,
		what: 'Rough share of the last second the main thread was blocked by long tasks (>50ms).',
		why: 'High means the main thread is jammed — exactly what janks typing. Browsers expose no true CPU meter, hence the ≈.',
	},
];

const bytes = (v: number) => (v >= 1024 ? (v / 1024).toFixed(1) : v);
const bytesUnit = (v: number) => (v >= 1024 ? 'KB' : 'B');

export const RENDER: MetricMeta[] = [
	{
		key: 'engineMs', label: 'RENDER', title: 'Engine render', group: 'render',
		format: ms, unit: 'ms', bands: { good: 50, ni: 100 },
		what: 'Time the engine spent turning your Markdown into slide HTML — parse, component transforms, layout math.',
		why: 'The core cost of every edit; the 140ms preview debounce exists to hide it.',
	},
	{
		key: 'totalMs', label: 'TOTAL', title: 'Edit → paint', group: 'render',
		format: ms, unit: 'ms', bands: { good: 100, ni: 200 },
		what: 'The whole edit→paint span: from render start to the slide appearing on screen.',
		why: 'What you actually feel after an edit — engine, sanitize, and the browser drawing the frame combined.',
	},
	{
		key: 'frameMs', label: 'FRAME', title: 'Frame parse & layout', group: 'render',
		format: ms, unit: 'ms', bands: { good: 16, ni: 50 },
		what: 'How long the browser took to parse and lay out the rendered slide inside the preview frame.',
		why: 'Heavy slides — many nodes, big images — cost more here.',
	},
	{
		key: 'fitMs', label: 'FIT', title: 'Fit to pane', group: 'render',
		format: ms, unit: 'ms', bands: { good: 8, ni: 16 },
		what: 'Scaling the slide to fit the preview pane — a quick layout measure plus a CSS transform.',
		why: 'Should be sub-millisecond; a spike points at layout thrash.',
	},
	{
		key: 'sanitizeMs', label: 'SANITIZE', title: 'HTML sanitize', group: 'render',
		format: ms, unit: 'ms', bands: { good: 5, ni: 15 },
		what: 'Security scrub (DOMPurify) of the slide HTML before it enters the preview frame.',
		why: 'Required to block XSS in the same-origin preview; scales with the HTML size.',
	},
	{
		key: 'srcBytes', label: 'SRC', title: 'Source size', group: 'render',
		format: bytes, unit: bytesUnit,
		what: 'Size of the Markdown being rendered.',
		why: 'The workload — a bigger source generally means a longer render.',
	},
];

export const ALL_METRICS: MetricMeta[] = [...VITALS, ...RUNTIME, ...RENDER];

export const METRIC_BY_KEY: Record<string, MetricMeta> = Object.fromEntries(ALL_METRICS.map((m) => [m.key, m]));

/** Format a value + unit into display text, e.g. "42ms" / "1.2KB". */
export function formatValue(m: MetricMeta, v: number): string {
	const unit = typeof m.unit === 'function' ? m.unit(v) : m.unit;
	return `${m.format(v)}${unit}`;
}
