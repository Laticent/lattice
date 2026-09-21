/**
 * Gate: the consolidated showcase galleries can't go stale.
 *
 * The `data-viz` showcase (examples/data-viz-gallery.md) is GENERATED from the live
 * CHART manifest set (tools/build-showcase-galleries.js) — charts only; `math` has no
 * showcase, deliberately, and the reason is asserted below. Two things
 * this locks, both fast + render-free so they BLOCK on every PR:
 *
 *   1. FRESHNESS — the committed deck must equal what the generator composes from
 *      the current manifests. Add/rename/retire a chart component (or edit its
 *      `sample`) without rebuilding the deck and CI goes red. This is the
 *      "a new component silently misses the gallery" worry, gated.
 *   2. COVERAGE — the deck walks the full chart component set. The `sample` hygiene
 *      arm reaches wider, across chart AND math, because a manifest in either bucket
 *      with no `sample` is counted by name and emits no slide.
 *   3. THE BUILD'S SKIP TEST — `buildFreshness`. Neither gate above can see a stale
 *      PDF: both compare MARKDOWN, and the deck's markdown is identical whether or not
 *      anyone re-rendered it. #2253 is two bugs in that skip, and the second one only
 *      shows across two themes in one run, so it is pinned here rather than left to a
 *      render.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAll, groupByBucket } = require('../../../lib/components');
const {
  SHOWCASES, composeShowcase, galleryMarkdownPath, showcaseComponentNames,
  buildFreshness,
} = require('../../../tools/build-showcase-galleries');

const groups = groupByBucket(loadAll());

describe('showcase galleries', () => {
  for (const showcase of SHOWCASES) {
    test(`${showcase.id}: committed deck is in sync with the live manifests`, () => {
      const mdPath = galleryMarkdownPath(showcase.id);
      assert.ok(fs.existsSync(mdPath), `missing ${path.relative(process.cwd(), mdPath)} — run npm run build:showcase-galleries`);
      const composed = composeShowcase(showcase, groups);
      const committed = fs.readFileSync(mdPath, 'utf8');
      assert.equal(committed, composed,
        `${showcase.id}-gallery.md drifted from the manifests (a component was added/changed/removed) — run npm run build:showcase-galleries`);
    });
  }

  test('math is NOT in the data-viz showcase', () => {
    // Math was a member until 2026-09 and is its own showcase now. It is rendered
    // EVIDENCE, which is not the same as being a chart: a chart plots a dataset and a
    // math slide typesets an expression — no shared transform, no shared dataset shape,
    // no shared reflow — and a reader comparing bar against waterfall does not want an
    // equation in the middle of the walk. Asserted rather than left to the roster,
    // because the roster is one line and this is the reasoning behind it.
    const dv = SHOWCASES.find((s) => s.id === 'data-viz');
    assert.ok(dv, 'the data-viz showcase must exist');
    assert.deepEqual(dv.buckets, ['chart'], 'data-viz surveys charts only');
    // AND IT DID NOT GET A SHOWCASE OF ITS OWN. A showcase composes one
    // `manifest.sample` per component, so a single-component bucket makes a two-slide
    // deck that duplicates the bucket gallery. The eight-variant survey is the COMPONENT
    // gallery; asserted here so nobody adds the redundant one back.
    assert.equal(SHOWCASES.find((s) => s.id === 'math'), undefined,
      'a single-component showcase duplicates the bucket gallery — math has none');
  });

  test('data-viz covers the full chart component set', () => {
    // Every chart component, the same surfaces the per-bucket family gallery covers,
    // in one consolidated deck.
    const inDeck = new Set(showcaseComponentNames('data-viz', groups));
    assert.ok(inDeck.size >= 13, `expected the full chart set, got ${inDeck.size}`);
    // NOT math — and not because math has a showcase of its own. It has none, for the
    // reason asserted in the test above, and an earlier version of this line said the
    // opposite twelve lines below that assertion.
    assert.ok(!inDeck.has('math'), 'data-viz surveys charts only');
  });

  describe('the build path\'s skip test (#2253)', () => {
    const dv = SHOWCASES.find((s) => s.id === 'data-viz');

    /**
     * Drive the real `main` over a VIRTUAL overlay: no file is written, no Chromium is
     * spawned, and the working tree is untouched when it returns.
     *
     * Three earlier attempts at this test were worse and a HARD RULE #25 checker said
     * so. Calling `buildFreshness(dv, theme, false)` twice asserted that a pure function
     * returns the same value for the same input — true of ANY implementation that takes
     * the flag as a parameter, so moving the `mdFresh` computation back inside the theme
     * loop (the #2253 bug, exactly) left it green. And probing the input arm by writing a
     * scratch `.css` into `lib/` both passed for the wrong reason — any pre-existing dirty
     * lib file satisfied it — and put a transient file in a directory several gates walk,
     * which is a race that took down a pre-commit run.
     *
     * So this drives `main`, which is where the bug lived.
     */
    const TOOL = require.resolve('../../../tools/build-showcase-galleries');
    const HELPER = require.resolve('../../../tools/lib/render-inputs');

    /**
     * Install the stubs, then load the tool FRESH so it picks them up.
     *
     * Both modules destructure `execFileSync` at load (`const { execFileSync } =
     * require('node:child_process')`), so patching the child_process export afterwards
     * does nothing — the binding is already captured. Dropping them from the require
     * cache first is what makes the seam real; this cost one debugging round.
     */
    function withStubs(fn, { deckDrifts = false, dirty = [], gitFails = false } = {}) {
      const cp = require('node:child_process');
      const realExec = cp.execFileSync;
      const realRead = fs.readFileSync;
      const realWrite = fs.writeFileSync;
      const realUnlink = fs.unlinkSync;
      const mdPath = galleryMarkdownPath('data-viz');
      const rendered = [];
      const wrote = [];
      try {
        cp.execFileSync = (bin, args) => {
          if (bin === 'git' && args[0] === 'status') {
            if (gitFails) throw new Error('not a git repository');
            return dirty.map((x) => `M  ${x}`).join('\0') + (dirty.length ? '\0' : '');
          }
          rendered.push(path.basename(String(args[args.length - 3] || '')));
          return '';
        };
        // VIRTUAL: the deck reads as drifted and nothing is written to disk, so a
        // concurrent test file never sees a half-written tree (the probe-file race
        // this replaces took down a pre-commit run).
        fs.readFileSync = (f, ...rest) => (f === mdPath && deckDrifts && !wrote.includes(f)
          ? String(realRead(f, 'utf8')).replace(/^# /m, '# DRIFTED ')
          : realRead(f, ...rest));
        fs.writeFileSync = (f) => { wrote.push(f); return undefined; };
        fs.unlinkSync = () => undefined;
        delete require.cache[TOOL];
        delete require.cache[HELPER];
        const tool = require(TOOL);
        return { ...fn(tool), rendered, wrote };
      } finally {
        cp.execFileSync = realExec;
        fs.readFileSync = realRead; fs.writeFileSync = realWrite; fs.unlinkSync = realUnlink;
        delete require.cache[TOOL];
        delete require.cache[HELPER];
        require(TOOL);
      }
    }

    const runMain = (argv, opts) => withStubs((tool) => ({ code: tool.main(argv) }), opts);
    const buildFreshnessWith = (dirty) =>
      withStubs((tool) => ({ v: tool.buildFreshness(tool.SHOWCASES[0], 'light', true) }), { dirty }).v;

    test('a drifted deck rebuilds BOTH themes, not just the first (#2253)', () => {
      // THE BUG: `buildOne` recomputed "does the deck match the manifests?" per theme,
      // and the LIGHT pass writes that deck — so dark compared against what light had
      // just written, called it fresh and skipped. Counting renders is the only way to
      // see it, because it is a two-theme-in-one-run failure.
      const { rendered } = runMain(['--dry-run'], { deckDrifts: true });
      assert.equal(rendered.filter((r) => r.endsWith('.pdf')).length, 0, '--dry-run must spend no render');
    });

    test('the build renders both themes when the deck drifted', () => {
      const { rendered } = runMain([], { deckDrifts: true });
      const pdfs = rendered.filter((r) => r.endsWith('.pdf')).map((r) => path.basename(r));
      assert.deepEqual(pdfs.sort(), ['data-viz-gallery.dark.pdf', 'data-viz-gallery.light.pdf'],
        'light AND dark must rebuild — dark skipping is #2253');
    });

    test('a changed render input alone makes it stale, deck untouched', () => {
      // The headline of #2253: engine CSS moves every rendered slide and no manifest, so
      // the markdown compare is byte-identical while the PDF is stale. The reason must
      // NAME the input, or the assertion would pass on any unrelated dirty file.
      const st = buildFreshnessWith(['lib/components/chart/gantt/gantt.styles.css']);
      assert.equal(st.fresh, false, 'a changed render input must not read as fresh');
      assert.match(st.reason, /gantt\.styles\.css/, 'the reason must name the input it saw');
    });

    test('a run where git could not answer SAYS so (it used to print `already fresh`)', () => {
      // The reason existed and reached nobody: `buildFreshness` passed
      // "git cannot answer — not checked" through, and all three fresh paths in `main`
      // printed the same `already fresh` line and dropped it. So the one run where the
      // render-input check did not actually RUN looked exactly like the runs where it
      // passed — a quiet pass, which is the failure this branch is about (HARD RULE #23).
      const out = [];
      const realWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
      try {
        runMain(['--dry-run'], { gitFails: true });
      } finally {
        process.stdout.write = realWrite;
      }
      const printed = out.join('');
      assert.match(printed, /render inputs were NOT checked/, 'the caveat must reach stdout');
      assert.match(printed, /git cannot answer/, 'and it must name why');
      // Once per run, not once per showcase × theme.
      assert.equal(printed.split('render inputs were NOT checked').length - 1, 1);
    });

    test('a dirty PDF reads fresh — the arm this fix does NOT close', () => {
      // Stated as a test rather than left to a comment, because it is the one place the
      // helper can still answer "fresh" over a stale artifact: once the PDF is dirty in
      // this working tree, `stalenessAgainstInputs` reads that as "a rebuild already
      // happened" and stops asking. Edit the engine, build, edit again, and this arm
      // still says fresh.
      //
      // An mtime comparison was tried here and reverted: `git stash pop` restores dirty
      // inputs and a dirty artifact together, so their relative mtimes become checkout
      // ORDER and a zero-content-change tree reports stale — and a DELETED input stats as
      // absent, sorts oldest, and reads fresh. The sound fix is content-addressed and is
      // its own change. This test pins the CURRENT answer so that change has to move it.
      const both = ['lib/components/chart/gantt/gantt.styles.css', 'examples/data-viz-gallery.light.pdf'];
      assert.equal(buildFreshnessWith(both).fresh, true,
        'a dirty PDF still short-circuits to fresh — change this line when content-addressing lands');
      // …while the same input change WITHOUT a dirty PDF is caught, which is the fix.
      const st = buildFreshnessWith(['lib/components/chart/gantt/gantt.styles.css']);
      assert.equal(st.fresh, false, 'a changed input over a clean PDF must be stale');
    });

    test('a missing PDF is stale even when the deck matches', () => {
      const bogus = { ...dv, id: `no-such-showcase-${process.pid}` };
      const f = buildFreshness(bogus, 'light', true);
      assert.equal(f.fresh, false);
      assert.equal(f.reason, 'missing PDF');
    });

  });

  test('every chart+math component actually has a sample (no silent omission)', () => {
    // A component with no `sample` is COUNTED by name but the composer emits no
    // slide for it, so the deck would silently omit it while the freshness/parity
    // gates stay green. Assert every in-scope component carries a sample, closing
    // that false-green.
    const set = [...(groups.chart || []), ...(groups.math || [])];
    const sampleless = set.filter((m) => !(typeof m.sample === 'string' && m.sample.trim())).map((m) => m.name);
    assert.deepEqual(sampleless, [],
      `chart/math components with no manifest.sample (would be omitted from the deck): ${sampleless.join(', ')}`);
  });
});
