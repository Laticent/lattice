/**
 * CENSUS: a list that renders as a TABLE draws its row rule BETWEEN rows only.
 *
 * A hairline under the last row of a ruled list stops being a separator and
 * becomes the list's outer edge — landing on whatever the stage already draws
 * below it (the footer hairline, an insight band's filled panel). Two rules
 * closing with nothing between them read as one thick doubled line rather than
 * two boundaries. #2055 measured and cleared exactly this across the table
 * family (25px apart → 133px); this arm holds the same line for the LIST family,
 * which that change did not cover.
 *
 * WHY A CENSUS AND NOT A PER-COMPONENT ASSERTION. The defect is not "component X
 * is wrong" — it is a shape that is easy to reach for (`border-bottom` on every
 * row) and correct-looking in isolation. A census fails when a NEW component
 * reaches for it, which is the case no per-component test can cover.
 *
 * WHAT COUNTS. A row-separator rule is a ONE-SIDED `border-top`/`border-bottom`
 * on a direct list row, in a list whose container sets no gap. Deliberately NOT
 * counted, because in each the border is STRUCTURE rather than a row separator —
 * the same criterion #2055 used to exempt roadmap and obligation-matrix's heat
 * and asymmetric variants:
 *   - a full `border:` shorthand, or a border paired with a left/right rail — a
 *     CARD's edge (list-steps' step cards, statute-stack's jurisdiction cards);
 *   - a gapped stack, where the rows do not touch and there is no shared edge;
 *   - `kpi`'s banding — `:nth-child` rules and a heavier `--text-heading` rule
 *     under the last row are a financial statement's total line, drawn on
 *     purpose.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const COMPONENTS = path.join(__dirname, '../../../lib/components');

/** Every `selector { body }` pair in a stylesheet, comments already stripped by the regex. */
function blocks(src) {
  return [...src.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** The one component family whose row rule is a DESIGNED total/banding treatment. */
const STRUCTURAL = [/^section\.kpi\./];

function offenders() {
  const found = [];
  const files = fs
    .readdirSync(COMPONENTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((bucket) =>
      fs
        .readdirSync(path.join(COMPONENTS, bucket.name), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((c) => path.join(COMPONENTS, bucket.name, c.name, `${c.name}.styles.css`)),
    )
    .filter((f) => fs.existsSync(f));

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const bs = blocks(src);
    for (const [sel, body] of bs) {
      const s0 = sel.split(',')[0].trim();
      if (!/(?:^|[\s>])li(\s*[:+~][\w-]*(\([^)]*\))?)?\s*$/.test(s0)) continue;
      if (s0.includes('::') || / code| strong/.test(s0)) continue;
      const sides = [...body.matchAll(/border-(top|bottom)\s*:\s*[0-9.]+px\s+(?:solid|dashed|dotted)/g)];
      if (!sides.length) continue;
      if (/(?<![-\w])border\s*:\s*[0-9]/.test(body)) continue;              // a card's box
      if (new Set(sides.map((m) => m[1])).size > 1) continue;               // both sides = a box
      if (/border-(left|right)\s*:\s*[0-9]/.test(body)) continue;           // a card's rail
      if (STRUCTURAL.some((re) => re.test(s0))) continue;
      // Interior-only already? `li + li` / `li ~ li` / `:not(:last-child)`.
      if (/\+\s*li|~\s*li|:not\(:(first|last)-child\)/.test(s0)) continue;
      // A gapped stack has no shared edge to double.
      const cont = s0.replace(/\s*>?\s*li(\s*[:+~][\w-]*(\([^)]*\))?)?\s*$/, '');
      const gapped = bs.some(
        ([s2, b2]) =>
          s2.split(',').some((x) => x.trim() === cont) &&
          /(?<!column-)(?<!row-)gap\s*:\s*(?!0(?:px)?\s*[;}]?\s*$)[^;]+/.test(b2),
      );
      if (gapped) continue;
      // A `:last-child { border-…: none }` clear beside it is the other valid shape.
      const cleared = bs.some(
        ([s2, b2]) =>
          s2.split(',').some((x) => x.trim().startsWith(s0) && /:last-child|:first-child/.test(x)) &&
          /border-(top|bottom)\s*:\s*none/.test(b2),
      );
      if (cleared) continue;
      found.push(`${path.basename(file)}  ${s0}`);
    }
  }
  return found;
}

describe('a ruled list draws its rule between rows, never as an outer edge', () => {
  test('no component draws a row rule above the first row or below the last', () => {
    assert.deepEqual(
      offenders(),
      [],
      'These rules put a hairline on a list\'s outer edge, where it doubles with the ' +
        'stage chrome instead of separating two rows. Use `li + li { border-top: … }` ' +
        '(list-tabular, inventory, list-steps.ghost) or clear the last row explicitly ' +
        '(list.takeaway, list.principles).',
    );
  });

  test('the census can actually fail — a reintroduced outer edge is caught', () => {
    // Anti-vacuity: the whole file is a deepEqual against []. Prove the walker
    // sees the shape it is looking for rather than silently matching nothing.
    const src = 'section.probe > .cell-stage > ul > li { border-bottom: 1px solid var(--border); }';
    const [[sel, body]] = blocks(src);
    assert.match(sel, /li\s*$/);
    assert.match(body, /border-bottom\s*:\s*1px solid/);
  });

  test('the four components that carry a row rule still carry one', () => {
    // The other way this could go quiet: someone deletes the rules entirely and
    // the census passes on an empty tree. Each of these renders as a ruled ledger.
    const carries = {
      'inventory/inventory/inventory': /ul > li \+ li \{\s*border-top: 1px solid var\(--border\)/,
      'inventory/list-tabular/list-tabular': /ol > li \+ li \{ border-top:1px solid var\(--border\)/,
      'inventory/list/list': /list\.takeaway[\s\S]{0,400}?border-bottom:1px solid var\(--border\)/,
      'progression/list-steps/list-steps': /\.ghost ol > li \+ li \{\s*\n?\s*border-top:1px solid var\(--border\)/,
    };
    for (const [rel, re] of Object.entries(carries)) {
      const src = fs.readFileSync(path.join(COMPONENTS, `${rel}.styles.css`), 'utf8');
      assert.match(src, re, `${rel} no longer carries its row rule`);
    }
  });
});
