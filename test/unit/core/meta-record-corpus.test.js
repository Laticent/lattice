/**
 * The corpus comparison from engineering/decisions/2026-08-05-one-class-directive-reader.md,
 * rerun for EVERY directive key (design note 2026-10-17-meta-record.md §9, step 1).
 *
 * `scanMetaSource` answers "which value governs this key on this slide?" from raw source with a
 * line scan. The engine answers the same question by rendering, and writes the answer on the
 * `<section>` as `data-<key>`. Over every committed deck, the two must agree for every applied key:
 * a disagreement is a slide the linter, the editor or the packaged facts would describe differently
 * from what renders. `class` has its own gate against the engine-derived `slideClassSpans`
 * (class-directive-scan.test.js); this one covers the rest.
 *
 * The figures print on every run so the PR body re-reads them off a run instead of transcribing.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { createEngine } = require('../../../lib/engine');
const { parseFrontMatter } = require('../../../lib/engine/directives');
const { resolveSplitMode } = require('../../../lib/core/resolve-split');
const { APPLIED_KEYS, enumValues, kebab } = require('../../../lib/core/meta-keys.js');
const { scanMetaSource } = require('../../../lib/core/meta-record.mjs');
const { EXCLUDE_MIRRORS_SHELL } = require('../../helpers/generated-mirrors.js');

const ROOT = path.join(__dirname, '..', '..', '..');

// Keys this comparison cannot ask the section about, each for a reason:
//   class   has its own gate (class-directive-scan.test.js): the engine also merges the deck class in.
//   theme   is deck-only and picks the stylesheet; the engine writes no per-slide attribute for it.
const SKIPPED_KEYS = new Set(['class', 'theme']);

const htmlUnescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

describe('scanMetaSource ≡ the engine, over the committed corpus, for every applied key', () => {
  const decks = execSync(`git ls-files "*.md" ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n')
    .map((rel) => {
      let src;
      try { src = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
      const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      if (!fm || !/^\s*(marp|theme|split):/m.test(fm[1])) return null;
      if (!/<!--\s*_?[A-Za-z]+\s*(:|-->)/.test(src)) return null;
      return { rel, src };
    })
    .filter(Boolean);

  test('the corpus is big enough for this to mean something', () => {
    assert.ok(decks.length > 400, `expected 400+ decks that carry a comment, found ${decks.length}`);
  });

  test('every slide resolves the SAME value for every applied key the engine writes', () => {
    const engine = createEngine();
    const wrong = [];
    const perKey = {};
    let compared = 0;
    let skipped = 0;
    let paneSplit = 0;
    let slides = 0;
    for (const { rel, src } of decks) {
      // preview:true keeps `data-debug`, which the export path strips (lib/engine/index.js).
      const html = engine.render(src, undefined, { preview: true }).html;
      const sections = [...html.matchAll(/<section\b([^>]*)>/g)].map((m) => m[1]);
      const scanned = scanMetaSource(src).slides.slice(2); // drop the two front-matter chunks
      // A PANE-SPLIT divergence, a second known kind: a deck that cannot lay panes side by side (square, portrait,
      // story, mobile) gives each pane its own page (lib/core/panes.js), which a `^---$` scan cannot see either.
      if (sections.length > scanned.length && /<!--\s*_?pane:/.test(src) && /^size:\s*(?:square|portrait|story|mobile)\b/m.test(src)) {
        paneSplit++;
        continue;
      }
      if (sections.length !== scanned.length) {
        // A BOUNDARY divergence, not a value one: `split: headings` injects boundaries the raw
        // source does not carry (the linter's pre-existing slide-numbering gap, named in
        // 2026-08-05-one-class-directive-reader.md). Anything else is a new kind of divergence.
        skipped++;
        assert.equal(resolveSplitMode(src), 'headings', `${rel}: divergence on a \`split: rule\` deck`);
        assert.ok(sections.length > scanned.length, `${rel}: the engine found FEWER slides than the scan`);
        continue;
      }
      compared++;
      slides += sections.length;
      const deckLevel = parseFrontMatter(src).directives;
      sections.forEach((attrs, i) => {
        const resolved = scanned[i].resolved;
        for (const key of APPLIED_KEYS) {
          if (SKIPPED_KEYS.has(key)) continue;
          const m = new RegExp(`\\sdata-${kebab(key)}="([^"]*)"`).exec(attrs);
          const got = m ? htmlUnescape(m[1]) : null;
          const entry = resolved.get(key);
          const want = entry ? entry.value : (Object.hasOwn(deckLevel, key) ? deckLevel[key] : null);
          // `paginate: false` writes no attribute: pagination is on only when it is exactly `true`.
          if (key === 'paginate') {
            if ((got === 'true') === (want === 'true')) { perKey[key] = (perKey[key] || 0) + 1; continue; }
          // The engine picks a CONTENT-AWARE `focusStyle` (`ring` on a table, else `spotlight`) when a
          // slide has `focus` and names no style, so any declared style is an acceptable fill there.
          } else if (key === 'focusStyle' && want == null && resolved.has('focus') && enumValues('focusStyle').includes(got)) {
            perKey[key] = (perKey[key] || 0) + 1;
            continue;
          } else if ((got ?? '') === (want ?? '')) {
            if (got != null) perKey[key] = (perKey[key] || 0) + 1;
            continue;
          }
          wrong.push(`${rel} slide ${i + 1} ${key}: engine ${JSON.stringify(got)} vs scan ${JSON.stringify(want)}`);
        }
      });
    }
    console.log(`# meta corpus: ${decks.length} decks · ${compared} compared · ${slides} slides · ${skipped} skipped · ${wrong.length} disagreements`);
    console.log(`# meta corpus: slides carrying each key, scan = engine: ${JSON.stringify(perKey)}`);
    assert.equal(skipped, 3, 'the boundary-divergence set should stay at the `split: headings` decks');
    assert.equal(paneSplit, 1, 'and the pane-split set at examples/image-pane-story.md');
    assert.ok(compared > 400, `expected 400+ comparable decks, compared ${compared}`);
    assert.deepEqual(wrong, []);
  });
});

describe('scanMetaSource ≡ the engine, for the keys no committed deck exercises', () => {
  // The corpus carries no `color` or `background*` comment, so this synthetic deck stands in: running
  // (`key:`) and spot (`_key:`) forms, an override, and a later running value, per key.
  const KEYS = ['backgroundColor', 'color', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize'];
  const VAL = { backgroundColor: ['#102030', '#abcdef', 'navy'], color: ['#ffffff', '#111111', 'white'], backgroundPosition: ['left', 'right top', 'center'], backgroundRepeat: ['no-repeat', 'repeat-x', 'repeat'], backgroundSize: ['cover', 'contain', '50%'] };
  test('running, spot and overriding values resolve identically on every slide', () => {
    const slides = [];
    for (let i = 0; i < 3; i++) {
      slides.push(KEYS.map((k) => `<!-- ${k}: ${VAL[k][i]} -->`).join('\n') + `\n\n# Running ${i}`);
      slides.push(KEYS.map((k) => `<!-- _${k}: ${VAL[k][(i + 1) % 3]} -->`).join('\n') + `\n\n# Spot ${i}`);
      slides.push(`# Inherits ${i}`);
    }
    const src = `---\nmarp: true\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;
    const html = createEngine().render(src, undefined, { preview: true }).html;
    const sections = [...html.matchAll(/<section\b([^>]*)>/g)].map((m) => m[1]);
    const scanned = scanMetaSource(src).slides.slice(2);
    assert.equal(sections.length, scanned.length);
    const wrong = [];
    sections.forEach((attrs, i) => {
      for (const key of KEYS) {
        const m = new RegExp(`\\sdata-${kebab(key)}="([^"]*)"`).exec(attrs);
        const got = m ? htmlUnescape(m[1]) : null;
        const want = scanned[i].resolved.get(key)?.value ?? null;
        if ((got ?? '') !== (want ?? '')) wrong.push(`slide ${i + 1} ${key}: engine ${JSON.stringify(got)} vs scan ${JSON.stringify(want)}`);
      }
    });
    assert.deepEqual(wrong, []);
  });
});
