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
		assert.equal(embedSrc('https://vimeo.com/76979871'), 'https://player.vimeo.com/video/76979871?autoplay=1');
	});

	test('non-embeddable providers and junk → null (fall back to the plain link)', async () => {
		const { embedSrc } = await load();
		assert.equal(embedSrc('https://www.tiktok.com/@x/video/6718335390845095173'), null);
		assert.equal(embedSrc('https://www.instagram.com/reel/CxYzAbCdEfg/'), null);
		assert.equal(embedSrc('https://example.com/watch?v=notreal'), null);
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
		assert.match(embedSrc('https://vimeo.com/76979871'), /^https:\/\/player\.vimeo\.com\/video\/\d+\?/);
	});
});
