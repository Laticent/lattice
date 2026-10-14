import data from './picture-tokens.data.json';

/** What the budget gate charges for one picture, in prompt tokens: the agent's own 512 px thumbnail
 *  (`view_asset`), and a 1568 px attached photo. The token count follows the model, not the file:
 *  a 512 px 3:2 picture is 212 tokens on GPT-5 mini, 250 on Claude, 1,290 on Gemini 2.5 and 8,500 on
 *  GPT-4o mini. Measured per model by `tools/probe-picture-tokens.mjs` into `picture-tokens.data.json`,
 *  times a 1.9 shape factor (a square costs up to 1.51x a 3:2 one, and a thin strip up to 1.86x on Gemini 2.5).
 *  The file lists only the models that cost more than the default, because the default covers the rest:
 *  it sits at or above the 90th percentile of the 192 models measured on 2026-10-13. */
export type PictureTokens = { thumb: number; photo: number };

const DEFAULT: PictureTokens = data.defaults;
const EXCEPTIONS = data.exceptions as unknown as Record<string, [number, number]>;
const MEASURED = new Set<string>(data.measuredIds.map((id: string) => id.replace(/:[^/]+$/, '')));
const VENDOR_FLOOR = data.vendorFloor as unknown as Record<string, [number, number]>;

/** The id OpenRouter lists a model under: no `:variant` suffix (`:free`, `:nitro`). A `~` alias is not one; see resolvePictureTokens. */
function catalogId(id: string): string {
	return id.replace(/:[^/]+$/, '');
}

/** The slice of the model the lookup needs: its id, and the catalog that says where a `~…-latest` alias points. */
type CatalogModel = { id: string; vision?: boolean; aliasSlug?: string | null };
type PictureModel = { openRouterModel?: () => string; listOpenRouterModels?: () => Promise<CatalogModel[]> };

/** The model catalog, or [] when it cannot be had within `ms`: a stalled fetch must not hold a chat turn, and a failed one
 *  is the same as an empty one to every caller (no price, no alias target, no vision flag). The timer is always cleared. */
export async function boundedCatalog(model: PictureModel, ms = 4000): Promise<CatalogModel[]> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([Promise.resolve(model.listOpenRouterModels?.()).then((c) => c ?? []), new Promise<CatalogModel[]>((r) => (timer = setTimeout(() => r([]), ms)))]);
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

/** Tokens one picture costs on the model in use. A `~anthropic/claude-sonnet-latest` style alias is not a model the
 *  table measured; the catalog says which model it points at today (`alias_target.slug`), and that one is looked up.
 *  A catalog that cannot be had in time, or that predates the field, falls back to the alias id itself: the default.
 *  A caller that already holds the catalog passes it, so one turn waits for it once. */
export async function resolvePictureTokens(model: PictureModel, catalog?: CatalogModel[]): Promise<PictureTokens> {
	const id = model.openRouterModel?.();
	if (!id) return DEFAULT;
	if (!id.startsWith('~')) return pictureTokensFor(id);
	const hit = (catalog ?? (await boundedCatalog(model))).find((m) => m.id === id);
	return pictureTokensFor(typeof hit?.aliasSlug === 'string' && hit.aliasSlug ? hit.aliasSlug : id);
}

/** Tokens one picture costs on `modelId`. A measured model is charged its figure, or the default when it sits under it. A model the
 *  table has never measured (one released since, or one whose probe failed) is charged its vendor's 90th percentile where the
 *  vendor has three or more readings, since a vendor tends to keep one image scheme, and the default otherwise.
 *  `probe-picture-tokens.mjs --check` lists the live models the table has not seen. */
export function pictureTokensFor(modelId: string | null | undefined): PictureTokens {
	const key = modelId ? catalogId(modelId) : '';
	if (!key) return DEFAULT;
	if (Object.hasOwn(EXCEPTIONS, key)) return { thumb: EXCEPTIONS[key][0], photo: EXCEPTIONS[key][1] };
	if (MEASURED.has(key)) return DEFAULT;
	const vendor = key.replace(/^~/, '').split('/')[0];
	const floor = vendor && Object.hasOwn(VENDOR_FLOOR, vendor) ? VENDOR_FLOOR[vendor] : null;
	return floor ? { thumb: floor[0], photo: floor[1] } : DEFAULT;
}

/** Models that list `pricing.image` price it as a per-token rate equal to their prompt rate (all 18 of the
 *  212 vision models checked on 2026-10-13), but OpenRouter does not say so, and an older listing was
 *  dollars per picture. A rate within this multiple of the prompt rate is read as per-token; a larger one,
 *  or any price on a free-prompt model, as dollars per picture (read per-token it would price one picture
 *  in dollars). Above it the gate picks a possible under-charge over a certain absurd over-charge. */
export const IMAGE_RATE_MAX_MULTIPLE = 10;

/** What the budget gate adds, in USD, for pictures the model prices itself: for each group of `count`
 *  pictures at `tokens` each, the gap between that and `tokens` at the prompt rate, never negative. Zero
 *  unless the model lists `pricing.image`. */
export function pictureSurchargeUsd(price: { promptPerM: number | null; imagePerM?: number | null } | null, groups: { count: number; tokens: number }[]): number {
	const image = price?.imagePerM;
	if (!price || image == null || !(image > 0)) return 0;
	const prompt = price.promptPerM ?? 0;
	let usd = 0;
	for (const { count, tokens } of groups) {
		if (!(count > 0)) continue;
		const flat = (tokens * prompt) / 1e6;
		const priced = prompt > 0 && image <= prompt * IMAGE_RATE_MAX_MULTIPLE ? (tokens * image) / 1e6 : image / 1e6;
		usd += count * Math.max(0, priced - flat);
	}
	return usd;
}

/** What one round's pictures add to the gate: `images` pictures in the conversation, of which `attached` are the
 *  author's photos (they ride the last user message and are re-sent every round); every other one is a
 *  `view_asset` thumbnail. Tokens at the model's figure for each kind, plus the model's own image-price surcharge. */
export function priceRound(cost: PictureTokens, price: { promptPerM: number | null; imagePerM?: number | null } | null, images: number, attached: number): { tokens: number; usd: number } {
	const photos = Math.max(0, Math.min(images, attached));
	const groups = [
		{ count: Math.max(0, images) - photos, tokens: cost.thumb },
		{ count: photos, tokens: cost.photo },
	];
	return { tokens: groups.reduce((n, g) => n + g.count * g.tokens, 0), usd: pictureSurchargeUsd(price, groups) };
}
