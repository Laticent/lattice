/**
 * Unit: deck-vs-slide PARITY for every switch (lib/core/switches.mjs). The owner's rule is that a deck's
 * `class:` reaches every slide and a slide's `with-X` brings a switch back, so for EVERY switch:
 *   · `class: no-X` in front matter renders exactly as the slide's own `no-X`;
 *   · `class: no-X` plus the slide's `with-X` renders exactly as the slide's own `with-X`.
 * The inversion pass found the bug class this pins: a reader handed the slide's classes without the
 * deck's (row label, heading period, pane spine, page number, callout narration each needed a hand fix).
 * A new switch reader that misses the deck class fails here instead of in an author's deck.
 *
 * Compared on the rendered section, minus `data-class` / `--class` (the slide's authored `_class` text,
 * which legitimately differs) and with the class list sorted (order is not what parity promises).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { SWITCHES } = require('../../../lib/core/switches');

const BODIES = {
  content: (cls) => `<!-- _class: content ${cls} -->\n\n## Head.\n\n- a\n- b\n\nTrailing note.\n`,
  table: (cls) => `<!-- _class: table ${cls} -->\n\n## Rates.\n\n| Criterion | A | B |\n|---|---|---|\n| Speed | 1 | 2 |\n| Cost | 3 | 4 |\n`,
  panes: (cls) => `<!-- _class: columns ${cls} -->\n\n### Left\n\nOne.\n\n### Right\n\nTwo.\n`,
};

const section = (md) => createEngine().render(md).html.match(/<section\b[^>]*>[\s\S]*?<\/section>/)[0]
  .replace(/ data-class="[^"]*"/g, '')
  .replace(/--class:&quot;[^;]*&quot;;/g, '')
  .replace(/ style=""/g, '')
  .replace(/class="([^"]*)"/g, (_, c) => `class="${c.split(/\s+/).filter(Boolean).sort().join(' ')}"`)
  // A PANE's own class list is left out: the deck's `class:` reaches each pane by design (a pane is a
  // component; `main` did this before the switch work), while a slide's `_class` stays the host's.
  .replace(/<lat-pane class="[^"]*"/g, '<lat-pane')
  // Attribute ORDER follows which directives the slide wrote; parity is about the values.
  .replace(/<(section|div)\b([^>]*)>/g, (_, tag, attrs) => `<${tag} ${(attrs.match(/[\w:-]+="[^"]*"/g) || []).sort().join(' ')}>`);
const deck = (deckClass, slide) => `---\ntheme: indaco${deckClass ? `\nclass: ${deckClass}` : ''}\n---\n\n${slide}`;

for (const [kind, body] of Object.entries(BODIES)) {
  test(`every switch: a deck-wide no-X renders as the slide's own, and a slide's with-X beats it (${kind} slide)`, () => {
    for (const s of SWITCHES) {
      assert.equal(section(deck(s.no, body(''))), section(deck('', body(s.no))), `${s.name}: deck ${s.no} differs from slide ${s.no}`);
      assert.equal(section(deck(s.no, body(s.with))), section(deck('', body(s.with))), `${s.name}: deck ${s.no} + slide ${s.with} differs from slide ${s.with}`);
    }
  });
}
