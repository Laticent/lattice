/**
 * Unit: the shared Export-to-Marp bundle spec (lib/core/marp-bundle.js).
 *
 * This pure module is the SINGLE source of truth for the bundle's generated
 * files + static-asset manifest, shared by the CLI (tools/export-marp.js) and
 * the Drawing Board's in-browser export so they can't drift. The render parity
 * of the baked deck is covered by bake-splits.test.js; here we pin the spec.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Evaluate the generated config the way a recipient's marp-cli does — from a
 * real bundle-shaped directory, since the config readdir's `themes/` at load.
 */
function requireGeneratedConfig(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marp-bundle-test-'));
  fs.mkdirSync(path.join(dir, 'themes'));
  fs.writeFileSync(path.join(dir, 'themes', 'indaco.css'), '/* */');
  fs.writeFileSync(path.join(dir, 'lattice.css'), '/* */');
  const file = path.join(dir, 'marp.config.cjs');
  fs.writeFileSync(file, src);
  try {
    return require(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const {
  STATIC_ASSETS, AGENT_ASSETS, RUNTIME_SCRIPTS, MARP_CONFIG_CJS, withRuntimeScripts,
  safeName, packageJson, vscodeSettings, readme, agentsMd, fontAssetsFor, marpScopableCss,
} = require('../../../lib/core/marp-bundle');

describe('marp-bundle spec', () => {
  test('STATIC_ASSETS ships the minified stylesheet/runtime/mermaid; NO engine', () => {
    const byTo = Object.fromEntries(STATIC_ASSETS.map((a) => [a.to, a.from]));
    // lattice.css at the bundle root (minified) — it is the Marp themeSet base.
    assert.equal(byTo['lattice.css'], 'dist/lattice.min.css');
    assert.equal(byTo['lattice-runtime.min.js'], 'dist/lattice-runtime.min.js');
    assert.equal(byTo['mermaid-v11.min.js'], 'mermaid-v11.min.js');
    // The bundle is Marp-native: no emulator is shipped.
    assert.ok(!STATIC_ASSETS.some((a) => /emulator/.test(a.from) || /emulator/.test(a.to)));
    assert.equal(byTo['dist/lattice.css'], undefined);
  });

  test('safeName slugs a deck title', () => {
    assert.equal(safeName('Q3 Board Review!'), 'Q3-Board-Review');
    assert.equal(safeName('  '), 'deck');
  });

  // The generated `npm run pdf` / `npm run html` scripts interpolate the deck
  // filename UNQUOTED, so the sanitizer's charset is what keeps them one argument.
  // Pin it: no whitespace, no shell metacharacter, no leading `-` to be read as a
  // flag, for every shape of title a deck can carry.
  test('safeName output is shell-safe, which is what lets the scripts go unquoted', () => {
    for (const title of [
      'Q3 Board Review', 'deck; rm -rf /', '--help', 'a"b\'c', 'a$(id)b', 'a|b&c', 'naïve—dash', '',
      '../../etc/passwd', 'a\nb',
    ]) {
      const slug = safeName(title);
      assert.match(slug, /^[\w.][\w.-]*$/, `unsafe slug for ${JSON.stringify(title)}: ${slug}`);
      assert.ok(!slug.includes('/'), 'no path separator');
    }
  });

  test('withRuntimeScripts appends the lint-ignored mermaid + runtime tags', () => {
    const out = withRuntimeScripts('# A\n\n## B\n');
    // The tags open the trailer; the data blocks follow them. (This used to be
    // `$`-anchored — true only while a marker-less export emitted no settings block,
    // which is the block-less state the runtime reads as "authoring surface" and the
    // choke point now refuses to produce.)
    assert.match(out, /<!-- markdownlint-disable MD033 -->\n<script src="mermaid-v11\.min\.js"><\/script>\n<script src="lattice-runtime\.min\.js"><\/script>\n/);
    assert.ok(RUNTIME_SCRIPTS.includes('lattice-runtime.min.js'));
    // Nothing but generated data blocks may follow — no stray deck content. Asserted as
    // EXACT EQUALITY rather than "strip the script tags and check for leftovers": the
    // strip form needed a `<script[\s\S]*?</script>` regex, which CodeQL reads (fairly, on
    // shape alone) as a hand-rolled HTML sanitizer — it is not one, there is no untrusted
    // input here, and saying so in a comment would not make the pattern stop looking like
    // one. Equality is also the stronger assertion: the strip form passed no matter how the
    // generated blocks were ordered or spelled.
    const trailer = out.slice(out.indexOf('<!-- markdownlint-disable MD033 -->'));
    assert.equal(
      trailer,
      '<!-- markdownlint-disable MD033 -->\n'
      + '<script src="mermaid-v11.min.js"></script>\n'
      + '<script src="lattice-runtime.min.js"></script>\n'
      + `<script type="application/lattice-export-settings">{"overflowMarker":"reader"}</script>\n`,
    );
  });

  test('marp.config.cjs builds a themeSet from root lattice.css + themes/, no engine', () => {
    assert.match(MARP_CONFIG_CJS, /themeSet/);
    assert.match(MARP_CONFIG_CJS, /allowLocalFiles/);
    // lattice.css is registered from the bundle ROOT (not dist/), since the
    // emulator's dist/ folder is no longer shipped.
    assert.match(MARP_CONFIG_CJS, /path\.join\(__dirname, 'lattice\.css'\)/);
    assert.doesNotMatch(MARP_CONFIG_CJS, /'dist'/);
    assert.doesNotMatch(MARP_CONFIG_CJS, /@slidewright\/lattice\/config/);
  });

  // marp-core defaults to html:false, which ESCAPES raw HTML — the deck's two
  // trailing runtime <script> tags came out as literal text on the last slide
  // and the runtime never loaded, so every transform-driven component rendered
  // as bare markdown. The flag is load-bearing, not cosmetic.
  test('marp.config.cjs enables html so the runtime <script> tags survive', () => {
    assert.match(MARP_CONFIG_CJS, /html:\s*true/);
    const cfg = requireGeneratedConfig(MARP_CONFIG_CJS);
    assert.equal(cfg.html, true);
    assert.equal(cfg.allowLocalFiles, true);
  });

  test('vscodeSettings registers the bundled themes for Marp VS Code', () => {
    const s = vscodeSettings(['lattice.css', 'themes/indaco.css', 'themes/indaco-dark.css']);
    const parsed = JSON.parse(s);
    assert.deepEqual(parsed['markdown.marp.themes'], ['lattice.css', 'themes/indaco.css', 'themes/indaco-dark.css']);
    // Mirrors marp.config.cjs's html:true — the extension also escapes raw HTML
    // by default, which printed the runtime <script> tags across the preview.
    assert.equal(parsed['markdown.marp.enableHtml'], true);
  });

  test('packageJson pins marp-cli only and scripts reference the deck', () => {
    const pkg = packageJson('My Deck');
    assert.ok(pkg.dependencies['@marp-team/marp-cli']);
    // The engine ships pre-bundled (dist/lattice-emulator.js), so it is NOT an
    // npm dependency — listing the unpublished @slidewright/lattice would 404
    // `npm install` and the recipient would never get marp-cli either.
    assert.strictEqual(pkg.dependencies['@slidewright/lattice'], undefined);
    assert.match(pkg.name, /^My-Deck-marp-export$/);
    // The scripts name the SANITIZED file — the same string the producers write
    // the deck under. They used to interpolate the raw title, so this bundle's
    // only documented render command was `marp My Deck.md …`: marp-cli reads that
    // as two input files, neither of which exists.
    assert.match(pkg.scripts.pdf, /^marp My-Deck\.md /);
    assert.match(pkg.scripts.pdf, / -o My-Deck\.pdf$/);
    assert.match(pkg.scripts.html, /^marp My-Deck\.md .* -o My-Deck\.html$/);
    for (const s of Object.values(pkg.scripts)) assert.doesNotMatch(s, /My Deck/);
  });

  // The generated README's paths and commands must name the same file the
  // producers write — prose keeps the deck's own title.
  test('readme paths use the sanitized filename, prose keeps the title', () => {
    const r = readme({ name: 'My Deck', palette: 'indaco', themes: ['lattice.css'], agent: true });
    assert.match(r, /^# My Deck — portable Marp bundle/, 'the heading keeps the real title');
    assert.match(r, /npx @marp-team\/marp-cli My-Deck\.md /);
    assert.match(r, /`My-Deck\.md` \| the deck/);
    assert.doesNotMatch(r, /My Deck\.md/, 'no path spells the unsanitized name');
    const a = agentsMd({ name: 'My Deck', version: '1.0.0' });
    assert.match(a, /`My-Deck\.md` — the slides/);
    assert.doesNotMatch(a, /`My Deck\.md`/);
  });

  test('readme documents the VS Code + marp-cli routes and the browser-HTML fidelity note', () => {
    const r = readme({ name: 'demo', palette: 'indaco', themes: ['lattice.css', 'themes/indaco.css'] });
    assert.match(r, /Marp for VS Code/);
    assert.match(r, /markdown\.marp\.themes/);
    assert.match(r, /npm run pdf/);
    assert.match(r, /--theme-set lattice\.css themes/);
    assert.match(r, /markdown\.marp\.enableHtml/);
    // Honest about the one route whose fidelity we cannot confirm. Deliberately
    // asserts the HEDGE, not the claim: whether the preview webview executes the
    // deck's scripts is UNVERIFIED and contested (engineering/gotchas.md). Pinning
    // the unhedged wording would have turned CI red the day that got settled.
    assert.match(r, /not something we can confirm/);
    assert.match(r, /\.html` opens standalone in any browser/);
    // Marp-native: the README must NOT point at a bundled emulator any more.
    assert.doesNotMatch(r, /lattice-emulator/);
  });


  describe('font supply', () => {
    // lattice.css's @font-face srcs are stylesheet-relative `url(fonts/<file>)`.
    // A bundle that shipped the CSS without that directory 404'd every face and
    // fell back to system serif/sans on every slide.
    test('fontAssetsFor derives the supply from the stylesheet itself', () => {
      const css = "@font-face{src:url(fonts/outfit-400.woff2) format('woff2')}"
        + "@font-face{src:url('fonts/playfair-700.woff2')}"
        + ".x{background:url(fonts/KaTeX_Main-Regular.woff2)}";
      assert.deepEqual(fontAssetsFor(css), [
        { from: 'dist/fonts/KaTeX_Main-Regular.woff2', to: 'fonts/KaTeX_Main-Regular.woff2' },
        { from: 'dist/fonts/outfit-400.woff2', to: 'fonts/outfit-400.woff2' },
        { from: 'dist/fonts/playfair-700.woff2', to: 'fonts/playfair-700.woff2' },
      ]);
    });

    test('fontAssetsFor dedupes repeats and ignores non-font urls', () => {
      const css = '@font-face{src:url(fonts/a.woff2)}@font-face{src:url(fonts/a.woff2)}'
        + ".y{background:url('data:image/svg+xml,<svg/>')}.z{background:url(../img/x.png)}";
      assert.deepEqual(fontAssetsFor(css), [{ from: 'dist/fonts/a.woff2', to: 'fonts/a.woff2' }]);
    });

    test('fontAssetsFor tolerates empty / missing input', () => {
      assert.deepEqual(fontAssetsFor(''), []);
      assert.deepEqual(fontAssetsFor(undefined), []);
    });
  });

  describe('marp-scopable CSS', () => {
    // marp-core scopes off the leftmost compound: a literal leading `section` is
    // the slide, anything else becomes a slide DESCENDANT. Lattice's dual-surface
    // `:is(section.x, figure.x)` head therefore scoped to a slide-inside-a-slide
    // and matched nothing — ~835 rules dead across the chart bucket and the
    // shared Form layer. Our own engine distributes the arms before scoping; the
    // export bakes the same distribution in, since marp-core can't be patched.
    test('distributes a leading :is() into per-arm selectors', () => {
      assert.equal(
        marpScopableCss(':is(section.map, figure.chart-frame) .map-region{fill:red}'),
        'section.map .map-region, figure.chart-frame .map-region{fill:red}',
      );
    });

    test('leaves a MID-selector :is() alone — it already scopes correctly', () => {
      const css = 'section.foo :is(ul, ol) > li{color:red}';
      assert.equal(marpScopableCss(css), css);
    });

    test('handles the minified no-space form and multiple rules', () => {
      assert.equal(
        marpScopableCss(':is(section,figure) .cell{a:b}section.x{c:d}:is(section.y,figure.y)::after{e:f}'),
        'section .cell, figure .cell{a:b}section.x{c:d}section.y::after, figure.y::after{e:f}',
      );
    });

    test('is idempotent — a distributed sheet passes through unchanged', () => {
      const once = marpScopableCss(':is(section.a, figure.a) .b{x:y}');
      assert.equal(marpScopableCss(once), once);
    });

    test('leaves declarations, at-rule preludes and data: URIs untouched', () => {
      const css = "@media (min-width:1px){:is(section.a, figure.a) .b{background:url(\"data:image/svg+xml,<svg/>\")}}";
      assert.equal(
        marpScopableCss(css),
        "@media (min-width:1px){section.a .b, figure.a .b{background:url(\"data:image/svg+xml,<svg/>\")}}",
      );
    });

    test('the SHIPPED stylesheet survives it: same rule count, second pass a no-op', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const css = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'dist', 'lattice.min.css'), 'utf8',
      );
      const once = marpScopableCss(css);
      const count = (s, ch) => s.split(ch).length - 1;
      assert.equal(count(once, '{'), count(css, '{'), 'rule blocks preserved');
      assert.equal(count(once, ';'), count(css, ';'), 'declarations preserved');
      // `tools/build-css.js` distributes at BUILD time, so on a current dist this
      // pass has nothing left to do — and it is now a BYTE-for-byte no-op, not
      // merely a semantic one. (It used to re-join comma lists with `, ` and grow
      // the sheet ~262 bytes; the character walk leaves an already-distributed
      // prelude alone.) The belt-and-braces value is for a bundle built against an
      // OLDER dist, which the next assertion covers.
      assert.equal(once, css, 'a current dist is already distributed — nothing to do');
      assert.equal(marpScopableCss(once), once, 'a second pass changes nothing');
      assert.deepEqual(once.match(/(^|[{};])\s*:is\([^)]*section[^)]*\)/g) || [], [],
        'no rule still LEADS with :is(section…)');
      // …and it really does distribute an UNDISTRIBUTED sheet (the older-dist case),
      // so the equality above can't pass by doing nothing at all.
      const stale = ':is(section.map, figure.chart-frame) .r{color:red}';
      assert.equal(marpScopableCss(stale), 'section.map .r, figure.chart-frame .r{color:red}');
    });

    test('does NOT touch :where() heads — unwrapping them would change specificity', () => {
      const css = ':where([data-family="tall"]) .x{a:b}';
      assert.equal(marpScopableCss(css), css);
    });
  });

  describe('agent kit', () => {
    test('AGENT_ASSETS carries the component catalog into agent/', () => {
      const byTo = Object.fromEntries(AGENT_ASSETS.map((a) => [a.to, a.from]));
      assert.equal(byTo['agent/components.json'], 'dist/docs/components.json');
      // The kit is catalog data only — no engine, no heavy runtime.
      assert.ok(!AGENT_ASSETS.some((a) => /emulator|runtime|\.js$/.test(a.from)));
    });

    test('agentsMd is bundle-tailored: names the deck, the catalog path, capacity, and the frozen snapshot', () => {
      const a = agentsMd({ name: 'q3-review', version: '1.2.3' });
      assert.match(a, /AGENTS\.md/);
      assert.match(a, /q3-review\.md/);            // points at THIS bundle's deck
      assert.match(a, /agent\/components\.json/);   // and its own catalog path
      assert.match(a, /capacity/i);                 // teaches pick-by-capacity
      assert.match(a, /count first/i);
      assert.match(a, /frozen snapshot/i);
      assert.match(a, /Lattice 1\.2\.3/);           // provenance stamp
      // Bundle-tailored, NOT the repo's AGENTS.md: no repo-only tooling paths.
      assert.doesNotMatch(a, /npm run lint:deck|dist\/docs\/components\.json/);
    });

    test('agentsMd omits the version stamp gracefully when unknown', () => {
      const a = agentsMd({ name: 'demo' });
      assert.match(a, /frozen snapshot[\s\S]*Lattice\)/);
      assert.doesNotMatch(a, /Lattice undefined/);
    });

    test('readme adds the agent section + rows only when agent:true', () => {
      const base = { name: 'demo', palette: 'indaco', themes: ['lattice.css'] };
      const on = readme({ ...base, agent: true });
      assert.match(on, /Extend it with an AI agent/);
      assert.match(on, /`AGENTS\.md`/);
      assert.match(on, /`agent\/components\.json`/);
      const off = readme({ ...base, agent: false });
      assert.doesNotMatch(off, /Extend it with an AI agent/);
      assert.doesNotMatch(off, /agent\/components\.json/);
    });
  });
});

/**
 * `resolveExportOverflowMarker` + the export-settings block.
 *
 * The level is an EXPORT setting, not a deck key. It shipped as `overflow-marker:`
 * front matter for one commit and moved, for the reason `autosplit:` moved a day
 * earlier: one deck source is previewed while authoring, exported for a recipient,
 * and printed to PDF, and the same question has three different correct answers
 * decided by which command you ran — a property of the render target.
 *
 * Two things that were DEFECTS while it was a deck key are properties here, and
 * both are pinned below: a re-export cannot inherit the previous export's choice,
 * and nothing in the emitted deck looks like an input the author should write.
 */
describe('marp bundle — the overflow-marker export setting', () => {
  const { resolveExportOverflowMarker } = require('../../../lib/core/marp-bundle');
  const {
    EXPORT_SETTINGS_TYPE, readExportSettings,
  } = require('../../../lib/core/export-settings');
  const { JSDOM } = require('jsdom');
  const settingsIn = (deck) => readExportSettings(new JSDOM(`<body>${deck}</body>`).window.document);

  test('nothing chosen anywhere resolves to reader', () => {
    assert.deepEqual(resolveExportOverflowMarker(), { marker: 'reader', source: 'default', ignored: [] });
    assert.deepEqual(resolveExportOverflowMarker({}), { marker: 'reader', source: 'default', ignored: [] });
  });

  test('this export beats the workspace setting, which beats the default', () => {
    assert.equal(resolveExportOverflowMarker({ chosen: 'off', workspace: 'author' }).marker, 'off');
    assert.equal(resolveExportOverflowMarker({ chosen: 'off', workspace: 'author' }).source, 'this export');
    assert.equal(resolveExportOverflowMarker({ workspace: 'author' }).marker, 'author');
    assert.equal(resolveExportOverflowMarker({ workspace: 'author' }).source, 'workspace setting');
  });

  test('values are normalized, and a null/absent choice falls through', () => {
    assert.equal(resolveExportOverflowMarker({ chosen: ' OFF ' }).marker, 'off');
    assert.equal(resolveExportOverflowMarker({ chosen: null, workspace: ' Author ' }).marker, 'author');
  });

  // The choke point RESOLVES, so a producer that passes nothing cannot emit a
  // block-LESS deck. That mattered: no block reads as "authoring surface", so the
  // Drawing Board — which never passed a marker — shipped delivered bundles with the
  // red QA ring and the "FIX ME" overlays, the exact defect this setting fixes.
  test('a producer that passes NOTHING still gets a real level in the block', () => {
    const deck = withRuntimeScripts('---\nmarp: true\n---\n\n# A\n');
    assert.deepEqual(settingsIn(deck), { overflowMarker: 'reader' },
      'never block-less — "the producer said nothing" must not read as "authoring surface"');
  });

  test('an invalid level from a producer is normalized, never written raw', () => {
    assert.deepEqual(settingsIn(withRuntimeScripts('---\nmarp: true\n---\n\n# A\n', { overflowMarker: 'quiet' })),
      { overflowMarker: 'reader' });
    assert.deepEqual(settingsIn(withRuntimeScripts('---\nmarp: true\n---\n\n# A\n', { overflowMarker: null })),
      { overflowMarker: 'reader' });
  });

  // A stored setting can go stale — a level renamed, a hand-edited localStorage,
  // a typo'd env var. It must not break the export, and it must not be swallowed.
  test('an unrecognized WORKSPACE value falls back AND is reported', () => {
    const r = resolveExportOverflowMarker({ workspace: 'quiet' });
    assert.equal(r.marker, 'reader');
    assert.equal(r.source, 'default');
    assert.deepEqual(r.ignored.map((i) => i.value), ['quiet'], 'the caller can name what it ignored');
  });

  // The first cut only looked at `workspace`, and only when nothing else won — so a
  // stale standing value beside a good flag was swallowed, which is precisely the
  // case its docstring claimed to cover.
  test('a bad value is reported even when another tier wins', () => {
    const r = resolveExportOverflowMarker({ chosen: 'off', workspace: 'quiet' });
    assert.equal(r.marker, 'off');
    assert.deepEqual(r.ignored.map((i) => i.tier), ['standing default']);
    const bothBad = resolveExportOverflowMarker({ chosen: 'nope', workspace: 'quiet' });
    assert.deepEqual(bothBad.ignored.map((i) => i.tier), ['this export', 'standing default']);
    assert.equal(bothBad.marker, 'reader');
  });

  // `off` is a real level but never a STANDING default: a silence that applies to
  // every future export, with nothing to notice it by, is the failure this whole
  // change exists to prevent. Rejected loudly rather than downgraded in silence.
  test('`off` is refused as a standing default, and says why', () => {
    const r = resolveExportOverflowMarker({ workspace: 'off' });
    assert.equal(r.marker, 'reader', 'it does not become the standing answer');
    assert.equal(r.source, 'default');
    assert.match(r.ignored[0].reason, /cannot be a standing default/);
    // …but it is perfectly valid for ONE export.
    assert.equal(resolveExportOverflowMarker({ chosen: 'off' }).marker, 'off');
    assert.deepEqual(resolveExportOverflowMarker({ chosen: 'off' }).ignored, []);
  });

  test('an empty workspace value is absence, not a bad value', () => {
    assert.deepEqual(resolveExportOverflowMarker({ workspace: '' }), { marker: 'reader', source: 'default', ignored: [] });
  });

  test('the level rides in the export-settings block, not the front matter', () => {
    const deck = withRuntimeScripts('---\nmarp: true\n---\n\n# A\n', { overflowMarker: 'off' });
    assert.deepEqual(settingsIn(deck), { overflowMarker: 'off' });
    assert.doesNotMatch(deck, /^overflow-marker:/m, 'nothing in the deck looks like a key to write');
    assert.match(deck, new RegExp(EXPORT_SETTINGS_TYPE));
  });

  // The stickiness bug, pinned. As a front-matter key, `off` chosen once for one
  // board meeting became a permanent property of every deck derived from that
  // bundle — inherited by every re-export, watched by nothing.
  test('a re-export does NOT inherit the previous export\'s level', () => {
    const first = withRuntimeScripts('---\nmarp: true\n---\n\n# A\n', { overflowMarker: 'off' });
    const second = withRuntimeScripts(first);
    assert.deepEqual(settingsIn(second), { overflowMarker: 'reader' },
      'the previous `off` is gone and the default takes over — not carried forward, and not block-less');
    const third = withRuntimeScripts(first, { overflowMarker: 'author' });
    assert.deepEqual(settingsIn(third), { overflowMarker: 'author' }, 'and an explicit choice replaces it');
  });

  test('re-exporting at the same level is byte-identical, with one block', () => {
    const once = withRuntimeScripts('---\nmarp: true\n---\n\n# A\n', { overflowMarker: 'reader' });
    const twice = withRuntimeScripts(once, { overflowMarker: 'reader' });
    assert.equal(twice, once);
    assert.equal((twice.match(new RegExp(EXPORT_SETTINGS_TYPE, 'g')) || []).length, 1);
  });
});
