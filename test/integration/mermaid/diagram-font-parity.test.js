/**
 * Integration: the face the EXPORT bakes into a diagram is the face the CASCADE resolves
 * for that slide (#1674, HARD RULE #1).
 *
 * WHY THIS EXISTS AND THE UNIT PARITY TEST IS NOT ENOUGH. `diagram-theme-parity.test.js`
 * drives both paths with ONE fake reader, so it proves the shared MAP agrees. It cannot
 * see a divergence that lives in a path's own READER — and #1674 put one there on
 * purpose: the export resolves tokens offline, where `base.sketch.css`'s class-scoped
 * `--font-body` re-point is invisible, so `readScopeToken` re-applies it by hand.
 *
 * The adversarial trio's checker proved the gap was real by mutation: making
 * `readScopeToken` never apply the re-point, and hard-coding `scope.hand` to false, each
 * COMPLETELY disable the feature this issue exists to deliver — and left all 6641 unit
 * tests green. Nothing constrained the behavior; only its ingredients.
 *
 * So this renders REAL DECKS through the REAL CLI and, for each slide, compares the
 * font-family baked into the SVG against `getComputedStyle(section).--font-body` in the
 * EXPORTED page. Both readings come from the export, which is the point — it asks whether
 * the offline bake agrees with the cascade of the artifact it produced.
 *
 * IT IS NOT THE PREVIEW'S CASCADE, and an earlier version of this note said it was. The
 * preview rescopes `:lattice-root` onto the section (`composeCss`), so a token that
 * resolves in one can fail in the other — which is exactly how a sketch-clean
 * custom-property cycle survived this gate. `preview-diagram-face.test.js` is the one
 * that reads the preview.
 *
 * The `sketch-clean` row is the one that caught a shipped bug: that register wants hand
 * SHAPES and a clean body FACE, and an earlier cut resolved the type from
 * `deckWantsHandDrawn` — which contains `sketch-clean` — so the export baked the hand
 * face where the cascade said Outfit.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const CHROME = resolveChrome();
const TIMEOUT = 180000;

const DIAGRAM = '```mermaid\nflowchart LR\n  A["Alpha node"] --> B["Beta node"]\n```';

/** A deck whose every slide carries a diagram and a distinct mode answer. */
function deck(frontMatterExtra, slideClasses) {
  const slides = slideClasses.map((cls) =>
    `${cls ? `<!-- _class: diagram ${cls} -->\n\n` : ''}## Slide\n\n${DIAGRAM}`);
  return `---\nmarp: true\ntheme: indaco\n${frontMatterExtra}\n---\n\n${slides.join('\n\n---\n\n')}\n`;
}

/** Render a deck and report, per slide, the baked face and the cascade's `--font-body`. */
async function facesFor(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fontparity-'));
  try {
    const md = path.join(dir, 'deck.md');
    fs.writeFileSync(md, source);
    const r = spawnSync(process.execPath, [EMULATOR, md, path.join(dir, 'deck.pdf')],
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);

    const puppeteer = require('puppeteer');
    const url = require('node:url');
    const launch = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    if (CHROME) launch.executablePath = CHROME;
    const browser = await puppeteer.launch(launch);
    try {
      const page = await browser.newPage();
      await page.goto(url.pathToFileURL(path.join(dir, 'deck.html')).href, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      return await page.evaluate(() => {
        // Compare FAMILY NAMES, not raw strings: mermaid re-quotes what it is given, so
        // `"Shantell Sans"` and `'Shantell Sans'` are the same answer.
        const first = (stack) => String(stack || '').split(',')[0].replace(/["']/g, '').trim();
        return [...document.querySelectorAll('section')].map((section) => {
          const label = section.querySelector('.mermaid-svg .nodeLabel');
          if (!label) return null;
          return {
            classes: section.className,
            baked: first(getComputedStyle(label).fontFamily),
            cascade: first(getComputedStyle(section).getPropertyValue('--font-body')),
          };
        }).filter(Boolean);
      });
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('the per-diagram font keys cover every one mermaid ships', () => {
  // `themeVariables.fontFamily` is global and most families follow it. Four do not: C4,
  // journey, sequence and timeline carry their OWN `*FontFamily` config keys, defaulted to
  // Open Sans / trebuchet ms. A `mode: sketch` deck rendered a C4 context diagram with 33
  // of 34 labels in Open Sans, and a user journey with 22 of 51 — on slides where every
  // other word was hand-drawn.
  //
  // `engineInitConfig` has to enumerate those keys (it is pure and fs-free, so it cannot
  // read mermaid's schema), which means the enumeration can rot. This derives the truth
  // from the installed mermaid and fails when it does.
  const { engineInitConfig, C4_FONT_KINDS } = require('../../../lib/integrations/mermaid/init-directive');

  /**
   * The object a source offset sits directly inside, by BRACE DEPTH — walk backwards to
   * the first `{` that is not already closed, then read the key in front of it. Returns
   * null at the top level.
   *
   * The first version took "the last `\"name\": {` within 6000 characters", which is a
   * guess, and it guessed wrong on the one key that matters: mermaid's TOP-LEVEL
   * `config.fontFamily` was attributed to `venn`, purely because `venn` happens to be the
   * last block declared before the top-level scalars in the bundle. That produced a
   * `venn.fontFamily` that does not exist, and the gate carried an exemption for it whose
   * stated justification ("the block's own general key, and it follows the global theme
   * variable") was false on both halves.
   */
  function enclosingBlock(src, at) {
    let depth = 0;
    for (let i = at - 1; i >= 0; i--) {
      const c = src[i];
      if (c === '}') depth++;
      else if (c === '{') {
        if (depth === 0) return (src.slice(Math.max(0, i - 80), i).match(/"([a-zA-Z0-9_]+)"\s*:\s*$/) || [])[1] || null;
        depth--;
      }
    }
    return null;
  }

  /**
   * Every `*FontFamily` key in mermaid's shipped default config, grouped by its block.
   * Top-level keys land under `TOP_LEVEL` rather than being dropped — that is where the
   * misattributed one actually lives, and the engine sets it.
   */
  const TOP_LEVEL = '(top-level)';
  function schemaFontKeys() {
    const dir = path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'chunks', 'mermaid.core');
    const out = {};
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/"([a-zA-Z0-9_]*[Ff]ontFamily)":/g)) {
        const parent = enclosingBlock(src, m.index) || TOP_LEVEL;
        (out[parent] = out[parent] || new Set()).add(m[1]);
      }
    }
    return out;
  }

  test('every font key mermaid defines is one the engine sets — with no exemptions', () => {
    const schema = schemaFontKeys();
    // A SCRAPER THAT FINDS NOTHING PASSES EVERY ASSERTION BELOW. Pin the blocks it must
    // find, so a bundle reshuffle that hides `sequence` degrades to a red test rather
    // than to a vacuous green one. (A TOTAL scraper failure is already caught by the C4
    // set-difference test; this catches losing one block.)
    assert.deepEqual(Object.keys(schema).sort(), ['(top-level)', 'c4', 'journey', 'sequence', 'timeline'],
      'the config scraper no longer finds the blocks it is written against');
    const cfg = engineInitConfig({ fontFamily: 'X' });
    const missing = [];
    for (const [block, keys] of Object.entries(schema)) {
      for (const key of keys) {
        const got = block === TOP_LEVEL ? cfg[key] : cfg[block]?.[key];
        if (got !== 'X') missing.push(block === TOP_LEVEL ? key : `${block}.${key}`);
      }
    }
    assert.deepEqual(missing.sort(), [],
      'mermaid defines these font keys and engineInitConfig does not set them, so those labels '
      + 'render in Open Sans / trebuchet ms however the deck is themed. Add them to '
      + 'perDiagramFonts (C4 shape kinds go in C4_FONT_KINDS).');
  });

  test('a pinned Mermaid theme stands the font keys down too', () => {
    // The stand-down is all-or-nothing. A `theme:` pin opts out of the deck's PALETTE,
    // and the font is part of that palette — it rides `themeVariables.fontFamily` for
    // every other family. Sending the per-diagram font keys while standing
    // `themeVariables` down gave a pinned diagram stock colors wearing the deck's type,
    // which is neither answer: before #1674 a pinned diagram got no engine config at all.
    const pinned = engineInitConfig({ fontFamily: 'HAND' }, { omitPalette: true });
    assert.equal('themeVariables' in pinned, false, 'the palette must be stood down');
    assert.equal(pinned.journey, undefined, 'journey font keys must go with it');
    assert.equal(pinned.sequence, undefined, 'sequence font keys must go with it');
    assert.equal(pinned.timeline, undefined, 'timeline font keys must go with it');
    assert.equal(pinned.c4.personFontFamily, undefined, 'c4 font keys must go with it');
    assert.equal(pinned.fontFamily, undefined, 'and the top-level font key must go with it');
    // …but the NON-palette c4 layout keys stay, exactly as the rest of the config does.
    assert.equal(pinned.c4.c4ShapeInRow, 3, 'opting out of the palette is not opting out of the layout');
  });

  test('the C4 kind list matches the shapes mermaid actually ships', () => {
    // Twenty-two, not the six an obvious reading finds: every shape has an `external_`
    // twin, and containers/components/systems each have `_db` and `_queue` variants. The
    // first cut set six and left every `System_Ext` label in Open Sans.
    const fromSchema = [...(schemaFontKeys().c4 || [])]
      .map((k) => k.replace(/FontFamily$/, '')).sort();
    assert.deepEqual([...C4_FONT_KINDS].sort(), fromSchema,
      'C4_FONT_KINDS has drifted from mermaid\'s c4 config block');
  });
});

describe('diagram font parity — the baked face IS the cascade\'s face', { skip: skipWithoutChrome(CHROME) }, () => {
  test('every mode answer agrees between the export bake and the cascade', { timeout: TIMEOUT }, async () => {
    const decks = [
      ['mode: sketch', 'mode: sketch', ['', 'boardroom', 'sketch-clean-body', 'dark']],
      ['mode: sketch-clean', 'mode: sketch-clean', ['', 'sketch']],
      ['mode: boardroom', 'mode: boardroom', ['', 'sketch']],
      ['plain deck', 'paginate: true', ['', 'sketch']],
      ['legacy class: sketch', 'class: sketch', ['', 'boardroom']],
    ];
    const mismatches = [];
    for (const [label, fm, classes] of decks) {
      // eslint-disable-next-line no-await-in-loop -- each deck is a full CLI render.
      const rows = await facesFor(deck(fm, classes));
      assert.equal(rows.length, classes.length, `${label}: expected one diagram per slide`);
      rows.forEach((row, i) => {
        if (row.baked !== row.cascade) {
          mismatches.push(`${label} · slide ${i + 1} (_class: ${classes[i] || 'none'}) — `
            + `export baked ${row.baked}, cascade resolves ${row.cascade}`);
        }
      });
    }
    assert.deepEqual(mismatches, [],
      'the export and the cascade disagree about a diagram\'s body face. That is the WYSIWYG '
      + 'split #1674 closed: the export resolves tokens offline and re-applies the sketch '
      + 'font re-point by hand (readScopeToken), so a re-point the CSS makes and the reader '
      + 'does not — or vice versa — lands here.');
  });

  test('the sketch deck really does bake the hand face — the test is not vacuous', { timeout: TIMEOUT }, async () => {
    // Without this, a change that made BOTH sides resolve the clean face would pass the
    // parity assertion above while silently deleting the feature.
    const rows = await facesFor(deck('mode: sketch', ['']));
    assert.equal(rows[0].baked, 'Shantell Sans',
      'a sketch deck must bake the hand face into its diagram labels');
  });
});
