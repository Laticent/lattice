/**
 * The door for code packages, the parts that need no browser: the registry slot and its hook
 * (lib/transformers/code-packages.js), the shared kernel (lib/packages/code-door-core.mjs), the
 * CLI's capture and substitute hooks (lib/packages/code-door.js), consent (lib/packages/trust.js),
 * the gate (lib/packages/gate.js refuseCode), the attribute rule (lib/core/door-attr.mjs
 * doorFilterAttr) and the OS layer's user (lib/core/os-sandbox.js). The door run through the real
 * CLI, with a network log, is test/integration/export/code-package-door.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { claimedSlides, spliced, withFailureNote, printableLine, engineClaimsOf } = require('../../../lib/packages/code-door-core.mjs');
const { ENGINE_CLAIMS, untrustedCodePackages, captureHook, substituteHook } = require('../../../lib/packages/code-door.js');
const { codeDigest, isTrusted, grantTrust, revokeTrust, readTrust, trustFile } = require('../../../lib/packages/trust.js');
const { refuseCode } = require('../../../lib/packages/gate.js');
const { unprivilegedUser } = require('../../../lib/core/os-sandbox.js');
const { cssRefTargets, doorFilterAttr, handedOf } = require('../../../lib/core/door-attr.mjs');
const engine = require('../../../lib/engine');

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `lattice-door-${p}-`));
const pkg = (code, name = 'tally', extra = {}) => ({
  type: 'component',
  name,
  roles: { 'transform.js': `${name}.transform.js` },
  files: { [`${name}.transform.js`]: code, ...extra },
  code: true,
});
const deck = (...classes) => `<article>${classes.map((c) => `<section class="${c}"><p>${c}</p></section>`).join('\n')}</article>`;

describe('the registry slot', () => {
  const md = '---\ntheme: indaco\n---\n\n<!-- _class: tally -->\n\n## Three wins\n\n- 3\n\n---\n\n<!-- _class: bar -->\n\n## Bars\n\n- A `1`\n- B `2`\n';

  test('without a hook the render is byte-identical', () => {
    const e = engine.createEngine();
    assert.equal(e.render(md, 'indaco', { codePackages: undefined }).html, e.render(md, 'indaco').html);
  });

  test('the hook sees the deck after the charts and before the masthead lift, with positions and the id prefix', () => {
    const seen = [];
    engine.createEngine().render(md, 'indaco', {
      codePackages: (html, ctx) => {
        seen.push({ html, index: ctx.slideIndex(1), idPrefix: ctx.idPrefix });
        return html;
      },
    });
    assert.equal(seen.length, 1);
    assert.match(seen[0].html, /class="bar[^"]*chart-frame/, 'the bar chart has already been drawn');
    assert.doesNotMatch(seen[0].html.slice(0, seen[0].html.indexOf('</section>')), /cell-masthead/, 'the masthead lift has not run yet');
    assert.equal(seen[0].index, 1);
    assert.equal(seen[0].idPrefix, '');
  });

  test('what the hook returns is what the rest of the registry frames', () => {
    const out = engine.createEngine().render(md, 'indaco', { codePackages: (html) => html.replace('<li>3</li>', '<li>DRAWN</li>') }).html;
    assert.match(out, /<li>DRAWN<\/li>/);
    assert.match(out, /cell-masthead[\s\S]*Three wins/, 'the masthead lift still frames the slide');
  });

  test('it runs inside a pane, at the host slide’s position', () => {
    const paned = '---\ntheme: indaco\n---\n\n## Intro\n\n---\n\n## Host\n\n<!-- panes: 50/50 -->\n<!-- pane: list -->\n\n- one\n\n<!-- pane: table -->\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const calls = [];
    engine.createEngine().render(paned, 'indaco', {
      codePackages: (html, ctx) => {
        calls.push({ sections: (html.match(/<section\b/g) || []).length, index: ctx.slideIndex(0) });
        return html;
      },
    });
    const panes = calls.filter((c) => c.sections === 1);
    assert.ok(panes.length >= 2, `each pane renders through the slot (${JSON.stringify(calls)})`);
    assert.ok(panes.every((c) => c.index === 1), `a pane is handed its host slide’s position (${JSON.stringify(calls)})`);
  });
});

describe('routing: the chart dispatch first-match rule', () => {
  test('the engine claims come from the shipped components that have a transform', () => {
    assert.ok(ENGINE_CLAIMS.includes('bar') && ENGINE_CLAIMS.includes('state-chart'));
    // `content` is a shipped component the engine stamps on ordinary sections; it draws with CSS
    // alone, so it must not claim: the first run of the door lost every slide to it.
    assert.ok(!ENGINE_CLAIMS.includes('content'));
    assert.deepEqual(engineClaimsOf({ packages: [{ type: 'component', name: 'a', code: true }, { type: 'component', name: 'b' }, { type: 'theme', name: 'c', code: true }] }), ['a']);
  });

  test('a package takes its own slides; a slide also naming a shipped transform is the engine’s', () => {
    const got = claimedSlides(deck('tally content form', 'bar tally', 'tally bar', 'plain'), { packages: ['tally'], engineClaims: ENGINE_CLAIMS });
    assert.deepEqual(got.map((c) => [c.index, c.pkg]), [[0, 'tally']]);
  });

  test('two packages on one slide: the first by name, never both', () => {
    const got = claimedSlides(deck('zeta alpha', 'zeta'), { packages: ['zeta', 'alpha'], engineClaims: [] });
    assert.deepEqual(got.map((c) => [c.index, c.pkg]), [[0, 'alpha'], [1, 'zeta']]);
  });
});

describe('the two passes: capture, then substitute', () => {
  const slideIndex = (i) => i + 3;

  test('capture records each claim with the render’s position and prefix, and names a shadowed slide', () => {
    const cap = captureHook(['tally'], { engineClaims: ['bar'] });
    const html = deck('a', 'tally', 'bar tally');
    assert.equal(cap.hook(html, { slideIndex, idPrefix: 'lat-r1-' }), html, 'capture changes nothing');
    assert.deepEqual(cap.claims.map((c) => [c.pkg, c.index, c.idPrefix]), [['tally', 4, 'lat-r1-']]);
    assert.deepEqual(cap.shadowed, [{ slide: 6, pkg: 'tally', engine: 'bar' }]);
  });

  test('substitute puts each result in by the same key, and a slide the first pass never saw gets a note', () => {
    const html = deck('tally', 'tally');
    const cap = captureHook(['tally'], { engineClaims: [] });
    cap.hook(html, { slideIndex, idPrefix: '' });
    const code = 'function t(s){return s.html}export{t as default};';
    const first = cap.claims[0];
    const keyed = new Map([[`tally\u0000${first.index}\u0000\u0000\u0000${code}\u0000${first.html}`, '<section class="tally">DRAWN</section>']]);
    const out = substituteHook(['tally'], keyed, new Map([['tally', code]]), { engineClaims: [] })(html, { slideIndex, idPrefix: '' });
    assert.match(out, /<section class="tally">DRAWN<\/section>/);
    assert.match(out, /did not draw this slide: the slide changed between the two renders/);
  });
});

describe('splicing the output back', () => {
  const original = '<section class="tally" id="3"><style>section.tally{gap:1em}</style><ul><li>3</li></ul><!-- a speaker note --></section>';

  test("the engine's tag, styles and notes stay; the package gives only the classes and the body", () => {
    const clean = '<section data-lattice-slide="9" id="evil" style="--theme:x" class="tally extra"><div>drawn</div></section>';
    assert.equal(spliced(original, clean, ['tally', 'tally-wide', 'bad"quote'], 'tally'), '<section class="tally tally-wide" id="3"><div>drawn</div><style>section.tally{gap:1em}</style><!-- a speaker note --></section>');
  });

  test('a package adds no class outside its own name: a later pass keys on section classes', () => {
    const clean = '<section class="tally video qr chart-frame tally-x"><div>drawn</div></section>';
    assert.match(spliced(original, clean, ['tally', 'video', 'qr', 'chart-frame', 'tally-x'], 'tally'), /^<section class="tally tally-x" id="3">/);
  });

  test('whitespace around the section is not content; anything but one section throws, for the door to catch', () => {
    assert.equal(spliced(original, '\n  <section class="tally"><b>x</b></section>\n', ['tally'], 'tally'), '<section class="tally" id="3"><b>x</b><style>section.tally{gap:1em}</style><!-- a speaker note --></section>');
    assert.throws(() => spliced(original, '<div>no section</div>', ['tally'], 'tally'), /not one <section>/);
  });

  test('a failure keeps the engine’s slide and says why, escaped, on one line', () => {
    const out = withFailureNote(original, 'tally', '\u001b[2J<img src=x onerror=alert(1)>\nOS sandbox on');
    assert.ok(out.startsWith(original.slice(0, -'</section>'.length)), 'the engine’s section is kept');
    assert.match(out, /<p data-package-error="tally" role="note">The code package “tally” did not draw this slide: \?\[2J&lt;img src=x onerror=alert\(1\)&gt;\?OS sandbox on<\/p><\/section>$/);
  });

  test('a stranger’s text is one printable line', () => {
    assert.equal(printableLine('a\nb‮\u001bc d\te'), 'a?b??c?d?e');
  });
});

describe('consent, pinned to the bytes and the layer', () => {
  test('the digest is the SHA-256 of transform.js, and an approval is for exactly that', () => {
    const file = path.join(tmp('home'), 'trust.json');
    const p = pkg('function t(s){return s.html}export{t as default};');
    const d = codeDigest(p);
    assert.match(d, /^[0-9a-f]{64}$/);
    assert.equal(isTrusted('component', 'tally', d, file), false);
    grantTrust('component', 'tally', d, { file, now: new Date('2026-09-27T00:00:00Z'), layer: 'on' });
    assert.equal(isTrusted('component', 'tally', d, file), true);
    assert.deepEqual(readTrust(file), { 'component/tally': { sha256: d, at: '2026-09-27T00:00:00.000Z', layer: 'on' } });
    const changed = codeDigest(pkg('function t(s){return s.html}export{t as default}; '));
    assert.equal(isTrusted('component', 'tally', changed, file), false, 'changed code asks again');
    assert.equal(isTrusted('component', 'other', d, file), false, 'the same code under another name asks again');
    assert.deepEqual(untrustedCodePackages([{ name: 'tally', pkg: p }], { file }), []);
    assert.equal(revokeTrust('component', 'tally', { file }), true);
    assert.deepEqual(untrustedCodePackages([{ name: 'tally', pkg: p }], { file }), [{ name: 'tally', sha256: d }]);
  });

  test('consent lives in $LATTICE_HOME, not in the package store; a foreign file grants nothing', () => {
    assert.equal(trustFile({ env: { LATTICE_HOME: '/x/home' } }), path.resolve('/x/home/trust.json'));
    const file = path.join(tmp('home'), 'trust.json');
    fs.writeFileSync(file, '{"trusted":{"component/tally":{"sha256":"x"}}}');
    assert.deepEqual(readTrust(file), {});
    fs.writeFileSync(file, 'not json');
    assert.deepEqual(readTrust(file), {});
  });
});

describe('the gate: the one shape a door runs', () => {
  test('accepts the export form, refuses the rest by name', () => {
    assert.equal(refuseCode(pkg('function t(s){return s.html}export{t as default};')), null);
    assert.match(refuseCode(pkg('module.exports = () => ""')), /does not end in `export \{ name as default \}`/);
    assert.match(refuseCode(pkg('function t(){}export{t as default};', 'tally', { 'x.mjs': '' })), /a script other than tally\.transform\.js \(x\.mjs\)/);
    assert.match(refuseCode({ ...pkg('function t(){}export{t as default};'), type: 'theme' }), /only a component may/);
    assert.match(refuseCode(pkg(`${'x'.repeat(1_000_001)}function t(){}export{t as default};`)), /past the 1,000,000 a code package may carry/);
  });
});

describe('the attribute rule: a package keeps only what it was handed', () => {
  test('every address in a CSS value, decoded; text outside a function is not an address', () => {
    assert.deepEqual(cssRefTargets(`--logo-mask:url('/etc/x'); content:"Q3"; background:image-set("a.png" 1x), \\75 rl(b.png) /* url(c) */`), ['/etc/x', 'a.png', 'b.png']);
  });

  test('handed addresses pass byte for byte; invented ones do not; data: and #fragment always pass', () => {
    const filter = doorFilterAttr({ refs: new Set(['photo.png', 'https://author.example/pic.png', 'file:///deck/bg.png']), attrs: new Set(), classes: new Set() });
    assert.equal(filter('img', 'src', 'photo.png'), true, "the author's own image passes through");
    assert.equal(filter('img', 'src', 'https://author.example/pic.png'), true, "the author's own web image too: --allow-remote decides about it");
    assert.equal(filter('div', 'style', "background-image:url('file:///deck/bg.png')"), true, "the author's background");
    assert.equal(filter('img', 'src', 'other.png'), false);
    assert.equal(filter('img', 'src', 'https://evil.example/?slide=secret'), false);
    assert.equal(filter('img', 'src', '//evil.example/x'), false);
    assert.equal(filter('span', 'style', "--logo-mask:url('/etc/passwd')"), false);
    assert.equal(filter('span', 'style', '--label:"Q3";color:var(--accent)'), true);
    assert.equal(filter('img', 'src', 'data:image/png;base64,AA'), true);
    assert.equal(filter('rect', 'fill', 'url(#grad-1)'), true);
    assert.equal(filter('a', 'href', 'https://evil.example/?d=1'), false, 'an invented link target too');
    assert.equal(filter('iframe', 'srcdoc', '<p>x</p>'), false);
  });

  test('engine channel markers: only the handed ones survive', () => {
    const handed = handedOf([{ localName: 'section', attributes: [{ name: 'class', value: 'tally lattice-bg-host' }, { name: 'data-lattice-berth', value: '' }] }]);
    const filter = doorFilterAttr(handed);
    assert.equal(filter('aside', 'class', 'lattice-notes speaker'), 'speaker', 'a forged notes channel loses its marker');
    assert.equal(filter('div', 'class', 'lattice-bg-host tally-marks'), 'lattice-bg-host tally-marks');
    assert.equal(filter('div', 'data-lattice-slide', '7'), false);
    assert.equal(filter('div', 'data-lattice-berth', ''), true);
  });
});

describe('the OS layer', () => {
  test('the unprivileged user comes from passwd, else 65534', () => {
    const dir = tmp('passwd');
    fs.writeFileSync(path.join(dir, 'passwd'), 'root:x:0:0::/root:/bin/sh\nnobody:x:99:98::/:/sbin/nologin\n');
    assert.deepEqual(unprivilegedUser(path.join(dir, 'passwd')), { name: 'nobody', uid: 99, gid: 98 });
    assert.deepEqual(unprivilegedUser(path.join(dir, 'missing')), { name: 'nobody', uid: 65534, gid: 65534 });
  });
});

describe('the final checker: what a later pass or the runtime acts on', () => {
  const { codeNameRefusal } = require('../../../lib/packages/code-door-core.mjs');
  const filterFor = (pkg, handedAttrs = []) => doorFilterAttr(handedOf([{ localName: 'section', attributes: [{ name: 'class', value: pkg }, ...handedAttrs] }], pkg));

  test('an own-name class that merely contains a runtime selector is not the package’s to add', () => {
    assert.equal(filterFor('acme')('code', 'class', 'acme-language-mermaid acme-box'), 'acme-box');
    assert.equal(filterFor('acme')('div', 'class', 'acme-functionplot'), false);
  });

  test('ids live in the package’s name or were handed; runtime data markers only as handed', () => {
    const f = filterFor('acme', [{ name: 'id', value: '3' }, { name: 'data-mermaid-state', value: 'done' }]);
    assert.equal(f('rect', 'id', 'acme-grad'), true);
    assert.equal(f('rect', 'id', '3'), true);
    assert.equal(f('rect', 'id', 'lattice-notes'), false);
    assert.equal(f('div', 'data-fp-final', '1'), false);
    assert.equal(f('div', 'data-mermaid-state', 'done'), true);
    assert.equal(f('div', 'data-acme-count', '3'), true, "the package's own data attributes are its own");
  });

  test('a code package may not take a name that starts a class Lattice uses', () => {
    const known = ['chart-frame', 'logo-wall', 'kpi'];
    assert.match(codeNameRefusal('chart', known), /"chart-frame"/);
    assert.match(codeNameRefusal('logo', known), /"logo-wall"/);
    assert.match(codeNameRefusal('lat', known), /class stem/);
    assert.equal(codeNameRefusal('tally', known), null);
  });
});

describe('doorFinish: a diagram names only the addresses a handed diagram did', () => {
  test('an invented image node in a Mermaid block refuses the output', async () => {
    const { JSDOM } = require('jsdom');
    const DOMPurify = require('dompurify');
    const { doorFinish } = require('../../../lib/core/door-attr.mjs');
    const { createSlideSanitizer } = await import('../../../lib/core/sanitize-slide-html.mjs');
    const win = new JSDOM('').window;
    let f = () => false;
    const sanitize = createSlideSanitizer(DOMPurify, win, { filterAttr: (a, b, c) => f(a, b, c) });
    const withFilter = (h, filter) => {
      f = filter;
      try {
        return sanitize(h);
      } finally {
        f = () => false;
      }
    };
    const handed = '<section class="acme"><pre><code class="language-mermaid">flowchart LR\n A</code></pre></section>';
    const out = '<section class="acme"><pre><code class="language-mermaid">flowchart LR\n A@{ img: "https://evil.example/x" }</code></pre></section>';
    assert.match(doorFinish(win.document, withFilter, out, handed, 'acme').error, /its diagram names an address the slide did not hold/);
    assert.equal(doorFinish(win.document, withFilter, handed, handed, 'acme').error, undefined);
  });
});
