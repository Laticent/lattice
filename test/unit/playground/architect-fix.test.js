/**
 * Unit: the per-finding model fix (the Coach card's "Fix" action).
 * Pure prompt assembly + edit extraction — the model is mocked, so the FLOW is
 * verified headless (the quality of a real model's rewrite is not, and can't be).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  return import('../../../docs/src/components/studio/ai/architect-fix.js');
}

const DECK = `---
theme: indaco
---

<!-- _class: title -->
# Hello

---

<!-- _class: content -->
This slide is a wall of text that goes on and on without a single idea to anchor it.
`;

const finding = { slide: 2, message: 'a dense slide — one idea per slide reads better', fix: 'Split it or cut to the essential point.' };

// A mock backend: complete() returns whatever reply we hand it, and records the
// messages + options it was called with so we can assert on the prompt and wiring.
function mockModel(reply) {
  const calls = [];
  return {
    calls,
    async complete(opts) { calls.push(opts); return typeof reply === 'function' ? reply(opts) : reply; },
  };
}

const EDIT = (slide, body) => '````lattice-edit slide=' + slide + '\n' + body + '\n````';

describe('buildFixMessages', () => {
  test('injects the canon principle when the finding rule maps to a card', async () => {
    const { buildFixMessages } = await load();
    const ruled = { slide: 2, rule: 'wall-of-text', message: 'a dense slide', fix: 'split it' };
    const msgs = buildFixMessages({ source: DECK, finding: ruled, catalog: [], cache: false });
    assert.match(msgs[0].content, /Apply this principle/);
    assert.match(msgs[0].content, /one idea per slide/i);
  });

  test('no canon line when the finding rule does not map', async () => {
    const { buildFixMessages } = await load();
    const msgs = buildFixMessages({ source: DECK, finding: { slide: 2, message: 'x' }, catalog: [], cache: false });
    assert.doesNotMatch(msgs[0].content, /Apply this principle/);
  });

  test('non-cache: one system string + a user turn, grounded in the finding + deck', async () => {
    const { buildFixMessages } = await load();
    const msgs = buildFixMessages({ source: DECK, finding, catalog: [], cache: false });
    assert.equal(msgs.length, 2);
    assert.equal(typeof msgs[0].content, 'string');
    assert.match(msgs[0].content, /slide 2/);
    assert.match(msgs[0].content, /a dense slide/);
    assert.match(msgs[0].content, /lattice-edit/); // the edit protocol is included
    assert.match(msgs[0].content, /\[slide 2\]/); // the numbered deck is included
    assert.equal(msgs[1].role, 'user');
    assert.match(msgs[1].content, /Rewrite slide 2/);
  });

  test('cache: static prefix carries the cache_control breakpoint, dynamic tail does not', async () => {
    const { buildFixMessages } = await load();
    const msgs = buildFixMessages({ source: DECK, finding, catalog: [], cache: true });
    assert.ok(Array.isArray(msgs[0].content));
    assert.equal(msgs[0].content.length, 2);
    assert.deepEqual(msgs[0].content[0].cache_control, { type: 'ephemeral' });
    assert.equal(msgs[0].content[1].cache_control, undefined);
    // The static block holds the (cacheable) protocol; the dynamic tail holds the deck.
    assert.match(msgs[0].content[0].text, /lattice-edit/);
    assert.match(msgs[0].content[1].text, /\[slide 2\]/);
  });
});

describe('requestSlideFix', () => {
  test('returns a normalised replace edit + before/after for a valid reply', async () => {
    const { requestSlideFix } = await load();
    const after = '<!-- _class: content -->\n## One idea\n- the essential point';
    const model = mockModel('Sure — here is the fix:\n\n' + EDIT(2, after));
    const out = await requestSlideFix({ model, source: DECK, finding, catalog: [] });
    assert.equal(out.edit.action, 'replace');
    assert.equal(out.edit.slide, 2);
    assert.equal(out.edit.body, after);
    assert.equal(out.after, after);
    assert.match(out.before, /wall of text/);
  });

  test('snaps a drifted slide= label back to the flagged slide', async () => {
    const { requestSlideFix } = await load();
    const model = mockModel(EDIT(7, '<!-- _class: content -->\n## Fixed'));
    const out = await requestSlideFix({ model, source: DECK, finding, catalog: [] });
    assert.equal(out.edit.slide, 2); // normalised to the finding, not the model's 7
  });

  test('null when no edit block came back', async () => {
    const { requestSlideFix } = await load();
    const model = mockModel('I think you should split the slide. (no edit block)');
    assert.equal(await requestSlideFix({ model, source: DECK, finding, catalog: [] }), null);
  });

  test('null on a no-op rewrite (body equals the current slide)', async () => {
    const { requestSlideFix, } = await load();
    const same = '<!-- _class: content -->\nThis slide is a wall of text that goes on and on without a single idea to anchor it.';
    const model = mockModel(EDIT(2, same));
    assert.equal(await requestSlideFix({ model, source: DECK, finding, catalog: [] }), null);
  });

  test('null for a deck-level finding (no single slide to rewrite)', async () => {
    const { requestSlideFix } = await load();
    const model = mockModel(EDIT(1, 'x'));
    assert.equal(await requestSlideFix({ model, source: DECK, finding: { slide: 0, message: 'deck' }, catalog: [] }), null);
    assert.equal(model.calls.length, 0); // never even calls the model
  });

  test('threads gate.cache(), gate.onUsage, and signal to the backend', async () => {
    const { requestSlideFix } = await load();
    const model = mockModel(EDIT(2, '<!-- _class: content -->\n## Fixed point'));
    const onUsage = () => {};
    const signal = new AbortController().signal;
    const gate = { cache: () => true, onUsage };
    await requestSlideFix({ model, gate, source: DECK, finding, catalog: [], signal });
    const call = model.calls[0];
    assert.equal(call.onUsage, onUsage);
    assert.equal(call.signal, signal);
    assert.ok(Array.isArray(call.messages[0].content)); // cache:true → structured blocks
  });
});
