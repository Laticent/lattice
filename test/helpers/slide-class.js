/**
 * The class a slide's source names for ITSELF, in either spelling: a record (`<!-- @meta{layout=kpi, class=dark} -->`,
 * the corpus's spelling since the meta sweep, engineering/decisions/2026-10-17-meta-record.md §15) or a directive
 * comment (`<!-- _class: kpi dark -->`). Read through the shared scanner (lib/core/class-directive-scan.mjs), so a test
 * asks the same question the linter and the editor ask, never a `_class:` regex that goes blind on a record.
 *
 * Only the slide's OWN class: a running global (`<!-- class: x -->`, a `carry` record) does not count, as the
 * `_class:` matches these tests used never counted it.
 */
const { slideClassDirectives } = require('../../lib/core/class-directive-scan.mjs');
const { isRecordOpener, readRecord } = require('../../lib/core/meta-door.mjs');

/**
 * @param {string} md  one slide's source (no front matter)
 * @returns {{text: string, payload: string} | null}  `text`: the comment as written; `payload`: its class words
 */
function ownClassOf(md) {
  const [own] = slideClassDirectives(String(md ?? ''));
  if (!own?.text || /^<!--\s*class\s*:/.test(own.text)) return null;
  // A `carry` record is a running global; read the record's own flag, not the word (a footer may say "carry on").
  // The scanner's comment text, its `<!--` and `-->` taken off by index (no HTML-ish regex: CodeQL's bad-tag-filter).
  const t = own.text.trim();
  const body = t.startsWith('<!--') && t.endsWith('-->') ? t.slice(4, -3) : t;
  if (isRecordOpener(body) && readRecord(body)?.carry) return null;
  return { text: own.text, payload: String(own.payload).trim() };
}

module.exports = { ownClassOf };
