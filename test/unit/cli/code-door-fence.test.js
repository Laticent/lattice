/**
 * The FENCE half of the code door, the parts that need no browser (plugin-system §9 decisions 3
 * and 10): finding a plugin's fences in the engine's HTML (lib/packages/code-door-fence.mjs), what
 * a renderer is handed, the capture and substitute hooks through the REAL engine, the gate for a
 * plugin's one script (code-shape.mjs `refusePluginCode`), and consent under `plugin/<name>`.
 * The door run through the real sandbox is test/integration/export/plugin-fence-door.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fenceBlocks, claimedFences, fenceInput, fenceKey, fenceMarkup, fenceId, replaceFences, withFenceNote, captureFences, substituteFences, decodeFenceBody, MAX_FENCE_CHARS, MAX_FENCES_PER_PASS } = require('../../../lib/packages/code-door-fence.mjs');
const { refusePluginCode, workerScript, PLUGIN_DATA_CONTRIBUTIONS, pluginConsentText } = require('../../../lib/packages/code-shape.mjs');
const { ENGINE_CLAIMS, untrustedCodePackages } = require('../../../lib/packages/code-door.js');
const { codeDigest, pluginDigest, isTrusted, grantTrust } = require('../../../lib/packages/trust.js');
const crypto = require('node:crypto');
const engine = require('../../../lib/engine');

const pre = (lang, text) => `<pre><code class="language-${lang}">${text}</code></pre>`;
const names = (...n) => new Set(n);

describe('finding a fence in the engine’s HTML', () => {
  test('a plain block of a name the door runs is a fence, with its text as the author wrote it', () => {
    const html = `<section>${pre('gantt', 'a &lt; b &amp;amp; c &quot;d&quot;\n')}</section>`;
    const [b] = fenceBlocks(html, names('gantt'));
    assert.equal(b.name, 'gantt');
    assert.equal(b.body, 'a < b &amp; c "d"\n', 'markdown-it escapes four characters, and those four come back');
    assert.equal(html.slice(b.start, b.end), pre('gantt', 'a &lt; b &amp;amp; c &quot;d&quot;\n'));
  });

  test('another language, a highlighted block, a block with a tag inside, and a bare <pre> are left alone', () => {
    const html = [
      pre('js', 'x'),
      '<pre><code class="language-gantt"><span class="hljs-k">a</span></code></pre>',
      '<pre class="x"><code class="hljs">no language</code></pre>',
      '<pre>just text</pre>',
      '<pre> <code class="language-gantt">a gap between them</code></pre>',
    ].join('\n');
    assert.deepEqual(fenceBlocks(html, names('gantt')), []);
  });

  test('a fence quoted inside a comment or a <style> is not a fence', () => {
    const html = `<!-- ${pre('gantt', 'in a comment')} --><style>${pre('gantt', 'in css')}</style>${pre('gantt', 'real')}`;
    assert.deepEqual(fenceBlocks(html, names('gantt')).map((b) => b.body), ['real']);
  });

  test('a fence of a plugin the deck did not load (data-lattice-off) stays the code block it is', () => {
    const html = `<pre data-lattice-off="gantt-plugin"><code class="language-gantt">x</code></pre>${pre('gantt', 'y')}`;
    assert.deepEqual(fenceBlocks(html, names('gantt')).map((b) => b.body), ['y']);
  });

  test('every fence of every name, in document order', () => {
    const html = pre('gantt', '1') + pre('map', '2') + pre('gantt', '3');
    assert.deepEqual(fenceBlocks(html, names('gantt', 'map')).map((b) => `${b.name}:${b.body}`), ['gantt:1', 'map:2', 'gantt:3']);
    assert.deepEqual(fenceBlocks(html, names()), [], 'no names, no fences');
  });

  test('a class list that holds the language among others still finds it', () => {
    assert.equal(fenceBlocks('<pre><code class="hljs language-gantt">x</code></pre>', names('gantt')).length, 1);
  });

  test('it is linear: many fences and a long run of unclosed <pre><code are both fast', () => {
    const many = pre('gantt', 'row\n').repeat(20000);
    let t = Date.now();
    assert.equal(fenceBlocks(many, names('gantt')).length, 20000);
    assert.ok(Date.now() - t < 2000, `20,000 fences took ${Date.now() - t} ms`);
    const hostile = '<pre><code class="language-gantt">'.repeat(20000);
    t = Date.now();
    assert.deepEqual(fenceBlocks(hostile, names('gantt')), []);
    assert.ok(Date.now() - t < 2000, `20,000 unclosed openers took ${Date.now() - t} ms`);
  });

  test('decodeFenceBody reads `&amp;lt;` as the author’s `&lt;`', () => {
    assert.equal(decodeFenceBody('&amp;lt;'), '&lt;');
  });
});

describe('what a renderer is handed', () => {
  const claim = { pkg: 'gantt-plugin', fence: 'gantt', id: 'gantt-plugin-0123abcd-0', body: 'a\nb', slide: 0, block: '<pre>…</pre>', start: 1, end: 2, i: 0 };

  test('the fence’s text and one id, and nothing else', () => {
    assert.deepEqual(fenceInput(claim), { body: 'a\nb', id: 'gantt-plugin-0123abcd-0' });
  });

  test('an id starts with the plugin’s name, names the fence’s TEXT and not its place, and counts repeats', () => {
    const seen = new Map();
    const a = fenceId('gantt-plugin', '', 'rows', seen);
    const b = fenceId('gantt-plugin', '', 'rows', seen);
    const c = fenceId('gantt-plugin', '', 'other', seen);
    assert.match(a, /^gantt-plugin-[0-9a-f]{8}-0$/);
    assert.equal(b, a.replace(/-0$/, '-1'), 'the same text again is the next one');
    assert.notEqual(c.slice(0, -2), a.slice(0, -2), 'other text, other name');
    assert.equal(fenceId('gantt-plugin', '', 'rows', new Map()), a, 'a fresh render gives the same id, wherever the fence sits');
  });

  test('an id holds only id-safe characters whatever the render prefix is', () => {
    assert.match(fenceId('gantt-plugin', 'lat r1"<>', 'x', new Map()), /^gantt-plugin-[A-Za-z0-9_-]+$/);
  });

  test('a fence’s key changes with the plugin, its code’s digest, its id and its text', () => {
    const k = fenceKey(claim, 'sha');
    assert.notEqual(k, fenceKey({ ...claim, pkg: 'other' }, 'sha'));
    assert.notEqual(k, fenceKey(claim, 'sha2'));
    assert.notEqual(k, fenceKey({ ...claim, id: 'x' }, 'sha'));
    assert.notEqual(k, fenceKey({ ...claim, body: 'c' }, 'sha'));
  });

  test('the root element is the door’s, naming the plugin, and the name is escaped', () => {
    assert.equal(fenceMarkup('gantt-plugin', '<b>x</b>'), '<div data-lattice-plugin="gantt-plugin"><b>x</b></div>');
    assert.doesNotMatch(fenceMarkup('a"><script>', ''), /<script/i);
  });

  test('a failure keeps the code block and says why, on one escaped line', () => {
    const out = withFenceNote(pre('gantt', 'x'), 'gantt-plugin', 'it threw <b>\nboom');
    assert.ok(out.startsWith(pre('gantt', 'x')), 'the author’s block is still there');
    assert.match(out, /<p data-package-error="gantt-plugin" role="note">The plugin “gantt-plugin” did not draw this block: it threw &lt;b&gt;\?boom<\/p>$/);
  });
});

describe('through the real engine: capture, then substitute', () => {
  const md = '---\ntheme: indaco\n---\n\n## One\n\n```gantt\nA 1\n```\n\n---\n\n## Two\n\n```js\nconst x = 1;\n```\n\n```gantt\nB <2>\n```\n\n---\n\n<!-- _class: tally -->\n\n## Claimed\n\n```gantt\nC 3\n```\n';
  const fences = new Map([['gantt', 'gantt-plugin']]);
  const slides = { names: ['tally'], engineClaims: ENGINE_CLAIMS };
  const render = (src, door) => engine.createEngine().render(src, 'indaco', { codeFences: door }).html;

  test('a render with no door is byte-identical to one with a capture door', () => {
    assert.equal(render(md, captureFences(fences, slides)), engine.createEngine().render(md, 'indaco').html);
  });

  test('capture finds each fence with its slide and id; the claimed slide’s fence is the package’s', () => {
    const cap = captureFences(fences, slides);
    render(md, cap);
    assert.deepEqual(cap.claims.map((c) => [c.pkg, c.fence, c.slide, c.body]), [
      ['gantt-plugin', 'gantt', 0, 'A 1\n'],
      ['gantt-plugin', 'gantt', 1, 'B <2>\n'],
    ]);
    assert.equal(new Set(cap.claims.map((c) => c.id)).size, 2);
  });

  test('inserting a slide before a fence does not change its id, so its remembered result still holds', () => {
    const idsOf = (src) => {
      const cap = captureFences(fences, slides);
      render(src, cap);
      return cap.claims.map((c) => c.id);
    };
    const before = idsOf(md);
    const after = idsOf(md.replace('## One', '## Zero\n\n---\n\n## One'));
    assert.deepEqual(after, before);
  });

  test('substitute puts each result at its fence and leaves every other block alone', () => {
    const cap = captureFences(fences, slides);
    render(md, cap);
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, `<p>drawn ${c.id}</p>`)]));
    const html = render(md, substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), slides));
    for (const c of cap.claims) assert.match(html, new RegExp(`<div data-lattice-plugin="gantt-plugin"><p>drawn ${c.id}</p></div>`));
    assert.match(html, /language-js/, 'a js fence is still code');
    assert.equal((html.match(/language-gantt/g) || []).length, 1, 'only the claimed slide’s fence is left, untouched');
  });

  test('a fence the first render never saw keeps its block with a note, never a stranger’s output', () => {
    const html = render(md, substituteFences(fences, new Map(), new Map([['gantt-plugin', 'SHA']]), slides));
    assert.match(html, /language-gantt[\s\S]*?data-package-error="gantt-plugin"[\s\S]*?changed between the two renders/);
  });

  test('the door leaves a fence’s text plain, so a grammar that knows the name cannot decide whether the plugin draws it', () => {
    // `tex` is a highlight.js language: with a grammar, a body with TeX in it came back as <span>s and was skipped.
    const src = '---\ntheme: indaco\n---\n\n## T\n\n```tex\n\\frac{a}{b} % c\n```\n\n```tex\nplain\n```\n';
    const none = captureFences(new Map(), slides);
    assert.match(render(src, none), /hljs-/, 'without the door, the grammar colors the first block');
    const cap = captureFences(new Map([['tex', 'tex-plugin']]), slides);
    render(src, cap);
    assert.equal(cap.claims.length, 2, 'with it, both blocks are the plugin’s');
  });

  test('a fence on a slide a LATER pass rebuilds is still drawn, and the pass never reads its output', () => {
    // The `video` pass turns a bullet into a poster address; the door runs after it (code-fences.js).
    const src = '---\ntheme: indaco\n---\n\n<!-- _class: video -->\n\n## Clip\n\n- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n```gantt\nx\n```\n';
    const cap = captureFences(fences, slides);
    render(src, cap);
    const evil = '<ul><li>https://evil.example/leak?d=BODY <code>poster</code></li></ul>';
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, evil)]));
    const html = render(src, substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), slides));
    assert.match(html, /data-lattice-plugin="gantt-plugin"/, 'the fence on a video slide was claimed and drawn');
    assert.doesNotMatch(html.replace(/<div data-lattice-plugin[\s\S]*?<\/div>/, ''), /evil\.example/, 'no pass after the door turned the output into an address');
  });

  test('two panes of one slide, each with a fence, get two ids; the same text twice gets two', () => {
    const src = '---\ntheme: indaco\n---\n\n## Host\n\n<!-- panes: 50/50 -->\n<!-- pane: bullets -->\n\n```gantt\nsame\n```\n\n<!-- pane: bullets -->\n\n```gantt\nsame\n```\n';
    const cap = captureFences(fences, slides);
    render(src, cap);
    assert.equal(cap.claims.length, 2);
    assert.equal(new Set(cap.claims.map((c) => c.id)).size, 2, `ids: ${cap.claims.map((c) => c.id)}`);
    assert.deepEqual([...new Set(cap.claims.map((c) => c.slide))], [0], 'a pane’s fence is at its host slide’s position');
    // The second render agrees with the first: every fence finds its result, none a "changed" note.
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, `<p>${c.id}</p>`)]));
    const html = render(src, substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), slides));
    assert.doesNotMatch(html, /changed between the two renders/);
    for (const c of cap.claims) assert.ok(html.includes(`<p>${c.id}</p>`));
  });

  test('a fence too long to hand over is named and stays a code block', () => {
    const big = `---\ntheme: indaco\n---\n\n## Big\n\n\`\`\`gantt\n${'x'.repeat(MAX_FENCE_CHARS + 1)}\n\`\`\`\n`;
    const cap = captureFences(fences, slides);
    render(big, cap);
    assert.equal(cap.claims.length, 0);
    assert.deepEqual(cap.tooLong, [{ pkg: 'gantt-plugin', slide: 0 }]);
  });

  test('a fence whose text would end its own block in HTML round-trips exactly', () => {
    const nasty = '</code></pre><script>alert(1)</script>&amp;&lt;';
    const src = `---\ntheme: indaco\n---\n\n## Nasty\n\n\`\`\`\`gantt\n${nasty}\n\`\`\`\`\n`;
    const cap = captureFences(fences, slides);
    render(src, cap);
    assert.equal(cap.claims.length, 1);
    assert.equal(cap.claims[0].body, `${nasty}\n`);
  });

  test('replaceFences applies several fences of one section in order', () => {
    const html = `<section>${pre('gantt', '1')}<p>x</p>${pre('gantt', '2')}</section>`;
    const { claims } = claimedFences(html, { fences, slideIndex: (n) => n });
    assert.equal(replaceFences(html, claims, ['<A>', '<BB>']), '<section><A><p>x</p><BB></section>');
  });
});

describe('a deck that asks for too much', () => {
  const fences = new Map([['gantt', 'gantt-plugin']]);
  const many = (n) => `<section>${pre('gantt', 'row\n').repeat(n)}</section>`;

  test('one pass claims at most MAX_FENCES_PER_PASS, counts the rest, and the same ones in both renders', () => {
    const r = claimedFences(many(MAX_FENCES_PER_PASS + 50), { fences, slideIndex: (n) => n });
    assert.equal(r.claims.length, MAX_FENCES_PER_PASS);
    assert.equal(r.tooMany, 50);
    assert.equal(new Set(r.claims.map((c) => c.id)).size, MAX_FENCES_PER_PASS, 'every claim has its own id');
  });

  test('claiming and splicing thousands of fences in one slide is linear, not quadratic', () => {
    const html = many(20000);
    const t0 = Date.now();
    const found = fenceBlocks(html, new Set(['gantt']));
    const claims = found.map((b) => ({ i: 0, start: b.start, end: b.end }));
    const out = replaceFences(`<section>${html.slice(9, -10)}</section>`, claims.map((c) => ({ ...c, i: 0 })), claims.map(() => '<x/>'));
    assert.ok(out.length < html.length);
    assert.ok(Date.now() - t0 < 3000, `20,000 fences found and spliced in ${Date.now() - t0} ms (it was 50 s)`);
  });

  test('a key is small however large the plugin’s code is: it holds the digest, not the code', () => {
    const claim = { pkg: 'p', id: 'p-1', body: 'x' };
    assert.ok(fenceKey(claim, crypto.createHash('sha256').update('x'.repeat(1_000_000)).digest('hex')).length < 200);
  });
});

describe('the gate for a plugin’s one script', () => {
  const code = 'function render(f){return "<p>"+f.body+"</p>"}\nexport { render as default };';
  const plugin = (over = {}, manifest = {}) => ({
    type: 'plugin',
    name: 'gantt-plugin',
    manifest: { name: 'gantt-plugin', type: 'plugin', contributes: { fences: { gantt: { body: 'text' } }, styles: true }, ...manifest },
    roles: { 'render.js': 'gantt-plugin.render.js' },
    files: { 'gantt-plugin.render.js': code },
    ...over,
  });

  test('accepts one fence, its CSS and its render.js in the export form', () => {
    assert.equal(refusePluginCode(plugin()), null);
  });

  test('refuses anything that is not a plugin, by name', () => {
    assert.match(refusePluginCode({ ...plugin(), type: 'component' }), /component package, not a plugin/);
  });

  test('refuses the contribution points that run code outside the sandbox, naming each', () => {
    const why = refusePluginCode(plugin({}, { contributes: { fences: { gantt: {} }, syntax: {}, hydrate: {}, bake: {} } }));
    assert.match(why, /syntax, hydrate, bake/);
    assert.deepEqual([...PLUGIN_DATA_CONTRIBUTIONS], ['fences', 'styles', 'diagnostics']);
  });

  test('refuses no fence and two fences: the renderer has no way to be told which it was handed', () => {
    assert.match(refusePluginCode(plugin({}, { contributes: { styles: true } })), /declares 0 fences/);
    assert.match(refusePluginCode(plugin({}, { contributes: { fences: { a: {}, b: {} } } })), /declares 2 fences/);
  });

  test('refuses a script that is not <name>.render.js, a fences list that is an array, and a package with no files', () => {
    assert.match(refusePluginCode(plugin({ roles: { 'render.js': 'evil.js' }, files: { 'evil.js': code } })), /a plugin's one script is gantt-plugin\.render\.js/);
    assert.match(refusePluginCode(plugin({}, { contributes: { fences: ['gantt'] } })), /declares 0 fences/);
    assert.match(refusePluginCode({ type: 'plugin', name: 'x', manifest: {} }), /carries no files/);
  });

  test('refuses a missing render.js, a second script, an oversize one and one not in the export form', () => {
    assert.match(refusePluginCode(plugin({ roles: {} })), /no render\.js/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': code, 'extra.mjs': 'x' } })), /script other than gantt-plugin\.render\.js \(extra\.mjs\)/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': `${code}\n//${'x'.repeat(1_000_001)}` } })), /past the 1,000,000/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': 'export default function(){}' } })), /does not end in `export \{ name as default \}`/);
  });
});

describe('the worker for a fence renderer', () => {
  const code = 'function render(f){return f.body}\nexport { render as default };';

  test('slide mode is the same bytes it was before fences existed (a digest taken from the commit before)', () => {
    const slideCode = 'function t(s){return s.html}\nexport { t as default };';
    assert.equal(crypto.createHash('sha256').update(workerScript(slideCode)).digest('hex'), '1e607320d2fe78abf3dc49aaae6d3f603b45ebf2f04713c3625093e69b488eea');
    assert.equal(workerScript(slideCode), workerScript(slideCode, { fence: false }));
  });

  test('fence mode hands the renderer { body, id } frozen, and refuses anything else', () => {
    const script = workerScript(code, { fence: true });
    assert.notEqual(script, workerScript(code));
    assert.match(script, /a fence is a text body and an id/);
    assert.match(script, /__freeze\(\{body:f\.body,id:f\.id\}\)/);
    assert.doesNotMatch(script, /facts|baseUrl|idPrefix/, 'a fence renderer is never handed a slide');
  });
});

describe('consent under plugin/<name>', () => {
  const pkg = (fence = 'gantt', code = 'export { x as default };') => ({ roles: { 'render.js': 'r.js' }, manifest: { contributes: { fences: { [fence]: {} } } }, files: { 'r.js': code } });

  test('a plugin’s digest covers its render.js AND the fence it owns, and nothing the renderer cannot change', () => {
    assert.match(codeDigest(pkg()), /^[0-9a-f]{64}$/);
    assert.equal(codeDigest(pkg()), pluginDigest('export { x as default };', 'gantt'));
    assert.notEqual(codeDigest(pkg('gantt')), codeDigest(pkg('map')), 'editing the manifest’s fence alone asks again');
    assert.notEqual(codeDigest(pkg('gantt', 'a')), codeDigest(pkg('gantt', 'b')));
    assert.equal(pluginConsentText('c', 'f'), 'lattice-plugin-fence:f\u0000c');
    assert.notEqual(codeDigest({ roles: { 'transform.js': 't.js' }, files: { 't.js': 'same' } }), codeDigest(pkg('gantt', 'same')), 'a component and a plugin with the same text do not share a digest');
  });

  test('an approval of a component named x grants nothing to a plugin named x, and the reverse', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fence-trust-')), 'trust.json');
    const sha = codeDigest(pkg());
    grantTrust('component', 'x', sha, { file });
    assert.equal(isTrusted('component', 'x', sha, file), true);
    assert.equal(isTrusted('plugin', 'x', sha, file), false);
    grantTrust('plugin', 'y', sha, { file });
    assert.equal(isTrusted('component', 'y', sha, file), false);
  });

  test('the door lists a plugin whose code is not approved, by its type', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fence-trust-')), 'trust.json');
    const sha = codeDigest(pkg());
    assert.deepEqual(untrustedCodePackages([{ name: 'x', type: 'plugin', sha256: sha }], { file }), [{ name: 'x', type: 'plugin', sha256: sha }]);
    grantTrust('plugin', 'x', sha, { file });
    assert.deepEqual(untrustedCodePackages([{ name: 'x', type: 'plugin', sha256: sha }], { file }), []);
    assert.equal(untrustedCodePackages([{ name: 'x', sha256: sha }], { file }).length, 1, 'a component of that name is still unapproved');
  });
});
