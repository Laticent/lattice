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

  function titleRow(description) {
    const docs = renderDocs({
      ...BASE,
      slots: { title: { selector: 'h2', required: true, description } },
    });
    const row = docs.split('\n').find((l) => l.startsWith('| `title`'));
    assert.ok(row, 'expected the title slot row');
    return row;
  }

  // Splitting on an UN-escaped pipe (not immediately preceded by a
  // backslash) must find exactly the 5 real structural table delimiters —
  // whatever the description contains must survive as ONE intact column,
  // never split into a 6th by an escaping bug.
  function assertFourColumns(row) {
    const parts = row.split(/(?<!\\)\|/);
    assert.equal(parts.length, 6, `row split into the wrong number of columns: ${JSON.stringify(row)}`);
    return parts[4];
  }

  test('tableCell escapes a bare pipe with no preceding backslash (the common case)', () => {
    const row = titleRow('Two options: a|b.');
    const desc = assertFourColumns(row);
    assert.ok(desc.includes(`a${'\\'}|b`), `expected an escaped pipe in: ${JSON.stringify(desc)}`);
  });

  test('tableCell escapes a pre-existing EVEN-length backslash run before a pipe (CodeQL: incomplete string escaping)', () => {
    // Two literal backslashes then a pipe. The original (pre-fix) code
    // escaped the pipe unconditionally — `a\\|b` → `a\\` + `\|` inserted =
    // a THREE-backslash run before the pipe, which happens to be odd/safe
    // here, but the SAME unconditional insertion turns a naturally-odd run
    // (see the next test) into an even/unsafe one. Checking parity first
    // and only inserting when needed guarantees the total is always odd —
    // this even-length run must come out odd so the pipe reads as escaped,
    // not as a real table delimiter.
    const input = `a${'\\'.repeat(2)}|b`;
    const row = titleRow(input);
    const desc = assertFourColumns(row);
    const backslashRun = /a(\\+)\|b/.exec(desc);
    assert.ok(backslashRun, `expected a backslash run before the pipe in: ${JSON.stringify(desc)}`);
    assert.equal(backslashRun[1].length % 2, 1, 'the backslash run before the pipe must be odd-length (escaped)');
  });

  test('tableCell leaves a pre-existing ODD-length backslash run before a pipe untouched (already safely escaped)', () => {
    // One literal backslash then a pipe (e.g. a slot description quoting a
    // regex alternation like `a\|b`) is ALREADY safely escaped as far as a
    // markdown table parser is concerned — no fix needed, so tableCell must
    // not touch it.
    const input = `a${'\\'}|b`;
    const row = titleRow(input);
    const desc = assertFourColumns(row);
    assert.ok(desc.includes(input), `expected the untouched original ${JSON.stringify(input)} in: ${JSON.stringify(desc)}`);
  });

  test('tableCell does not touch backslashes that are nowhere near a pipe (e.g. an intentional `` \\` `` markdown-escape illustration)', () => {
    // Regression: an earlier "escape every backslash" fix for the pipe-
    // parity bug also doubled backslashes that have nothing to do with
    // pipes — visible in real shipped manifests (funnel, map) whose slot
    // descriptions illustrate an escaped backtick, e.g. `Signups \`4,800\``.
    // Scoping the fix to backslash-runs-immediately-before-a-pipe must
    // leave this kind of content byte-identical.
    const input = 'value pill like `Signups \\`4,800\\`` — no pipe nearby.';
    const row = titleRow(input);
    const desc = assertFourColumns(row);
    assert.ok(desc.includes(input), `expected the backslashes untouched in: ${JSON.stringify(desc)}`);
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
