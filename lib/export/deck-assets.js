/**
 * lib/export/deck-assets.js — the CLI's half of `asset:<name>` (media note §7 slice 1).
 *
 * In the Studio, `![](asset:team-shot)` names a photo in the Library, and the host hands the render a map of
 * name → URL. The CLI has no Library, so it builds the same map from a folder beside the deck: `assets/`.
 * `assets/team-shot.jpg` answers `asset:team-shot`. The folder is the Studio Library's export shape, so a deck
 * and its `assets/` folder move together.
 *
 * Why `assets/`: it is the name most static-site and slide tools already use for "pictures that belong to this
 * deck", and the only place the CLI looks, so an author never wonders which folder is searched.
 *
 * The name is the file's stem, lowercased (the Library's own name rule, `assetName` in lib/core/media-sources.js).
 * Two files with one stem (`a.jpg`, `a.png`): the first in alphabetical order wins, and `duplicates` names the rest.
 * A file whose REAL path leaves the deck folder (a symlink) is not listed (lib/export/file-confine.js), so its name
 * draws the stand-in like any missing one.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ASSET_FOLDER = 'assets';
const ASSET_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.mp4', '.webm', '.mov']);
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * @param {string} deckDir
 * @param {{ allows: (p: string) => boolean }} [confine]
 * @returns {{ urls: Record<string, string>, duplicates: string[] }} `urls` is name → file URL
 */
function buildAssetUrls(deckDir, confine) {
	const urls = Object.create(null);
	const duplicates = [];
	const dir = path.join(deckDir, ASSET_FOLDER);
	let names = [];
	try {
		names = fs.readdirSync(dir).sort();
	} catch {
		return { urls: {}, duplicates };
	}
	for (const file of names) {
		const ext = path.extname(file).toLowerCase();
		const stem = path.basename(file, path.extname(file)).toLowerCase();
		const abs = path.join(dir, file);
		if (!ASSET_EXT.has(ext) || !NAME.test(stem)) continue;
		try {
			if (!fs.statSync(abs).isFile()) continue;
		} catch {
			continue;
		}
		if (confine && !confine.allows(abs)) continue;
		if (stem in urls) duplicates.push(file);
		else urls[stem] = pathToFileURL(abs).href;
	}
	return { urls: { ...urls }, duplicates };
}

/**
 * The `asset:<name>` references a deck's markdown makes outside fenced code, with the slide each sits on.
 * A line walk: fences quote material (HARD RULE #29's reading), and `---` outside one opens the next slide.
 * @returns {{ name: string, slide: number }[]}
 */
function assetRefs(source) {
	const out = [];
	let slide = 1;
	let fence = null;
	let comment = false;
	const lines = String(source).split(/\r?\n/);
	let start = 0;
	// The front matter holds one use, the deck `logo:`, which belongs to slide 1.
	if (/^\uFEFF?---\s*$/.test(lines[0] ?? '')) {
		const close = lines.findIndex((l, n) => n > 0 && /^---\s*$/.test(l));
		if (close > 0) {
			for (const l of lines.slice(1, close)) {
				const m = /^\s*logo:\s*["']?asset:([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(l);
				if (m) out.push({ name: m[1].toLowerCase(), slide: 1 });
			}
			start = close + 1;
		}
	}
	for (const raw of lines.slice(start)) {
		// A `---` or a fence inside an HTML comment is not a slide break or a fence (the renderer reads it so).
		let line = raw;
		if (comment) {
			const end = line.indexOf('-->');
			if (end === -1) continue;
			comment = false;
			line = line.slice(end + 3);
		}
		// Cut every `<!-- … -->` span; an opener with no closer starts a comment that runs to a later line.
		for (let open = line.indexOf('<!--'); open !== -1; open = line.indexOf('<!--')) {
			const close = line.indexOf('-->', open + 4);
			if (close === -1) {
				comment = true;
				line = line.slice(0, open);
				break;
			}
			line = line.slice(0, open) + line.slice(close + 3);
		}
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			continue;
		}
		if (fence) continue;
		if (/^---\s*$/.test(line)) {
			slide += 1;
			continue;
		}
		// A reference sits where a picture address does: `](asset:…)`, `url(asset:…)`, `src="asset:…"`. A mention in
		// prose or in an inline code span is text, which the renderer leaves alone.
		const prose = line.replace(/(`+)[^`]*?\1/g, '');
		for (const m of prose.matchAll(/(?:\]\(\s*<?|url\(\s*["']?|\b(?:src|href|poster)\s*=\s*["'])asset:([A-Za-z0-9][A-Za-z0-9._-]*)/g)) out.push({ name: m[1].toLowerCase(), slide });
	}
	return out;
}

module.exports = { ASSET_FOLDER, buildAssetUrls, assetRefs };
