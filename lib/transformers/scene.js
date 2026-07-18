/**
 * Registry adapter for the `scene` component. Kernel:
 * lib/components/imagery/scene/scene.transform.js.
 *
 * Resolves a `section.scene`'s composition from its inline poster `<svg>`'s aspect
 * (the SAME adaptive brain image uses — lib/core/image-aspect.js), stamps
 * `data-img-composition`, and wraps the poster in `.scene-figure` + the heading /
 * caption in `.scene-text`, so scene.styles.css lays out the image-mirrored
 * compositions. Idempotent. `form: canvas`, non-strict — no `.cell-stage` wrap.
 */

const engine = require('../components/imagery/scene/scene.transform');

const SEL = 'section.scene';

module.exports = {
  name: 'scene',
  selector: SEL,
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    engine.applyToDom(root);
  },
};
