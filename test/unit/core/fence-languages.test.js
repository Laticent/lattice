/**
 * lib/core/fence-languages — the fence walk, the language census, and the
 * script-tagged-as-session detector.
 *
 * Three consumers depend on this being right and they fail in different
 * directions, so the cases below are grouped that way rather than by function:
 * the ENGINE asks `missing()` to decide what the preview must fetch (a false
 * negative leaves a fence gray forever), the LINTER asks `shellFenceFindings()`
 * (a false positive nags an author whose transcript is correctly tagged), and
 * both walk the same fences (a mis-parsed fence corrupts both answers at once).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  scanFences,
  fenceLanguages,
  missingLanguages,
  looksLikeShellScript,
  shellFenceFindings,
  normalizeInfo,
  SCRIPT_TAGS,
  SESSION_TAGS,
} = require('../../../lib/core/fence-languages');

// Built with an explicit join so the fixture source can hold real fence markers
// without this file's own fences (there are none) being ambiguous to a reader.
const F = '```';
const deck = (...lines) => lines.join('\n');

describe('scanFences — the walk', () => {
  test('reads the tag and body of each fence', () => {
    const out = scanFences(deck(`${F}bash`, 'set -e', `${F}`, '', `${F}python`, 'x = 1', `${F}`));
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((f) => f.lang), ['bash', 'python']);
    assert.equal(out[0].body, 'set -e');
    assert.equal(out[1].body, 'x = 1');
  });

  test('reports the 1-based opening line, so a finding can point at it', () => {
    const out = scanFences(deck('## heading', '', `${F}bash`, 'set -e', `${F}`));
    assert.equal(out[0].line, 3);
  });

  test('a longer fence run is not closed by a shorter one inside it', () => {
    // The documenting case: a block that SHOWS fenced markdown. Closing on the
    // inner ``` would split one fence into two and mis-attribute the tags.
    const out = scanFences(deck('````markdown', `${F}bash`, 'set -e', `${F}`, '````'));
    assert.equal(out.length, 1);
    assert.equal(out[0].lang, 'markdown');
    assert.ok(out[0].body.includes('set -e'));
  });

  test('tilde fences are fences too', () => {
    assert.deepEqual(scanFences(deck('~~~bash', 'set -e', '~~~')).map((f) => f.lang), ['bash']);
  });

  test('a tilde fence is not closed by a backtick run', () => {
    const out = scanFences(deck('~~~bash', F, 'set -e', '~~~'));
    assert.equal(out.length, 1);
    assert.ok(out[0].body.includes(F));
  });

  test('inline code on a line of its own does not open a fence', () => {
    assert.deepEqual(scanFences('some `` `x` `` prose\n'), []);
    assert.deepEqual(scanFences(`a ${F}x${F} b\n`), []);
  });

  test('an unclosed fence still reports its language', () => {
    // markdown-it renders it to the end of the document and asks the highlighter
    // for that language, so dropping it here would under-report what to fetch.
    const out = scanFences(deck(`${F}rust`, 'fn main() {}'));
    assert.deepEqual(out.map((f) => f.lang), ['rust']);
  });

  test('a DEEPLY INDENTED fence still counts — a list item legitimately has one', () => {
    // This assertion used to read "four spaces does not open a fence", which is
    // CommonMark's rule at the TOP LEVEL and the wrong rule for this kernel. Inside
    // a list item the content is measured from the list marker, so
    // `- item` + a 4-space-indented fence IS a fence and the engine renders it
    // `class="language-powershell"` — while this walk returned nothing for it, so
    // the Playground never fetched the grammar and the fence stayed monochrome
    // there while the CLI colored it. That is precisely the cross-surface gap this
    // kernel exists to close, and the old cap reopened it for one authoring shape.
    // See the header of lib/core/fence-languages.js for why generous is correct
    // here: a false positive costs one unused ~2 KB grammar fetch.
    assert.deepEqual(scanFences(deck(`   ${F}go`, 'x', `   ${F}`)).map((f) => f.lang), ['go']);
    assert.deepEqual(scanFences(deck(`    ${F}go`, 'x', `    ${F}`)).map((f) => f.lang), ['go']);
    assert.deepEqual(
      scanFences(deck('- item', '', `    ${F}powershell`, '    Get-Item', `    ${F}`)).map((f) => f.lang),
      ['powershell'],
    );
  });

  test('an untagged fence reports an empty language', () => {
    assert.deepEqual(scanFences(deck(F, 'plain', F)).map((f) => f.lang), ['']);
  });
});

describe('normalizeInfo — what the highlighter is actually asked for', () => {
  test('takes the first word and lowercases it', () => {
    assert.equal(normalizeInfo('Bash'), 'bash');
    assert.equal(normalizeInfo('  JavaScript  '), 'javascript');
  });

  test('drops attribute syntax', () => {
    assert.equal(normalizeInfo('js {highlight=1}'), 'js');
    assert.equal(normalizeInfo('ts,twoslash'), 'ts');
  });

  test('a non-string is not a language', () => {
    assert.equal(normalizeInfo(undefined), '');
    assert.equal(normalizeInfo(null), '');
  });
});

describe('fenceLanguages — the census', () => {
  test('distinct tags in first-appearance order, untagged excluded', () => {
    const src = deck(
      `${F}python`, 'x', F, '',
      `${F}bash`, 'y', F, '',
      `${F}`, 'z', F, '',
      `${F}python`, 'w', F,
    );
    assert.deepEqual(fenceLanguages(src), ['python', 'bash']);
  });

  test('a deck with no fences asks for nothing', () => {
    assert.deepEqual(fenceLanguages('## just a heading\n'), []);
    assert.deepEqual(fenceLanguages(''), []);
  });
});

describe('missingLanguages — what the preview must fetch', () => {
  // A stand-in rather than a real highlight.js: the point is the CONTRACT with
  // whichever instance is passed, and a real one would make the test depend on
  // which build the runner happened to load first (the `common` and full entries
  // share one singleton core, so requiring both in a process contaminates it).
  const hljsWith = (...known) => ({ getLanguage: (n) => (known.includes(n) ? {} : undefined) });

  test('names only what the given instance cannot serve', () => {
    const src = deck(`${F}bash`, 'x', F, '', `${F}powershell`, 'y', F);
    assert.deepEqual(missingLanguages(src, hljsWith('bash')), ['powershell']);
    assert.deepEqual(missingLanguages(src, hljsWith('bash', 'powershell')), []);
  });

  test('asks the instance it was handed, not a bundled one', () => {
    const src = deck(`${F}bash`, 'x', F);
    assert.deepEqual(missingLanguages(src, hljsWith()), ['bash']);
  });

  test('a bad instance yields nothing rather than throwing', () => {
    const src = deck(`${F}bash`, 'x', F);
    assert.deepEqual(missingLanguages(src, null), []);
    assert.deepEqual(missingLanguages(src, {}), []);
  });
});

describe('looksLikeShellScript — the session/script call', () => {
  test('a shebang is a script', () => {
    assert.equal(looksLikeShellScript('#!/usr/bin/env bash\nls\n'), true);
  });

  for (const line of ['set -euo pipefail', 'export PATH=/x', 'if [ -f x ]; then', 'for h in a b; do', 'done', 'COUNT=0', 'deploy() {']) {
    test(`script-only line: ${line}`, () => {
      assert.equal(looksLikeShellScript(line), true);
    });
  }

  test('a prompt anywhere makes it a session, script-ish lines and all', () => {
    // The false-positive guard that matters: a transcript legitimately contains
    // commands that would otherwise read as script lines.
    assert.equal(looksLikeShellScript('$ set -euo pipefail\nok\n'), false);
    assert.equal(looksLikeShellScript('checking...\n$ export PATH=/x\ndone\n'), false);
    assert.equal(looksLikeShellScript('# whoami\nroot\n'), false);
  });

  test('a body that is legal as either reading is left alone', () => {
    assert.equal(looksLikeShellScript('echo hello\nls -la\n'), false);
  });

  test('empty and non-string bodies are not scripts', () => {
    assert.equal(looksLikeShellScript(''), false);
    assert.equal(looksLikeShellScript('   \n\n'), false);
    assert.equal(looksLikeShellScript(undefined), false);
  });
});

describe('shellFenceFindings — one finding per mis-tagged fence', () => {
  test('flags a script under every session tag', () => {
    for (const tag of SESSION_TAGS) {
      const out = shellFenceFindings(deck(`${F}${tag}`, '#!/bin/sh', 'set -eu', F));
      assert.equal(out.length, 1, tag);
      assert.equal(out[0].lang, tag);
      assert.equal(out[0].line, 1);
    }
  });

  test('never flags a script under a script tag', () => {
    for (const tag of SCRIPT_TAGS) {
      assert.deepEqual(shellFenceFindings(deck(`${F}${tag}`, '#!/bin/sh', 'set -eu', F)), []);
    }
  });

  test('never flags a genuine transcript', () => {
    assert.deepEqual(shellFenceFindings(deck(`${F}console`, '$ ./deploy.sh', 'ok  web-01', F)), []);
  });

  test('ignores a non-shell language whose body happens to look script-ish', () => {
    // `set` and `done` appear in plenty of grammars; the rule is scoped to the
    // session TAGS, so nothing else can trip it.
    assert.deepEqual(shellFenceFindings(deck(`${F}python`, 'set -eu', F)), []);
  });

  test('reports each offending fence separately', () => {
    const out = shellFenceFindings(deck(
      `${F}shell`, 'set -eu', F, '',
      `${F}console`, '$ ls', F, '',
      `${F}shellsession`, '#!/bin/sh', F,
    ));
    assert.deepEqual(out.map((f) => f.lang), ['shell', 'shellsession']);
  });
});

describe('the tag vocabularies', () => {
  test('script and session tags are disjoint', () => {
    for (const t of SCRIPT_TAGS) assert.equal(SESSION_TAGS.includes(t), false, t);
  });

  test('they are frozen — a consumer cannot mutate the shared vocabulary', () => {
    assert.equal(Object.isFrozen(SCRIPT_TAGS), true);
    assert.equal(Object.isFrozen(SESSION_TAGS), true);
  });
});
