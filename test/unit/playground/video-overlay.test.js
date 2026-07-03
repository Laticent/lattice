/**
 * Unit: video-overlay.js `embedSrc` — the allow-listed provider→embed-URL builder
 * behind the parent-hosted playback overlay. The DOM/iframe mounting is verified
 * interactively (and on-device on iOS); here we lock the pure, security-relevant
 * core: only known providers embed, and the src is built from the parsed VIDEO ID,
 * never the raw author href (so a hostile URL can't become an iframe src).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/playground/video-overlay.js');
}

describe('embedSrc', () => {
	test('YouTube (watch / youtu.be / shorts) → nocookie autoplay embed by id (no playsinline → native iOS controls)', async () => {
		const { embedSrc } = await load();
		for (const u of [
			'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
			'https://youtu.be/aqz-KE-bpKQ',
			'https://www.youtube.com/shorts/aqz-KE-bpKQ',
			'https://www.youtube.com/watch?list=x&v=aqz-KE-bpKQ',
		]) {
			assert.equal(embedSrc(u), 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?autoplay=1&rel=0');
		}
	});

	test('Vimeo → player embed by numeric id', async () => {
		const { embedSrc } = await load();
		assert.equal(embedSrc('https://vimeo.com/1084537'), 'https://player.vimeo.com/video/1084537?autoplay=1');
	});

	test('TikTok CANONICAL link → player embed SYNC (id in URL); a short link → null (async path)', async () => {
		const { embedSrc } = await load();
		assert.equal(
			embedSrc('https://www.tiktok.com/@scout2015/video/6718335390845095173'),
			'https://www.tiktok.com/player/v1/6718335390845095173?autoplay=1',
		);
		assert.equal(embedSrc('https://www.tiktok.com/t/ZP8GrtdJH/'), null); // short link → resolveTikTokSrc
	});

	test('Instagram (reel / p / tv / reels) → the frameable /p/{code}/embed/ iframe SYNC (shortcode in URL)', async () => {
		const { embedSrc } = await load();
		// Every post type normalizes to the universal /p/{code}/embed/ path (the URL
		// Instagram's own embed.js builds). The shortcode is in the URL → no fetch.
		for (const u of [
			'https://www.instagram.com/reel/DaStLQkuN3Q',
			'https://www.instagram.com/reel/DaStLQkuN3Q/',
			'https://www.instagram.com/reels/DaStLQkuN3Q/',
			'https://www.instagram.com/p/DaStLQkuN3Q/',
			'https://www.instagram.com/tv/DaStLQkuN3Q/',
			'https://www.instagram.com/reel/DaStLQkuN3Q/?igsh=abc123',
		]) {
			assert.equal(embedSrc(u), 'https://www.instagram.com/p/DaStLQkuN3Q/embed/');
		}
	});

	test('non-embeddable providers and junk → null (fall back to the plain link)', async () => {
		const { embedSrc } = await load();
		// `embedSrc` is the SYNC path (id/shortcode in the URL) — TikTok SHORT links are
		// async (below); these are genuinely non-embeddable.
		assert.equal(embedSrc('https://example.com/watch?v=notreal'), null);
		assert.equal(embedSrc('https://www.instagram.com/someuser/'), null); // a profile, not a post
		assert.equal(embedSrc(''), null);
		assert.equal(embedSrc(null), null);
	});

	test('the src is REBUILT from the parsed id, so no foreign origin/scheme can be smuggled', async () => {
		const { embedSrc } = await load();
		// Even if a hostile href embeds a provider-looking substring, the output is
		// ALWAYS the provider's own nocookie/player origin + a constrained id — never
		// the input's origin. (The id is `[\w-]{11}` / `\d+`, so it can't break out.)
		const out = embedSrc('https://evil.example/#youtube.com/embed/aqz-KE-bpKQ');
		assert.ok(out === null || out.startsWith('https://www.youtube-nocookie.com/embed/'));
		assert.match(embedSrc('https://www.youtube.com/watch?v=aqz-KE-bpKQ'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?/);
		assert.match(embedSrc('https://vimeo.com/1084537'), /^https:\/\/player\.vimeo\.com\/video\/\d+\?/);
		// Instagram: the src is Instagram's OWN origin + a constrained shortcode ([\w-]+),
		// never the input's origin — even when a hostile href carries a look-alike substring.
		assert.match(embedSrc('https://www.instagram.com/reel/DaStLQkuN3Q/'), /^https:\/\/www\.instagram\.com\/p\/[\w-]+\/embed\/$/);
		const ig = embedSrc('https://evil.example/#instagram.com/reel/DaStLQkuN3Q');
		assert.ok(ig === null || ig.startsWith('https://www.instagram.com/p/'));
	});
});

describe('isEmbeddable', () => {
	test('YouTube / Vimeo / TikTok / Instagram (any form) → true; junk → false', async () => {
		const { isEmbeddable } = await load();
		assert.equal(isEmbeddable('https://youtu.be/aqz-KE-bpKQ'), true);
		assert.equal(isEmbeddable('https://vimeo.com/1084537'), true);
		assert.equal(isEmbeddable('https://www.tiktok.com/t/ZP8GrtdJH/'), true); // short link — resolved async
		assert.equal(isEmbeddable('https://www.tiktok.com/@x/video/6718335390845095173'), true);
		assert.equal(isEmbeddable('https://www.instagram.com/reel/DaStLQkuN3Q/'), true); // sync — shortcode in URL
		assert.equal(isEmbeddable('https://example.com/x'), false);
		assert.equal(isEmbeddable(''), false);
	});
});

describe('providerShape', () => {
	test('YouTube / Vimeo → landscape; TikTok / Instagram (vertical) → portrait; junk → landscape', async () => {
		const { providerShape } = await load();
		assert.equal(providerShape('https://youtu.be/aqz-KE-bpKQ'), 'landscape');
		assert.equal(providerShape('https://vimeo.com/1084537'), 'landscape');
		assert.equal(providerShape('https://www.tiktok.com/t/ZP8GrtdJH/'), 'portrait');
		assert.equal(providerShape('https://www.tiktok.com/@x/video/6718335390845095173'), 'portrait');
		assert.equal(providerShape('https://www.instagram.com/reel/DaStLQkuN3Q/'), 'portrait');
		assert.equal(providerShape('https://example.com/x'), 'landscape'); // default
		assert.equal(providerShape(''), 'landscape');
	});
});

describe('resolveTikTokSrc (injected fetch — no network)', () => {
	const oembed = (html) => async () => ({ ok: true, json: async () => ({ html }) });

	test('resolves a SHORT link to the official player, built from the parsed id only', async () => {
		const { resolveTikTokSrc } = await load();
		// The real oEmbed shape: the id lives in `data-video-id` on the blockquote.
		const html = '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@boloscout/video/7656898689901939990" data-video-id="7656898689901939990">…</blockquote>';
		const src = await resolveTikTokSrc('https://www.tiktok.com/t/ZP8GrtdJH/', oembed(html));
		assert.equal(src, 'https://www.tiktok.com/player/v1/7656898689901939990?autoplay=1');
	});

	test('falls back to the /video/{id} in the html if data-video-id is absent', async () => {
		const { resolveTikTokSrc } = await load();
		const src = await resolveTikTokSrc('https://www.tiktok.com/t/x/', oembed('<a href="https://www.tiktok.com/@u/video/123">x</a>'));
		assert.equal(src, 'https://www.tiktok.com/player/v1/123?autoplay=1');
	});

	test('a failed / non-ok / id-less response resolves to null (→ the link fallback)', async () => {
		const { resolveTikTokSrc } = await load();
		assert.equal(await resolveTikTokSrc('https://www.tiktok.com/t/x/', async () => { throw new Error('cors'); }), null);
		assert.equal(await resolveTikTokSrc('https://www.tiktok.com/t/x/', async () => ({ ok: false })), null);
		assert.equal(await resolveTikTokSrc('https://www.tiktok.com/t/x/', oembed('<blockquote>no id here</blockquote>')), null);
	});
});
