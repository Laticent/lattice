/** The media reach-in gate (tools/check-ownership.js `checkMediaReachIns`; media note §4.11): it passes on the tree, it fails on a
 *  component that hides a figure's title, and it fails on a stale sanction. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkMediaReachIns } = require('../../../tools/check-ownership.js');

const tree = (css) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
  fs.mkdirSync(path.join(root, 'lib', 'components', 'x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'components', 'x', 'x.styles.css'), css);
  return root;
};

test('the committed components reach into no media figure', () => {
  const errors = [];
  checkMediaReachIns(errors);
  assert.deepEqual(errors, []);
});

test('a host that hides the title fails; a property set on the figure passes', () => {
  const bad = [];
  checkMediaReachIns(bad, [], tree('section.x .lat-media-title { display: none; }'));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /reaches into a media figure/);
  const good = [];
  checkMediaReachIns(good, [], tree('section.x .video-embed { --lat-media-w: 40cqi; } /* .lat-media-title in a comment */'));
  assert.deepEqual(good, []);
});

test('a stale sanction fails', () => {
  const errors = [];
  checkMediaReachIns(errors, [{ file: 'lib/components/x/x.styles.css', why: 'reason' }], tree('section.x { color: red; }'));
  assert.match(errors.join('\n'), /stale SANCTIONED_MEDIA_REACH_INS/);
});
