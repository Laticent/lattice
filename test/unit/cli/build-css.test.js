/**
 * Unit: tools/build-css.js — CSS bundler.
 *
 * Covers:
 *   1. bundle() emits the @layer declaration with the documented order
 *   2. bundle() includes the file-header banner so authors are warned
 *      not to edit the generated file
 *   3. bundle() includes lib/_theme.css contents (the Marp @theme block)
 *      before the @layer declaration — Marp's parser requires @theme
 *      not to be inside any layer
 *   4. bundle() picks up per-component styles.css from lib/components/<n>/
 *   5. bundle() silently skips missing source files (the migration ramp)
 *   6. bundle() reads only SOURCE files, never a generated dist/ artifact
 *   7. bundle() is deterministic — the pair that makes it authoritative (#1783)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bundle } = require('../../../tools/build-css');

describe('build-css', () => {
  test('output declares the @layer cascade in the documented order', () => {
    const out = bundle();
    assert.match(
      out,
      /@layer base, root, scaffold, components, semi-universal, universal, diagram-overrides;/
    );
  });

  test('output starts with the "Do not edit by hand" banner', () => {
    const out = bundle();
    assert.match(out, /^\/\* dist\/lattice\.css — GENERATED/);
    assert.match(out, /Do not edit by hand/);
  });

  test('Marp @theme directive appears before the @layer declaration', () => {
    const out = bundle();
    const themeIdx = out.indexOf('@theme lattice');
    const layerIdx = out.indexOf('@layer base, root');
    assert.ok(themeIdx > 0, '@theme directive missing');
    assert.ok(layerIdx > 0, '@layer declaration missing');
    assert.ok(
      themeIdx < layerIdx,
      `@theme must come before @layer (theme at ${themeIdx}, layer at ${layerIdx})`
    );
  });

  test('includes a per-source-file separator comment for traceability', () => {
    const out = bundle();
    // Every concatenated source file should be marked with its path so
    // reviewers can grep for "where did this rule come from?"
    assert.match(out, /\/\* === lib\/_theme\.css === \*\//);
  });

  test('Form Cell sheets emit after base.variants and before the Tile sheets', () => {
    // The whole cascade-neutrality argument for the self-contained Form Cells
    // (ADR 2026-06-15-form-implementation.md §6.2) rests on this emit order:
    // base.variants.css → cell/<id>/<id>.css → tile/<id>/<id>.css. A future
    // sort/slot regression would otherwise pass CI and only surface as a pixel
    // diff. Pin it here.
    const out = bundle();
    const at = (rel) => out.indexOf(`/* === ${rel} === */`);
    const variants = at('lib/base/base.variants.css');
    const cellStage = at('lib/forms/cell/stage/stage.css');
    const tileMeta = at('lib/forms/tile/meta/meta.css');
    assert.ok(variants > 0, 'base.variants.css separator missing');
    assert.ok(cellStage > 0, 'cell/stage/stage.css separator missing');
    assert.ok(tileMeta > 0, 'tile/meta/meta.css separator missing');
    assert.ok(
      variants < cellStage && cellStage < tileMeta,
      `expected base.variants < cell < tile (variants ${variants}, cell ${cellStage}, tile ${tileMeta})`
    );
    // Every Cell sheet precedes every Tile sheet (disjoint selectors, but the
    // documented slot keeps the Cell-is-the-slot / Tile-docks-in-it order).
    const cellIdxs = [...out.matchAll(/\/\* === lib\/forms\/cell\/[^=]+=== \*\//g)].map((m) => m.index);
    const tileIdxs = [...out.matchAll(/\/\* === lib\/forms\/tile\/[^=]+=== \*\//g)].map((m) => m.index);
    assert.ok(cellIdxs.length >= 5, `expected ≥5 cell sheets, got ${cellIdxs.length}`);
    assert.ok(tileIdxs.length >= 4, `expected ≥4 tile sheets, got ${tileIdxs.length}`);
    assert.ok(
      Math.max(...cellIdxs) < Math.min(...tileIdxs),
      'all Form Cell sheets must emit before all Form Tile sheets'
    );
  });

  // WHAT USED TO BE HERE, and why it is gone (#1783).
  //
  // A sixth test read `dist/lattice.css` off disk and asserted it equalled
  // `bundle()`, under the name "committed lattice.css matches bundle() output
  // (freshness gate)". Both halves of that name stopped being true at #1742,
  // which gitignored `dist/`. The file is no longer committed, so there is no
  // "did you regenerate it?" question to gate — and it is not a CI gate either,
  // because CI full-builds before it runs, which makes the comparison vacuous
  // there in exactly the state where it can never fail.
  //
  // Where it COULD fail was a developer's machine, and it failed for a reason
  // that has nothing to do with the code under test: `dist/lattice.css` is
  // whatever the last local build wrote, so any source change since then makes
  // the two differ. HARD RULE #16 requires a rebase right before every push,
  // and the pre-push hook runs this suite — so the repo mandated the exact
  // action that turned this test red, at the worst possible moment, naming a
  // subsystem the session had not touched. It blocked the #1779 push and read
  // as an unrelated regression.
  //
  // Measured: with `dist/` built at fbb6287~1 and the sources at fbb6287, the
  // on-disk file is 1,594,354 CHARACTERS against bundle()'s 1,595,126 — the byte
  // counts are 1,636,084 and 1,636,862, because the bundle is full of multi-byte
  // punctuation and `.length` is not `wc -c`. The whole 772-character delta is
  // one hunk of lib/components/chart/journey/journey.styles.css that fbb6287
  // changed: a nine-line comment added above
  // `section.journey .journey-mood-key-label`, less the `opacity: 0.85` line the
  // same commit deleted from the rule. In that same tree `npm run build:check`
  // reports every artifact up to date — correctly, because it runs
  // `--exclude-uncommitted` and `dist/` is deliberately not its business. Two
  // gates "disagreeing" over the same file was this test asking a question that
  // is no longer about the source tree.
  //
  // There is no second producer to reconcile: `main()` writes `bundle()` VERBATIM
  // to dist/lattice.css, in both a full build and `--only-uncommitted`, so those
  // two modes are byte-identical from the same sources. (It writes other things
  // too — the min file, the emoji sheet, dist/fonts/, 32 dist/themes/*.min.css —
  // and the loose phrasing matters, because dist/themes/ genuinely IS a two-pass
  // fixpoint with derive-cat-ink. dist/lattice.css is not.) `bundle()` is
  // authoritative.
  //
  // The question this test used to ask still has an answer, and it did NOT go
  // unowned: `npm run build:check:all` runs in CI's `unit` job right after the
  // full build (.github/workflows/ci.yml). That is the one place it is a real
  // question — after a build, "did each generator write what its own --check
  // recomputes, and did a later step clobber it?" — and it is mutation-checked
  // there: making main() write `freshMin` to OUTPUT turns that step red while
  // this file stays green, which is exactly the coverage the disk comparison was
  // carrying and the reason it moved to CI rather than being dropped.
  // (`npm run css:check` asks the same thing for the CSS alone, in ~0.5s, and is
  // the one to reach for by hand. CI takes the 38-artifact version.)
  // See engineering/gotchas.md.
  //
  // Rebuilding inside the test was the other candidate and is worse: `main()`
  // does `rmSync(dist/themes)` before recreating it, and three other unit files
  // read `dist/themes/`, so under `node --test`'s parallelism it would have
  // manufactured a fresh flake.
  //
  // What replaces it is the property that makes the disk comparison unnecessary
  // in the first place, and it holds in every tree state.
  test('bundle() is a pure function of the SOURCE tree — it reads nothing from dist/', (t) => {
    const seen = [];
    const record = (p) => { if (typeof p === 'string') seen.push(p); };
    for (const method of ['readFileSync', 'readdirSync', 'existsSync', 'statSync']) {
      const real = fs[method];
      t.mock.method(fs, method, function spy(p, ...rest) {
        record(p);
        return real.call(this, p, ...rest);
      });
    }
    const out = bundle();
    assert.ok(out.length > 100_000, 'bundle() returned no meaningful output');
    assert.ok(seen.length > 50, `expected bundle() to read many sources, saw ${seen.length}`);

    // OUR dist/, not any dist/. `node_modules/katex/dist/katex.min.css` is read
    // here and is a legitimate input: it is a pinned dependency's shipped file,
    // fixed by the lockfile and identical on every machine, so it is a source as
    // far as this bundle is concerned. The repo's own `dist/` is the opposite —
    // it is bundle()'s OUTPUT, and reading it would make the bundler a function
    // of its own last run. That is the loop this test exists to keep shut, and
    // scoping to the repo root is what makes the difference legible.
    // The bare directory needs its own arm: `<root>/dist` does not start with
    // `<root>/dist/`, so a `readdirSync(ROOT + '/dist')` or an `existsSync` on it
    // would slip past a trailing-separator prefix test. Any child it then read
    // would be caught, but a bundler that BRANCHED on the directory's contents
    // without reading a file would not be — so close it here rather than rely on
    // the follow-on read.
    const ownDist = path.join(path.resolve(__dirname, '..', '..', '..'), 'dist');
    const distReads = seen.filter((p) => {
      const abs = path.resolve(p);
      return abs === ownDist || abs.startsWith(ownDist + path.sep);
    });
    assert.deepEqual(
      distReads,
      [],
      "bundle() read the repo's own dist/ — it must derive that directory from sources, never from itself",
    );
  });

  test('bundle() is deterministic — two calls agree byte for byte', () => {
    // The pair matters: "reads only sources" plus "same sources, same bytes" is
    // what lets `main()` be trusted to write bundle() once, and what makes a
    // disk comparison a statement about the clock rather than about the code.
    assert.equal(bundle(), bundle());
  });
});
