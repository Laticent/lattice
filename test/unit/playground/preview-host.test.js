/**
 * Unit: isPreviewHost — the runtime backstop that keeps the guided tour off
 * dev / PR-preview surfaces, so its pointer-trapping overlay can never block
 * an interactive feature from being reviewed on a *.pages.dev preview.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
  // Pure, import-free module (guided-tour.js itself pulls in driver.js + CSS).
  return import('../../../docs/src/playground/preview-host.js');
}

describe('isPreviewHost', () => {
  test('preview / dev hosts → true', async () => {
    const { isPreviewHost } = await load();
    for (const h of [
      'localhost',
      '127.0.0.1',
      '[::1]',
      'lattice-docs-5ji.pages.dev',
      'claude-top-5-latest-issues-m.lattice-docs-5ji.pages.dev',
      'LATTICE-DOCS.PAGES.DEV', // case-insensitive
    ]) {
      assert.equal(isPreviewHost(h), true, `${h} should be a preview host`);
    }
  });

  test('production hosts → false', async () => {
    const { isPreviewHost } = await load();
    for (const h of [
      'laticent.github.io',
      'lattice.dev',
      'docs.lattice.dev',
      'example.com',
      'not-pages.dev.evil.com', // must end with .pages.dev, not merely contain it
      'pages.dev', // bare apex is not a Cloudflare subdomain we serve
    ]) {
      assert.equal(isPreviewHost(h), false, `${h} should NOT be a preview host`);
    }
  });

  test('empty / nullish → false (fail closed to production semantics is fine here)', async () => {
    const { isPreviewHost } = await load();
    assert.equal(isPreviewHost(''), false);
    assert.equal(isPreviewHost(null), false);
    assert.equal(isPreviewHost(undefined), false);
  });
});
