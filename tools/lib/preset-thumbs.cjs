/**
 * preset-thumbs — the one sample slide the Studio's preset thumbnails picture, and the hash
 * that says whether the committed images still match it. Shared by the generator
 * (tools/build-preset-thumbs.mjs) and the freshness test
 * (test/unit/core/preset-thumbs-fresh.test.js), so the two cannot disagree about either.
 *
 * The slide carries every surface a preset changes that a small picture can still show:
 * a kicker (eyebrow), a heading (alignment + rule), the page edge (bar + backdrop) and a
 * row of cards (lift + rails). It is set at `scale-xl` so the words survive a 320px image.
 */
const crypto = require('node:crypto');
const { PRESETS } = require('../../lib/core/front-matter-key.js');

const PRESET_THUMB_SAMPLE = `
<!-- _class: cards-grid scale-xl -->

\`Q4 review\`

## Capacity plan

- Build ahead
  - Weekends.
- Re-route
  - Line 1.
`;

/** sha256 over the preset table and the sample slide — what the images were cut from. */
function presetThumbHash() {
	return crypto.createHash('sha256').update(JSON.stringify(PRESETS)).update(PRESET_THUMB_SAMPLE).digest('hex');
}

module.exports = { PRESET_THUMB_SAMPLE, presetThumbHash };
