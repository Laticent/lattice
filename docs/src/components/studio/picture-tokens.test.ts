import { describe, expect, it, vi } from 'vitest';
import { checkCatalog, DEFAULTS, lostExceptions, pictureCost, SHAPE, summarize, vendorOf, visionIds } from '../../../../tools/probe-picture-tokens.mjs';
import { boundedCatalog, IMAGE_RATE_MAX_MULTIPLE, pictureSurchargeUsd, pictureTokensFor, priceRound, resolvePictureTokens } from './picture-tokens';
import data from './picture-tokens.data.json';

describe('pictureTokensFor — what one picture costs, by model', () => {
	it('charges the default to a model the table does not list, and to no model at all', () => {
		expect(pictureTokensFor('anthropic/claude-sonnet-5.5')).toEqual(data.defaults);
		expect(pictureTokensFor('some-new/model')).toEqual(data.defaults);
		expect(pictureTokensFor(null)).toEqual(data.defaults);
		expect(pictureTokensFor(undefined)).toEqual(data.defaults);
		expect(pictureTokensFor('')).toEqual(data.defaults);
	});
	it('charges a model the table never measured its vendor floor, and a measured one the default', () => {
		const floor = data.vendorFloor.openai;
		expect(floor[1]).toBeGreaterThan(data.defaults.photo);
		expect(pictureTokensFor('openai/gpt-9-not-yet-measured')).toEqual({ thumb: floor[0], photo: floor[1] });
		expect(pictureTokensFor('openai/gpt-9-not-yet-measured:nitro')).toEqual({ thumb: floor[0], photo: floor[1] });
		expect(pictureTokensFor('openai/gpt-5-mini')).toEqual(data.defaults); // measured, under the default
		expect(pictureTokensFor('brand-new-vendor/model')).toEqual(data.defaults); // no readings for the vendor
		for (const id of ['__proto__/x', 'constructor/x', '~constructor/x']) expect(pictureTokensFor(id)).toEqual(data.defaults);
	});
	it('records every model it saw, and floors only a vendor with three readings that beats a default', () => {
		const rows = [
			{ id: 'v/a', t512: 1000, t1568: 3000 },
			{ id: 'v/b', t512: 1100, t1568: 3100 },
			{ id: 'v/c', t512: 1200, t1568: 3200 },
			{ id: 'v/d', t512: 5000, t1568: 20000 },
			{ id: 'w/a', t512: 5000, t1568: 20000 },
			{ id: 'w/b', t512: 5000, t1568: 20000 },
			{ id: 'x/a', t512: 100, t1568: 100 },
			{ id: 'x/b', t512: 100, t1568: 100 },
			{ id: 'x/c', t512: 100, t1568: 100 },
			{ id: 'y/err', t512: 'ERR 429', t1568: 'ERR 429' },
		];
		const out = summarize(rows, '2026-10-14');
		expect(out.measuredIds).toEqual(['v/a', 'v/b', 'v/c', 'v/d', 'w/a', 'w/b', 'x/a', 'x/b', 'x/c']);
		expect(out.unmeasuredIds).toEqual(['y/err']);
		expect(Object.keys(out.vendorFloor)).toEqual(['v']); // w has two readings, x is under the default
		const [vThumb] = (out.vendorFloor as Record<string, number[]>).v;
		expect(vThumb).toBeGreaterThanOrEqual((out.exceptions as Record<string, number[]>)['v/c'][0]);
	});
});

describe('variants and empty aliases', () => {
	it('keys an exception by the base id, so the lookup that strips :free finds it, and keeps the dearer variant', () => {
		const out = summarize([{ id: 'x/y:free', t512: 3000, t1568: 9000 }, { id: 'x/y', t512: 4000, t1568: 8000 }], '2026-10-14');
		expect(Object.keys(out.exceptions)).toEqual(['x/y']);
		expect(out.exceptions['x/y' as keyof typeof out.exceptions]).toEqual([7600, 17100]);
	});
	it('prices an alias whose slug is empty as the alias itself, not as the default', async () => {
		const floor = data.vendorFloor.openai;
		const tokens = await resolvePictureTokens({ openRouterModel: () => '~openai/gpt-6-astra-latest' }, [{ id: '~openai/gpt-6-astra-latest', aliasSlug: '' }]);
		expect(tokens).toEqual({ thumb: floor[0], photo: floor[1] });
	});
});

describe('the no-spend catalog check', () => {
	const table = { measuredIds: ['a/one', 'a/two'], unmeasuredIds: ['a/failed'] };
	it('reports a live vision model the table never saw, and one that is gone, but not one the probe already failed on', () => {
		expect(checkCatalog(table, ['a/one', 'a/failed', 'a/new'])).toEqual({ added: ['a/new'], gone: ['a/two'] });
		expect(checkCatalog(table, ['a/one', 'a/two', 'a/failed'])).toEqual({ added: [], gone: [] });
	});
	it('picks vision models the way the probe does, and finds a vendor without trusting the id', () => {
		const cat = [
			{ id: 'a/vis', architecture: { input_modalities: ['text', 'image'] }, pricing: { prompt: '0.000001' } },
			{ id: 'a/text', architecture: { input_modalities: ['text'] }, pricing: { prompt: '0.000001' } },
			{ id: 'a/vis:batch', architecture: { input_modalities: ['image'] }, pricing: { prompt: '0.000001' } },
			{ id: '~a/alias', architecture: { input_modalities: ['image'] }, pricing: { prompt: '0.000001' } },
		];
		expect(visionIds(cat)).toEqual(['a/vis']);
		expect(vendorOf('anthropic/claude-sonnet-5.5')).toBe('anthropic');
		expect(vendorOf('~anthropic/claude-sonnet-latest')).toBe('anthropic');
		expect(vendorOf('__proto__/x')).toBeNull();
		expect(vendorOf('noslash')).toBeNull();
	});
	it('matches the committed table: no model is both measured and unmeasured, and every exception is measured', () => {
		expect(data.measuredIds.filter((id: string) => data.unmeasuredIds.includes(id))).toEqual([]);
		for (const id of Object.keys(data.exceptions)) expect(data.measuredIds, id).toContain(id);
	});
});

describe('the table, continued', () => {
	it('charges a listed model its measured figure, whatever variant the id carries', () => {
		// Measured 2026-10-13: a 512 px 3:2 picture is 8,500 tokens and a 1568 px one 36,835 on GPT-4o mini; times the 1.9 shape factor.
		expect(pictureTokensFor('openai/gpt-4o-mini')).toEqual({ thumb: 16150, photo: 70000 });
		expect(pictureTokensFor('openai/gpt-4o-mini:nitro')).toEqual({ thumb: 16150, photo: 70000 });
		expect(pictureTokensFor('minimax/minimax-01').photo).toBeGreaterThan(13000);
	});
	it('does not read an object prototype as a model', () => {
		for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(pictureTokensFor(id)).toEqual(data.defaults);
	});
	it('never charges a listed model less than the default at either size', () => {
		for (const [id, [thumb, photo]] of Object.entries(data.exceptions as unknown as Record<string, [number, number]>)) {
			expect(thumb, id).toBeGreaterThanOrEqual(data.defaults.thumb);
			expect(photo, id).toBeGreaterThanOrEqual(data.defaults.photo);
			expect(thumb > data.defaults.thumb || photo > data.defaults.photo, `${id} is listed but costs no more than the default`).toBe(true);
		}
	});
	it('keeps the probe tool, the data file and the module on one set of defaults', () => {
		expect(data.defaults).toEqual(DEFAULTS);
		expect(data.shape).toBe(SHAPE);
	});
	it('covers every measured model: the default is at or above the 90th percentile, and exceptions take the rest', () => {
		// Claude (250 / 2,131) and GPT-5 mini (212 / 1,941) sit under the default. Gemini 2.5 (1,290 / 1,806) does not: a thin strip
		// costs it 1.86x the 3:2 picture, so the 1.9 shape factor lifts its thumbnail over the default (measured 2026-10-14).
		for (const id of ['anthropic/claude-sonnet-5.5', 'openai/gpt-5-mini']) expect(pictureTokensFor(id)).toEqual(data.defaults);
		expect(pictureTokensFor('google/gemini-2.5-flash-lite')).toEqual({ thumb: 2500, photo: 4450 });
		expect(data.p50[0]).toBeLessThan(data.defaults.thumb);
		expect(data.p90[0] * data.shape).toBeLessThanOrEqual(data.defaults.thumb);
		expect(data.p90[1] * data.shape).toBeLessThanOrEqual(data.defaults.photo);
	});
});

describe('resolvePictureTokens — a ~…-latest alias is priced as the model it points at', () => {
	const catalog = [
		{ id: '~openai/gpt-6-astra-latest', aliasSlug: 'openai/gpt-6-astra-pro' },
		{ id: '~anthropic/claude-sonnet-latest', aliasSlug: 'anthropic/claude-sonnet-5.5' },
		{ id: 'openai/gpt-4o-mini' },
	];
	const model = (id: string, cat: typeof catalog | Error = catalog) => ({ openRouterModel: () => id, listOpenRouterModels: async () => (cat instanceof Error ? Promise.reject(cat) : cat) });
	it('looks up the alias target, so an alias for an exception model is charged the exception', async () => {
		expect(await resolvePictureTokens(model('~openai/gpt-6-astra-latest'))).toEqual(pictureTokensFor('openai/gpt-6-astra-pro'));
		expect((await resolvePictureTokens(model('~openai/gpt-6-astra-latest'))).photo).toBeGreaterThan(data.defaults.photo);
	});
	it('charges the default to the shipped default model (an alias whose target is under the default)', async () => {
		expect(await resolvePictureTokens(model('~anthropic/claude-sonnet-latest'))).toEqual(data.defaults);
	});
	it('prices a plain id without the catalog, and falls back to the default when the catalog is unreadable or stale', async () => {
		expect(await resolvePictureTokens(model('openai/gpt-4o-mini', new Error('offline')))).toEqual(pictureTokensFor('openai/gpt-4o-mini'));
		// An alias the catalog cannot resolve is an unmeasured model: it pays its vendor's floor.
		const openaiFloor = { thumb: data.vendorFloor.openai[0], photo: data.vendorFloor.openai[1] };
		expect(await resolvePictureTokens(model('~openai/gpt-6-astra-latest', new Error('offline')))).toEqual(openaiFloor);
		// A catalog cached before the aliasSlug field existed.
		expect(await resolvePictureTokens(model('~openai/gpt-6-astra-latest', [{ id: '~openai/gpt-6-astra-latest' }]))).toEqual(openaiFloor);
		expect(await resolvePictureTokens({})).toEqual(data.defaults);
	});
});

describe('summarize — the probe tool’s pure half', () => {
	it('lists only a model that costs more than a default at either size, after the shape factor, rounded up to 50', () => {
		const out = summarize(
			[
				{ id: 'a/small', t512: 250, t1568: 2131 },
				{ id: 'b/big-thumb', t512: 1362, t1568: 2000 },
				{ id: 'c/big-photo', t512: 200, t1568: 3343 },
				{ id: 'd/at-default', t512: 1130, t1568: 2300 }, // 1,130 x 1.9 = 2,147: under the thumb default, 2,300 x 1.9 = 4,370 under the photo one
			],
			'2026-10-13',
		);
		expect(out.exceptions).toEqual({ 'b/big-thumb': [2600, 4450], 'c/big-photo': [2150, 6400] });
		expect(out.models).toBe(4);
		expect(out.shape).toBe(1.9);
	});
	it('treats an error, a timeout and a negative reading as unmeasured, never as an exception', () => {
		const out = summarize(
			[
				{ id: 'a/ok', t512: 250, t1568: 2131 },
				{ id: 'b/429', t512: 'ERR 429', t1568: 'ERR 429' },
				{ id: 'c/timeout', t512: 22027, t1568: 'ERR TimeoutError' },
				{ id: 'd/negative', t512: -47, t1568: 1082 },
			],
			'2026-10-13',
		);
		expect(out.models).toBe(1);
		expect(out.unmeasured).toBe(3);
		expect(out.exceptions).toEqual({});
	});
	it('writes a finite file for an empty probe, never a null', () => {
		const out = summarize([], '2026-10-13');
		expect(JSON.parse(JSON.stringify(out)).max).toEqual([0, 0]);
	});
});

describe('lostExceptions — a rerun must not quietly send a listed model back to the default', () => {
	const previous = { exceptions: { 'openai/gpt-4o-mini': [13200, 57100], 'amazon/nova-lite-v1': [2850, 4450] } };
	it('names a listed model the new run did not measure (an error, a timeout, or no row)', () => {
		const rows = [
			{ id: 'openai/gpt-4o-mini', t512: 'ERR 429', t1568: 'ERR 429' },
			{ id: 'anthropic/claude-sonnet-5.5', t512: 250, t1568: 2131 },
		];
		expect(lostExceptions(previous, rows)).toEqual(['openai/gpt-4o-mini', 'amazon/nova-lite-v1']);
	});
	it('is empty when every listed model was measured again, and when there is no previous table', () => {
		const rows = [
			{ id: 'openai/gpt-4o-mini', t512: 8500, t1568: 36835 },
			{ id: 'amazon/nova-lite-v1', t512: 1826, t1568: 1826 },
		];
		expect(lostExceptions(previous, rows)).toEqual([]);
		expect(lostExceptions(undefined, rows)).toEqual([]);
	});
	it('protects every model the committed table lists', () => {
		const everyListed = Object.keys(data.exceptions).map((id) => ({ id, t512: 1, t1568: 1 }));
		expect(lostExceptions(data, everyListed)).toEqual([]);
		expect(lostExceptions(data, [])).toEqual(Object.keys(data.exceptions));
	});
});

describe('pictureSurchargeUsd — a model that lists its own image price', () => {
	const flat = (tokens: number, promptPerM: number) => (tokens * promptPerM) / 1e6;
	const group = (count: number, tokens = 1300) => [{ count, tokens }];
	it('adds nothing without an image price, so a model without one is charged the token figure as before', () => {
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: null }, group(5))).toBe(0);
		expect(pictureSurchargeUsd({ promptPerM: 3 }, group(5))).toBe(0); // a catalog cached before the field existed
		expect(pictureSurchargeUsd(null, group(5))).toBe(0);
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 9 }, group(0))).toBe(0);
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 9 }, [])).toBe(0);
	});
	it('adds nothing when the image price equals the prompt price (all 18 models that list one)', () => {
		expect(pictureSurchargeUsd({ promptPerM: 0.75, imagePerM: 0.75 }, group(5))).toBe(0);
	});
	it('charges the gap when the image rate is a multiple of the prompt rate', () => {
		// $3/M prompt, $9/M image: 1,300 tokens at $9/M is $0.0117 a picture, against $0.0039 at the prompt rate.
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 9 }, group(2))).toBeCloseTo(2 * (flat(1300, 9) - flat(1300, 3)), 9);
	});
	it('prices each group at its own token figure: thumbnails and attached photos', () => {
		const price = { promptPerM: 3, imagePerM: 9 };
		const both = pictureSurchargeUsd(price, [
			{ count: 2, tokens: 1300 },
			{ count: 1, tokens: 2400 },
		]);
		expect(both).toBeCloseTo(2 * (flat(1300, 9) - flat(1300, 3)) + (flat(2400, 9) - flat(2400, 3)), 9);
	});
	it('reads a price more than 10x the prompt rate as dollars per picture', () => {
		// $1.5/M prompt, image $4,800/M (raw $0.0048): 3,200x the prompt rate, so dollars per picture, not a token rate.
		expect(pictureSurchargeUsd({ promptPerM: 1.5, imagePerM: 4800 }, group(3))).toBeCloseTo(3 * (0.0048 - flat(1300, 1.5)), 9);
	});
	it('never prices a picture below the token figure, and reads a free-prompt model’s image price as dollars', () => {
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 0.5 }, group(2))).toBe(0);
		expect(pictureSurchargeUsd({ promptPerM: 0, imagePerM: 2000 }, group(1))).toBeCloseTo(0.002, 9);
	});
	it('sits on the boundary: ten times the prompt rate is still a token rate', () => {
		expect(IMAGE_RATE_MAX_MULTIPLE).toBe(10);
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 30 }, group(1))).toBeCloseTo(flat(1300, 30) - flat(1300, 3), 9);
		// Past it the number is dollars: $0.000031 a picture, below the $0.0039 token figure, so that stands.
		expect(pictureSurchargeUsd({ promptPerM: 3, imagePerM: 31 }, group(1))).toBe(0);
	});
});

describe('priceRound — one round’s pictures: thumbnails and the author’s attached photos', () => {
	const cost = { thumb: 2000, photo: 3600 };
	it('prices a thumbnail at the thumb figure and an attached photo at the photo figure', () => {
		expect(priceRound(cost, null, 3, 0).tokens).toBe(3 * 2000);
		expect(priceRound(cost, null, 1, 1).tokens).toBe(3600);
	});
	it('prices a round that holds both: the attached photos, then every other picture as a thumbnail', () => {
		// Two attached photos and two view_asset thumbnails in the same conversation.
		expect(priceRound(cost, null, 4, 2).tokens).toBe(2 * 3600 + 2 * 2000);
	});
	it('never counts an attached photo that is not in the round, or a negative picture', () => {
		expect(priceRound(cost, null, 1, 4).tokens).toBe(3600); // one picture in the conversation, however many the author attached
		expect(priceRound(cost, null, 0, 2).tokens).toBe(0);
		expect(priceRound(cost, null, -1, 0).tokens).toBe(0);
	});
	it('adds the model’s image-price surcharge per kind, in dollars', () => {
		const price = { promptPerM: 3, imagePerM: 9 };
		const both = priceRound(cost, price, 3, 1);
		expect(both.usd).toBeCloseTo(2 * ((2000 * 6) / 1e6) + (3600 * 6) / 1e6, 9);
		expect(priceRound(cost, { promptPerM: 3, imagePerM: null }, 3, 1).usd).toBe(0);
	});
});

describe('boundedCatalog — a stalled catalog never holds a turn', () => {
	it('returns the catalog, an empty list for a missing, failing or absent one, and never rejects', async () => {
		expect(await boundedCatalog({ listOpenRouterModels: async () => [{ id: 'a/b' }] })).toEqual([{ id: 'a/b' }]);
		expect(await boundedCatalog({ listOpenRouterModels: async () => Promise.reject(new Error('offline')) })).toEqual([]);
		expect(await boundedCatalog({})).toEqual([]);
	});
	it('gives up after the bound, and leaves no timer behind either way', async () => {
		vi.useFakeTimers();
		try {
			const stalled = boundedCatalog({ listOpenRouterModels: () => new Promise(() => {}) }, 4000);
			await vi.advanceTimersByTimeAsync(4001);
			expect(await stalled).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
			await boundedCatalog({ listOpenRouterModels: async () => [{ id: 'x/y' }] }, 4000);
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('pictureCost — the probe tool’s per-picture difference', () => {
	it('subtracts the baseline, keeps an error an error, and refuses a missing baseline', () => {
		expect(pictureCost(16, 1306)).toBe(1290);
		expect(pictureCost(16, 'ERR 429')).toBe('ERR 429');
		expect(pictureCost('ERR 429', 18000)).toBe('ERR no-baseline');
		expect(pictureCost(Number.NaN, 18000)).toBe('ERR no-baseline');
	});
});
