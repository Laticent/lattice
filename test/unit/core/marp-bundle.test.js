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
const {
  STATIC_ASSETS, AGENT_ASSETS, RUNTIME_SCRIPTS, MARP_CONFIG_CJS, withRuntimeScripts,
  safeName, packageJson, vscodeSettings, readme, agentsMd,
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

  describe('withRuntimeScripts — strips a pre-existing trailing runtime-script block', () => {
    // examples/gallery-jargon.md's actual convention: an explanatory HTML
    // comment, the markdownlint-disable pragma, then two repo-relative script
    // tags — appended so authors can preview Mermaid/structural components
    // locally. Without stripping, the bundle's own bundle-relative pair would
    // ship duplicated alongside it.
    const deckWithLocalPreviewScripts = [
      '# A',
      '',
      '## B',
      '',
      '<!-- Import Mermaid and the Lattice runtime theme for VS Code / web preview.',
      '     The build script (lattice-emulator.js) pre-renders Mermaid to SVG at build time',
      '     so these scripts are a no-op in the PDF/HTML output. -->',
      '<!-- markdownlint-disable MD033 -->',
      '<script src="../mermaid-v11.min.js"></script>',
      '<script src="../dist/lattice-runtime.js"></script>',
      '',
    ].join('\n');

    test('a multi-line explanatory comment + markdownlint pragma + repo-relative scripts are all stripped, no duplication', () => {
      const out = withRuntimeScripts(deckWithLocalPreviewScripts);
      // exactly one copy of each script tag (the bundle's own bundle-relative pair)
      assert.equal((out.match(/mermaid-v11\.min\.js/g) || []).length, 1);
      assert.equal((out.match(/lattice-runtime\.min\.js/g) || []).length, 1);
      // the old repo-relative paths are gone entirely
      assert.doesNotMatch(out, /\.\.\/mermaid-v11\.min\.js/);
      assert.doesNotMatch(out, /\.\.\/dist\/lattice-runtime\.js/);
      // the stale explanatory comment (referencing lattice-emulator.js) doesn't leak into the bundle
      assert.doesNotMatch(out, /lattice-emulator\.js/);
      // the deck body itself is preserved
      assert.match(out, /^# A\n\n## B/);
    });

    test('a bare pair with no preceding comment is also stripped cleanly', () => {
      const out = withRuntimeScripts('# A\n\n<script src="mermaid-v11.min.js"></script>\n<script src="lattice-runtime.min.js"></script>\n');
      assert.equal((out.match(/mermaid-v11\.min\.js/g) || []).length, 1);
      assert.equal((out.match(/lattice-runtime\.min\.js/g) || []).length, 1);
    });

    // Regression for the catastrophic-swallow bug: a real multi-slide deck is
    // full of OTHER, unrelated single-line `<!-- _class: … -->` directive
    // comments — one per slide. A naive backtracking `(?:<!--[\s\S]*?-->)*`
    // pattern can lazily stretch across all of them, treating the entire deck
    // body as "one comment" and deleting it. This must strip ONLY the
    // trailing block and leave every earlier slide fully intact.
    test('earlier per-slide directive comments are never swallowed (the real-deck shape)', () => {
      const manySlides = [
        '<!-- _class: title -->',
        '<!-- _footer: "Title slide · title" -->',
        '',
        '# From Signal to Strategy',
        '',
        '---',
        '',
        '<!-- _class: quote -->',
        '<!-- _footer: "Pull quote · quote" -->',
        '',
        '> The signal was always there.',
        '',
        '— Head of Product',
        '',
        '---',
        '',
        '<!-- _class: closing -->',
        '<!-- _footer: "Final ask · closing" -->',
        '',
        '## Next step is a working session, not a debate',
        '',
        '<!-- Import Mermaid and the Lattice runtime theme for VS Code / web preview.',
        '     The build script (lattice-emulator.js) pre-renders Mermaid to SVG at build time',
        '     so these scripts are a no-op in the PDF/HTML output. -->',
        '<!-- markdownlint-disable MD033 -->',
        '<script src="../mermaid-v11.min.js"></script>',
        '<script src="../dist/lattice-runtime.js"></script>',
        '',
      ].join('\n');

      const out = withRuntimeScripts(manySlides);
      // every slide's content and directive comments survive, untouched
      assert.match(out, /<!-- _class: title -->/);
      assert.match(out, /# From Signal to Strategy/);
      assert.match(out, /<!-- _class: quote -->/);
      assert.match(out, /The signal was always there/);
      assert.match(out, /<!-- _class: closing -->/);
      assert.match(out, /Next step is a working session, not a debate/);
      // exactly one copy of the runtime scripts (the bundle's own pair), no duplication
      assert.equal((out.match(/mermaid-v11\.min\.js/g) || []).length, 1);
      assert.equal((out.match(/lattice-runtime\.min\.js/g) || []).length, 1);
      assert.doesNotMatch(out, /\.\.\/mermaid-v11\.min\.js/);
    });

    test('an unrelated trailing HTML comment (no qualifying script tag) is left untouched', () => {
      const out = withRuntimeScripts('# A\n\n<!-- a normal closing note, not about runtime scripts -->\n');
      assert.match(out, /a normal closing note, not about runtime scripts/);
    });
  });

  test('marp.config.cjs builds a themeSet from root lattice.css + themes/, no engine, and allows the runtime <script> tags through', () => {
    assert.match(MARP_CONFIG_CJS, /themeSet/);
    assert.match(MARP_CONFIG_CJS, /allowLocalFiles/);
    // Without html:true, marp-core's default HTML sanitizer strips <script src>
    // from the deck as an XSS precaution, silently breaking every structural
    // component (masthead-lift's .cell-stage, split panels, chart-family, …) in
    // both the PDF and HTML export paths. See lib/core/marp-bundle.js's comment.
    assert.match(MARP_CONFIG_CJS, /html:\s*true/);
    // lattice.css is registered from the bundle ROOT (not dist/), since the
    // emulator's dist/ folder is no longer shipped.
    assert.match(MARP_CONFIG_CJS, /path\.join\(__dirname, 'lattice\.css'\)/);
    assert.doesNotMatch(MARP_CONFIG_CJS, /'dist'/);
    assert.doesNotMatch(MARP_CONFIG_CJS, /@slidewright\/lattice\/config/);
  });

  test('vscodeSettings registers the bundled themes for Marp VS Code', () => {
    const s = vscodeSettings(['lattice.css', 'themes/indaco.css', 'themes/indaco-dark.css']);
    const parsed = JSON.parse(s);
    assert.deepEqual(parsed['markdown.marp.themes'], ['lattice.css', 'themes/indaco.css', 'themes/indaco-dark.css']);
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
    assert.match(r, /open the exported HTML|open the HTML|Open the HTML/i);
    // Marp-native: the README must NOT point at a bundled emulator any more.
    assert.doesNotMatch(r, /lattice-emulator/);
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
