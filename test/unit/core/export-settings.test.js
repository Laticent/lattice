/**
 * Unit: the export-settings block (lib/core/export-settings.js).
 *
 * The producer's decisions, carried into the artifact — separate from the deck's
 * front-matter snapshot on purpose. Front matter is the author's deck; an export
 * setting is a property of the render target, and conflating them was the altitude
 * error this block exists to correct
 * (engineering/decisions/2026-07-30-overflow-marker-register.md).
 *
 * What has to hold is the same short list the front-matter block has to satisfy —
 * round-trip, cannot close its own `<script>`, reading REMOVES it — plus the one
 * property that is the whole reason it is a separate block: a re-export replaces it
 * rather than inheriting it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  EXPORT_SETTINGS_TYPE, EXPORT_SETTINGS_NOTE,
  exportSettingsBlock, withoutExportSettingsBlock, readExportSettings,
} = require('../../../lib/core/export-settings');

const docWith = (block) => new JSDOM(`<article><section><h1>A</h1>${block}</section></article>`).window.document;

describe('export settings — the block', () => {
  test('carries the settings as a JSON payload under its own type', () => {
    const block = exportSettingsBlock({ overflowMarker: 'reader' });
    assert.ok(block.startsWith(`${EXPORT_SETTINGS_NOTE}\n`), 'the generated-file note leads');
    // The note has one job beyond provenance: say it is NOT front matter, so nobody
    // copies the idea back into a deck.
    assert.match(EXPORT_SETTINGS_NOTE, /Not deck front matter/);
    const el = new JSDOM(`<section>${block}</section>`).window.document.querySelector('script');
    assert.equal(el.getAttribute('type'), EXPORT_SETTINGS_TYPE);
    assert.deepEqual(JSON.parse(el.textContent), { overflowMarker: 'reader' });
  });

  test('nothing to carry writes nothing', () => {
    assert.equal(exportSettingsBlock({}), '');
    assert.equal(exportSettingsBlock(), '');
    assert.equal(exportSettingsBlock({ overflowMarker: undefined }), '');
    assert.equal(exportSettingsBlock({ overflowMarker: '' }), '', 'an empty value is absence');
  });

  // The one character that could turn a data block into markup — same guard and
  // same reason as the front-matter block.
  test('a payload cannot close its own script element', () => {
    const block = exportSettingsBlock({ overflowMarker: '</script><img src=x onerror=alert(1)>' });
    const beforeTheRealClose = block.slice(0, -'</script>\n'.length).toLowerCase();
    assert.ok(!beforeTheRealClose.includes('</script'), 'only the real closing tag is present');
    const doc = docWith(block);
    assert.equal(doc.querySelectorAll('img').length, 0, 'the browser parses no injected element');
    assert.equal(readExportSettings(doc).overflowMarker, '</script><img src=x onerror=alert(1)>',
      'and it still round-trips exactly');
  });
});

describe('export settings — reading them back', () => {
  test('returns the settings and REMOVES the block', () => {
    const doc = docWith(exportSettingsBlock({ overflowMarker: 'off' }));
    assert.equal(doc.querySelectorAll('script').length, 1);
    assert.deepEqual(readExportSettings(doc), { overflowMarker: 'off' });
    assert.equal(doc.querySelectorAll('script').length, 0, 'the block is out of the DOM');
    assert.equal(doc.querySelector('section').children.length, 1, 'only the real content is left');
    assert.equal(doc.querySelector('section h1').textContent, 'A');
  });

  test('a second read finds nothing — which is why the caller memoizes', () => {
    const doc = docWith(exportSettingsBlock({ overflowMarker: 'off' }));
    readExportSettings(doc);
    assert.equal(readExportSettings(doc), null);
  });

  // The distinction the runtime leans on: null means "not an exported artifact",
  // so it decides the whole default. A corrupt payload has to read as null too —
  // guessing would hand a reader the authoring signal or vice versa.
  test('no block, corrupt JSON, and a non-object payload all read null', () => {
    assert.equal(readExportSettings(docWith('')), null);
    assert.equal(readExportSettings(docWith(`<script type="${EXPORT_SETTINGS_TYPE}">{not json</script>`)), null);
    assert.equal(readExportSettings(docWith(`<script type="${EXPORT_SETTINGS_TYPE}">"reader"</script>`)), null);
    assert.equal(readExportSettings(docWith(`<script type="${EXPORT_SETTINGS_TYPE}">[1,2]</script>`)), null,
      'an array would make settings.overflowMarker read undefined off the wrong shape');
    assert.equal(readExportSettings(docWith(`<script type="${EXPORT_SETTINGS_TYPE}">null</script>`)), null);
  });

  test('the LAST block wins, and every one is removed', () => {
    const doc = docWith(exportSettingsBlock({ overflowMarker: 'author' }) + exportSettingsBlock({ overflowMarker: 'off' }));
    assert.deepEqual(readExportSettings(doc), { overflowMarker: 'off' }, 'the newest, not the stalest');
    assert.equal(doc.querySelectorAll('script').length, 0);
  });

  test('survives a null / non-DOM argument', () => {
    assert.equal(readExportSettings(null), null);
    assert.equal(readExportSettings({}), null);
  });
});

describe('export settings — stripping, so a re-export cannot inherit', () => {
  test('removes the block and its note, leaving the deck otherwise intact', () => {
    const deck = `# A\n\nBody.\n${exportSettingsBlock({ overflowMarker: 'off' })}`;
    assert.equal(withoutExportSettingsBlock(deck), '# A\n\nBody.\n');
  });

  test('removes every block, not just the first', () => {
    const deck = `# A\n${exportSettingsBlock({ overflowMarker: 'off' })}${exportSettingsBlock({ overflowMarker: 'author' })}`;
    assert.equal(withoutExportSettingsBlock(deck), '# A\n');
  });

  test('a deck with no block is unchanged, and null/undefined are safe', () => {
    assert.equal(withoutExportSettingsBlock('# A\n'), '# A\n');
    assert.equal(withoutExportSettingsBlock(null), '');
    assert.equal(withoutExportSettingsBlock(undefined), '');
  });

  // It must not touch the FRONT-MATTER snapshot beside it — the two blocks live in
  // the same trailer and are stripped by different owners.
  test('leaves the front-matter snapshot block alone', () => {
    const fmBlock = '<script type="application/lattice-front-matter">"marp: true"</script>\n';
    const deck = `# A\n${fmBlock}${exportSettingsBlock({ overflowMarker: 'off' })}`;
    assert.equal(withoutExportSettingsBlock(deck), `# A\n${fmBlock}`);
  });
});
