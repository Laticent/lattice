/**
 * `namesRemoteResource` (lib/export/player-prune.js) drops a deck declaration naming a remote resource before
 * `scopeReHostedCss` hands the sheet to the Studio's Reading view, a document with no subresource policy. Since
 * Segno R4 it reads the value with `cssRefSpans` and judges each address with `isRemoteRef`. The regex it replaced
 * is frozen in tools/segno-legacy/names-remote-resource.js.
 *
 * Two arms: the picked spellings the regex missed (the failing arm: the frozen copy keeps each one), and every
 * declaration of every tracked stylesheet, where the two may differ only by the new one dropping more, and only
 * on the entries listed below.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const csstree = require('css-tree');
const { namesRemoteResource, scopeReHostedCss } = require('../../../lib/export/player-prune.js');
const legacy = require('../../../tools/segno-legacy/names-remote-resource.js');

const ROOT = path.join(__dirname, '../../..');

// Each one fetches from the web in Chromium from a top-level `<style>` (test/integration/export/rehost-remote-oracle.test.js).
const MISSED = [
	'u\\72l(https://x.test/a.png)',
	'\\75rl(https://x.test/a.png)',
	'\\55 RL(https://x.test/a.png)',
	'url(\\\\\\\\x.test/a.png)',
	'url(/\\\\x.test/a.png)',
	'url(ht\\9tps://x.test/a.png)',
	'image-set("\\\\\\\\x.test/a.png" 1x)', // CSS `"\\\\x…"`: the value `\\x…`, which the URL parser reads as `//x…`
	'image-set("ht\\9tps://x.test/a.png" 1x)',
];
// Each one is the regex's own catch, and must stay caught.
const CAUGHT = [
	'url(https://x.test/a.png)',
	'url( "https://x.test/a.png" )',
	"url('//x.test/a.png')",
	'image-set("https://x.test/a.png" 1x)',
	'url(HTTPS://x.test/a.png)',
	// Any scheme, where the string is an address (the inversion review, 2026-11-04): `chrome-extension://` probes a
	// reader's extensions, and the desktop app's `asset://` and `tauri://` fetch.
	'image-set("chrome-extension://abc/x.png" 1x)',
	'image-set("asset://localhost/x.png" 1x)',
	'url("tauri://localhost/x.png" crossorigin(anonymous))',
	'url("chrome-extension://a/x',
	'"asset://localhost/x.png"',
	'"file:///a.png"',
	'"//"',
];
// Each one must survive: the engine's own marks, a relative or fragment address, and prose.
const KEPT = [
	"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>\")",
	"url(data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>)",
	'url(a.png)',
	'url(../themes/x.svg)',
	'url(#clip)',
	'"Note: read the http://x.test link"',
	'"Note: x"',
	'"12:30"',
	'"Inter", sans-serif',
	'"mailto:a@x.test"',
	// Prose that names a scheme or holds a backslash (the checker and the red team, 2026-11-04).
	'"File: "',
	'"Blob: x"',
	'"ftp: x"',
	'"wss: live"',
	'"\\\\"',
	'"\\\\ "',
	'counter(x) "\\\\"',
];

describe('namesRemoteResource reads with cssRefSpans', () => {
	for (const v of MISSED) {
		test(`drops ${v}, which the regex kept`, () => {
			assert.equal(namesRemoteResource(v), true);
			assert.equal(legacy.namesRemoteResource(v), false, 'the frozen regex now catches it: this arm no longer proves anything');
		});
	}
	for (const v of CAUGHT) test(`still drops ${v}`, () => assert.equal(namesRemoteResource(v), true));
	for (const v of KEPT) test(`keeps ${v}`, () => assert.equal(namesRemoteResource(v), false));

	test('a nested rule css-tree cannot parse is dropped, not passed through unfenced', () => {
		const { css } = scopeReHostedCss('.a{color:red;.b{background:url(https://x.test/n.png)}+ p{color:blue}}', () => true, { root: '.r', within: '.lp-figure' });
		assert.match(css, /color:red/);
		assert.doesNotMatch(css, /x\.test|color:blue/);
	});

	test('an escaped at-rule name is the at-rule: @\\70roperty, @\\66ont-face and @\\6b eyframes are dropped', () => {
		const { css } = scopeReHostedCss('@\\70roperty --bg{syntax:"<color>";inherits:false;initial-value:red}@\\66ont-face{font-family:AppSans;src:local(a)}@\\6b eyframes spin{to{opacity:0}}.c{color:red}', () => true, { root: '.r', within: '.lp-figure' });
		assert.match(css, /\.c:where/);
		assert.doesNotMatch(css, /--bg|AppSans|spin/);
	});

	test('the escaped spelling no longer survives scopeReHostedCss', () => {
		const { css, applied } = scopeReHostedCss('.x{color:red;background:u\\72l(https://x.test/a.png)}', () => true, { root: '.r', within: '.lp-figure' });
		assert.equal(applied, true);
		assert.match(css, /color:red/);
		assert.doesNotMatch(css, /x\.test/);
	});
});

// The only declarations in the tree the two read differently. Each is a drop the regex missed.
const KNOWN_DIFFERENCES = new Set(['spec/conformance/theme/script-url.css --x url(javascript:alert(1))']);

describe('on every tracked stylesheet, the reader drops what the regex dropped', () => {
	test('and differs only by dropping more, where listed', () => {
		const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
		// The built bundle too, when the install built it (it carries the inlined mark tokens).
		for (const f of ['dist/lattice.css', 'dist/lattice-min.css']) if (fs.existsSync(path.join(ROOT, f))) files.push(f);
		let decls = 0;
		const seen = [];
		for (const f of files) {
			let ast;
			try {
				ast = csstree.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
			} catch {
				continue;
			}
			csstree.walk(ast, {
				visit: 'Declaration',
				enter(d) {
					const text = csstree.generate(d.value);
					decls++;
					const was = legacy.namesRemoteResource(text);
					const now = namesRemoteResource(text);
					if (was === now) return;
					assert.equal(now, true, `${f}: the reader keeps ${d.property}:${text}, which the regex dropped`);
					seen.push(`${f} ${d.property}${text}`);
				},
			});
		}
		assert.ok(decls > 10_000, `read only ${decls} declarations: the sheets were not found`);
		for (const s of seen) assert.ok(KNOWN_DIFFERENCES.has(s), `an unlisted difference: ${s}`);
		assert.equal(seen.length, KNOWN_DIFFERENCES.size, `a listed difference is gone: ${[...KNOWN_DIFFERENCES].filter((k) => !seen.includes(k)).join(', ')}`);
	});
});
