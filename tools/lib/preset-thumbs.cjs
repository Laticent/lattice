/**
 * preset-thumbs — the one sample slide the Studio's preset thumbnails picture, and the hash
 * that says whether the committed images still match it. Shared by the generator
 * (tools/build-preset-thumbs.mjs) and the freshness test
 * (test/unit/core/preset-thumbs-fresh.test.js), so the two cannot disagree about either.
 *
 * The sample is a TITLE slide, because that is where the four presets differ most at a glance:
 * alignment (centered / flush left) and the backdrop (none / ledger / strata) fill the frame,
 * while a content slide's differences — a 1px bar, a hairline rule — vanish at 160px. That is
 * measured, not assumed: the first thumbnails used a card slide, and Classic and Minimal came
 * out nearly identical.
 *
 * WHAT THE HASH COVERS, and what it cannot. It hashes each preset's VALUES (not its label or
 * description, which do not change a pixel), the sample slide and the deck header the tool
 * writes. It does NOT cover the CSS those values resolve to — the `ledger` / `strata` finishes,
 * the title component, the `indaco` palette. A visual change there needs a manual
 * `node tools/build-preset-thumbs.mjs`; the freshness test cannot see it.
 */
const crypto = require('node:crypto');
const { PRESETS } = require('../../lib/core/front-matter-key.js');

/** The deck header every thumbnail is rendered under; `{name}` is the preset. */
const PRESET_THUMB_HEADER = '---\nmarp: true\ntheme: indaco\npreset: {name}\n---\n';

const PRESET_THUMB_SAMPLE = `
<!-- _class: title -->

\`Q4 · Review\`

# Capacity plan

Where the plant runs short, and the fix.
`;

/** sha256 over what the images were cut from: each preset's values, the header and the sample. */
function presetThumbHash() {
	const values = Object.fromEntries(Object.entries(PRESETS).map(([name, p]) => [name, p.values]));
	return crypto.createHash('sha256').update(JSON.stringify(values)).update(PRESET_THUMB_HEADER).update(PRESET_THUMB_SAMPLE).digest('hex');
}

module.exports = { PRESET_THUMB_HEADER, PRESET_THUMB_SAMPLE, presetThumbHash };
