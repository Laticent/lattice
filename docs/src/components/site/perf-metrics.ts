// Metric metadata — the single source of truth behind the performance overlay's
// rows AND their detail cards. One table so a row's label, formatter, budget
// colour, and its plain-language explanation can never drift apart.
//
// Three groups, mirroring what the overlay measures:
//   • vitals  — Google Core Web Vitals (page load, one-shot).
//   • runtime — live browser health while the overlay is shown.
//   • render  — the Lattice edit→preview pipeline (fed by render-metrics.ts).
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
	/** Regime-specific bands (FRAME/TOTAL): the same metric is judged differently
	 * depending on whether the render was a warm 'patch' or a cold 'write' — a full
	 * rebuild can't meet a single-frame budget, so it gets a realistic one. When the
	 * live regime (passed as the string `extra`) has an entry here, it wins over
	 * `bands` for both the rating AND the detail-card band label. */
	regimeBands?: Partial<Record<'patch' | 'restyle' | 'write', Bands>>;
	/** Override rating (MEM rates by heap fraction, passed as `extra`). */
	rate?: (v: number, extra?: number | string) => Rating | null;
	/** True for a proxy metric (CPU≈) — the detail card flags the approximation. */
	approximate?: boolean;
};

const ms = (v: number) => Math.round(v);
const round3 = (v: number) => v.toFixed(3);

// The regime a render sample carries (mirrors RenderSample.writePath); passed to
// rateMetric/bandLabel as `extra` so FRAME/TOTAL judge + explain the live regime.
export type Regime = 'patch' | 'restyle' | 'write';
/** How each regime reads in the UI — a patch/restyle is a quick in-place swap (body / theme
 * <style>), a write a full rebuild. */
export const REGIME_WORD: Record<Regime, string> = { patch: 'patch', restyle: 'restyle', write: 'rebuild' };

// The bands that actually govern a metric right now: the live regime's bands when it
// has an entry in `regimeBands`, else the metric's default `bands`.
function activeBands(m: MetricMeta, extra?: number | string): Bands | undefined {
	if (m.regimeBands && typeof extra === 'string' && m.regimeBands[extra as Regime]) return m.regimeBands[extra as Regime];
	return m.bands;
}

// Human-readable budget line for the detail card, e.g. "good < 50ms · ok < 100ms".
// Takes the live regime so a FRAME/TOTAL label matches the band its value is rated by.
export function bandLabel(m: MetricMeta, extra?: number | string): string | null {
	const bands = activeBands(m, extra);
	if (!bands) return null;
	const u = typeof m.unit === 'function' ? '' : m.unit;
	const { good, ni, dir = 'lower' } = bands;
	const cmp = dir === 'lower' ? '<' : '>';
	return `good ${cmp} ${good}${u} · ok ${cmp} ${ni}${u}`;
}

export function rateByBands(bands: Bands, v: number): Rating {
	const { good, ni, dir = 'lower' } = bands;
	if (dir === 'higher') return v >= good ? 'good' : v >= ni ? 'needs-improvement' : 'poor';
	return v < good ? 'good' : v < ni ? 'needs-improvement' : 'poor';
}

/** Rating for a metric+value (regime bands, else rate override, else bands, else null). */
export function rateMetric(m: MetricMeta, v: number, extra?: number | string): Rating | null {
	// Regime-specific bands win first (FRAME/TOTAL): a full rebuild judged on a rebuild
	// budget, a patch on the frame budget — never one against the other's yardstick.
	if (m.regimeBands && typeof extra === 'string') {
		const rb = m.regimeBands[extra as Regime];
		if (rb) return rateByBands(rb, v);
	}
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
		format: ms, unit: 'fps',
		// Rate against the display's OWN ceiling (the max FPS seen this session, passed
		// as `extra` = current/ceiling), the way MEM rates against the heap limit — NOT a
		// fixed 60 band. A steady 30 on a 30Hz panel or under a power-saver / background
		// throttle is the device's ceiling, not jank; only a value that falls BELOW that
		// ceiling is a real drop. Falls back to an absolute band before a ceiling is known.
		rate: (v, frac) => {
			if (typeof frac === 'number' && Number.isFinite(frac)) return frac >= 0.9 ? 'good' : frac >= 0.6 ? 'needs-improvement' : 'poor';
			return v >= 50 ? 'good' : v >= 30 ? 'needs-improvement' : 'poor';
		},
		what: 'Frames the browser painted this second.',
		why: 'A steady low value (≈30) usually just means the display refresh rate — or a power-saver / background-tab throttle — capping the frame loop, not jank. Real preview stutter shows in INP and the RENDER group below; the signal here is FPS DROPPING relative to its own ceiling while you interact.',
	},
	{
		key: 'MEM', label: 'MEM', title: 'JavaScript heap', group: 'runtime',
		format: ms, unit: 'MB',
		// Rated by fraction of the heap limit (passed as `extra`), not absolute MB.
		rate: (_v, frac) => (typeof frac !== 'number' || !Number.isFinite(frac) ? null : frac <= 0.5 ? 'good' : frac <= 0.8 ? 'needs-improvement' : 'poor'),
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
		// Judged by regime, same as FRAME below: a normal edit is engine + sanitize +
		// a ~2ms body patch; a restyle swaps the theme <style> in place (the browser still
		// re-parses the sheet, but off the synchronous frame — so TOTAL climbs while FRAME
		// stays low); a full rebuild adds the frame reparse AND a runtime reload + realm mint.
		// restyle bands calibrated from a real 4× capture (median ~186ms, max ~565ms).
		regimeBands: { patch: { good: 100, ni: 200 }, restyle: { good: 250, ni: 600 }, write: { good: 300, ni: 700 } },
		what: 'The whole edit→paint span: from render start to the slide appearing on screen.',
		why: 'What you actually feel after an edit. On a normal edit it’s the engine plus a near-instant in-place patch; on a theme/mode change it’s a restyle (the sheet re-parses off-frame); on a size change it’s a full rebuild (reparse + runtime reload).',
	},
	{
		key: 'frameMs', label: 'FRAME', title: 'Frame parse & layout', group: 'render',
		format: ms, unit: 'ms', bands: { good: 16, ni: 50 },
		// FRAME means different things per render regime, so it is rated against per-regime
		// budgets (perf-diagnosis §C1). A 'patch' swaps only the slide body in place — a true
		// single-frame op. A 'restyle' swaps the theme <style>'s textContent in place: the
		// SYNCHRONOUS frame is still cheap (a real 4× capture puts it median ~23ms, max ~84ms —
		// the browser's sheet reparse lands off-frame, in TOTAL), so its FRAME band sits just
		// above patch, not up at write. A 'write' rebuilds the whole preview document, re-parsing
		// the ~260KB stylesheet + reloading the runtime + minting a fresh realm; inherently
		// tens–hundreds of ms and can NEVER meet a 16ms frame budget — judging it by one was the
		// panel's central lie. Bands roomier still on a slow phone.
		regimeBands: { patch: { good: 16, ni: 50 }, restyle: { good: 60, ni: 180 }, write: { good: 250, ni: 600 } },
		what: 'How the edited slide reached the screen. Normally its body is swapped in place — a patch, near-instant. A theme/mode change is a restyle (still a quick in-place <style> swap); it climbs to a full rebuild only on a size change, when the browser re-parses the whole stylesheet AND reloads the runtime.',
		why: 'A patch skips the stylesheet reparse; a restyle swaps the sheet in place (the reparse lands off-frame, so FRAME stays low and TOTAL carries it); a rebuild pays the reparse plus a runtime reload on-frame. All are one-offs, not something you hit while typing.',
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
	{
		key: 'coalesced', label: 'COALESCE', title: 'Debounce coalescing', group: 'render',
		format: (v) => v, unit: '→1',
		what: 'How many edits (or prop changes) the 140ms preview debounce collapsed into this one render.',
		why: 'Higher means the debounce folded a burst into one pass instead of N — sparing all but one render (each keystroke would otherwise cost a full ~38ms engine pass while you type).',
	},
];

export const ALL_METRICS: MetricMeta[] = [...VITALS, ...RUNTIME, ...RENDER];

export const METRIC_BY_KEY: Record<string, MetricMeta> = Object.fromEntries(ALL_METRICS.map((m) => [m.key, m]));

/** Format a value + unit into display text, e.g. "42ms" / "1.2KB". */
export function formatValue(m: MetricMeta, v: number): string {
	const unit = typeof m.unit === 'function' ? m.unit(v) : m.unit;
	return `${m.format(v)}${unit}`;
}
