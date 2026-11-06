// The opt-in script policy (lib/core/subresource-csp.mjs `scriptSources`): a nonce adds a
// script-src that refuses every script without it, and no nonce leaves the policy as it was.
// Lifecycle note §4 (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md).

const assert = require('node:assert/strict');
const { test, before } = require('node:test');

let subresourceCspPolicy;
before(async () => {
	({ subresourceCspPolicy } = await import('../../../lib/core/subresource-csp.mjs'));
});

const NONCE = 'wy_RIsXw0l85v73EclDX2WUl';

test('no nonce: no script-src, so every other caller is unchanged', () => {
	assert.doesNotMatch(subresourceCspPolicy({}), /script-src/);
	assert.doesNotMatch(subresourceCspPolicy({ fontOrigins: ['https://lattice.dev'] }), /script-src/);
});

test('a nonce: nonce + strict-dynamic, the host origin as the fallback, and nothing unsafe', () => {
	const p = subresourceCspPolicy({ scriptNonce: NONCE, fontOrigins: ['https://lattice.dev'] });
	const script = p.split('; ').find((d) => d.startsWith('script-src'));
	assert.equal(script, `script-src 'nonce-${NONCE}' 'strict-dynamic' https://lattice.dev`);
	assert.doesNotMatch(p, /unsafe-inline|unsafe-eval|unsafe-hashes/);
	// The subresource directives are still all there.
	for (const d of ['img-src', 'media-src', 'font-src', 'connect-src', "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(p.includes(d), d);
});

test('a malformed nonce is refused rather than written into the policy', () => {
	for (const bad of ["x' 'unsafe-inline", 'short', 'has space in it ok', "abcdefghijklmnop'"]) {
		assert.doesNotMatch(subresourceCspPolicy({ scriptNonce: bad }), /script-src/, bad);
	}
});

test('an origin that is not exactly an origin does not reach script-src', () => {
	const p = subresourceCspPolicy({ scriptNonce: NONCE, fontOrigins: ['https://a.dev/path', "https://b.dev 'unsafe-inline'", 'https://ok.dev'] });
	const script = p.split('; ').find((d) => d.startsWith('script-src'));
	assert.equal(script, `script-src 'nonce-${NONCE}' 'strict-dynamic' https://ok.dev`);
});

// single-slide-render.ts stamps the nonce on the drawn-library preloads by matching their opening
// `<link rel="preload" as="script"`. If that attribute order ever changes, the nonce silently drops
// and 'strict-dynamic' refuses the preload (the library still loads, slower). Pin the shape here.
test('drawnLibraryPreload opens every tag the way the preview nonce stamp matches', async () => {
	const { drawnLibraryPreload } = await import('../../../lib/plugins/drawn-library.mjs');
	const out = drawnLibraryPreload('https://lattice.dev/lattice-runtime.js');
	const tags = out.match(/<link\b[^>]*>/g) || [];
	assert.ok(tags.length > 0, 'at least one drawn library is preloaded beside a runtime');
	for (const t of tags) assert.ok(t.startsWith('<link rel="preload" as="script"'), t);
	const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../../docs/src/playground/single-slide-render.ts'), 'utf8');
	assert.match(src, /replaceAll\('<link rel="preload" as="script"', '<link rel="preload" as="script"' \+ n\)/);
});
