// The author's per-export choice for pictures (lib/core/image-policy.js), set by the export panels
// and read by `deckImageSetting` in deck-export.js. `deck` (the default) defers to the deck's own
// `images:` front matter line; `optimized` or `original` overrides it for this deck's exports.
// Module state, not a parameter: eight share* helpers sit between the panel and the exporter, and none of
// them has an opinion about pictures.

import exportCanvasCore from '../../../../../lib/core/export-canvas.js';
import fontPolicyCore from '../../../../../lib/core/font-policy.js';
import frontMatterKeyCore from '../../../../../lib/core/front-matter-key.js';
import imagePolicyCore from '../../../../../lib/core/image-policy.js';
import sizesCore from '../../../../../lib/engine/sizes.js';

let override = { mode: 'deck', quality: '' };

export function setImagesOverride(next) {
	override = { mode: next?.mode === 'optimized' || next?.mode === 'original' ? next.mode : 'deck', quality: String(next?.quality ?? '').trim() };
}

/** The front-matter setting with the panel's override applied on top, word by word, as the command line's `--images` does over the deck's line. */
export function applyImagesOverride(fromDeck) {
	if (override.mode === 'deck') return fromDeck;
	return imagePolicyCore.mergeImagesSettings(fromDeck, `${override.mode} ${override.quality}`);
}

// The export panel's choice for fonts (lib/core/font-policy.js): '' defers to the deck's `fonts:` line; otherwise the words
// ride on top of it class by class, as `--fonts` does on the command line.
let fontsOverride = '';

export function setFontsOverride(next) {
	fontsOverride = String(next ?? '').trim();
}

export function applyFontsOverride(fromDeck) {
	return fontsOverride ? fontPolicyCore.mergeFontsSettings(fromDeck, fontsOverride) : fromDeck;
}

/** The deck's own `size:`, read the way the command line reads it (quotes and a trailing comment stripped). */
export function deckSizeOf(source) {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(source || ''))?.[1] ?? '';
	return frontMatterKeyCore.frontMatterValue(fm, 'size') || '';
}

// The export canvas (lib/core/export-canvas.js): 'hd' (default) or '4k'. A 4K deck exports its PDF, PowerPoint and
// LibreOffice at HD unless the author picks 4K here; a deck that is not 4K has nothing to choose.
let canvasChoice = '';

export function setCanvasChoice(next) {
	canvasChoice = next === '4k' ? '4k' : '';
}

/** The deck source an export of `format` renders: the deck's own, or its `size:` lowered to HD. Never edits the author's deck. */
export function exportSourceFor(source, format) {
	const deckSize = deckSizeOf(source);
	// A remembered 4K only matters to a deck that is 4K: another deck (edited since, or a different one) keeps its own canvas.
	const { size } = exportCanvasCore.exportCanvas({ deckSize, requested: exportCanvasCore.is4k(deckSize) ? canvasChoice : '', format });
	return size ? sizesCore.withSize(source, size) : source;
}

const KEY = (deckId) => `lattice-studio-images:${deckId}`;

/** What this deck's exports last used. `deck` when unknown or storage is blocked. */
export function loadImagesChoice(deckId) {
	try {
		const v = JSON.parse(localStorage.getItem(KEY(deckId)) || 'null');
		if (v && (v.mode === 'optimized' || v.mode === 'original')) return { mode: v.mode, quality: String(v.quality ?? '') };
	} catch {
		// private window: the choice starts at "deck setting"
	}
	return { mode: 'deck', quality: '' };
}

export function saveImagesChoice(deckId, choice) {
	try {
		if (choice.mode === 'deck') localStorage.removeItem(KEY(deckId));
		else localStorage.setItem(KEY(deckId), JSON.stringify(choice));
	} catch {
		// blocked storage: the choice still applies to this session
	}
}
