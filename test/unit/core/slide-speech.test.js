const test = require('node:test');
const assert = require('node:assert/strict');
const { slideToSpeech } = require('../../../lib/core/slide-speech.js');

// slide-speech is the shared base narration flattener (moved out of the browser-only
// read-aloud.ts, #902 Gap 1) — both producers flatten a slide identically. These pin
// the same contract read-aloud.test.ts pinned for the browser copy.

test('drops the _class directive + reads the heading and prose', () => {
  const out = slideToSpeech('<!-- _class: kpi -->\n\n## Revenue is up\n\nWe grew 40% this quarter.');
  assert.match(out, /^Revenue is up\. We grew 40% this quarter\.$/);
});

test('flattens inline markup (bold / code) to its words', () => {
  const out = slideToSpeech('- **Bold** point\n- a `code` token\n- plain item');
  assert.match(out, /Bold point\./);
  assert.match(out, /a code token\./);
  assert.match(out, /plain item\./);
  assert.doesNotMatch(out, /[*`]/);
});

test('a link reads as its label, not its URL', () => {
  const out = slideToSpeech('See [the report](https://example.com/x) for detail.');
  assert.match(out, /See the report for detail\./);
  assert.doesNotMatch(out, /example\.com/);
});

test('skips fenced code and ![bg] images entirely', () => {
  const out = slideToSpeech('Intro line.\n\n```js\nconst x = 1;\n```\n\n![bg](photo.jpg)\n\nClosing line.');
  assert.equal(out, 'Intro line. Closing line.');
});

test('a structural line gets a synthetic terminator so pauses fall between clauses', () => {
  // A bullet with no end punctuation gains a `.` so the caption engine breathes.
  assert.match(slideToSpeech('- first\n- second'), /^first\. second\.$/);
  // …but a line that already ends in punctuation is not double-terminated.
  assert.equal(slideToSpeech('## Done.'), 'Done.');
});

test('nothing to say → empty string', () => {
  assert.equal(slideToSpeech('![bg](a.svg)'), '');
  assert.equal(slideToSpeech(''), '');
  assert.equal(slideToSpeech(null), '');
});

// ── COMMENTS ARE BLOCKS, NOT LINE PREFIXES ───────────────────────────────────
//
// A speaker note in this engine IS a non-directive HTML comment, and the Studio's own
// note editor writes multi-line ones. This flattener used to skip a comment with
// `/^<!--/` — a test that sees only the line the comment OPENS on — so every
// continuation line of a note was returned as slide prose.
//
// That single line-prefix test was the channel behind three leaks measured on real
// exported bytes (2026-08-24-stage-console-split.md §10): a note in the `.vtt` with
// default flags on a chart slide, a note in the `.vtt` under `--strip-notes`, and a
// multi-line `<!-- caption: -->` surviving `--strip-captions`. The ladder cells all
// passed throughout, because every note in them was single-line.
//
// These are the shapes, at the kernel. The integration cells in
// test/integration/export/html-player.test.js drive the same shapes through the real
// exporter; both are needed — one says where the bug is, the other says it is gone
// from the bytes a recipient opens.
test('a MULTI-LINE speaker note is not spoken — no continuation line survives', () => {
  const out = slideToSpeech('# Title\n\n<!--\nPRIVATE do not say the Ohio number.\nLegal has not cleared it.\n-->\n\nBody sentence here.');
  assert.equal(out, 'Title. Body sentence here.');
});

test('the `note:` form the Studio writes is not spoken either', () => {
  const out = slideToSpeech('# Title\n\n<!-- note:\nPRIVATE Ohio number\n-->\n\nBody sentence here.');
  assert.equal(out, 'Title. Body sentence here.');
});

test('a note TRAILING a content line is dropped without eating the content', () => {
  // The other half of the line-prefix bug: `/^<!--/` never fired here at all, so the
  // whole line went through with its comment markup intact.
  const out = slideToSpeech('# Title\n\nBody here. <!-- note: PRIVATE trailing -->');
  assert.equal(out, 'Title. Body here.');
});

test('an unclosed comment inside a FENCE does not swallow the slide', () => {
  // Why the blanker tracks fences: a code sample may legitimately show an opening
  // comment with no close. Treating that as a real comment would silently eat every
  // remaining line — turning a narration bug into a blank caption track.
  const out = slideToSpeech('# Title\n\n```html\n<!-- an example opener\n```\n\nBody sentence here.');
  assert.equal(out, 'Title. Body sentence here.');
});

test('a directive comment still goes, and content on the same line still comes', () => {
  assert.equal(slideToSpeech('<!-- _class: funnel -->\n# Signup funnel\n\nBody.'), 'Signup funnel. Body.');
});

test('blankHtmlComments preserves the LINE COUNT — speakLeftover indexes by line', () => {
  // The contract that lets chart-narration.js blank comments before filtering by a
  // `consumed` Set of ORIGINAL line indices. Deleting lines here would shift every
  // index and silently mis-drop real authored content.
  const { blankHtmlComments } = require('../../../lib/core/slide-speech.js');
  const src = '# H\n\n<!-- note:\nPRIVATE\n-->\n\n- item one\n- item two';
  assert.equal(blankHtmlComments(src).split('\n').length, src.split('\n').length);
  assert.equal(blankHtmlComments(src).includes('PRIVATE'), false);
  assert.ok(blankHtmlComments(src).includes('- item two'), 'real content is untouched');
});
