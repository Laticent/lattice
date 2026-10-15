/**
 * Unit: the code plugin's lazy highlighter (lib/plugins/code/shared/highlighter.js).
 *
 * The engine used to require highlight.js's full 192-language build at load. The code plugin loads
 * `highlight.js/lib/core` and each grammar the first time a fence names it, plus the grammars that
 * one embeds (languages.generated.js `requires`). These tests pin that the lazy load colors EXACTLY
 * what the full build did, for every language, and that the shell grammar stays Lattice's.
 *
 * The reference is a separate highlight.js instance with every grammar registered, built from the
 * same modules: the lazy one is the process-wide core singleton, so loading the full build into it
 * would make the comparison vacuous.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const highlighter = require('../../../lib/plugins/code/shared/highlighter.js');
const { LANGUAGES, ALIASES } = require('../../../lib/plugins/code/shared/languages.generated.js');
const shellLanguage = require('../../../lib/plugins/code/shared/shell.hljs.js');

// A snippet that wakes most grammars' embedded languages: markup with script and style, a template
// literal, Markdown, SQL, a comment and a string.
const SNIPPET = [
  '<div class="a" id="b"><script>let x = `y${z}`; // note</script><style>a { color: red; }</style></div>',
  '# Title with `code` and *emphasis*',
  'function f(x) { return "s" + 1; } /* block */',
  "SELECT * FROM t WHERE a = 'b' AND n > 3;",
  'GET /index.html HTTP/1.1',
  'Content-Type: application/json',
  '',
  '{"key": [1, 2.5, true, null]}',
  '',
].join('\n');

function reference() {
  const ref = require('highlight.js/lib/core').newInstance();
  for (const name of Object.keys(LANGUAGES)) ref.registerLanguage(name, require(`highlight.js/lib/languages/${name}`));
  ref.registerLanguage('bash', shellLanguage);
  return ref;
}

describe('code plugin — lazy highlighter', () => {
  test('every language colors exactly as the full build does', () => {
    const ref = reference();
    const differ = [];
    for (const name of Object.keys(LANGUAGES)) {
      const want = ref.highlight(SNIPPET, { language: name, ignoreIllegals: true }).value;
      const got = highlighter.highlight(SNIPPET, name);
      if (got !== want) differ.push(name);
    }
    assert.deepEqual(differ, [], `lazy highlighting differs from the full build for: ${differ.join(', ')}`);
  });

  test('every alias resolves to a loadable language', () => {
    for (const [alias, canon] of Object.entries(ALIASES)) {
      assert.ok(Object.hasOwn(LANGUAGES, canon), `${alias} → ${canon}, which the table does not list`);
      assert.ok(highlighter.canColor(alias), `${alias} cannot be colored`);
    }
  });

  test('a language highlight.js does not know renders nothing (the renderer escapes it plain)', () => {
    assert.equal(highlighter.highlight('x = 1', 'no-such-language'), '');
    assert.equal(highlighter.canColor('no-such-language'), false);
  });

  test('bash is Lattice\'s shell grammar, even after the full build re-registers the stock one', () => {
    assert.match(highlighter.highlight('docker compose up -d', 'sh'), /hljs-built_in">docker/);
    require('highlight.js'); // the full build, into the same core singleton: stock bash replaces ours
    assert.match(highlighter.highlight('docker compose up -d', 'bash'), /hljs-built_in">docker/);
    assert.equal(highlighter.hljs.getLanguage('bash').name, shellLanguage.GRAMMAR_NAME);
  });

  test('the table matches the installed highlight.js (regenerate: npm run build)', () => {
    const { table } = require('../../../tools/build-code-languages.js');
    const fresh = table();
    assert.deepEqual(Object.keys(fresh.languages), Object.keys(LANGUAGES));
  });
});
