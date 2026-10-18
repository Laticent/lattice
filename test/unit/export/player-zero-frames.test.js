/**
 * The player refuses a document it cannot read (engineering/decisions/2026-10-16-player-as-library-audit.md
 * §10, §11.3). The red team fed a reveal.js-shaped document to `buildPlayerHtml`, and it returned a
 * 63,201-byte player with zero slides, no error and no warning. `assemblePlayer` now throws, and
 * the CLI's existing catch reports it ("--player assembly failed").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerHtml } = require('../../../lib/export/html-player.js');

const reveal = `<!doctype html><html><head><meta charset="utf-8"><title>Foreign</title><style>.reveal{color:red}</style></head>
<body><div class="reveal"><div class="slides"><section><h1>One</h1></section><section><h1>Two</h1></section></div></div></body></html>`;

test('a document with no Lattice slides is refused, not exported as an empty player', async () => {
	await assert.rejects(buildPlayerHtml({ docHtml: reveal, source: '', now: 0 }), /no Lattice slides/);
});

test('one Lattice slide is enough', async () => {
	const doc = reveal.replace('<section><h1>One</h1></section>', '<section data-lattice-slide="1" id="1"><h1>One</h1></section>');
	const { html } = await buildPlayerHtml({ docHtml: doc, source: '# One\n', now: 0 });
	assert.match(html, /data-lattice-slide="1"/);
});
