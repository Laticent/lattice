/**
 * Registry adapter for the `collage` component. Kernel:
 * lib/components/imagery/collage/collage.transform.js.
 *
 * Structures an authored photo list into flat tiles. The CLI stamps the packed grid afterward
 * (lib/core/collage-stamp.js, which can read image headers); the live preview measures and packs
 * in `applyToDom`. Idempotent on the `.collage-fit` marker.
 */

const engine = require('../components/imagery/collage/collage.transform');

module.exports = {
  name: 'collage',
  selector: 'section.collage',
  applyToHtml(html, ctx) {
    return engine.applyToRenderedHtml(html, ctx);
  },
  applyToDom(root) {
    engine.applyToDom(root);
  },
};
