// The author's per-export choice for pictures (lib/core/image-policy.js), set by the export panels
// and read by `deckImageSetting` in deck-export.js. `deck` (the default) defers to the deck's own
// `images:` / `images-quality:` front matter; `optimized` or `original` overrides it for this deck's exports.
// Module state, not a parameter: eight share* helpers sit between the panel and the exporter, and none of
// them has an opinion about pictures.

let override = { mode: 'deck', quality: '' };

export function setImagesOverride(next) {
	override = { mode: next?.mode === 'optimized' || next?.mode === 'original' ? next.mode : 'deck', quality: String(next?.quality ?? '').trim() };
}

/** The front-matter setting with the panel's override applied on top. */
export function applyImagesOverride(fromDeck) {
	if (override.mode === 'deck') return fromDeck;
	return { mode: override.mode, quality: override.quality || fromDeck.quality };
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
