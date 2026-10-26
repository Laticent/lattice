/**
 * Followup 2687-p7, the red team's follow-on: `contain:paint` on a plugin's fence root holds a
 * `position:fixed` box, but the TOP LAYER is outside every box. A plugin that returned a
 * `<button popovertarget>` over its own block and a `<div popover>` painted over the whole slide
 * after one click (measured in Chromium 131). `doorFinishFence` now drops the attributes that
 * reach the top layer; the inline door runs the fence door first, so it inherits the drop.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const doc = new JSDOM('').window.document;
const pass = (s) => s; // the sanitizer is not under test: the drop runs on what it returns

test('a plugin fence cannot open the top layer: popover and command attributes are dropped', async () => {
  const { doorFinishFence } = await import('../../../lib/core/door-attr.mjs');
  const html =
    '<button popovertarget="pp" popovertargetaction="show">x</button>' +
    '<div popover="manual" id="pp" style="position:fixed;inset:0">y</div>' +
    '<button commandfor="d" command="show-modal">z</button><p>keep</p>';
  const out = doorFinishFence(doc, pass, html, 'p');
  assert.ok(!('error' in out), JSON.stringify(out));
  assert.doesNotMatch(out.html, /popover|commandfor|command=/i, out.html);
  assert.match(out.html, /<p>keep<\/p>/, 'the drawing itself survives');
});

test('an inline span cannot open the top layer either', async () => {
  const { doorFinishInline } = await import('../../../lib/core/door-attr.mjs');
  const out = doorFinishInline(doc, pass, '<span popover id="q">w</span>', 'p');
  assert.ok(!('error' in out), JSON.stringify(out));
  assert.doesNotMatch(out.html, /popover/i, out.html);
});

test('output with none of them is returned untouched', async () => {
  const { doorFinishFence } = await import('../../../lib/core/door-attr.mjs');
  assert.deepEqual(doorFinishFence(doc, pass, '<p class="a">plain</p>', 'p'), { html: '<p class="a">plain</p>' });
});
