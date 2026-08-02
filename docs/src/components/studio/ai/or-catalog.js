// The OpenRouter catalog — curated model lists + pure formatting/grouping helpers.
//
// One source of truth for the model picker, shared by the Drawing Board settings
// (vanilla DOM, drawing-board-settings.js) and the Studio Workspace (React,
// WorkspaceSheet.tsx). The curated lists used to live inside the Drawing Board
// widget; extracting them here keeps the two surfaces from drifting (HARD RULE
// #1/#15 — reuse, don't reinvent). Everything here is pure (no DOM, no fetch) so
// both consumers and the unit tests can import it freely.
//
// A catalog entry is the shape architect-model.js `listOpenRouterModels()` yields:
//   { id, name, promptPerM, completionPerM, contextLength, maxOutput, vision }
// where the per-million prices are already normalized (null = "pricing varies").

// Curated by FAMILY PREFIX, not a pinned id, so a version bump (claude-sonnet-4
// → 4.6 → 5) stays featured without an edit AND a retired id can't strand the
// list (the old pinned `claude-3.5-sonnet`/`claude-3.5-haiku` 404'd — #614).
// `inSet` prefix-matches these against the LIVE catalog; the connect-time default
// in architect-model.js is the `~*-latest` alias of the Sonnet family.
export const OR_FEATURED = [
	'anthropic/claude-sonnet', 'anthropic/claude-opus',
	'openai/gpt-5', 'openai/gpt-4o',
	'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
];

// Strong performers that punch above their price (the "Value" lens) — family
// prefixes for the same rot-proofing.
export const OR_VALUE = [
	'anthropic/claude-haiku',
	'deepseek/deepseek-r1', 'deepseek/deepseek-chat',
	'meta-llama/llama-3.3-70b-instruct',
	'qwen/qwen-2.5-72b-instruct', 'qwen/qwq',
	'google/gemini-2.5-flash', 'openai/gpt-5-mini', 'openai/gpt-4o-mini',
];

// The picker's four lenses, in display order. [key, label] — the label is the tab.
export const OR_VIEWS = [
	['featured', 'Featured'],
	['value', 'Value'],
	['free', 'Free'],
	['all', 'All'],
];

// id matches a curated entry exactly or by prefix (so a versioned id like
// "anthropic/claude-sonnet-4:beta" still counts as featured).
export const inSet = (set, id) => set.some((f) => id === f || String(id).startsWith(f));

// OpenRouter ":free" rows report both prices as 0.
export const isFreeModel = (m) => m.promptPerM === 0 && m.completionPerM === 0;

// The vendor segment of an id ("anthropic/claude-sonnet-4" → "anthropic"), with
// separators softened so it reads as a group heading.
export const vendorOf = (id) => (String(id).split('/')[0] || 'other').replace(/[-_]/g, ' ');

// Drop the redundant "Vendor: " prefix from a catalog name — we group by vendor,
// so the row only needs the model part ("Anthropic: Claude Opus 4" → "Claude Opus 4").
export const shortName = (m) => (m.name || m.id).replace(/^[^:]+:\s*/, '');

// A per-million price: "free" at 0, 3-dp under $1, else 2-dp. Empty for unknown.
export function fmtPrice(n) {
	if (n == null || Number.isNaN(n)) return '';
	if (n === 0) return 'free';
	return n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;
}

// The price half of a row's meta line. Variable/router models (price === null)
// read "pricing varies" rather than a nonsense "$-1000000".
export const priceLabel = (m) => (m.promptPerM != null
	? `${fmtPrice(m.promptPerM)}/M in · ${fmtPrice(m.completionPerM)}/M out`
	: 'pricing varies');

// A context window as a compact "1M" / "200K" / "512".
export const fmtCtx = (n) => {
	if (!n) return '';
	if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
	if (n >= 1000) return `${Math.round(n / 1000)}K`;
	return String(n);
};

// The full meta line under a model name: context window (when known) + pricing.
export const metaLabel = (m) => `${m.contextLength ? `${fmtCtx(m.contextLength)} ctx · ` : ''}${priceLabel(m)}`;

// A hover/title string with the precise figures the compact meta line rounds.
export const rowTitle = (m) => [
	m.contextLength ? `Context ${m.contextLength.toLocaleString()} tokens` : null,
	m.maxOutput ? `Max output ${m.maxOutput.toLocaleString()}` : null,
	m.vision ? 'Accepts images' : null,
].filter(Boolean).join(' · ');

// A USD figure for the spend readout: 3-dp for sub-dollar amounts (so $0.046 is
// legible), 2-dp otherwise.
export const fmtUSD = (n) => `$${(Number(n) || 0).toFixed(Number(n) > 0 && Number(n) < 1 ? 3 : 2)}`;

// A token count as "1.2M" / "9.8K" / "512".
export const fmtTokens = (n) => {
	n = Number(n) || 0;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`;
	return String(Math.round(n));
};

// Filter the catalog for a view ('featured' | 'value' | 'free' | 'all') and a
// free-text query (matched against name + id, case-insensitive). Pure — returns a
// new array, original untouched.
export function filterModels(models, view, query) {
	const q = (query || '').trim().toLowerCase();
	let items = (models || []).filter((m) => `${m.name || ''} ${m.id}`.toLowerCase().includes(q));
	if (view === 'featured') items = items.filter((m) => inSet(OR_FEATURED, m.id));
	else if (view === 'value') items = items.filter((m) => inSet(OR_VALUE, m.id));
	else if (view === 'free') items = items.filter(isFreeModel);
	return items;
}

// Group catalog entries by vendor and return them sorted — vendors alphabetically,
// models by short name within each — as an array of { vendor, models } so a
// renderer can emit a heading + rows per group without re-sorting.
export function groupByVendor(items) {
	const groups = {};
	for (const m of items || []) (groups[vendorOf(m.id)] ||= []).push(m);
	return Object.keys(groups).sort().map((vendor) => ({
		vendor,
		models: groups[vendor].slice().sort((x, y) => shortName(x).localeCompare(shortName(y))),
	}));
}

// The empty-state message for a view that filtered everything out.
export const emptyMessage = (view) => (view === 'all' ? 'No models match.'
	: view === 'free' ? 'No free models in the catalog right now.'
		: `No ${view} models match — try All.`);
