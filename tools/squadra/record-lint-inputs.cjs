// Preload for tools/squadra-fix-diff.js: while the lint unit tests run, record every source they
// hand the linter, so the fix diff's first corpus is "the cases someone already thought mattered"
// (design §15.3, corpus 1) without anyone copying them out by hand. Appends one JSON string per
// line to $SQUADRA_RECORD. Loaded with `node --require`, never by shipped code.
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.SQUADRA_RECORD;
if (out) {
  const root = path.join(__dirname, '..', '..');
  const seen = new Set();
  const record = (src) => {
    if (typeof src !== 'string' || !src || seen.has(src)) return;
    seen.add(src);
    fs.appendFileSync(out, `${JSON.stringify(src)}\n`);
  };
  const wrap = (mod, name) => {
    const fn = mod[name];
    if (typeof fn !== 'function') return;
    mod[name] = function recorded(src, ...rest) {
      record(src);
      return fn.call(this, src, ...rest);
    };
  };
  const core = require(path.join(root, 'lib/authoring/lint-core.js'));
  for (const n of ['lintTextWith', 'applyFix', 'applyAllFixes']) wrap(core, n);
  const lint = require(path.join(root, 'lib/authoring/lint.js'));
  wrap(lint, 'lintText');
}
