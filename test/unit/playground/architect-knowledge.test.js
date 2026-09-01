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
      metric: { label: 'Tile', summary: 'Values in tiles.', sample: '## H\n\n1. ARR `$4.2M`\n2. Retention `94%`' },
      // numbered + nested description row — a different grammar → kept.
      def: { label: 'Editorial', summary: 'Eyebrow above name.', sample: '## H\n\n1. Function `Purpose`\n   - Why it exists.' },
      // same grammar as `metric` (numbered + pill) → finish-only → dropped.
      register: { label: 'Pill', summary: 'Accent pill.', sample: '## H\n\n1. cards-grid `stable`\n2. radar `beta`' },
      // incidental mid-prose code span must NOT read as a value grammar → dropped.
      mirror: { label: 'Flip', summary: 'Columns swapped.', sample: '## H\n\n- **First.** Pair with `chosen` to mark it.\n- **Second.** body.' },
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

/**
 * AUTHORING_RULES is not decoration: it is appended to the dossier on every
 * Studio turn AND dumped verbatim into the agent kit's `authoring/rules.md`,
 * where it is the SECOND file a cold agent reads — before any component doc.
 * So a wrong rule here is not a stale comment, it is an instruction that
 * produces broken decks at two surfaces at once. Three shipped that way and
 * these arms are why they cannot come back.
 */
describe('AUTHORING_RULES — the rules that ship to two surfaces', () => {
  const ruleMatching = async (re) => {
    const { AUTHORING_RULES } = await load();
    const hit = AUTHORING_RULES.filter((r) => re.test(r));
    assert.equal(hit.length, 1, `expected exactly one rule matching ${re}`);
    return hit[0];
  };

  // The eyebrow selector is `h1 + p:has(> code:only-child)` — an immediate
  // ELEMENT-sibling match. The rule said eyebrow-then-h1, which renders the
  // eyebrow as a second subtitle with no error anywhere.
  test('the title slide is h1 → eyebrow → subtitle, in that order', async () => {
    const rule = await ruleMatching(/^Title slides:/);
    const h1 = rule.indexOf('# H1');
    const eyebrow = rule.indexOf('`eyebrow`');
    const subtitle = rule.indexOf('subtitle');
    assert.ok(h1 > 0 && eyebrow > 0 && subtitle > 0, 'all three parts named');
    assert.ok(h1 < eyebrow, 'the h1 comes before the eyebrow');
    assert.ok(eyebrow < subtitle, 'the eyebrow comes before the subtitle');
  });

  // There is no ```chart fence in the engine — plugins.js rewrites
  // functionplot/latticeplot, anima and mermaid, and nothing else. Advertising
  // one invites a model to fabricate a payload format.
  test('advertises only fences the engine actually rewrites', async () => {
    const { AUTHORING_RULES } = await load();
    const all = AUTHORING_RULES.join('\n');
    assert.doesNotMatch(all, /```chart \(/, 'no ```chart fence is advertised');
    for (const real of ['```mermaid', '```functionplot', '```anima', '$$']) {
      assert.ok(all.includes(real), `${real} is named`);
    }
  });

  // The list was hand-maintained and had drifted four layouts behind
  // lint-core, which is the contract's real owner (HARD RULE #1).
  test('the nested-bullet rule names every layout lint-core requires it on', async () => {
    const rule = await ruleMatching(/take NESTED bullets/);
    const { CARD_STYLE_LAYOUTS, SPLIT_SLOT_LAYOUTS } = require('../../../lib/authoring/lint-core.js');
    for (const name of [...CARD_STYLE_LAYOUTS, ...SPLIT_SLOT_LAYOUTS]) {
      assert.ok(rule.includes(name), `${name} takes nested bullets but the rule omits it`);
    }
  });

  // 3 spaces under `1.`, 2 under `-`. Getting this wrong silently flattens
  // every ledger row (premise, timeline-list, kpi, list-tabular).
  test('states the nested-indent width for both marker kinds', async () => {
    const rule = await ruleMatching(/take NESTED bullets/);
    assert.match(rule, /2 spaces under a `-` parent/);
    assert.match(rule, /3 under a `1\.` parent/);
  });
});
