// Test helper: run the player's local-file inliner on an HTML fragment the way the assembler does, on a parsed
// document, and hand back what a test asserts on (`html` is the body's markup after the bake).
//
// `bakeCounted` also counts the inliner's WORK instead of timing it (HARD RULE #32): the characters its string searches
// and hand-written readers cover (`charReads`, test/helpers/work-count.js) and the `file://` to path conversions it
// makes. The jsdom parse runs first and is not counted: it is jsdom's, and the assembler pays it anyway. A Windows
// runner once took 3.3 s on a 1 MB srcset because each copy of one address was converted again (#2800); a count sees
// that on every platform, and a stopwatch saw it only on a slow one.
const url = require('node:url');

// The conversion counter has to be in place before html-player.js destructures `fileURLToPath` at its first load.
const HTML_PLAYER = require.resolve('../../../lib/export/html-player.js');
const loadedFirst = Boolean(require.cache[HTML_PLAYER]);
const realFileURLToPath = url.fileURLToPath;
let conversions = 0;
url.fileURLToPath = function countedFileURLToPath(...args) {
	conversions++;
	return realFileURLToPath.apply(this, args);
};

const { JSDOM } = require('jsdom');
const { inlineDocAssets } = require(HTML_PLAYER);
const { charReads } = require('../../helpers/work-count.js');

function bake(fragment, opts = {}) {
	const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${fragment}</body></html>`);
	const r = inlineDocAssets(dom.window.document, opts);
	return { ...r, doc: dom.window.document, html: dom.window.document.body.innerHTML };
}

/** `bake`, plus `work` (characters the inliner covered, parse excluded) and `conversions` (file URLs turned into paths). */
function bakeCounted(fragment, opts = {}) {
	if (loadedFirst) throw new Error('bakeCounted cannot count conversions: html-player.js was loaded before bake-helper.js');
	const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${fragment}</body></html>`);
	conversions = 0;
	const { result, scanned, reads } = charReads(() => inlineDocAssets(dom.window.document, opts));
	return { ...result, work: scanned + reads, conversions };
}

module.exports = { bake, bakeCounted };
