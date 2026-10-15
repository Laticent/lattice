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

  // The test above loads languages cumulatively into one singleton, so an embedded language another
  // test loaded first would hide a missing `requires` entry. This one gives each language a FRESH
  // instance holding only that language and the closure the table says it needs.
  test('each language plus its `requires` closure alone colors as the full build does', () => {
    const ref = reference();
    const differ = [];
    for (const [name, requires] of Object.entries(LANGUAGES)) {
      if (name === 'http') continue; // a chosen body set, not every language: its own test below
      const solo = require('highlight.js/lib/core').newInstance();
      for (const dep of [...requires, name]) solo.registerLanguage(dep, require(`highlight.js/lib/languages/${dep}`));
      solo.registerLanguage('bash', shellLanguage);
      const want = ref.highlight(SNIPPET, { language: name, ignoreIllegals: true }).value;
      if (solo.highlight(SNIPPET, { language: name, ignoreIllegals: true }).value !== want) differ.push(name);
    }
    assert.deepEqual(differ, [], `the requires table misses an embedded language for: ${differ.join(', ')}`);
  });

  // `http` auto-detects its body among every registered language; the table gives it JSON and XML
  // (tools/build-code-languages.js AUTODETECT_BODIES) rather than ~190 fetches. On those bodies it
  // matches the full build; on a plain-text body the full build guessed EBNF, and this stays plain.
  test('http colors JSON, XML and HTML bodies as the full build does, from its own closure alone', () => {
    const full = require('highlight.js');
    const solo = require('highlight.js/lib/core').newInstance();
    for (const dep of [...LANGUAGES.http, 'http']) solo.registerLanguage(dep, require(`highlight.js/lib/languages/${dep}`));
    for (const body of [
      'POST /api/users HTTP/1.1\nContent-Type: application/json\n\n{"name": "Ada", "admin": true, "n": 3}\n',
      'POST /svc HTTP/1.1\nContent-Type: application/xml\n\n<user id="1"><name>Ada</name></user>\n',
      'HTTP/1.1 200 OK\nContent-Type: text/html\n\n<!doctype html>\n<p class="a">Hi</p>\n',
    ]) {
      assert.equal(solo.highlight(body, { language: 'http' }).value, full.highlight(body, { language: 'http' }).value, body);
    }
    assert.ok(LANGUAGES.http.length < 10, `http embeds ${LANGUAGES.http.length} grammars`);
    assert.doesNotMatch(solo.highlight('HTTP/1.1 500 Error\n\nsomething went wrong\n', { language: 'http' }).value, /language-ebnf/);
  });

  test('every alias names the grammar the full build gives it, whatever was loaded first', () => {
    const full = require('highlight.js');
    const shell = new Set(['bash', 'sh', 'zsh']);
    const differ = [];
    for (const [alias, canon] of Object.entries(ALIASES)) {
      if (shell.has(alias)) continue; // Lattice's shell grammar owns these on purpose
      if (full.getLanguage(alias)?.name !== full.getLanguage(canon)?.name) differ.push(`${alias} → ${canon}`);
    }
    assert.deepEqual(differ, []);
    // Load the losing owner of `ls` last: the alias must still color as LiveScript.
    highlighter.ensure('livescript');
    highlighter.ensure('lasso');
    assert.equal(highlighter.highlight('x = 1', 'ls'), full.highlight('x = 1', { language: 'livescript' }).value);
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
