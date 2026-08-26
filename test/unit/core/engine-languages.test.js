/**
 * The engine's LANGUAGE CAPABILITY (lib/engine `languages`).
 *
 * WHY IT IS TESTED AT ALL. Which languages a deck can highlight used to be
 * decided by an esbuild `onResolve` hook in tools/build-playground.js and was
 * observable nowhere: the engine's `highlight` option guards with
 * `hljs.getLanguage(lang)` and silently emits plain text on a miss, so a
 * `powershell` fence rendered 11 token spans in a CLI export and 0 in the
 * Playground with nothing logged. These assertions pin the two properties the
 * preview's on-demand loader depends on — that `missing()` answers truthfully
 * about THIS build, and that `register()` reaches the singleton the renderer
 * will actually consult.
 *
 * This file loads the FULL highlight.js (what the CLI ships) via lib/engine, so
 * `missing()` is empty for everything real. The interesting direction — a build
 * that is short a grammar — is covered against a stand-in instance in
 * fence-languages.test.js, because `common` and the full entry share one
 * singleton core and requiring both in a process contaminates the answer.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../../../lib/engine');

const F = '```';
const fence = (tag, ...body) => `${F}${tag}\n${body.join('\n')}\n${F}\n`;

describe('engine.languages — the census', () => {
  test('the CLI build carries the full highlight.js, not `common`', () => {
    // The guarantee the export path rests on. `common` is 36; a regression that
    // swapped the full build for it here would silently decolor every exotic
    // fence in every PDF.
    assert.ok(engine.languages.list().length > 150, `expected the full build, got ${engine.languages.list().length}`);
  });

  test('has() answers for canonical names and aliases alike', () => {
    assert.equal(engine.languages.has('bash'), true);
    assert.equal(engine.languages.has('sh'), true, 'sh is an alias of bash');
    assert.equal(engine.languages.has('zsh'), true, 'zsh is an alias of bash');
    assert.equal(engine.languages.has('powershell'), true);
    assert.equal(engine.languages.has('not-a-language-at-all'), false);
    assert.equal(engine.languages.has(''), false);
    assert.equal(engine.languages.has(undefined), false);
  });

  test('needed() reads a deck; missing() is empty on the full build', () => {
    const src = `# t\n\n${fence('powershell', '$x = 1')}\n${fence('dockerfile', 'FROM alpine')}`;
    assert.deepEqual(engine.languages.needed(src), ['powershell', 'dockerfile']);
    assert.deepEqual(engine.languages.missing(src), []);
  });
});

describe('engine.languages.register — teaching the singleton', () => {
  test('a registered grammar is immediately visible to has()', () => {
    const name = 'lattice-test-lang';
    assert.equal(engine.languages.has(name), false);
    const took = engine.languages.register(name, () => ({ name, contains: [] }));
    assert.equal(took, true);
    assert.equal(engine.languages.has(name), true);
  });

  test('a second registration of the same name is a no-op, not an overwrite', () => {
    const name = 'lattice-test-lang-twice';
    assert.equal(engine.languages.register(name, () => ({ name, contains: [] })), true);
    assert.equal(engine.languages.register(name, () => ({ name, contains: [] })), false);
  });

  test('junk is refused rather than thrown', () => {
    // The caller is a preview registering a file it fetched over the network; a
    // grammar that will not load should cost one fence its color, not the render.
    assert.equal(engine.languages.register('x-no-def', null), false);
    assert.equal(engine.languages.register('x-no-def-2', 'not a function'), false);
    assert.equal(engine.languages.register('', () => ({})), false);
  });

  test('registering AFTER a render is picked up by the next one', () => {
    // The property the whole on-demand design rests on: `buildMd` memoizes the
    // markdown-it INSTANCE, and its `highlight` closure reads the singleton at
    // call time — so there is no parser cache to invalidate when a grammar
    // arrives mid-session. If this ever inverts, a fetched grammar would appear
    // only after an unrelated theme change forced a memo miss.
    const name = 'latticelatelang';
    const deck = `---\nmarp: true\n---\n\n## t\n\n${fence(name, 'KEYWORDKEYWORD value')}`;
    const before = engine.render(deck, undefined);
    assert.match(before.html, new RegExp(`language-${name}`), 'the fence renders either way');
    assert.equal(
      (before.html.match(/<span class="hljs-/g) || []).length,
      0,
      'unregistered → no token spans',
    );

    engine.languages.register(name, (hljs) => ({
      name,
      keywords: 'KEYWORDKEYWORD',
      contains: [hljs.QUOTE_STRING_MODE],
    }));

    const after = engine.render(deck, undefined);
    assert.ok(
      (after.html.match(/<span class="hljs-/g) || []).length > 0,
      'registered → token spans, with no cache flush in between',
    );
  });
});
