// THE MODEL CONFIG — every model id the Studio names, read from ONE committed file
// (`models.config.json`). The pickers' curation, the connect-time defaults, the voice ranking and
// the retired list all come from here, so a provider retiring a model is a one-line edit to that
// file plus the normal deploy, and the nightly check (tools/check-model-ids.mjs) reads the same
// file against every provider's live list. No runtime fetch: the app bundles the JSON.
// engineering/decisions/2026-11-09-model-guard-rails.md
//
// Pure and fs-free: the browser, vitest and the Node nightly import it alike (a JSON import
// attribute both Vite and Node understand).

import raw from './models.config.json' with { type: 'json' };

// Any Gemini version from 3 up (`3.1`, `3.8`, a future `4`): the families follow whatever Google
// lists today instead of naming a release that may not exist on a given account.
const MACROS = { gemini3up: String.raw`gemini-(?:[3-9]|\d{2,})(?:\.\d+)*` };

/** A family pattern string → RegExp, with `{macro}` placeholders expanded. */
export const familyRegExp = (src) => new RegExp(String(src).replace(/\{(\w+)\}/g, (m, k) => MACROS[k] ?? m));

const freeze = (o) => Object.freeze(o);

/**
 * Check a raw config's shape. Returns a list of problems (empty = valid). The unit test runs it on
 * the committed file, and the nightly runs it before it asks any provider anything.
 * @param {any} cfg
 * @returns {string[]}
 */
export function validateModelsConfig(cfg) {
	const errs = [];
	const isId = (v) => typeof v === 'string' && v.trim() === v && v.length > 0;
	const ids = (path, v) => {
		if (!Array.isArray(v)) {
			errs.push(`${path}: expected a list of ids`);
			return;
		}
		v.forEach((x, i) => {
			if (!isId(x)) errs.push(`${path}[${i}]: not a model id`);
		});
		const dup = v.find((x, i) => v.indexOf(x) !== i);
		if (dup) errs.push(`${path}: "${dup}" is listed twice`);
	};
	for (const use of ['chat', 'image', 'voice']) {
		const d = cfg?.defaults?.[use];
		if (!d || typeof d !== 'object') errs.push(`defaults.${use}: missing`);
		else for (const [route, id] of Object.entries(d)) if (!isId(id)) errs.push(`defaults.${use}.${route}: not a model id`);
	}
	for (const [use, byProvider] of Object.entries(cfg?.families ?? {})) {
		for (const [provider, list] of Object.entries(byProvider)) {
			ids(`families.${use}.${provider}`, list);
			for (const src of list || []) {
				try {
					familyRegExp(src);
				} catch (e) {
					errs.push(`families.${use}.${provider}: "${src}" is not a valid pattern (${e.message})`);
				}
			}
		}
	}
	const or = cfg?.openrouter ?? {};
	for (const k of ['chatFeatured', 'chatValue', 'voiceFeatured', 'voiceValue', 'voiceQualityRank']) ids(`openrouter.${k}`, or[k]);
	if (!isId(or.voiceQualityFloor)) errs.push('openrouter.voiceQualityFloor: not a model id');
	else if (!or.voiceQualityRank?.includes(or.voiceQualityFloor)) errs.push('openrouter.voiceQualityFloor: must be one of voiceQualityRank');
	for (const [route, list] of Object.entries(cfg?.retired ?? {})) ids(`retired.${route}`, list);
	// A retired id named anywhere else is a contradiction: the hotfix moved half of it.
	// Prefix-aware both ways: retiring `qwen/qwq-32b` while the lens still lists the prefix `qwen/qwq` is the same contradiction.
	const retired = Object.values(cfg?.retired ?? {}).flat();
	for (const { where, id, kind } of configuredIds(cfg)) {
		const hit = retired.find((r) => retiredCovers(r, id) || (kind === 'prefix' && retiredCovers(id, r)));
		if (hit) errs.push(`${where}: "${id}" is also in retired ("${hit}")`);
	}
	return errs;
}

/**
 * Every id or pattern the config names, with where it sits and how the nightly must check it:
 * `exact` (the id must be live), `prefix` (some live id starts with it) or `pattern` (some live id
 * matches the family). `list` names the live list it is checked against.
 * @param {any} cfg
 * @returns {{ where: string, id: string, kind: 'exact' | 'prefix' | 'pattern', list: string }[]}
 */
export function configuredIds(cfg) {
	const out = [];
	const voiceList = (route) => (route === 'openrouter' ? 'openrouter-voice' : route);
	for (const [use, d] of Object.entries(cfg?.defaults ?? {})) {
		for (const [route, id] of Object.entries(d ?? {})) out.push({ where: `defaults.${use}.${route}`, id, kind: 'exact', list: use === 'voice' ? voiceList(route) : route });
	}
	for (const [what, d] of Object.entries(cfg?.pinned ?? {})) {
		for (const [list, id] of Object.entries(d ?? {})) out.push({ where: `pinned.${what}`, id, kind: 'exact', list });
	}
	for (const [use, byProvider] of Object.entries(cfg?.families ?? {})) {
		for (const [provider, list] of Object.entries(byProvider ?? {})) for (const id of list ?? []) out.push({ where: `families.${use}.${provider}`, id, kind: 'pattern', list: provider });
	}
	const or = cfg?.openrouter ?? {};
	for (const k of ['chatFeatured', 'chatValue']) for (const id of or[k] ?? []) out.push({ where: `openrouter.${k}`, id, kind: 'prefix', list: 'openrouter' });
	for (const k of ['voiceFeatured', 'voiceValue']) for (const id of or[k] ?? []) out.push({ where: `openrouter.${k}`, id, kind: 'prefix', list: 'openrouter-voice' });
	for (const id of or.voiceQualityRank ?? []) out.push({ where: 'openrouter.voiceQualityRank', id, kind: 'exact', list: 'openrouter-voice' });
	return out;
}

/** Build the frozen runtime view of a raw config (exported for tests; the app uses `MODELS`). */
export function compileModelsConfig(cfg) {
	const families = (use) => freeze(Object.fromEntries(Object.entries(cfg.families?.[use] ?? {}).map(([p, list]) => [p, list.map(familyRegExp)])));
	const retired = freeze(Object.fromEntries(Object.entries(cfg.retired ?? {}).map(([r, list]) => [r, freeze([...list])])));
	return freeze({
		defaults: freeze({
			chat: freeze({ ...cfg.defaults.chat }),
			image: freeze({ ...cfg.defaults.image }),
			voice: freeze({ ...cfg.defaults.voice }),
		}),
		pinned: freeze({ ...(cfg.pinned ?? {}) }),
		families: freeze({ chat: families('chat'), voice: families('voice') }),
		openrouter: freeze({
			chatFeatured: freeze([...cfg.openrouter.chatFeatured]),
			chatValue: freeze([...cfg.openrouter.chatValue]),
			voiceFeatured: freeze([...cfg.openrouter.voiceFeatured]),
			voiceValue: freeze([...cfg.openrouter.voiceValue]),
			voiceQualityRank: freeze([...cfg.openrouter.voiceQualityRank]),
			voiceQualityFloor: cfg.openrouter.voiceQualityFloor,
		}),
		retired,
	});
}

/** The committed config, compiled. */
export const MODELS = compileModelsConfig(raw);

/**
 * Whether `entry` (a retired id) covers `id`. An entry is matched the way the picker lenses match
 * (`inSet`): the id itself, or an id that continues it after `-`, `:` or `.`. So retiring `qwen/qwq`
 * covers the `qwen/qwq-32b` and `qwen/qwq-32b:free` a selection actually stored, and never
 * `qwen/qwq2`.
 */
export const retiredCovers = (entry, id) => {
	const e = String(entry);
	const s = String(id);
	return s === e || (s.startsWith(e) && /[-:.]/.test(s[e.length]));
};

/**
 * Whether the config retires `model` on `route`. Each route is held to its own list only: an id on
 * a direct key (`claude-sonnet-…`) is never matched against OpenRouter's.
 * @param {string} route a provider id (`openrouter`, `gemini`, …)
 * @param {string} model
 */
export function isConfigRetired(route, model) {
	const list = MODELS.retired[route];
	if (!list?.length || !model) return false;
	return list.some((e) => retiredCovers(e, model));
}
