const test = require('node:test');
const assert = require('node:assert/strict');

// A hidden or unlaid slide has no box. The camera used to photograph it as a blank 1 x 1 picture and say nothing; the
// export then shipped a blank slide. It now stops with a named error the Studio reports and the CLI falls back on.
test('a slide with no size is refused by name, not photographed as a blank 1 x 1 picture', async () => {
  const { captureSlideCanvas } = await import('../../../lib/core/slide-camera.mjs');
  const section = { offsetWidth: 0, offsetHeight: 0, getBoundingClientRect: () => ({ width: 0, height: 0 }), ownerDocument: {} };
  await assert.rejects(captureSlideCanvas(section), { name: 'SlideNotLaidOut', message: /no size/ });
  const flat = { ...section, offsetWidth: 1280 };
  await assert.rejects(captureSlideCanvas(flat), { name: 'SlideNotLaidOut' }, 'a slide with width but no height is refused too');
});
