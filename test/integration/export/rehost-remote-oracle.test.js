/**
 * The Reading view's deck sheet fetches nothing from the web, measured in a real browser.
 *
 * `scopeReHostedCss` (lib/export/player-prune.js) builds the sheet the Studio's Reading view puts in its own top-level
 * document, which carries no subresource policy. It drops every declaration `namesRemoteResource` says names a remote
 * resource. This loads a corpus of remote spellings (an escaped `url(` name, a backslash host, a tab in the scheme, an
 * `image-set()` string, a custom property read through `var()`) in headless Chromium, from a page on one loopback
 * origin, each address a distinct file on ANOTHER loopback origin standing in for the web, and reads the second
 * server's log:
 *
 *   1. CONTROL: the corpus unpruned. Every case must fetch, or it proves nothing; a case that does not is a test bug.
 *   2. The real `scopeReHostedCss` output: 0 requests.
 *   3. The failing arm: `REHOST_ORACLE_LEGACY=1` drops with the regex the prune had before Segno R4
 *      (tools/segno-legacy/names-remote-resource.js), and the escaped spellings fetch.
 *
 * `REHOST_ORACLE_ENGINE=webkit|firefox` drives Playwright's WebKit or Gecko instead (#23).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const csstree = require('css-tree');
const { scopeReHostedCss, namesRemoteResource } = require('../../../lib/export/player-prune.js');
const legacy = require('../../../tools/segno-legacy/names-remote-resource.js');

async function launch() {
	const engine = process.env.REHOST_ORACLE_ENGINE;
	if (!engine || engine === 'chromium') return { kind: 'puppeteer', browser: await require('puppeteer').launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] }) };
	const pw = require(require.resolve('playwright', { paths: [path.join(__dirname, '../../../docs/node_modules'), __dirname] }));
	return { kind: 'playwright', browser: await pw[engine].launch() };
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function serve(handler) {
	const server = http.createServer(handler);
	return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// The address of file `n` on the web origin, spelled each way a browser reads as a web fetch.
const SPELLINGS = {
	plain: (o, n) => `${o}/${n}.png`,
	'protocol-relative': (o, n) => `${o.replace(/^http:/, '')}/${n}.png`,
	'backslash-host': (o, n) => `${o.replace(/^http:\/\//, '\\\\\\\\')}/${n}.png`, // CSS `\\\\host`: the value `\\host`
	'tab-in-scheme': (o, n) => `ht\\9 tp${o.slice(4)}/${n}.png`, // CSS `\9 ` is a tab, which the URL parser removes
	'upper-scheme': (o, n) => `HTTP${o.slice(4)}/${n}.png`,
};
// Where the address sits. Each wrapper gets its own element and property, so the cascade keeps every case.
const WRAPPERS = {
	url: (a) => `background-image:url(${a})`,
	'url-dq': (a) => `background-image:url("${a}")`,
	'esc-url': (a) => `background-image:u\\72l(${a})`,
	'esc-url-hex': (a) => `background-image:\\75 rl(${a})`,
	'esc-URL': (a) => `background-image:\\55 RL("${a}")`,
	'image-set': (a) => `background-image:image-set("${a}" 1x)`,
	'image-set-url': (a) => `background-image:image-set(u\\72l(${a}) 1x)`,
	'custom-property': (a) => `--img:u\\72l(${a});background-image:var(--img)`,
	'list-style': (a) => `list-style-image:u\\72l(${a})`,
	// A nested rule with no `&` (relaxed nesting), which css-tree keeps as raw text (the red team, 2026-11-04).
	'nested-rule': (a) => `color:red;b{background-image:url(${a})}`,
};

function corpus(origin) {
	const cases = [];
	for (const [s, spell] of Object.entries(SPELLINGS)) {
		for (const [w, wrap] of Object.entries(WRAPPERS)) {
			const n = `c${cases.length}`;
			cases.push({ n, name: `${w} / ${s}`, decl: wrap(spell(origin, n)) });
		}
	}
	return cases;
}

const ROOT = '.st-read-article';
const WITHIN = '.lp-figure';
const pageHtml = (cases, css) =>
	`<!doctype html><meta charset="utf-8"><style>${css}</style><article class="st-read-article">${cases.map((c) => `<figure class="lp-figure"><ul><li class="${c.n}">x<b style="display:inline-block;width:9px;height:9px"></b></li></ul></figure>`).join('')}</article>`;
const rawSheet = (cases, keep) => cases.filter((c) => keep(c)).map((c) => `${ROOT} ${WITHIN} .${c.n}{${c.decl}}`).join('\n');
// The legacy arm: every declaration the frozen regex keeps, judged as the prune judges it (on css-tree's re-serialized value).
const keptBy = (fn) => (c) => {
	let kept = true;
	const ast = csstree.parse(`.x{${c.decl}}`);
	csstree.walk(ast, { visit: 'Declaration', enter(d) { if (fn(csstree.generate(d.value))) kept = false; } });
	// A nested rule css-tree cannot parse is no declaration: the new kernel drops it whole, the old one kept it.
	if (fn === namesRemoteResource) csstree.walk(ast, { visit: 'Block', enter(b) { b.children.forEach((n) => { if (n.type === 'Raw') kept = false; }); } });
	return kept;
};

async function fetchedBy(env, pageOrigin, html, hits) {
	hits.length = 0;
	const page = await env.browser.newPage();
	try {
		pageOrigin.html = html;
		await page.goto(`${pageOrigin.url}/`, { waitUntil: env.kind === 'puppeteer' ? 'networkidle0' : 'networkidle' });
		// Paint every element so a lazily decoded image is requested.
		await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		await new Promise((r) => setTimeout(r, 300));
	} finally {
		await page.close();
	}
	return new Set(hits);
}

test('the Reading view sheet fetches none of the corpus from the web', { timeout: 120_000 }, async () => {
	const hits = [];
	const web = await serve((req, res) => {
		hits.push((req.url || '').slice(1).replace(/\.png.*$/, ''));
		res.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG);
	});
	const app = { html: '' };
	const appServer = await serve((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(app.html));
	app.url = `http://localhost:${appServer.address().port}`;
	const origin = `http://127.0.0.1:${web.address().port}`;
	const cases = corpus(origin);
	const env = await launch();
	try {
		// 1. CONTROL.
		const control = await fetchedBy(env, app, pageHtml(cases, rawSheet(cases, () => true)), hits);
		// Chromium fetches every case. Another engine may skip a spelling (Gecko 142 does not read `\\host` as `//host`
		// in CSS); those are listed, and the rest must still be most of the corpus.
		const silent = cases.filter((c) => !control.has(c.n)).map((c) => c.name);
		if (!process.env.REHOST_ORACLE_ENGINE || process.env.REHOST_ORACLE_ENGINE === 'chromium') assert.deepEqual(silent, [], 'a case the browser never fetches unpruned proves nothing');
		else if (silent.length) console.log(`rehost oracle: ${process.env.REHOST_ORACLE_ENGINE} never fetches ${silent.length} case(s) unpruned: ${silent.join(', ')}`);
		assert.ok(control.size >= cases.length * 0.75, `the control fetched only ${control.size} of ${cases.length}`);

		if (process.env.REHOST_ORACLE_LEGACY) {
			// 3. The failing arm.
			const got = await fetchedBy(env, app, pageHtml(cases, rawSheet(cases, keptBy(legacy.namesRemoteResource))), hits);
			const leaked = cases.filter((c) => got.has(c.n)).map((c) => c.name);
			assert.deepEqual(leaked, [], `the frozen regex let ${leaked.length} of ${cases.length} cases fetch`);
			return;
		}
		// 2a. Every declaration the reader keeps, unfenced.
		const kept = await fetchedBy(env, app, pageHtml(cases, rawSheet(cases, keptBy(namesRemoteResource))), hits);
		assert.deepEqual(cases.filter((c) => kept.has(c.n)).map((c) => c.name), []);
		// 2b. The real kernel's whole sheet: the prune, the fence, css-tree's re-serialization.
		const { css, applied } = scopeReHostedCss(rawSheet(cases, () => true).replaceAll(`${ROOT} ${WITHIN} `, ''), () => true, { root: ROOT, within: WITHIN, colorScheme: 'light' });
		assert.equal(applied, true);
		const scoped = await fetchedBy(env, app, pageHtml(cases, css), hits);
		assert.deepEqual(cases.filter((c) => scoped.has(c.n)).map((c) => c.name), [], `scopeReHostedCss let these fetch: ${[...scoped].join(', ')}`);
		console.log(`rehost oracle (${process.env.REHOST_ORACLE_ENGINE || 'chromium'}): control fetched ${control.size} of ${cases.length}; the pruned sheet fetched 0`);
	} finally {
		await env.browser.close();
		web.close();
		appServer.close();
	}
});
