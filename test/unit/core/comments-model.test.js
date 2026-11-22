/**
 * `comments()` (lib/core/meta-record.mjs), the notes channel's reader, finds where a comment is live from the deck
 * model's block ranges (Segno P3, engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 islands left). Held here
 * to markdown-it as the engine configures it (lib/core/boundary-parser.mjs): every `<!--` is tagged, the source is
 * parsed, and an opener is live when its tag comes back inside an `html_block` or an `html_inline` token, the rule
 * lib/authoring/notes-core.js `liveCommentOpeners` reads notes by.
 *
 * Inline structure is S2's (P4), so the atoms hold none: no code span, backslash, `$`, other raw HTML inline, or the
 * `<!-->` short forms. Seeded (seed 3042, HARD RULE #32); the seed is in every message.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { boundaryParser } from '../../../lib/core/boundary-parser.mjs';
import { comments } from '../../../lib/core/meta-record.mjs';

/** The openers markdown-it renders as comments, paired the way `comments()` pairs them. */
function reference(src) {
  const hits = [];
  for (let at = src.indexOf('<!--'); at !== -1; at = src.indexOf('<!--', at + 1)) hits.push(at);
  const parts = [];
  let cursor = 0;
  hits.forEach((at, i) => {
    parts.push(src.slice(cursor, at), `<!--zqlcn${i}e`);
    cursor = at + 4;
  });
  parts.push(src.slice(cursor));
  const tagged = parts.join('');
  const fm = /^---\n[\s\S]*?\n---\n?/.exec(tagged);
  const live = new Set();
  const seen = (tok) => {
    if (tok.type !== 'html_block' && tok.type !== 'html_inline') return;
    for (const m of tok.content.matchAll(/<!--zqlcn(\d+)e/g)) live.add(hits[Number(m[1])]);
  };
  for (const tok of boundaryParser.parse(fm ? tagged.slice(fm[0].length) : tagged, {})) {
    seen(tok);
    if (tok.children) tok.children.forEach(seen);
  }
  const out = [];
  let at = src.indexOf('<!--');
  while (at !== -1) {
    if (!live.has(at)) {
      at = src.indexOf('<!--', at + 4);
      continue;
    }
    const close = src.indexOf('-->', at + 4);
    if (close === -1) break;
    out.push([at, close + 3]);
    at = src.indexOf('<!--', close + 3);
  }
  return out;
}

const ATOMS = [
  '<!-- note -->\n',
  '<!--\nmulti\nline -->\n',
  'text <!-- inline --> tail\n',
  'text <!-- open\nmore -->\n',
  'para <!-- unclosed\n',
  '-->\n',
  '\n',
  '\n',
  '---\n',
  '# Heading <!-- h -->\n',
  'Setext <!-- s -->\n===\n',
  '```\n<!-- fenced -->\n```\n',
  '```\n<!-- open fence\n',
  '~~~\n-->\n~~~\n',
  '    <!-- indented -->\n',
  '$$\n<!-- in math -->\n$$\n',
  '$$\n<!-- open math\n',
  '<div>\n<!-- in div -->\n</div>\n',
  '<div>\n```\n<!-- fence in div -->\n```\n</div>\n',
  '> <!-- quoted -->\n',
  '> quote <!-- q\n> more -->\n',
  '- <!-- listed -->\n',
  '- item <!-- li -->\n  <!-- cont -->\n',
  '1. one\n   ```\n   <!-- list fence -->\n   ```\n',
  '| a | b <!-- th --> |\n|---|---|\n| <!-- td --> | c |\n',
  '| <!-- a | b --> |\n|---|---|\n',
  '| a | b |\n|---|---|\n| c | d | <!-- past the columns --> |\n',
  '> | a \\| <!-- esc --> |\n> |---|\n',
  '[ref]: /url "<!-- title -->"\n',
  '<pre>\n<!-- in pre\n</pre>\n-->\n',
  'lazy\n<!-- not a block -->\n',
];

function deck(rand, n) {
  let s = rand(4) === 0 ? '---\ntheme: x <!-- fm -->\n---\n\n' : '';
  for (let i = 0; i < n; i++) s += ATOMS[rand(ATOMS.length)];
  return s;
}

describe('comments() reads liveness from the deck model', () => {
  test('agrees with markdown-it on 4,000 seeded decks (seed 3042)', () => {
    let seed = 3042;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 4000; i++) {
      const src = deck(rand, 1 + rand(8));
      const got = comments(src).map((c) => [c.start, c.end]);
      assert.deepEqual(got, reference(src), `seed 3042, deck ${i}: ${JSON.stringify(src)}`);
    }
  });

  test('the shapes the fence scan got wrong', () => {
    const live = (src) => comments(src).map((c) => c.body.trim());
    // A comment in a `$$` block or an indented code block is code, not a note.
    assert.deepEqual(live('$$\n<!-- x -->\n$$\n'), []);
    assert.deepEqual(live('    <!-- x -->\n'), []);
    // A fence inside a `<div>` block is HTML to the engine, so the comment in it is live.
    assert.deepEqual(live('<div>\n```\n<!-- x -->\n```\n</div>\n'), ['x']);
    // An unclosed opener in a fence no longer swallows the note after the fence.
    assert.deepEqual(live('```\n<!-- open\n```\n\n<!-- note -->\n'), ['note']);
    // An inline opener does not close two paragraphs down.
    assert.deepEqual(live('a <!-- open\n\nb -->\n'), []);
    // A comment across two table cells is two cells of text, and one past the header's columns is dropped.
    assert.deepEqual(live('| <!-- a | b --> |\n|---|---|\n'), []);
    assert.deepEqual(live('| a | b |\n|---|---|\n| c | d | <!-- gone --> |\n'), []);
    assert.deepEqual(live('| a | <!-- kept --> |\n|---|---|\n'), ['kept']);
    // The front matter is settings, not Markdown.
    assert.deepEqual(live('---\ntitle: <!-- x -->\n---\n\nbody\n'), []);
  });

  test('offsets index the chunk as given: a BOM and CRLF', () => {
    const src = '\uFEFFa <!-- one -->\r\n\r\n<!--\r\ntwo -->\r\n';
    const found = comments(src);
    assert.deepEqual(found.map((c) => src.slice(c.start, c.end)), ['<!-- one -->', '<!--\r\ntwo -->']);
    assert.deepEqual(found.map((c) => src.slice(c.bodyStart, c.bodyStart + c.body.length)), found.map((c) => c.body));
  });
});
