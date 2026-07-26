/**
 * Unit: tools/build-component-docs.js renderDocs() — the Agent contract
 * block (manifest.schema.json commonMistakes/variantDecisionRule/
 * dataShapeGuidance). Covers what a fixture-free full-manifest run can't:
 * the section-order invariant (purpose never dangles under the contract's
 * last subsection — regression from the 2026-07-26 pilot) and the
 * newline-injection guard (a manifest string containing a blank line +
 * `##` must not become a real heading in the generated doc).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { renderDocs } = require('../../../tools/build-component-docs');

const BASE = Object.freeze({
  name: 'probe',
  function: 'statement',
  form: 'canvas',
  substance: 'prose',
  tags: ['a', 'b', 'c'],
  description: 'A probe component.',
  purpose: 'Use this to probe the generator.',
  skeleton: '<!-- _class: probe -->\n\n## Heading.\n',
  slots: {
    title: { selector: 'h2', required: true, description: 'The heading.' },
  },
});

describe('renderDocs — Agent contract', () => {
  test('purpose sits above the Agent contract heading, not dangling under its last subsection', () => {
    const docs = renderDocs({
      ...BASE,
      commonMistakes: [{ mistake: 'm', fix: 'f' }],
    });
    const purposeLine = docs.indexOf(BASE.purpose);
    const contractHeading = docs.indexOf('## Agent contract');
    const lastSubsection = docs.lastIndexOf('### Common mistakes');
    assert.ok(purposeLine >= 0 && contractHeading >= 0 && lastSubsection >= 0);
    assert.ok(purposeLine < contractHeading, 'purpose must precede the Agent contract heading');
    assert.ok(contractHeading < lastSubsection, 'Agent contract heading must precede its subsections');
  });

  test('newlines inside commonMistakes/dataShapeGuidance/variantDecisionRule collapse to one bullet line', () => {
    const docs = renderDocs({
      ...BASE,
      variants: ['four'],
      variantDocs: { four: { summary: 's', sample: '<!-- _class: probe four -->\n\n## Heading.\n' } },
      commonMistakes: [{ mistake: 'line one\n\n## Injected heading\n\n- list item', fix: 'ok' }],
      variantDecisionRule: [{ variant: 'four', useWhen: 'first\n\n## Also injected' }],
      dataShapeGuidance: ['shape one\n\n## Also injected too'],
    });
    // The only headings in the doc are the real, known ones — nothing an
    // author put in a manifest string became a start-of-line heading.
    const headings = docs.match(/^#{1,6} .+$/gm) || [];
    for (const h of headings) {
      assert.ok(!/injected/i.test(h), `an injected heading leaked through: ${h}`);
    }
    // Each entry rendered as exactly one bullet line — the literal "##"
    // characters survive as inert mid-line text, not a real heading
    // (that's the property under test, not the surrounding prose).
    assert.match(docs, /^- \*\*line one ## Injected heading - list item\*\* ok$/m);
    assert.match(docs, /^- \*\*`four`\.\*\* first ## Also injected$/m);
    assert.match(docs, /^- shape one ## Also injected too$/m);
  });

  test('bare CR and CRLF line endings are also collapsed, not just LF (CommonMark treats \\r as a line ending too)', () => {
    const docs = renderDocs({
      ...BASE,
      commonMistakes: [{ mistake: 'bare CR\r\r## Injected via CR', fix: 'ok' }],
      dataShapeGuidance: ['CRLF\r\n\r\n## Injected via CRLF'],
    });
    const headings = docs.match(/^#{1,6} .+$/gm) || [];
    for (const h of headings) {
      assert.ok(!/injected/i.test(h), `an injected heading leaked through: ${h}`);
    }
    assert.match(docs, /^- \*\*bare CR ## Injected via CR\*\* ok$/m);
    assert.match(docs, /^- CRLF ## Injected via CRLF$/m);
  });

  test('the "default" variantDecisionRule sentinel renders distinctly from a real variant token', () => {
    const docs = renderDocs({
      ...BASE,
      variants: ['four'],
      variantDocs: { four: { summary: 's', sample: '<!-- _class: probe four -->\n\n## Heading.\n' } },
      variantDecisionRule: [
        { variant: 'default', useWhen: 'the plain case' },
        { variant: 'four', useWhen: 'the four-up case' },
      ],
    });
    assert.match(docs, /- \*\*default \(no modifier\)\.\*\* the plain case/);
    assert.match(docs, /- \*\*`four`\.\*\* the four-up case/);
  });

  test('tableCell escapes a pre-existing backslash before escaping pipes (CodeQL: incomplete string escaping)', () => {
    // A slot description quoting a regex alternation like `a\|b` — one
    // literal backslash immediately before a pipe.
    const input = `A regex like a${'\\'}|b means alternation.`;
    const docs = renderDocs({
      ...BASE,
      slots: { title: { selector: 'h2', required: true, description: input } },
    });
    const row = docs.split('\n').find((l) => l.startsWith('| `title`'));
    assert.ok(row, 'expected the title slot row');
    // Escaping backslash first turns the single `\` into `\\`, so the pipe
    // that follows is escaped from a position with NO dangling backslash —
    // it can't be misread as an escaped backslash followed by a bare,
    // column-splitting pipe (the actual CodeQL-flagged failure mode: escaping
    // the pipe WITHOUT first escaping the backslash turns `a\|b` into
    // `a\\|b`, which a table parser reads as an escaped backslash followed
    // by a real, unescaped delimiter pipe — corrupting the row).
    const expected = `a${'\\'.repeat(3)}|b`;
    assert.ok(row.includes(expected), `expected ${JSON.stringify(expected)} in row: ${JSON.stringify(row)}`);
    // Splitting on an UN-escaped pipe (not immediately preceded by a
    // backslash) must find exactly the 5 real structural delimiters — the
    // description's own pipe, protected by its now-correctly-parity'd
    // backslash run, must not count as a 6th and corrupt the column count.
    const structuralParts = row.split(/(?<!\\)\|/);
    assert.equal(structuralParts.length, 6, `row split into the wrong number of columns: ${JSON.stringify(row)}`);
    assert.ok(structuralParts[4].includes(expected), 'the description stayed one intact column');
  });

  test('Agent contract section is omitted entirely when the manifest carries none of its inputs', () => {
    const docs = renderDocs({
      name: 'bare',
      function: 'statement',
      form: 'canvas',
      substance: 'prose',
      tags: ['a', 'b', 'c'],
      description: 'No slots, no budgets, no new fields.',
      skeleton: '<!-- _class: bare -->\n',
    });
    assert.ok(!docs.includes('## Agent contract'));
  });
});
