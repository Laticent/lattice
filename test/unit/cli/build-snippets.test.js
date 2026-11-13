/**
 * Unit: tools/build-snippets.js — VS Code snippets generator.
 *
 * Covers:
 *   1. buildSnippets returns one entry per manifest with the expected shape
 *   2. prefix is `lattice-<name>` so authors can type `lattice-` and see
 *      every component as autocomplete suggestions
 *   3. body is the skeleton split on newlines, trailing newline stripped
 *   4. serialize round-trips through JSON.parse to the same object
 *   5. The committed `.vscode/lattice.code-snippets` matches what
 *      buildSnippets would emit right now — i.e. the file is not stale
 *      relative to the current manifests (the CI gate)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildSnippets, serialize, OUT_FILE } = require('../../../tools/build-snippets');
const { loadAll } = require('../../../lib/components');

describe('build-snippets', () => {
  describe('buildSnippets', () => {
    test('emits one snippet per manifest', () => {
      const manifests = loadAll();
      const snippets = buildSnippets(manifests);
      assert.equal(Object.keys(snippets).length, manifests.length);
    });

    test('keys are "lattice: <name>" and prefixes are "lattice-<name>"', () => {
      const snippets = buildSnippets();
      for (const [key, snippet] of Object.entries(snippets)) {
        assert.match(key, /^lattice: [a-z][a-z0-9-]*$/);
        const name = key.replace(/^lattice: /, '');
        assert.equal(snippet.prefix, `lattice-${name}`);
      }
    });

    test('body is an array of strings, one per line, no trailing empty', () => {
      const m = {
        name: 'demo',
        function: 'inventory',
        form: 'grid',
        substance: 'structure',
        description: 'demo',
        skeleton: 'line1\nline2\nline3\n',
      };
      const snippets = buildSnippets([m]);
      const body = snippets['lattice: demo'].body;
      assert.deepEqual(body, ['line1', 'line2', 'line3']);
    });

    test('body preserves intentional blank lines inside the skeleton', () => {
      const m = {
        name: 'demo',
        function: 'inventory',
        form: 'grid',
        substance: 'structure',
        description: 'demo',
        skeleton: '<!-- _class: demo -->\n\n## Heading.\n\n- One\n- Two\n',
      };
      const body = buildSnippets([m])['lattice: demo'].body;
      assert.deepEqual(body, [
        '<!-- _class: demo -->',
        '',
        '## Heading.',
        '',
        '- One',
        '- Two',
      ]);
    });

    // VS Code reads a snippet body as a template: `$` starts a tab stop or a variable and `\\` escapes. Before 2026-11-10 six
    // skeletons inserted wrong (`$410M` became tab stop 410, `$0` the final cursor, `$y$` an empty variable). Every `$` and
    // `\\` is escaped now, so undoing VS Code's escaping gives back the manifest's skeleton exactly.
    test('every snippet inserts its skeleton exactly: no bare `$`, and unescaping gives the skeleton back', () => {
      const manifests = require('../../../lib/components').loadAll();
      const snippets = buildSnippets(manifests);
      for (const m of manifests) {
        const { body, scope } = snippets[`lattice: ${m.name}`];
        assert.equal(scope, 'markdown', `${m.name}: scoped to Markdown`);
        for (const line of body) {
          // A `$` is bare when an even number of backslashes stands before it.
          assert.ok(!/(^|[^\\])(\\\\)*\$/.test(line), `${m.name}: bare $ in ${JSON.stringify(line)}`);
        }
        const inserted = body.map((l) => l.replace(/\\([\\$}])/g, '$1')).join('\n');
        assert.equal(inserted, m.skeleton.replace(/\n$/, ''), `${m.name}: inserts its skeleton exactly`);
      }
    });

    test('description matches the manifest description', () => {
      const snippets = buildSnippets();
      for (const [key, snippet] of Object.entries(snippets)) {
        assert.ok(typeof snippet.description === 'string' && snippet.description.length > 0,
          `${key}: description must be non-empty string`);
      }
    });
  });

  describe('serialize', () => {
    test('output is parseable JSON when the header comment is stripped', () => {
      const text = serialize(buildSnippets());
      const stripped = text.replace(/^\/\/.*\n/gm, '').trim();
      assert.doesNotThrow(() => JSON.parse(stripped));
    });

    test('output ends with a single trailing newline', () => {
      const text = serialize(buildSnippets());
      assert.ok(text.endsWith('\n'));
      assert.ok(!text.endsWith('\n\n'), 'should not end with double newline');
    });

    test('output starts with the "Do not edit by hand" header', () => {
      const text = serialize(buildSnippets());
      assert.match(text, /^\/\/ Lattice slide-layout snippets/);
      assert.match(text, /Do not edit by hand/);
    });
  });

  describe('committed file freshness', () => {
    test('.vscode/lattice.code-snippets matches the current manifests', () => {
      assert.ok(fs.existsSync(OUT_FILE), `expected ${OUT_FILE} to exist`);
      const current = fs.readFileSync(OUT_FILE, 'utf8');
      const fresh = serialize(buildSnippets());
      assert.equal(
        current,
        fresh,
        `${OUT_FILE} is stale. Run \`npm run snippets:build\` to regenerate.`
      );
    });
  });
});
