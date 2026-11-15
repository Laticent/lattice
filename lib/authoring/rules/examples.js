// The `deck` ruleset's fixtures: every `*.fixtures.md` under lib/authoring/rules/, keyed by its path relative to this
// folder, which is what a rule's `examples` field names. Build-side only (it reads files): the stamp builder and the
// tests compile the ruleset with these, and the browser never loads them (decision 2026-11-13 §3.4).

const fs = require('node:fs');
const path = require('node:path');

/** `{ 'family/rule.fixtures.md': text }` for every fixtures file under `dir`. */
function ruleExamples(dir = __dirname) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.fixtures.md')) out[path.relative(dir, p).split(path.sep).join('/')] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

module.exports = { ruleExamples };
