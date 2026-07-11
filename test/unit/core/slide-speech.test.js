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
