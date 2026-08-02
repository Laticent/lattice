/**
 * Unit: lib/core/svg-a11y-names.js — the document-level pass that makes every named
 * chart graphic reliably announced.
 *
 * WHY THESE ARE STRING-LEVEL ASSERTIONS, not DOM ones. The first version of this kernel
 * emitted `</svg></svg>` — it sliced the element body to the index PAST the closing tag
 * and then appended another close. Every existing test passed and the rendered pixels
 * were identical, because browsers and jsdom silently drop a stray unmatched close tag.
 * A DOM-based test cannot see malformed markup; only comparing the STRING can. So the
 * tag balance is asserted here directly.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applyToHtml } = require('../../../lib/core/svg-a11y-names');

/** Every `<svg` has exactly one matching close — the invariant a DOM test cannot see. */
function balanced(html) {
  return (html.match(/<svg\b/g) || []).length === (html.match(/<\/svg\s*>/g) || []).length;
}

describe('svg-a11y-names — applyToHtml', () => {
  test('references a graphic\'s own <title>/<desc> by id', () => {
    const out = applyToHtml('<svg class="x" role="img"><title>Funnel chart</title><desc>Stages — a, b</desc><g/></svg>');
    assert.match(out, /<svg[^>]*aria-labelledby="lat-svgt-1"/);
    assert.match(out, /<svg[^>]*aria-describedby="lat-svgd-1"/);
    assert.match(out, /<title id="lat-svgt-1">Funnel chart<\/title>/);
    assert.match(out, /<desc id="lat-svgd-1">Stages — a, b<\/desc>/);
  });

  test('emits well-formed markup — no duplicated closing tag', () => {
    // The regression this file exists for. See the header.
    const src = '<p>before</p><svg role="img"><title>T</title><desc>D</desc><g/></svg><p>after</p>';
    const out = applyToHtml(src);
    assert.ok(balanced(out), `unbalanced <svg> tags: ${out}`);
    assert.equal((out.match(/<\/svg>/g) || []).length, 1);
    assert.ok(out.includes('<p>after</p>'), 'content after the graphic survives');
    assert.ok(out.startsWith('<p>before</p>'), 'content before the graphic survives');
  });

  test('appends its attributes — it never reorders the existing ones', () => {
    // Several matchers in this repo anchor on `<svg class="…"` as a PREFIX; prepending
    // reordered the attributes and broke the piechart parity test.
    const out = applyToHtml('<svg class="piechart-svg" viewBox="0 0 377 200" role="img"><title>Pie chart</title></svg>');
    assert.match(out, /^<svg class="piechart-svg" viewBox="0 0 377 200" role="img" aria-labelledby=/);
  });

  test('numbers multiple graphics independently and uniquely', () => {
    const out = applyToHtml('<svg role="img"><title>A</title></svg><svg role="img"><title>B</title></svg>');
    assert.ok(balanced(out));
    const ids = [...out.matchAll(/<title id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['lat-svgt-1', 'lat-svgt-2']);
    assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  });

  test('an <svg> with no <title> is untouched — this pass never invents a name', () => {
    const src = '<svg role="img"><g/></svg>';
    assert.equal(applyToHtml(src), src);
  });

  test('an existing accessible name always wins', () => {
    for (const src of [
      '<svg role="img" aria-label="Contact QR code"><title>QR</title></svg>',
      '<svg role="img" aria-labelledby="mermaid-title"><title>Flowchart</title></svg>',
    ]) {
      assert.equal(applyToHtml(src), src, 'an authored/upstream name must not be overridden');
    }
  });

  test('a decorative or unroled <svg> is left alone', () => {
    const src = '<svg class="journey-face" aria-hidden="true"><title>x</title></svg>';
    assert.equal(applyToHtml(src), src);
  });

  test('a <title> nested inside a shape is a TOOLTIP, not the graphic\'s name', () => {
    // The map emits a <title> per region. Promoting one would rename the whole graphic
    // after whichever shape happened to come first.
    const src = '<svg role="img"><path d="M0 0"><title>Kenya</title></path></svg>';
    assert.equal(applyToHtml(src), src, 'a non-direct-child <title> is not a name');
  });

  test('a malformed id is never reflected — the graphic is skipped, not rewritten', () => {
    const src = '<svg role="img"><title id="a&quot; onload=x">T</title></svg>';
    const out = applyToHtml(src);
    assert.equal(out, src, 'an author-owned id means hands off');
    assert.doesNotMatch(out, /aria-labelledby/, 'never reflects a malformed id, in any position');
    assert.ok(balanced(out));
  });

  test('an author id is NEVER overwritten — that would dangle references to it', () => {
    // An element has exactly one id, so "add ours as well" is not available. Overwriting
    // silently breaks every reference elsewhere in the document; the button below loses
    // its accessible name outright. Skipping costs this ONE graphic the durable naming —
    // which is the state it was already in — and costs nothing else.
    const src = '<svg role="img"><title id="radar-mini-3">Radar</title></svg>' +
      '<button aria-labelledby="radar-mini-3">go</button>';
    const out = applyToHtml(src);
    assert.equal(out, src, 'the graphic is left exactly as authored');
    assert.match(out, /id="radar-mini-3"/, 'the referenced id still has an owner');
  });

  test('an author id on <desc> costs the description, not the name', () => {
    // Finer-grained than the <title> case: we can still mint the name and simply omit
    // aria-describedby, so the graphic keeps a reliable name.
    const out = applyToHtml('<svg role="img"><title>T</title><desc id="mine">D</desc></svg>');
    assert.match(out, /aria-labelledby="lat-svgt-1"/, 'still named');
    assert.doesNotMatch(out, /aria-describedby/, 'no reference to an id we do not own');
    assert.match(out, /<desc id="mine">D<\/desc>/, 'the author id survives untouched');
  });

  test('the id-squat guard validates the prefix it actually returns', () => {
    // The guard used to test the PREVIOUS candidate and bail at a fixed count, so the last
    // prefix it assigned was returned unchecked: 32 decoy tokens as plain text plus a squat
    // on the 33rd defeated it, and the chart announced the attacker's string on a real
    // Chrome accessibility tree. The loop condition is now the invariant.
    const decoys = ['lat-svg', ...Array.from({ length: 31 }, (_, i) => `lat-x${i}-svg`)].join(' ');
    const out = applyToHtml(
      `<p>${decoys}</p><span id="lat-x31-svgt-1" hidden>Squatted</span>` +
      '<svg role="img"><title>Real chart</title></svg>',
    );
    const ref = out.match(/aria-labelledby="([^"]+)"/)[1];
    assert.notEqual(ref, 'lat-x31-svgt-1', 'must not land on the squatted id');
    assert.equal((out.match(new RegExp(`id="${ref}"`, 'g')) || []).length, 1, 'exactly one owner');
  });

  test('is idempotent — a second pass changes nothing', () => {
    const once = applyToHtml('<svg role="img"><title>T</title><desc>D</desc></svg>');
    assert.equal(applyToHtml(once), once);
  });

  test('tolerates a spaced closing tag and a `>` inside an attribute value', () => {
    for (const src of [
      '<svg role="img"><title>T</title></svg >',
      '<svg role="img" data-x="a>b"><title>T</title></svg>',
    ]) {
      const out = applyToHtml(src);
      assert.ok(balanced(out), `unbalanced for ${src}: ${out}`);
    }
  });

  test('an id already present in the document cannot steal a chart\'s name', () => {
    // The critical defect this guard exists for. `aria-labelledby` resolves to whichever
    // node owns the id, so an element declaring the id we were about to mint wins by
    // being first — and the Studio renders UNTRUSTED shared/AI-generated markdown, whose
    // `id` and `aria-*` the sanitizer preserves verbatim. Untrusted content could dictate
    // what a screen reader says a chart is, with a pixel-identical render.
    const out = applyToHtml('<span id="lat-svgt-1" hidden>PROFITS UP 400%</span><svg role="img"><title>Funnel chart</title></svg>');
    const ref = out.match(/aria-labelledby="([^"]+)"/)[1];
    assert.notEqual(ref, 'lat-svgt-1', 'must not reference the squatted id');
    assert.match(out, new RegExp(`<title id="${ref}">Funnel chart</title>`), 'the reference resolves to OUR title');
  });

  test('an id in the SOURCE is never referenced — and never destroyed either', () => {
    // No engine kernel emits a `<title id=…>`, so this is reachable only from author HTML.
    // Referencing it would let authored content (UNTRUSTED, in the Studio) dictate what a
    // chart announces as; overwriting it dangles every reference to it. Skip is the only
    // move that does neither.
    const src = '<svg role="img"><title id="author-chosen">Real name</title></svg>';
    const out = applyToHtml(src);
    assert.doesNotMatch(out, /aria-labelledby/, 'we do not point at an id the source chose');
    assert.equal(out, src, 'and we do not take the id away from it');
  });

  test('a self-closing <svg/> is left alone — rewriting it re-parents its sibling', () => {
    // Stripping the `/` turns it into an OPEN tag, and in HTML5 foreign content `<svg/>`
    // legitimately self-closes — so the next sibling gets pulled INTO the graphic. That
    // is a real DOM change, not a cosmetic one.
    const src = '<svg role="img"/><p>sibling</p>';
    assert.equal(applyToHtml(src), src);
  });

  test('html with no <svg> is returned untouched', () => {
    const src = '<p>no graphics here</p>';
    assert.equal(applyToHtml(src), src);
  });

  // ── Slide scoping ─────────────────────────────────────────────────────────
  // The counter used to run from the start of whatever document it was handed, so the SAME chart
  // was `lat-svgt-1` previewed alone and `lat-svgt-3` inside its deck. Nothing announced wrongly —
  // each document wires itself correctly — but a slice render and an export render of one slide
  // were never the same bytes, which was 87 of the 97 residual slides in `npm run equiv`.

  const sect = (body) => `<section>${body}</section>`;
  const chart = (name) => `<svg role="img"><title>${name}</title><desc>Key</desc></svg>`;

  test('ids are scoped to their section, and restart within each one', () => {
    const out = applyToHtml(sect(chart('One') + chart('Two')) + sect(chart('Three')));
    assert.match(out, /id="lat-svgt-1-1"/);
    assert.match(out, /id="lat-svgt-1-2"/);
    assert.match(out, /id="lat-svgt-2-1"/, 'the second slide restarts at 1, scoped by its own position');
  });

  test('a slice rendered at an OFFSET emits exactly what that slide emitted in the deck', () => {
    // The property the whole change exists for.
    const deck = applyToHtml(sect(chart('One')) + sect(chart('Two')) + sect(chart('Three')));
    const slice = applyToHtml(sect(chart('Three')), 2);
    const idsOf = (h) => [...h.matchAll(/id="(lat-svg[td]-[\d-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(idsOf(slice), ['lat-svgt-3-1', 'lat-svgd-3-1']);
    for (const id of idsOf(slice)) assert.ok(idsOf(deck).includes(id), `${id} is not what the deck minted for slide 3`);
  });

  test('every id in a multi-slide document is still unique', () => {
    // Slide number x per-slide ordinal. The SVG duplicate-id trap is the reason this module numbers
    // at all: a second `#lat-svgt-1` makes every reference resolve to the FIRST one.
    const out = applyToHtml([1, 2, 3].map(() => sect(chart('A') + chart('B'))).join(''));
    const ids = [...out.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))], []);
  });

  test('a section-less fragment keeps the bare ordinal — there is no slide to scope by', () => {
    // Unit fixtures and any caller handing over a bare `<svg>` rather than a rendered deck.
    assert.match(applyToHtml(chart('Alone')), /id="lat-svgt-1"/);
  });

  test('a bad offset is ignored rather than trusted', () => {
    for (const bad of [-1, 1.5, Number.NaN, '2', null, undefined]) {
      assert.match(applyToHtml(sect(chart('One')), bad), /id="lat-svgt-1-1"/, String(bad));
    }
  });

  test('THE SQUAT GUARD STILL HOLDS AGAINST THE NEW ID SHAPE', () => {
    // RE-EARNED, not assumed. This guard has been broken twice, both times by a change that looked
    // unrelated to it, so a change to the id SHAPE has to be shown not to walk past it a third time.
    // The squatter now has to name `lat-svgt-<slide>-<n>` rather than `lat-svgt-<n>`; the probe keys
    // on the `lat-svg` PREFIX, so it must still move us off — on the literal AND on the
    // entity-encoded spelling, which parses to the same id and which the Studio's sanitizer
    // re-serializes to a literal.
    for (const squat of ['lat-svgt-2-1', 'lat&#x2d;svgt-2-1']) {
      const out = applyToHtml(sect(chart('One')) + sect(`<span id="${squat}" hidden>PROFITS UP 400%</span>` + chart('Two')), 0);
      const refs = [...out.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(!refs.includes('lat-svgt-2-1'), `landed on the squatted id for ${squat}`);
      for (const ref of refs) {
        assert.equal((out.match(new RegExp(`id="${ref}"`, 'g')) || []).length, 1, `${ref} has more than one owner`);
      }
    }
  });

  test('scoping by slide does NOT let two slides collide on one id', () => {
    // The failure this whole module exists to prevent, restated for the new shape: if the slide
    // number were dropped from the id (or two sections were numbered the same), every
    // `aria-labelledby` would resolve to the FIRST owner and two charts would announce as one.
    const out = applyToHtml(sect(chart('One')) + sect(chart('Two')));
    const refs = [...out.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(refs.length, 2);
    assert.notEqual(refs[0], refs[1], 'two slides took the same id — the duplicate-id trap is back');
  });
});
