/**
 * Author text never reaches `String.prototype.replace` as a replacement STRING.
 *
 * A replacement string reads `$&` (the match), `` $` `` (everything before it), `$'` (everything
 * after it), `$1`… (a group) and `$$` (one `$`). So a deck that wrote any of them in a label, a
 * caption or a cell had other markup pasted into the slide in their place: a `meta:` line
 * repeated the masthead before it, and a QR label put the rest of the SVG into `aria-label`
 * (followups.d/2519-p3-author-text-as-a-replace-replacement-string.md). Each site now passes a
 * function, whose return value is used as written.
 *
 * THE ORACLE. Each site renders the author's text twice: once as written, once with every `$`
 * swapped for `§`. Swapping `§` back must give the first output exactly. Escaping, filtering and
 * every other step treat `$` and `§` alike, so only a replacement pattern can tell them apart.
 * Counting occurrences is not enough: on a roadmap cell the expanded `$&` happened to contain the
 * text once, so a count passed with the bug in place.
 *
 * WHY NO GATE. The follow-up asked for a kernel helper or a lint-style gate against new sites.
 * Neither ships. A census on 2026-10-06 found 55 `.replace()` calls in lib/ whose replacement is
 * built at run time, and author text reaches 8 of them. The other 47 interpolate engine values
 * (class names, slide numbers, ids), so a gate keyed on the call's shape would need 47 allowlist
 * entries, and telling an author's string from an engine's needs the provenance census HARD RULE
 * #22 keeps for markup, which this does not justify. The census command is
 * `grep -rnE "\.replace(All)?\([^;]*, *\`[^\`]*\$\{" lib`, plus the same with an identifier as the
 * second argument.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const PATTERNS = ['$&', '$`', "$'", '$1', '$$'];
const TEXT = `Cost ${PATTERNS.join(' ')} end`;
const STAND_IN = '\u00a7'; // §, which no site treats differently from `$`
// Sites that build HTML escape `&`; the tests below write the text the way a renderer hands it on.
const asHtml = (s) => s.replaceAll('&', '&amp;');

/** `render(text)` puts `text` where an author's text goes; `$` must come out as written. */
async function readsAsWritten(render, { at = 'one place', text = TEXT } = {}) {
  const standIn = await render(text.replaceAll('$', STAND_IN));
  assert.ok(standIn.includes(STAND_IN), `the text did not reach the output (${at}):\n${standIn.slice(0, 600)}`);
  assert.equal(await render(text), standIn.replaceAll(STAND_IN, '$'), at);
}

describe('author text is used as written, never as a replacement pattern', () => {
  test('meta tile: a `meta:` line in the masthead bay', async () => {
    const meta = require('../../../lib/forms/tile/meta/meta.transform.js');
    await readsAsWritten((t) => meta.applyToHtml('<header>H</header><div class="masthead-bay"></div><p>after</p>', `---\nmeta: ${t}\n---\n`));
  });

  test('QR code: the label in aria-label and <title>', async () => {
    const { qrSvg } = require('../../../lib/engine/qr.js');
    await readsAsWritten((t) => qrSvg('https://example.com', { label: t }), { at: 'aria-label and <title>' });
  });

  test('QR card: the caption figure placed in a split panel', async () => {
    const { renderSection } = require('../../../lib/components/connect/_qr-card/qr-general.transform.js');
    await readsAsWritten((t) => renderSection(
      '<div class="panel-left"><h2>Title</h2></div><div class="panel-right"><p>Right</p></div>'
      + `<ul><li>https://example.com <code>qr</code></li><li>${asHtml(t)} <code>caption</code></li></ul>`,
      'qr split-panel',
    ));
  });

  test('roadmap: a status cell and a horizon card', async () => {
    const { applyStatusMarkers, applyHorizons } = require('../../../lib/components/chart/roadmap/roadmap.transform.js');
    // Cells reach the transform as rendered HTML; this text has no `<`, so it passes through raw.
    const table = (t) => '<table><thead><tr><th>Stream</th><th>Now</th><th>Next</th></tr></thead>'
      + `<tbody><tr><td>${t}</td><td>Ship it [x]</td><td>Plan [ ]</td></tr></tbody></table>`;
    await readsAsWritten((t) => applyStatusMarkers(`<h2>Roadmap</h2>${table(t)}`), { at: 'status markers' });
    await readsAsWritten((t) => applyHorizons(`<h2>Roadmap</h2>${table(t)}`), { at: 'horizons' });
  });

  test('a page of a split slide: its data-split-label', async () => {
    const { carouselize } = require('../../../lib/core/carousel.js');
    const tag = '<section data-lattice-slide="1" id="s1" class="math theorem form">';
    const card = (title) => `<blockquote><p><strong>${title}.</strong> A statement long enough to be a card.</p></blockquote>`;
    await readsAsWritten((t) => {
      const inner = '<div class="cell-masthead"><div class="masthead-lede"><h2>The heading</h2></div></div>'
        + `<div class="cell-stage">${card('Definition')}${card(asHtml(t))}${card('Lemma')}</div><div class="cell-footer"><footer>math</footer></div>`;
      const parts = carouselize(tag, inner, { strategy: 'math-structures' }, 2, 'math');
      assert.ok(Array.isArray(parts) && parts.length >= 2, 'the slide did not split');
      return parts.join('\n');
    }, { at: 'the split pages' });
  });

  test('a refused web image: its data-lattice-web-src', async () => {
    const { blockWebImages } = require('../../../lib/core/remote-ref.js');
    // The address is the author's text here, so no spaces in it.
    await readsAsWritten((t) => blockWebImages(`<img src="https://a.example/x.png?q=${asHtml(t)}" alt="x">`).html,
      { at: 'data-lattice-web-src', text: PATTERNS.join('') });
  });

  // An author's `_class:` tokens reach the section's class attribute through four more sites
  // (chart-family.js, split-panels.js, backdrop.js, carousel.js). There a `$\`` pasted the tag's
  // own prefix, `"` included, into `class="…"`, so the rest of the token became an attribute of
  // its own (`_class: piechart x$\`onmouseover=…`). Rendered through the engine, as a deck is.
  const TOKEN = `QZ${PATTERNS.join('')}QQ`;
  for (const [name, cls, body] of [
    ['a chart layout', 'piechart', '## Where it went.\n\n- Deck production `46%`\n- Meetings `22%`\n- Deciding `32%`\n'],
    ['a split panel', 'split-panel capstone', '## Left\n\nThe argument.\n\n## Right\n\nThe evidence.\n'],
    ['a finish', 'finish-grain', '## A slide with grain\n\nBody text.\n'],
  ]) {
    test(`a \`_class:\` token on ${name} (${cls})`, async () => {
      const { render } = require('../../../lib/engine/index.js');
      await readsAsWritten(async (t) => (await render(`---\ntheme: indaco\n---\n\n<!-- _class: ${cls} ${t} -->\n\n${body}`)).html, { text: TOKEN, at: cls });
    });
  }

  test('a `_class:` token on a page of a split slide', async () => {
    const { carouselize } = require('../../../lib/core/carousel.js');
    const card = (title) => `<blockquote><p><strong>${title}.</strong> A statement long enough to be a card.</p></blockquote>`;
    const inner = '<div class="cell-masthead"><div class="masthead-lede"><h2>The heading</h2></div></div>'
      + `<div class="cell-stage">${card('Definition')}${card('Theorem')}${card('Lemma')}</div><div class="cell-footer"><footer>math</footer></div>`;
    await readsAsWritten((t) => carouselize(`<section data-lattice-slide="1" id="s1" class="math theorem form ${asHtml(t)}">`, inner, { strategy: 'math-structures' }, 2, 'math').join('\n'),
      { at: 'the split pages', text: TOKEN });
  });

  test("the spark-size autofix keeps the author's spark text", async () => {
    const { sparkFitFindings } = require('../../../lib/authoring/lint-core.js');
    await readsAsWritten((t) => {
      const spark = `~{1 3 2, label: "${t}", lg}`;
      const [f] = sparkFitFindings(`---\ntheme: indaco\n---\n\n- \`${spark}\`\n`, [{ src: spark, why: 'wide', to: 'sm', over: 10 }]);
      assert.ok(f?.replace, 'no autofix was offered');
      return f.replace.to;
      // A backtick would end the code span the spark sits in, so `$\`` cannot appear in one.
    }, { at: 'the autofix', text: `Cost ${PATTERNS.filter((p) => p !== '$`').join(' ')} end` });
  });

  test("a code package's failure note", async () => {
    const { withFailureNote } = await import('../../../lib/packages/code-door-core.mjs');
    await readsAsWritten((t) => withFailureNote('<section id="s1"><p>Body</p></section>', 'pkg', t));
  });
});
