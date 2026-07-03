/**
 * Unit: the Lattice authoring dossier fed to Converse (the cloud tier). The model
 * was guessing layout structure (e.g. authoring `decision` as flat Markdown) because
 * it only had one-line descriptions. This proves the primer now carries, per layout,
 * the skeleton + variants + slot contracts — so the model copies, not guesses — plus
 * the cross-cutting authoring rules. Pure string assembly → fully verifiable here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/architect-knowledge.js');
}

const SAMPLE = [
  { name: 'title', bucket: 'anchor', summary: 'Opening slide.', skeleton: '<!-- _class: title silent -->\n\n`eyebrow`\n\n# Heading',
    slots: [{ name: 'title', required: true, description: 'Slide heading.' }] }, // generic → skipped
  { name: 'quote', bucket: 'statement', summary: 'A pulled quotation.' },
  { name: 'agenda', bucket: 'inventory', summary: 'Auto-numbered TOC.' },
  { name: 'decision', bucket: 'comparison', summary: 'The verdict slide.',
    skeleton: '<!-- _class: decision -->\n\n## Heading\n\n- Chosen path\n  - rationale',
    variants: ['banner-tag'],
    capacity: { axis: 'item', soft: 2 },
    density: { axis: 'item', soft: 20, note: "each option's tradeoff in a sentence or two" },
    slots: [
      { name: 'title', required: true, description: 'Slide heading.' }, // generic → skipped
      { name: 'options', required: true, description: 'Top-level bullet is the option name; an indented bullet carries the rationale.' },
    ] },
  // A layout whose variant changes the authoring GRAMMAR — the case the user hit.
  { name: 'list-tabular', bucket: 'inventory', summary: 'A ruled ledger.',
    skeleton: '<!-- _class: list-tabular -->\n\n## Heading\n\n1. First entry\n   - Description.',
    variants: ['metric'],
    variantSkeletons: [
      { name: 'metric', caption: 'Values in tiles.', sample: '<!-- _class: list-tabular metric -->\n\n## Scoreboard.\n\n1. Build path `334 / 334`' },
    ] },
];

describe('buildLatticePrimer — the authoring dossier', () => {
  test('emits a per-layout block: ## bucket then ### name — summary', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /## anchor\n/);
    assert.match(p, /### title — Opening slide\./);
    assert.match(p, /### decision — The verdict slide\./);
    // canonical bucket order: anchor < statement < inventory < comparison.
    assert.ok(p.indexOf('## anchor') < p.indexOf('## statement'));
    assert.ok(p.indexOf('## statement') < p.indexOf('## inventory'));
    assert.ok(p.indexOf('## inventory') < p.indexOf('## comparison'));
  });

  test('includes the authoring SKELETON (four-backtick fenced) so the model copies it', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /````\n<!-- _class: decision -->/);
    assert.match(p, /- Chosen path\n {2}- rationale/); // the nested structure is shown verbatim
  });

  test('lists a layout’s variants with a compose example', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /Variants: banner-tag \(append to the class, e\.g\. `decision banner-tag`\)\./);
  });

  test('carries real slot contracts but skips generic "Slide heading." slots', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /`options`: Top-level bullet is the option name; an indented bullet carries the rationale\./);
    assert.doesNotMatch(p, /`title`: Slide heading\./); // generic, the skeleton already shows it
  });

  test('surfaces the content BUDGET (capacity + density) so the model writes tight while authoring', async () => {
    // Red-team fix (2026-06-30): the budgets must reach the GENERATION prompt,
    // not just the post-hoc review panel. A layout with capacity/density gets a
    // `Budget:` line; the universal chrome limits ride in the authoring rules.
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /Budget: ≤ 2 items, ≤ ~20 words each — each option's tradeoff in a sentence or two\./);
    assert.match(p, /eyebrow ≤ 5 words/); // universal chrome budgets in the rules
    assert.match(p, /slide title ≤ 10/);
  });

  test('intro instructs exact `_class` names + skeleton-verbatim, never guess', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /You know Lattice/);
    assert.match(p, /exact layout name in `_class`/);
    assert.match(p, /never guess/);
  });

  test('carries the footgun rules (card-style nesting, title slide, base modifiers)', async () => {
    const { buildLatticePrimer, AUTHORING_RULES } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /NESTED bullets/);
    assert.match(p, /NEVER write inline `- \*\*Title\.\*\* body`/);
    assert.match(p, /title silent/);
    assert.match(p, /BASE MODIFIERS/);
    assert.match(p, /tone-pass/); // state markers enumerated
    assert.ok(AUTHORING_RULES.length >= 5, 'rules exported for reuse');
  });

  test('a layout with no skeleton/variants/slots still appears (name + summary)', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    assert.match(p, /### quote — A pulled quotation\./);
  });

  test('empty / missing catalog degrades to just the rules (no throw)', async () => {
    const { buildLatticePrimer } = await load();
    assert.match(buildLatticePrimer([]), /Authoring rules:/);
    assert.match(buildLatticePrimer(null), /Authoring rules:/);
  });

  test('ships a grammar-changing variant its OWN skeleton (not just the base)', async () => {
    const { buildLatticePrimer } = await load();
    const p = buildLatticePrimer(SAMPLE);
    // base list-tabular skeleton (numbered/nested) still present …
    assert.match(p, /````\n<!-- _class: list-tabular -->[\s\S]*1\. First entry\n {3}- Description\./);
    // … plus the metric variant's distinct grammar (numbered + `value` pill).
    assert.match(p, /`list-tabular metric` is authored differently — Values in tiles\.:/);
    assert.match(p, /````\n<!-- _class: list-tabular metric -->[\s\S]*1\. Build path `334 \/ 334`/);
    // the rule that primes the model to expect per-variant structure.
    assert.match(p, /variant can change a layout’s authoring STRUCTURE/);
  });
});

describe('pickGrammarVariants — variants whose authoring grammar differs from base', () => {
  const M = {
    skeleton: '<!-- _class: list-tabular -->\n\n## H\n\n- **First.** body.\n- **Second.** body.',
    variantDocs: {
      // numbered + trailing `value` pill — a real grammar change → kept.
      metric: { label: 'Tile', caption: 'Values in tiles.', sample: '## H\n\n1. ARR `$4.2M`\n2. Retention `94%`' },
      // numbered + nested description row — a different grammar → kept.
      def: { label: 'Editorial', caption: 'Eyebrow above name.', sample: '## H\n\n1. Function `Purpose`\n   - Why it exists.' },
      // same grammar as `metric` (numbered + pill) → finish-only → dropped.
      register: { label: 'Pill', caption: 'Accent pill.', sample: '## H\n\n1. cards-grid `stable`\n2. radar `beta`' },
      // incidental mid-prose code span must NOT read as a value grammar → dropped.
      mirror: { label: 'Flip', caption: 'Columns swapped.', sample: '## H\n\n- **First.** Pair with `chosen` to mark it.\n- **Second.** body.' },
      // no sample → skipped without throwing.
      empty: { label: 'Empty' },
    },
  };

  test('keeps metric + def (distinct grammars), drops register/mirror (finish-only)', async () => {
    const { pickGrammarVariants } = await load();
    const picked = pickGrammarVariants(M).map((v) => v.name);
    assert.deepEqual(picked, ['metric', 'def']);
  });

  test('carries the variant caption + trimmed sample for the dossier', async () => {
    const { pickGrammarVariants } = await load();
    const metric = pickGrammarVariants(M).find((v) => v.name === 'metric');
    assert.equal(metric.caption, 'Values in tiles.');
    assert.match(metric.sample, /1\. ARR `\$4\.2M`/);
  });

  test('no variantDocs / non-object degrades to [] (no throw)', async () => {
    const { pickGrammarVariants } = await load();
    assert.deepEqual(pickGrammarVariants({ skeleton: '- x' }), []);
    assert.deepEqual(pickGrammarVariants({}), []);
    assert.deepEqual(pickGrammarVariants(null), []);
  });
});
