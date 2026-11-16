/**
 * lib/core/policy-page-script.js
 *
 * Two pages evaluate the slide sanitizer's SOURCE TEXT rather than import it: the code door's sanitizer
 * page (lib/packages/code-door-worker.js) and the function-plot capture page (lib/export/locked-figures.js).
 * A page has no module system, so each one used to need `sanitize-slide-html.mjs` to import nothing. It now
 * imports one thing, the security spine's policy table (`content-policy.js`, a require-free CommonJS
 * leaf), and this swaps that one import line for the table's body, wrapped as a module, so the page gets
 * the same lists the Node and browser builds read.
 *
 * Node only. Refuses, loudly, a source whose import line is not exactly the expected one: a page that
 * half-loaded the sanitizer would strip nothing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { pkgRootFrom } = require('./pkg-root');

// The one import line a page script can take, matched rather than spelled as a string: a string holding an
// import statement reads to tools/structure.js as an edge dependency-cruiser missed.
const POLICY_IMPORT = /^import contentPolicy from (['"])\.\/content-policy\.js\1;$/m;

/** The policy table as a JavaScript expression that evaluates to its exports. */
function policyExpression() {
  // From the package root, not `__dirname`: the CLI bundle runs from dist/, where no content-policy.js sits beside it.
  const body = fs.readFileSync(path.join(pkgRootFrom(__dirname), 'lib/core/content-policy.js'), 'utf8');
  if (/\brequire\s*\(/.test(body)) throw new Error('content-policy.js requires something a page cannot load');
  return `(()=>{const module={exports:{}};(function(module,exports){${body}\n})(module,module.exports);return module.exports;})()`;
}

/**
 * `src` (an ES module's text) with its `import contentPolicy from './content-policy.js';` line replaced by
 * `const contentPolicy = <the table>;`.
 * @param {string} src
 * @param {string} name  the file's name, for the error
 */
function inlinePolicyImport(src, name) {
  if (!POLICY_IMPORT.test(src)) throw new Error(`${name} no longer imports content-policy.js the way a page script expects (${POLICY_IMPORT})`);
  return src.replace(POLICY_IMPORT, () => `const contentPolicy = ${policyExpression()};`);
}

module.exports = { POLICY_IMPORT, inlinePolicyImport };
