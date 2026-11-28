/**
 * player-prune-fonts.js — the three `@font-face` readers of lib/export/player-prune.js (`prunePlayerFontFaces`,
 * `fontFaceFamilies`, `mergeIdenticalFontFaces`) as they were before Segno P5b read them with the one CSS tokenizer.
 *
 * Frozen verbatim from lib/export/player-prune.js at 893ade75 (with `normalizeFamily` and `WEIGHT_KEYWORDS`, which they
 * read). It is the ORACLE for test/unit/export/player-prune-fonts-differential.test.js. Nothing in lib/ may read it. Do
 * not fix bugs here. Delete it when nobody reads it.
 */
const WEIGHT_KEYWORDS = { normal: 400, bold: 700 };

function normalizeFamily(name) {
	return String(name).trim().replace(/^["']|["']$/g, '').trim();
}

function prunePlayerFontFaces(fontCss, usedFamilies) {
	// Case-folded compare: CSS family matching is ASCII case-insensitive, so a theme
	// that authors a family in non-canonical case must still match its face.
	const fold = (s) => normalizeFamily(s).toLowerCase();
	const used = new Set([...usedFamilies].map(fold));
	if (used.size === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	const faces = fontCss.match(/@font-face\s*\{[^}]*\}/gi) || [];
	if (faces.length === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	let kept = 0;
	const out = faces
		.filter((face) => {
			const m = face.match(/font-family\s*:\s*([^;}]+)/i);
			if (!m) return true; // unparseable family → keep (never drop on doubt)
			const keep = used.has(fold(m[1]));
			if (keep) kept++;
			return keep;
		})
		.join('');
	// If nothing would be dropped, report not-applied (no rewrite needed). And if
	// NOTHING matched (kept 0) — a used-set that names no embedded family — treat it
	// as a detection failure and keep every face, never strand the deck fontless.
	if (kept === faces.length || kept === 0) return { css: fontCss, applied: false, total: faces.length, kept };
	return { css: out, applied: true, total: faces.length, kept };
}

function fontFaceFamilies(css) {
	const out = new Set();
	for (const m of String(css || '').matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
		const fam = m[1].match(/font-family\s*:\s*([^;}]+)/i);
		if (fam) out.add(normalizeFamily(fam[1]).toLowerCase());
	}
	return out;
}

function mergeIdenticalFontFaces(fontCss, used) {
	const none = { css: fontCss, applied: false, merged: 0 };
	const byFamily = used?.byFamily instanceof Map ? used.byFamily : new Map(Object.entries(used?.byFamily || {}));
	if (!byFamily.size) return none;
	const fold = (s) => normalizeFamily(s).toLowerCase();
	const anyWeights = [...(used?.any || [])];
	const foreign = new Set([...(used?.foreign || [])].map((f) => String(f).toLowerCase()));
	const faces = [];
	for (const m of fontCss.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
		const body = m[1];
		const fam = body.match(/font-family\s*:\s*([^;}]+)/i);
		const wt = body.match(/font-weight\s*:\s*([^;}]+)/i);
		const st = body.match(/font-style\s*:\s*([^;}]+)/i);
		// No descriptor means `normal`, but such a face is never merged: the rewrite has no
		// descriptor to widen, and dropping its run-mates would leave their weights synthesized.
		const weightText = wt ? wt[1].trim().toLowerCase() : '';
		const weight = WEIGHT_KEYWORDS[weightText] ?? (/^\d{1,4}$/.test(weightText) ? Number(weightText) : NaN);
		faces.push({
			start: m.index,
			end: m.index + m[0].length,
			text: m[0],
			family: fam ? fold(fam[1]) : null,
			style: st ? st[1].trim().toLowerCase() : 'normal',
			weight,
			// Everything but the weight: two faces merge only if all of it is identical.
			rest: body.replace(/font-weight\s*:\s*[^;}]+;?/i, '').trim(),
		});
	}
	const drop = new Set();
	const replace = new Map();
	const groups = new Map();
	for (const f of faces) {
		if (!f.family) continue;
		const k = `${f.family}|${f.style}`;
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(f);
	}
	for (const group of groups.values()) {
		if (foreign.has(group[0].family)) continue;
		if (group.some((f) => !Number.isFinite(f.weight))) continue;
		// Two faces at one weight (a `unicode-range` split, say) are one combined face to the
		// browser; widening only one of them would split what it can match. Leave the family alone.
		if (new Set(group.map((f) => f.weight)).size !== group.length) continue;
		const sorted = [...group].sort((a, b) => a.weight - b.weight);
		const usedHere = [...(byFamily.get(sorted[0].family) || []), ...anyWeights];
		for (let i = 0; i < sorted.length; ) {
			let j = i;
			while (j + 1 < sorted.length && sorted[j + 1].rest === sorted[i].rest) j++;
			const run = sorted.slice(i, j + 1);
			i = j + 1;
			if (run.length < 2) continue;
			const lo = run[0].weight;
			const hi = run[run.length - 1].weight;
			const declared = new Set(run.map((f) => f.weight));
			if (usedHere.some((w) => w > lo && w < hi && !declared.has(w))) continue;
			const first = run.reduce((a, b) => (a.start < b.start ? a : b));
			replace.set(first, first.text.replace(/font-weight\s*:\s*[^;}]+/i, `font-weight:${lo} ${hi}`));
			for (const f of run) if (f !== first) drop.add(f);
		}
	}
	if (!drop.size) return none;
	let out = '';
	let last = 0;
	for (const f of faces) {
		out += fontCss.slice(last, f.start);
		if (!drop.has(f)) out += replace.get(f) ?? f.text;
		last = f.end;
	}
	out += fontCss.slice(last);
	return { css: out, applied: true, merged: drop.size };
}

module.exports = { prunePlayerFontFaces, fontFaceFamilies, mergeIdenticalFontFaces };
