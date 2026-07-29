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

  test('withRuntimeScripts appends the lint-ignored mermaid + runtime tags', () => {
    const out = withRuntimeScripts('# A\n\n## B\n');
    assert.match(out, /<!-- markdownlint-disable MD033 -->\n<script src="mermaid-v11\.min\.js"><\/script>\n<script src="lattice-runtime\.min\.js"><\/script>\s*$/);
    assert.ok(RUNTIME_SCRIPTS.includes('lattice-runtime.min.js'));
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
    assert.match(pkg.scripts.pdf, /My Deck\.md/);
  });

  test('readme documents the VS Code + marp-cli routes and the browser-HTML fidelity note', () => {
    const r = readme({ name: 'demo', palette: 'indaco', themes: ['lattice.css', 'themes/indaco.css'] });
    assert.match(r, /Marp for VS Code/);
    assert.match(r, /markdown\.marp\.themes/);
    assert.match(r, /npm run pdf/);
    assert.match(r, /--theme-set lattice\.css themes/);
    assert.match(r, /markdown\.marp\.enableHtml/);
    // Honest about the one route that ISN'T full fidelity: the preview webview
    // does not execute the deck's scripts, so runtime-built components stay flat.
    assert.match(r, /does not execute the deck's\s+`<script>` tags/);
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
      assert.ok(once.length > css.length, 'arms were actually distributed');
      assert.equal(marpScopableCss(once), once, 'a second pass changes nothing');
      assert.deepEqual(once.match(/(^|[{};])\s*:is\([^)]*section[^)]*\)/g) || [], [],
        'no rule still LEADS with :is(section…)');
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
