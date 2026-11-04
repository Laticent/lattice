/**
 * Unit: no rule in the CSS an Export-to-Marp bundle ships is silenced by Marp's pagination mask.
 *
 * marpit's postcss pagination plugin (@marp-team/marpit lib/postcss/pagination.js) comments out
 * every `content` declaration in a rule whose selector STARTS `section…::after` with no space or
 * combinator, so the theme cannot override Marp's page number. Lattice's minified bundle sheet
 * strips the spaces inside `:is(…)`, so a rule like `section.collage:not(.with-pagination)::after
 * { content: none }` matched it and did nothing in marp-cli or VS Code: the page number showed on
 * slides the engine hides it on. Our rules carry `:where(:not(* > .lat-never))`, which is always
 * true, adds no specificity, and puts a combinator in the selector, so the mask does not match.
 *
 * Marp is not a dependency here, so the mask's test is restated from marpit's source.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const MARPIT_PAGINATION_MASK = /^section(?![\w-])[^\s>+~]*::?after$/;
const masked = (selector) => MARPIT_PAGINATION_MASK.test(selector.replace(/\[.*?\]/g, ''));

/**
 * Rules the mask still reaches, each with why it is allowed. `mark-asterisks` draws its second
 * cluster on `section::after`, which IS Marp's page number, so the two cannot both paint there:
 * in a Marp render the page number keeps the pseudo. Recorded in
 * followups.d/3023-p3-marp-mark-asterisks-page-number.md.
 */
const SANCTIONED_MASKED = new Set(['section.mark-asterisks:after']);

test('no content rule in the bundled sheet is masked by Marp, except the sanctioned ones', () => {
  const sheet = path.join(__dirname, '../../../dist/lattice-min.css');
  const found = [];
  postcss.parse(fs.readFileSync(sheet, 'utf8')).walkRules((rule) => {
    if (!rule.selectors.some(masked)) return;
    let hasContent = false;
    rule.walkDecls('content', (d) => {
      if (!d.value.includes('attr(data-marpit-pagination)')) hasContent = true;
    });
    if (hasContent) found.push(rule.selector);
  });
  assert.deepEqual(found.filter((s) => !SANCTIONED_MASKED.has(s)), [], 'add :where(:not(* > .lat-never)) before ::after');
  for (const s of SANCTIONED_MASKED) assert.ok(found.includes(s), `stale sanction: ${s}`);
});

test('the mask test itself catches the old spelling and passes the new one', () => {
  assert.equal(masked('section.collage.collage:not(.with-pagination):after'), true);
  assert.equal(masked('section.image.image[data-img-composition=statement]:not(.with-pagination):after'), true);
  assert.equal(masked('section.collage.collage:not(.with-pagination):where(:not(*>.lat-never)):after'), false);
});
