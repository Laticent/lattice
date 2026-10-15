#!/usr/bin/env node
/**
 * tools/build-code-languages.js — the code plugin's LANGUAGE TABLE: every highlight.js
 * language, the names and aliases a fence may use for it, and the languages it embeds.
 *
 * WHY A TABLE. The code plugin loads `highlight.js/lib/core` plus only the grammars a deck's
 * fences name (lib/plugins/code/shared/highlighter.js), instead of the full 192-language build
 * the engine used to require at load (~105 ms per process, measured in
 * engineering/decisions/2026-10-15-code-plugin.md §2). To load a grammar by a fence's name it
 * must know which module that name lives in without loading every module to ask, so the answer
 * is generated here, from the installed highlight.js, and committed.
 *
 * WHY `requires`. A grammar may hand part of a block to another (`subLanguage`): HTML's
 * `<script>` to JavaScript, Markdown's inline HTML to XML. The full build colored those because
 * every language was registered; a lazy load has to register them too, or `<style>` in an HTML
 * fence renders plain where it used to be colored. `requires` is the closure of every
 * `subLanguage` a grammar names.
 *
 * A grammar that AUTO-DETECTS its embedded language among every registered one (an empty
 * `subLanguage` list) is named in AUTODETECT_BODIES with the languages it may detect. Requiring all
 * of them made one ```http fence fetch about 190 grammars in the Studio, and the full build's
 * guess was not even right: it colored a plain-text error body as EBNF and form data as INI.
 * A grammar that auto-detects and is not listed fails this build, so the next one is a decision.
 *
 *   node tools/build-code-languages.js           write the table
 *   node tools/build-code-languages.js --check   exit 1 if it is stale
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'lib', 'plugins', 'code', 'shared', 'languages.generated.js');

/**
 * What an auto-detecting grammar may detect, by its canonical name. `http`: the bodies an HTTP
 * message carries on a slide — JSON, and XML (which colors HTML too). Measured against the full
 * build: identical on JSON, XML and HTML bodies; plain where it guessed wrong.
 */
const AUTODETECT_BODIES = Object.freeze({ http: Object.freeze(['json', 'xml']) });

/** Every `subLanguage` a grammar mode tree names; `'*'` when one auto-detects among all (see above). */
function embedded(mode, seen = new Set(), out = new Set()) {
  if (!mode || typeof mode !== 'object' || seen.has(mode)) return out;
  seen.add(mode);
  if (mode.subLanguage !== undefined) {
    const list = [].concat(mode.subLanguage);
    if (list.length === 0) out.add('*');
    for (const s of list) out.add(s);
  }
  for (const key of ['contains', 'variants', 'starts']) {
    const v = mode[key];
    if (Array.isArray(v)) for (const m of v) embedded(m, seen, out);
    else if (v && typeof v === 'object') embedded(v, seen, out);
  }
  return out;
}

function table() {
  const hljs = require('highlight.js');
  const names = hljs.listLanguages().sort();
  const direct = new Map(names.map((n) => {
    let found = [...embedded(hljs.getLanguage(n))].filter((d) => d !== n);
    if (found.includes('*')) {
      if (!Object.hasOwn(AUTODETECT_BODIES, n)) {
        throw new Error(`"${n}" auto-detects among every language; add it to AUTODETECT_BODIES with the languages its blocks embed`);
      }
      found = [...new Set([...found.filter((d) => d !== '*'), ...AUTODETECT_BODIES[n]])];
    }
    return [n, found];
  }));
  const closure = (name) => {
    const out = new Set();
    const stack = [...direct.get(name)];
    while (stack.length) {
      const d = stack.pop();
      if (out.has(d) || d === name || !direct.has(d)) continue;
      out.add(d);
      stack.push(...direct.get(d));
    }
    return [...out].sort();
  };
  const languages = {};
  const aliases = {};
  for (const n of names) {
    const fileOk = fs.existsSync(path.join(ROOT, 'node_modules', 'highlight.js', 'lib', 'languages', `${n}.js`));
    if (!fileOk) throw new Error(`highlight.js lists "${n}" but ships no lib/languages/${n}.js`);
    const req = closure(n);
    languages[n] = req;
    aliases[n] = n;
  }
  // An alias two grammars both claim (`ls`: Lasso and LiveScript; `ml`: OCaml and SML) resolves as
  // the full build resolves it — asked of the full build itself, so the table cannot pick the other
  // owner, and highlighting by the canonical name (highlighter.js) cannot depend on load order.
  const nameOf = new Map(names.map((n) => [hljs.getLanguage(n), n]));
  for (const n of names) {
    for (const a of hljs.getLanguage(n).aliases || []) {
      const key = String(a).toLowerCase();
      if (!Object.hasOwn(aliases, key)) aliases[key] = nameOf.get(hljs.getLanguage(key)) ?? n;
    }
  }
  return { version: require('highlight.js/package.json').version, languages, aliases };
}

function render({ version, languages, aliases }) {
  const langLines = Object.entries(languages).map(([n, req]) => `  ${JSON.stringify(n)}: Object.freeze(${JSON.stringify(req)}),`);
  const aliasLines = Object.keys(aliases).sort().map((a) => `  ${JSON.stringify(a)}: ${JSON.stringify(aliases[a])},`);
  return `// GENERATED by tools/build-code-languages.js from highlight.js ${version} — do not edit.
// Every highlight.js language (canonical name → the languages it embeds), and
// every name or alias a fence may use (lower-case) → its canonical name. Read by
// lib/plugins/code/shared/highlighter.js. Regenerate: npm run build.

const LANGUAGES = Object.freeze({
${langLines.join('\n')}
});

const ALIASES = Object.freeze({
${aliasLines.join('\n')}
});

module.exports = { LANGUAGES, ALIASES };
`;
}

function main() {
  const text = render(table());
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) {
      process.stderr.write(`code languages: ${path.relative(ROOT, OUT)} is stale. Run: node tools/build-code-languages.js\n`);
      process.exit(1);
    }
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  if (!process.argv.includes('--silent')) process.stdout.write(`code languages: ${Object.keys(table().languages).length} languages → ${path.relative(ROOT, OUT)}\n`);
}

if (require.main === module) main();

module.exports = { table, render };
