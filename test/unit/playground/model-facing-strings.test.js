/**
 * Unit: the model-facing strings #3531 corrected, held where no other test reaches them.
 *
 * Each was a claim the Studio's model read and the engine had stopped honoring. The chat request itself is pinned on
 * the real surface by docs/e2e/chat-model-facing-strings.spec.ts; this file holds the strings that spec cannot see
 * (the edit-block protocol rides only the one-shot and on-device paths) and pins each at its source, so a revert goes
 * red in the inner loop rather than only in the e2e tier.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { DECK_CANON } = require('../../../lib/authoring/deck-canon.js');
const { DECK_SETTING_PROSE } = require('../../../lib/core/deck-settings.prose.js');

describe('model-facing strings (#3531)', () => {
  test('the edit-block protocol asks for the slide from its @meta line, with a fence that exists', async () => {
    // Writers emit `@meta` since #3433, and the authoring rules say there is no ```chart fence.
    const { EDIT_PROTOCOL } = await import('../../../docs/src/components/studio/ai/architect-edits.js');
    assert.match(EDIT_PROTOCOL, /give the WHOLE slide \(its `@meta\{…\}` line through its last line\)/);
    assert.doesNotMatch(EDIT_PROTOCOL, /_class/);
    assert.doesNotMatch(EDIT_PROTOCOL, /```chart/);
  });

  test('the authoring rules name no layout that does not exist', async () => {
    // `bleed` is a collage variant, not a layout; a full-slide photo is `image` with `class=spotlight`.
    const { AUTHORING_RULES } = await import('../../../docs/src/lib/architect-knowledge.js');
    const photo = AUTHORING_RULES.find((r) => r.startsWith('A photo is'));
    assert.ok(photo, 'the photo rule is present');
    assert.match(photo, /`class=spotlight` behind the whole slide/);
    assert.doesNotMatch(photo, /`bleed`/);
  });

  test('the deck canon names no field the model never sees', () => {
    // `escalateTo` is a manifest field; no prompt or tool result shows it to the model.
    assert.doesNotMatch(DECK_CANON, /escalateTo/);
    assert.match(DECK_CANON, /move to the layout its contract names or split across slides/);
  });

  test('the glossary blurb names the registry it reads', () => {
    // lib/core/glossary-auto.mjs builds from `terms:`, which absorbs `acronyms:` (2026-11-16-terms-registry.md).
    assert.match(DECK_SETTING_PROSE.glossary.info, /built from the terms: definitions/);
    assert.doesNotMatch(DECK_SETTING_PROSE.glossary.info, /acronyms:/);
  });
});
