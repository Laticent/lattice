/**
 * Unit: which LOOK does a slide's diagram bake in? (`lib/core/diagram-look.js`)
 *
 * The sibling of the band tests, and it guards the same failure mode: a Mermaid SVG
 * bakes its geometry at render time, so `look` cannot be applied or undone by a later
 * CSS rule. If the two render paths ever answer this differently, a deck's diagrams
 * change SHAPE between the Playground and the exported PDF — the geometry version of
 * the #1326 ink/chip mismatch.
 *
 * The load-bearing case is rule 1. On `a11y-*` / `onyx` / `concrete` the per-category
 * PATTERN is the redundant encoding a color-blind or monochrome reader depends on
 * (M1, engineering/textures.md), and it cannot survive rough.js's stroked hachure.
 * A regression there would be silent on every other theme and invisible to a contrast
 * audit, so it is asserted from both directions: the deck asking for sketch, and a
 * single slide pinning it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveDiagramLook,
  paletteUsesTextureChannel,
  deckWantsHandDrawn,
} = require('../../../lib/core/diagram-look');
const { MODE_REGISTER } = require('../../../lib/core/resolve-mode');

const REPO = path.join(__dirname, '..', '..', '..');
const THEMES = path.join(REPO, 'themes');

// THE EMULATOR'S REAL SLICE. `preprocessMermaid` passes
// `source.match(/^---\r?\n[\s\S]*?\r?\n---/)[0]`, which ENDS at the closing `---`
// with NO trailing newline. The first cut of these tests appended one, so every
// case exercised an input the engine never produces — and `mode: sketch` shipped
// reaching no diagram at all, green. Both shapes are asserted below.
const fm = (body) => `---\nmarp: true\n${body}\n---`;
const fmNl = (body) => `${fm(body)}\n`;

describe('resolveDiagramLook — rule 3, inherit the deck', () => {
  test('a plain deck bakes classic', () => {
    assert.equal(resolveDiagramLook({ frontMatter: fm('theme: carta'), slideClass: 'diagram' }), 'classic');
  });

  test('`mode: sketch` bakes hand-drawn', () => {
    assert.equal(resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'diagram' }), 'handDrawn');
  });

  test('`mode: sketch-clean` bakes hand-drawn too — clean BODY, not clean shapes', () => {
    assert.equal(resolveDiagramLook({ frontMatter: fm('mode: sketch-clean'), slideClass: 'diagram' }), 'handDrawn');
  });

  test('the legacy deck-wide `class: sketch` spelling is honored', () => {
    // Most decks in the repo still say this; it predates the mode/finish split.
    assert.equal(resolveDiagramLook({ frontMatter: fm('class: sketch'), slideClass: 'diagram' }), 'handDrawn');
  });

  test('`mode:` wins over a leftover `class:` on a half-migrated deck', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('mode: boardroom\nclass: sketch'), slideClass: 'diagram' }),
      'classic',
    );
  });

  test('no front matter at all is classic, not a throw', () => {
    assert.equal(resolveDiagramLook({}), 'classic');
    assert.equal(resolveDiagramLook({ frontMatter: '', slideClass: '' }), 'classic');
  });
});

describe('resolveDiagramLook — rule 2, the slide owns its look', () => {
  test('`_class: sketch` reaches a diagram on an otherwise plain deck', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('theme: carta'), slideClass: 'diagram sketch' }),
      'handDrawn',
    );
  });

  test('`_class: boardroom` opts ONE slide out of a sketch deck', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'boardroom' }),
      'classic',
    );
  });

  test('a slide class that names no mode token inherits — it does not force an answer', () => {
    // The #1340 shape: `_class: diagram` says nothing about mode, so it must not be
    // read as "this slide pinned something".
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'diagram dark' }),
      'handDrawn',
    );
  });
});

describe('resolveDiagramLook — rule 1, the texture channel outranks the finish', () => {
  test('a texture palette bakes classic even when the DECK asks for sketch', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'diagram', paletteUsesTexture: true }),
      'classic',
    );
  });

  test('a texture palette bakes classic even when the SLIDE pins sketch itself', () => {
    // Rule 1 is checked before rule 2 precisely so a per-slide pin cannot reach past it.
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('theme: a11y-base'), slideClass: 'diagram sketch', paletteUsesTexture: true }),
      'classic',
    );
  });
});

describe('paletteUsesTextureChannel — read the real theme files', () => {
  // A hardcoded theme list here would rot the first time a palette adopted the
  // channel, which is the whole reason the predicate reads CSS instead.
  const read = (name) => fs.readFileSync(path.join(THEMES, `${name}.css`), 'utf8');

  test('the three texture BASES declare the channel', () => {
    for (const name of ['a11y-base', 'onyx', 'concrete']) {
      assert.equal(paletteUsesTextureChannel(read(name)), true, `${name} should declare --cat-N-texture`);
    }
  });

  test('a hue-carried palette does not', () => {
    for (const name of ['carta', 'indaco', 'mustard']) {
      assert.equal(paletteUsesTextureChannel(read(name)), false, `${name} should not declare --cat-N-texture`);
    }
  });

  test('no theme is missed: every file declaring the channel is a known texture family', () => {
    // The emulator resolves @import before asking, so the VARIANTS (a11y-deuteranopia,
    // onyx-dark, …) inherit the answer rather than declaring it. This asserts the set
    // of DECLARING files, so a new one shows up here rather than silently opting a
    // palette out of the hand look.
    const declaring = fs.readdirSync(THEMES)
      .filter((f) => f.endsWith('.css'))
      .filter((f) => paletteUsesTextureChannel(fs.readFileSync(path.join(THEMES, f), 'utf8')))
      .map((f) => f.replace('.css', ''))
      .sort();
    assert.deepEqual(declaring, ['a11y-base', 'concrete', 'onyx']);
  });
});

describe('deckWantsHandDrawn', () => {
  test('reads the deck half on its own', () => {
    assert.equal(deckWantsHandDrawn(fm('mode: sketch')), true);
    assert.equal(deckWantsHandDrawn(fm('class: sketch')), true);
    assert.equal(deckWantsHandDrawn(fm('theme: carta')), false);
    assert.equal(deckWantsHandDrawn(''), false);
  });
});

describe('resolveDiagramLook — the front-matter slice the emulator actually passes', () => {
  // Regression: `readFrontMatterMode` re-extracts the fence with a pattern that
  // requires a newline AFTER the closing `---`. Fed the emulator's slice it returned
  // null, so a `mode:` deck fell through to the legacy `class:` fallback and
  // `mode: sketch` never reached a diagram on the export path.
  for (const [label, make] of [['no trailing newline (the engine slice)', fm], ['with trailing newline', fmNl]]) {
    test(`mode: sketch resolves hand-drawn — ${label}`, () => {
      assert.equal(resolveDiagramLook({ frontMatter: make('mode: sketch'), slideClass: 'diagram' }), 'handDrawn');
    });
    test(`mode: boardroom resolves classic — ${label}`, () => {
      assert.equal(resolveDiagramLook({ frontMatter: make('mode: boardroom'), slideClass: 'diagram' }), 'classic');
    });
  }

  test('the full deck source works too — callers pass either', () => {
    const source = `${fmNl('mode: sketch')}\n## A slide\n`;
    assert.equal(resolveDiagramLook({ frontMatter: source, slideClass: 'diagram' }), 'handDrawn');
  });
});

describe('resolveDiagramLook — the PRINT band is a texture band for every theme', () => {
  // base.print-textures.css points --cat-N-texture at the a11y set under
  // section.print for ANY palette, so a hue-carried theme still carries its
  // categories by pattern once it prints. Without this the hand look stripped the
  // channel on paper, in monochrome — and split the two render paths, since the
  // preview reads computed style and DOES see section.print.
  test('print forces classic even on a hue-carried palette asking for sketch', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'diagram', band: 'print' }),
      'classic',
    );
  });

  test('print outranks a per-slide sketch pin', () => {
    assert.equal(
      resolveDiagramLook({ frontMatter: fm('theme: carta'), slideClass: 'diagram sketch', band: 'print' }),
      'classic',
    );
  });

  test('light and dark bands do not change the answer', () => {
    for (const band of ['light', 'dark', '']) {
      assert.equal(
        resolveDiagramLook({ frontMatter: fm('mode: sketch'), slideClass: 'diagram', band }),
        'handDrawn',
        `band ${band || '(unset)'} should not suppress the hand look`,
      );
    }
  });

  test('the print texture block really does cover every theme', () => {
    // Pins the premise the rule rests on, so a refactor of base.print-textures.css
    // that scoped it per-theme would fail HERE rather than silently on paper.
    const css = fs.readFileSync(path.join(REPO, 'lib', 'base', 'base.print-textures.css'), 'utf8');
    assert.match(css, /section\.print\s*\{[^}]*--cat-1-texture\s*:/, 'section.print must declare the texture channel');
  });
});

describe('MODE_WANTS_HAND is derived, not listed', () => {
  test('every mode register whose classes include `sketch` resolves hand-drawn', () => {
    // Derived from MODE_REGISTER so a new register cannot be left behind. If this
    // fails, a mode was added whose class string says sketch but which resolves clean.
    for (const [name, classes] of Object.entries(MODE_REGISTER)) {
      const wantsHand = String(classes).split(/\s+/).includes('sketch');
      assert.equal(
        resolveDiagramLook({ frontMatter: fm(`mode: ${name}`), slideClass: 'diagram' }),
        wantsHand ? 'handDrawn' : 'classic',
        `mode: ${name} (classes "${classes}")`,
      );
    }
  });
});
