/**
 * Every public engine door reads a slide-metadata record exactly as it reads the directive comments the record
 * replaces (engineering/decisions/2026-10-17-meta-record.md §5.1). Each door calls ONE preamble, `prepareSource`
 * (lib/engine/index.js): line endings, the source hooks, the settings fold. A door that skipped the hooks would leave
 * every record inert there, and this test is what notices.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');

// The same deck twice: directive comments, then records. CRLF on purpose: the hooks run after the line-ending fold.
const COMMENTS = ['---', 'size: 4:3', '---', '', '<!-- _class: columns -->', '', '## Two panes.', '', '<!-- _pane: list -->', '### Left', '', '- One', '', '<!-- _pane: list -->', '### Right', '', '- Two', ''].join('\r\n');
const RECORDS = ['---', 'size: 4:3', '---', '', '<!-- {layout=columns} -->', '', '## Two panes.', '', '<!-- {pane=list} -->', '### Left', '', '- One', '', '<!-- @meta{pane=list} -->', '### Right', '', '- Two', ''].join('\r\n');

describe('every engine door reads records as it reads directive comments', () => {
  const engine = createEngine();

  test('render()', () => {
    assert.equal(engine.render(RECORDS).html, engine.render(COMMENTS).html);
  });

  test('geometry()', () => {
    assert.deepEqual(engine.geometry(RECORDS), engine.geometry(COMMENTS));
  });

  test('paneOrientations()', () => {
    const comments = engine.paneOrientations(COMMENTS);
    assert.ok(comments.length > 0, 'the comment deck has panes, so the comparison is not vacuous');
    assert.deepEqual(engine.paneOrientations(RECORDS), comments);
  });

  test('the token seam (_tokens)', () => {
    const lf = (s) => s.replace(/\r\n/g, '\n');
    // `data-pane-slot` is a hash of the source text, a placeholder the render replaces (render() above matches whole).
    const directives = (src) => engine._tokens(lf(src)).filter((t) => t.type === 'html_block').map((t) => t.content.trim().replace(/data-pane-slot="[^"]*"/, 'data-pane-slot'));
    assert.deepEqual(directives(RECORDS), directives(COMMENTS));
  });
});
