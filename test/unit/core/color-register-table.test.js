/**
 * The COLOR REGISTER TABLE — every combination of the four writers that can reach
 * one slide's color axis, checked as a TABLE rather than as a handful of repros.
 *
 * WHAT THIS IS NOT. It is not a render test and does not claim to be one. It reads
 * an HTML class string and a resolved band string; it resolves no CSS and produces
 * no pixel, so it cannot tell you which canvas a slide DRAWS — CSS decides that by
 * stylesheet order, not by the order of tokens in a class attribute. Deriving "the
 * canvas" from attribute order is exactly the mistake that let a broken permutation
 * table read green (HARD RULE #23). What it DOES prove is the thing every downstream
 * consumer depends on: which tokens the section carries, and that the baked Mermaid
 * ink was resolved for the same band. Ink and chip disagreeing is the whole #1326
 * bug family (see lib/core/diagram-band.js); this pins them together over the
 * complete input space.
 *
 * WHY A TABLE. The axis produced five defects in a row (#1326 ×4, #1329, #1340) and
 * then #1402 measured the shape of it: 40 of 168 combinations wrong, and every one
 * of them a deck that set BOTH `color-mode:` and a legacy `class:`. Fixing the
 * repros one at a time is how it became five defects. The full space is small enough
 * to enumerate, so it is enumerated.
 *
 * THE FOUR AXES, and why each one is here rather than assumed:
 *
 *   1. `color-mode:`    the first-class deck register — 5 values plus unset.
 *   2. the legacy `class:` color alias — 3 values plus unset.
 *   3. `_class:`        the slide's own — a scheme, print, a component, or a
 *                       component AND a scheme (the case where deck and slide name
 *                       the same token, which is what makes provenance unrecoverable).
 *   4. flagPrint        `--print` / `--image-mode print`. The earlier table omitted
 *                       it, which is why `--image-mode print` could become a silent
 *                       no-op on a `color-mode:` deck while `manifest.json` still
 *                       recorded "print".
 *
 * And axis 2 is run in BOTH ITS SPELLINGS — the front-matter key and the mid-deck
 * global `<!-- class: … -->` — because they are governed differently ON PURPOSE and
 * an untested asymmetry is indistinguishable from a bug. See
 * lib/core/deck-class-register.js: the front-matter register is APPENDED over a
 * slide's own `_class:` and so can collide, while a global comment directive is
 * REPLACED wholesale by a slide's own and sits below the front matter in document
 * order — it overrides `color-mode:` locally for the same reason a spot `_class:
 * dark` does.
 *
 * 7 `color-mode:` values × 5 `class:` values × 7 `_class:` values × 2 flag states
 * × 2 spellings = 980 rows, each checked on THREE axes: the section's colour
 * tokens, its COMPONENT, and the band its Mermaid ink was baked for.
 *
 * See engineering/decisions/2026-08-05-deck-class-register-boundary.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../../../lib/engine');
const { resolveDiagramBand } = require('../../../lib/core/diagram-band');
const { withPrintColorMode, colorModeClass } = require('../../../lib/core/resolve-color-mode');
const { COLOR_MODE_TOKENS } = require('../../../lib/core/color-mode');
const { frontMatterScalar } = require('../../../lib/core/front-matter-key');
const { slideClassSpans, slideClassAt } = require('../../../lib/core/slide-class-spans');
const { isComponentToken, DEFAULT_COMPONENT } = require('../../../lib/core/resolve-component');

const AXIS = new Set(COLOR_MODE_TOKENS);

// `light  # migrated 2026-08` is R2's exact input: a value with a trailing YAML
// comment. It used to be a value NO reader understood — the point being that they
// must all fail to understand it the SAME way. Since `frontMatterScalar`
// (lib/core/front-matter-key.js) became the one scalar rule, every reader now
// UNDERSTANDS it the same way instead, as plain `light`. Either way the row earns
// its place: an earlier table generated only bare names, so the loose/strict split
// that shipped a print canvas with light-baked ink could not have appeared in it.
const COLOR_MODES = [null, 'light', 'dark', 'system', 'inherited', 'print', 'light  # migrated 2026-08'];
// `kpi` is R1's input. Without a COMPONENT in the deck-wide register, the row
// where the deck and the slide name the SAME component — the one that made a
// by-value strip delete the slide's own layout — was not in the table at all.
const DECK_CLASSES = [null, 'light', 'dark', 'print', 'kpi'];
const SLIDE_CLASSES = [null, 'light', 'dark', 'print', 'kpi', 'kpi dark', 'kpi light'];
const SPELLINGS = ['frontmatter', 'global'];

/** One deck source for a row of the table. */
function build({ cm, deck, slide, spelling }) {
  const fm = ['---', 'marp: true', 'theme: indaco', 'split: rule'];
  if (cm) fm.push(`color-mode: ${cm}`);
  if (deck && spelling === 'frontmatter') fm.push(`class: ${deck}`);
  fm.push('---', '');
  const global = deck && spelling === 'global' ? `<!-- class: ${deck} -->\n\n` : '';
  const spot = slide ? `<!-- _class: ${slide} -->\n\n` : '';
  return `${fm.join('\n')}\n${global}${spot}## S\n\ntext\n`;
}

/**
 * THE CONTRACT, spelled independently of the implementation — the color-axis tokens
 * the section must end up carrying.
 *
 *   · The engine's print flag writes `color-mode: print`, which outranks everything
 *     deck-wide (a CLI flag is the strongest statement of "this is going on paper").
 *   · `color-mode:` supersedes the legacy front-matter `class:` color alias, whatever
 *     the alias says — including `print`.
 *   · A mid-deck global `<!-- class: … -->` is NOT superseded; a slide's own
 *     `_class:` replaces it WHOLESALE (Marpit's spot-replaces-global: the whole
 *     `class` key, not the tokens it happens to name).
 *   · A slide that names a scheme owns its scheme — but `print` is a medium, not a
 *     scheme, so a deck-wide print survives alongside a slide's own pin.
 */
function expectedTokens({ cm, deck, slide, spelling, flagPrint }) {
  // The AXIS token in the deck-wide value, not the value wholesale — the register
  // may carry a non-colour token beside it (`kpi`, `no-note`), and only the colour
  // one belongs on this axis.
  const axisIn = (v) => (v || '').split(/\s+/).find((t) => AXIS.has(t)) || '';
  // Through `frontMatterScalar` — the deck writes `color-mode: <cm>` as a literal
  // line, and the engine cleans that scalar (trailing YAML comment stripped) before
  // `colorModeClass` ever sees it. Modelling the read here rather than assuming a
  // bare name is what lets the commented row carry a real expectation instead of a
  // refusal. Not a tautology: the row still independently pins the section CLASS,
  // the COMPONENT and the baked BAND against each other.
  const deckColor = flagPrint ? 'print' : (colorModeClass(frontMatterScalar(cm || ''))
    || (spelling === 'frontmatter' ? axisIn(deck) : ''));
  let slideOwn = '';
  if (spelling === 'global') slideOwn = axisIn(deck);
  if (slide) slideOwn = axisIn(slide);
  const out = new Set();
  if (slideOwn) {
    out.add(slideOwn);
    if (deckColor === 'print' && slideOwn !== 'print') out.add('print');
  } else if (deckColor) out.add(deckColor);
  return out;
}

/**
 * The COMPONENT the section must end up carrying — a second axis, because the
 * colour axis alone cannot see R1. A by-value strip deleted a slide's own
 * `kpi`; every row below checks that the component survives, not just the canvas.
 *
 *   · front matter naming a component  → refused, so the slide's own wins, else
 *     the default (`content`);
 *   · a mid-deck global naming one     → honoured, but a slide's own `_class:`
 *     replaces it WHOLESALE (so a spot naming no component falls to the default).
 */
function expectedComponent({ deck, slide, spelling }) {
  const componentIn = (v) => (v || '').split(/\s+/).find(isComponentToken) || '';
  if (slide) return componentIn(slide) || DEFAULT_COMPONENT;
  if (spelling === 'global' && deck) return componentIn(deck) || DEFAULT_COMPONENT;
  return DEFAULT_COMPONENT;
}

/** The band those tokens must bake for. Print is a medium and outranks both schemes. */
function expectedBand(tokens) {
  if (tokens.has('print')) return 'print';
  return tokens.has('dark') ? 'dark' : 'light';
}

const show = (s) => `{${[...s].sort().join(' ')}}`;

describe('the color register table — color-mode: × class: × _class: × --print', () => {
  for (const spelling of SPELLINGS) {
    test(`every combination resolves one color axis and one band (deck class as ${spelling})`, () => {
      const wrong = [];
      let rows = 0;
      for (const flagPrint of [false, true]) {
        for (const cm of COLOR_MODES) {
          for (const deck of DECK_CLASSES) {
            for (const slide of SLIDE_CLASSES) {
              rows++;
              const raw = build({ cm, deck, slide, spelling });
              const src = flagPrint ? withPrintColorMode(raw) : raw;
              const cls = (engine.render(src).html.match(/<section[^>]*\sclass="([^"]*)"/) || [])[1] || '';
              const got = new Set(cls.split(/\s+/).filter((t) => AXIS.has(t)));
              const want = expectedTokens({ cm, deck, slide, spelling, flagPrint });
              // The BAKE half, resolved exactly as the export path resolves it: the
              // source-side slide class (which reads both directive forms) plus the
              // deck's front matter. If the two halves can disagree, they will.
              const fence = (src.match(/^---[\s\S]*?\n---/) || [''])[0];
              const spans = slideClassSpans(src).spans;
              const band = resolveDiagramBand({
                frontMatter: fence,
                slideClass: slideClassAt(spans, src.length - 3),
                flagPrint,
              });
              const row = `${spelling} print=${flagPrint} color-mode=${cm} class=${deck} _class=${slide}`;
              // COMPONENTS, checked alongside the colour axis — a lost colour token
              // is a wrong canvas, a lost component token is a wrong LAYOUT.
              const comps = cls.split(/\s+/).filter(isComponentToken);
              const wantComp = expectedComponent({ deck, slide, spelling });
              if (show(got) !== show(want)) {
                wrong.push(`${row}\n    class → ${show(got)}, expected ${show(want)}   (full: "${cls}")`);
              } else if (comps.length !== 1 || comps[0] !== wantComp) {
                wrong.push(`${row}\n    component → [${comps.join(' ')}], expected exactly [${wantComp}]   (full: "${cls}")`);
              } else if (band !== expectedBand(want)) {
                wrong.push(`${row}\n    band → ${band}, expected ${expectedBand(want)}   (class: "${cls}")`);
              }
            }
          }
        }
      }
      assert.equal(rows, 490, 'the table must stay complete — a dropped axis reads as a pass');
      assert.deepEqual(wrong, [],
        'a token the section does not carry is a canvas the author did not ask for; a band that '
        + 'disagrees with it is baked ink on the wrong chip');
    });
  }

  // The four regressions the strip-after-stamp attempt shipped, as named cases.
  // All four inputs ARE generated by the table above — R1 needs a component in the
  // deck-wide register and a component assertion, R2 needs a value with a trailing
  // YAML comment, and both were missing from an earlier version of this table,
  // which is how a "672-row gate" could cover only half the regressions it named.
  // They are kept as named cases anyway: a table failure names a row, not a bug.
  describe('the shapes a subtract-after-stamp design gets wrong', () => {
    const classOf = (src) => (engine.render(src).html.match(/<section[^>]*\sclass="([^"]*)"/) || [])[1] || '';

    test('R1 · a slide keeps its own component when the deck-wide register names one too', () => {
      const src = ['---', 'marp: true', 'theme: indaco', 'class: kpi', '---', '',
        '<!-- _class: kpi -->', '', '## S', '', 'text', ''].join('\n');
      const cls = classOf(src).split(/\s+/);
      assert.ok(cls.includes('kpi'), `the slide's own component survives, got "${cls.join(' ')}"`);
      assert.ok(!cls.includes('content'), 'and no default is appended over it');
    });

    test('R2 · one reader for `color-mode:`, so a trailing comment cannot split the answer', () => {
      // The invariant R2 guards is UNCHANGED: the canvas and the ink are one
      // decision, and a trailing YAML comment must not make two readers answer
      // differently. What changed is the ANSWER they agree on. `frontMatterScalar`
      // strips the comment, so `color-mode: light` is a real declaration and — per
      // this register's own rule — it supersedes the legacy `class: print` alias.
      // Before, the value was unreadable, `class: print` won by default, and the
      // regression was a print canvas with light-baked ink. Now light wins on BOTH
      // halves. Either way the two must not split, which is what this asserts.
      const src = ['---', 'marp: true', 'theme: indaco', 'color-mode: light  # migrated 2026-08',
        'class: print', '---', '', '## S', '', 'text', ''].join('\n');
      const cls = classOf(src).split(/\s+/);
      const fence = (src.match(/^---[\s\S]*?\n---/) || [''])[0];
      assert.ok(cls.includes('color-light'),
        `the comment is stripped and color-mode: supersedes the alias, got "${cls.join(' ')}"`);
      assert.ok(!cls.includes('print'), 'the superseded alias does not also land');
      assert.equal(resolveDiagramBand({ frontMatter: fence, slideClass: '' }), 'light',
        'and the bake agrees — the canvas and the ink are one decision');
    });

    test('R3 · the print flag reaches the canvas on a deck that sets `color-mode:`', () => {
      const src = withPrintColorMode(['---', 'marp: true', 'theme: indaco', 'color-mode: dark',
        '---', '', '## S', '', 'text', ''].join('\n'));
      const cls = classOf(src).split(/\s+/);
      assert.ok(cls.includes('print'), `got "${cls.join(' ')}"`);
      assert.ok(!cls.includes('dark'), 'and the deck color mode it overrode is gone');
      assert.equal(resolveDiagramBand({ frontMatter: src, slideClass: '', flagPrint: true }), 'print');
    });

    test('R4 · a mid-deck global `<!-- class: … -->` is never deleted', () => {
      const src = ['---', 'marp: true', 'theme: indaco', 'color-mode: light', 'class: dark',
        '---', '', '## A', '', '---', '', '<!-- class: dark -->', '', '## B', '', 'text', ''].join('\n');
      const all = [...engine.render(src).html.matchAll(/<section[^>]*\sclass="([^"]*)"/g)]
        .map((m) => m[1].split(/\s+/));
      assert.ok(all[0].includes('color-light'), `slide 1 takes the deck color mode, got "${all[0].join(' ')}"`);
      assert.ok(!all[0].includes('dark'), 'and the superseded front-matter alias is not stamped');
      assert.ok(all[1].includes('dark'), `slide 2's own mid-deck global stands, got "${all[1].join(' ')}"`);
    });
  });
});
