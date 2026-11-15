// Preload for the Squadra diffs (tools/squadra-reference-diff.js, tools/squadra-fix-diff.js): while the lint unit
// tests run, record every source they hand the linter, so the diffs' first corpus is "the cases someone already
// thought mattered" without anyone copying them out by hand. Appends one JSON string per line to $SQUADRA_RECORD.
// Loaded with `node --require`, never by shipped code.
//
// LAZY, ON PURPOSE. The linter modules are wrapped when a test FIRST loads them, never by this preload. A test that
// stubs one of lint-core's dependencies before it requires lint-core (payload-elision-lint-oracle.test.js replaces
// `elidePayloads`, which lint-core destructures at load) needs lint-core to load after its stub. Requiring lint-core
// here loaded it first, the stub never took, and the recording run exited 1 on a test that passes on its own, which
// made a real test failure look the same as that noise. The wrap is in place on the module's own exports object, so a
// caller that destructures after loading still gets the recording function.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
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
  const targets = new Map([
    [path.join(root, 'lib/authoring/lint-core.js'), ['lintTextWith', 'applyFix', 'applyAllFixes']],
    [path.join(root, 'lib/authoring/lint.js'), ['lintText']],
  ]);
  const done = new Set();
  const load = Module._load;
  Module._load = function recordingLoad(request, parent, isMain) {
    const exports = load.apply(this, arguments);
    if (done.size < targets.size) {
      let file;
      try {
        file = Module._resolveFilename(request, parent, isMain);
      } catch {
        return exports;
      }
      const names = targets.get(file);
      if (names && !done.has(file)) {
        done.add(file);
        for (const n of names) wrap(exports, n);
      }
    }
    return exports;
  };
}
