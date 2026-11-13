/**
 * The five slow patterns #3089 and #3095 added after the regex census's snapshot, rewritten (HARD RULE #32,
 * followups.d/3045-p2-regex-recheck-gate.md: "admitted with --raise"). Each rewrite is held to the pattern it replaced by a
 * seeded differential fuzz (seed 3045, printed in every failure) over the characters the pattern is made of, and each
 * has a mutation arm: the regex trace refuses the old pattern, so a reader that went back to it fails here.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { __stripAgendaFencesForTest: stripAgendaFences, __stripAgendaHtmlBlocksForTest: stripAgendaHtmlBlocks } = require('../../../lib/authoring/lint-core');
const { replaceClassDirective } = require('../../../lib/core/agenda-autofill');
const { firstHeadingInner } = require('../../../lib/forms/tile/progress/progress.transform');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The old patterns (tests are outside the census, which reads lib/** only).
const OLD = {
  fence: /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm,
  html: /^ {0,3}<[A-Za-z][\s\S]*?(?=\n[ \t]*\n|$(?![\s\S]))/gm,
  directive: /(<!--\s*_class\s*:\s*)(["']?)([\s\S]*?)\2(\s*-->)/,
  heading: /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/,
  cls: /\sclass=(["'])([^"']*)\1/,
};
const NEW_CLS = /\sclass=(?:"([^"']*)"|'([^"']*)')/;
const show = (o, q, v, c) => `[${o}|${q}|${v}|${c}]`;

const CASES = [
  ['fence', ['```', '```', '~~~', '````', '`', ' ', '\t', '\n', '\n', '\r', ' ', 'a', 'js'], (s) => s.replace(OLD.fence, ''), stripAgendaFences],
  ['html block', ['<', '<a', '<B', '<1', ' ', ' ', '  ', '\t', '\n', '\n', '\r', ' ', 'x', '>'], (s) => s.replace(OLD.html, ''), stripAgendaHtmlBlocks],
  [
    'class directive',
    ['<!--', '-->', '--->', '_class', ':', ' ', '\n', '"', "'", 'a', 'b c', '-', '>', '<!-- _class: ', '\t'],
    (s) => s.replace(OLD.directive, (_m, o, q, v, c) => show(o, q, v, c)),
    (s) => replaceClassDirective(s, (_m, o, q, v, c) => show(o, q, v, c)),
  ],
  ['heading', ['<h1', '<h2', '<h7', '<h1x', '>', '</h1>', '</h3>', '</h9>', '<', '/', 'a', ' ', '\n', 'h'], (s) => (s.match(OLD.heading) || [])[1] ?? '', (s) => firstHeadingInner(s) ?? ''],
  [
    'class attribute',
    [' class=', 'class=', '"', "'", 'a', 'b c', ' ', '\t', '=', 'x'],
    (s) => { const m = OLD.cls.exec(s); return m ? `${m.index}|${m[0]}|${m[2]}` : null; },
    (s) => { const m = NEW_CLS.exec(s); return m ? `${m.index}|${m[0]}|${m[1] ?? m[2]}` : null; },
  ],
];

describe('the agenda and progress readers answer as the regexes they replaced (seeded fuzz, seed 3045)', () => {
  for (const [name, pieces, old, neu] of CASES) {
    test(`${name}: 50,000 draws, no input where old and new disagree`, () => {
      const rand = mulberry32(3045);
      for (let i = 0; i < 50000; i++) {
        let s = '';
        const len = Math.floor(rand() * 17);
        for (let j = 0; j < len; j++) s += pieces[Math.floor(rand() * pieces.length)];
        assert.equal(neu(s), old(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
      }
    });
  }

  test('each reader runs only regexes the census calls linear, on the hostile input its old pattern choked on', () => {
    assertLinearRegexes(() => stripAgendaFences('```\n'.repeat(2000)));
    assertLinearRegexes(() => stripAgendaHtmlBlocks('<a\n'.repeat(2000)));
    assertLinearRegexes(() => replaceClassDirective(`<!-- _class: a${' '.repeat(4000)}x`, (m) => m));
    assertLinearRegexes(() => firstHeadingInner('<h1>'.repeat(2000)));
    assertLinearRegexes(() => NEW_CLS.exec(' class="a'.repeat(2000)));
  });

  test('mutation arm: the trace refuses every old pattern', () => {
    for (const [name, re] of Object.entries(OLD)) {
      assert.throws(() => assertLinearRegexes(() => 'x'.match(re)), /polynomial|unknown|does not hold/, name);
    }
  });
});
