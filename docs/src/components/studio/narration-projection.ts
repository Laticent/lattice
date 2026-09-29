// Live narration from the component-aware DOM projection — the Studio Present twin
// of the CLI export's caption projection (2026-07-11-manifest-speech-contract.md).
//
// WHY this exists: read-aloud once had TWO producers that narrated the same deck
// DIFFERENTLY — Present flattened raw MARKDOWN (`slideToSpeech`), while the export
// narrated the rendered, component-aware DOM (`projectDeckToSpeech`). So a KPI tile
// read "…dollars. Total revenue." live but "Total revenue: … dollars" in the export;
// a hidden pull-quote gloss was spoken live but not exported; a QR URL was read live
// but stripped in the DOM. This runs the SAME shared kernel (`prose-projection.mjs`,
// via the player-core bundle) against Present's live slide DOM, so live and export
// draw narration from one source of truth. Charts keep their richer markdown narrator
// (`narrateChart`) on BOTH surfaces — the export now runs the same shared narrateChart
// per chart slide too (#902 Gap 1, lib/core/chart-narration.js), so the chart family is
// unified as well, not just prose.
//
// The projection is theme-invariant (it reads textContent, not computed style), so
// the render palette/mode only need to be VALID, not "correct" — we resolve them the
// same way the presenter stage doc does, for consistency.

import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { withoutAutoGlossary } from '../../../../lib/core/glossary-auto.mjs';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { paneSplitCounts } from './pane-pages';
import type { SceneRef } from './present-guide';
import { buildDeckRender, type ExtraTheme, loadDeckRenderFonts } from './share-export';

// The modules the projection loads on demand, named once so the idle warm-up fetches the same set
// Present does (`warmNarrationProjection`), with `buildDeckRender`'s own (`loadDeckRenderFonts`).
// A new `import()` here, or in `buildDeckRender`, belongs in that list too.
const loadDeckPreview = () => import('@/playground/deck-preview.js');
const loadPlayerCore = () => import('@/playground/player-core.generated.js');
const loadSanitizeSlide = () => import('@/lib/sanitize-slide-html.js');

/** Fetch Present's narration modules without projecting anything, so read-aloud works offline
 *  after a session that never presented. */
export function warmNarrationProjection(): Promise<unknown> {
	return Promise.all([loadDeckRenderFonts(), loadDeckPreview(), loadPlayerCore(), loadSanitizeSlide()]);
}

/**
 * Render the whole deck once and project each slide's DOM to natural narration
 * DISPLAY text — a per-slide `string[]` index-aligned to the slides in `source`
 * (joined `\n\n---\n\n`). Downstream `buildTrack` expands the display text to spoken
 * form, exactly as it does for a speaker note. Reuses the export's `buildDeckRender`
 * (engine + theme glue) and the shared `projectDeckToSpeech` (HARD RULE #1/#15) — no
 * projection byte lives twice. Async + dynamic-imported so the heavy engine/bundle
 * cost is paid only when Present actually opens.
 *
 * Each section is sanitized (HARD RULE #22 — the caller-sanitizes contract the
 * projection expects) before projecting. A section that fails to parse yields '' at
 * its index rather than dropping — dropping would misalign every later slide's
 * narration with its slide.
 */
export async function projectDeckSpeech(
	options: SingleSlideOptions,
	source: string,
	paletteOverride?: string,
	extraTheme?: ExtraTheme,
	extraCss?: string,
	modeOverride?: 'light' | 'dark',
): Promise<string[]> {
	return (await projectDeckScript(options, source, paletteOverride, extraTheme, extraCss, modeOverride)).map((s) => s.text);
}

/** A slide's narration text plus where its emphasis falls — what `projectDeckToScript` returns from
 *  the shared kernel, carried through the Studio so the LIVE reader spends the same beats the CLI
 *  export bakes. Without this the two producers disagree: an exported .vtt would hold after a bolded
 *  claim and Present would not, which is exactly the drift HARD RULE #1 exists to stop. */
export type SlideScript = {
	text: string;
	emphasis: readonly { start: number; end: number; weight: number }[];
	/** Where each sentence came from: the heading, paragraph, list item or table row the Guide focuses
	 *  as it is read (`bindingRefsFor`). Spans over `text`, so they hold only while it is the text read. */
	refs?: readonly SceneRef[];
};

/** `projectDeckSpeech`'s richer form — renders the deck, then projects each section to a script. */
export async function projectDeckScript(
	options: SingleSlideOptions,
	source: string,
	paletteOverride?: string,
	extraTheme?: ExtraTheme,
	extraCss?: string,
	modeOverride?: 'light' | 'dark',
): Promise<SlideScript[]> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	const { html } = await buildDeckRender(options, source, palette, mode, extraTheme, extraCss);
	const { splitSections } = (await loadDeckPreview()) as unknown as {
		splitSections: (h: string) => string[];
	};
	const slides = splitSlides(stripFrontMatter(source));
	const counts = paneSplitCounts(slides, source);
	// `glossary: auto` renders one section the source does not contain, at the end. Drop it HERE, at
	// the one producer Present and the narration bake both read, so every narrator gets a list indexed
	// by authored slide and none of them stands its projection down for a slide nobody narrates. The
	// CLI trims the same section through the same kernel (lattice-emulator.js resolveReadAlong).
	const authored = counts ? counts.reduce((a, b) => a + b, 0) : slides.length;
	const sections = withoutAutoGlossary(splitSections(html), authored, source);
	const scripts = await projectSectionsToScript(sections);
	// A split panes slide repeats its masthead on every page; the fold says it once, and needs each
	// page's masthead AS NARRATED to know exactly which words those are.
	const mastheads = counts?.some((c) => c > 1) ? await projectMastheads(sections) : undefined;
	return foldPaneSplits(scripts, source, mastheads);
}

/** Each section's MASTHEAD (its `.cell-masthead`: eyebrow, title, subtitle) narrated alone, through
 *  the same kernel as the whole section, index-aligned; '' for a section without one. */
async function projectMastheads(sectionHtmls: string[]): Promise<string[]> {
	const parser = new DOMParser();
	const alone = sectionHtmls.map((h) => {
		const section = parser.parseFromString(h, 'text/html').querySelector('section');
		const masthead = section?.querySelector('.cell-masthead');
		if (!section || !masthead) return '';
		const shell = section.cloneNode(false) as Element;
		shell.appendChild(masthead.cloneNode(true));
		return shell.outerHTML;
	});
	const scripts = await projectSectionsToScript(alone.map((h) => h || '<section></section>'));
	return scripts.map((x, i) => (alone[i] ? x.text : ''));
}

/**
 * Fold the scripts of a split panes slide back onto the ONE source slide it came from.
 *
 * The projection is per rendered SECTION, and every caller indexes it by source slide — Present
 * and the narration bake refuse it outright when the two counts differ, and fall back to the
 * markdown flatten. A panes slide the engine splits (pane-pages.ts) is two sections for one
 * slide, so without this a single split slide cost the whole deck its projected narration.
 * Folded, the split slide narrates its two pages in order, as one slide, and every later slide
 * keeps its own projection. The emphasis spans of the second page shift by the text before them.
 * `mastheads` (each section's masthead as narrated, index-aligned with `scripts`) says which words a
 * later page repeats; without it nothing is cut.
 *
 * Folds ONLY when the map accounts for the section count exactly; any other expansion
 * (`_focusSteps`, `split: headings`) leaves the scripts as they were, for the callers' own guard.
 */
export function foldPaneSplits(scripts: SlideScript[], source: string, mastheads?: readonly string[]): SlideScript[] {
	const slides = splitSlides(stripFrontMatter(source));
	const counts = paneSplitCounts(slides, source);
	if (!counts || counts.reduce((a, b) => a + b, 0) !== scripts.length) return scripts;
	const out: SlideScript[] = [];
	let at = 0;
	for (const n of counts) {
		const run = scripts.slice(at, at + n);
		at += n;
		// A slide that did not split keeps its script whole, bindings included. A folded one drops
		// them: its refs count units per PAGE, and the pages are one slide now.
		if (n === 1 && run[0]) {
			out.push(run[0]);
			continue;
		}
		let text = '';
		const emphasis: { start: number; end: number; weight: number }[] = [];
		for (let k = 0; k < run.length; k++) {
			const part = run[k];
			// The slide's masthead (its title, eyebrow, subtitle) rides EVERY page of the split, so a
			// later page opens with it again: say it once. Only that page's OWN masthead text is cut,
			// and only when the page really opens with it, so a word two panes happen to share is
			// never dropped. No masthead text, no cut.
			const lead = k > 0 && text ? (mastheads?.[at - n + k] ?? '').trim() : '';
			let cut = lead && part.text.startsWith(lead) ? lead.length : 0;
			while (cut && cut < part.text.length && /\s/.test(part.text[cut])) cut++;
			const rest = part.text.slice(cut);
			if (!rest.trim()) continue;
			const shift = (text ? text.length + 1 : 0) - cut;
			text = text ? `${text} ${rest}` : rest;
			for (const e of part.emphasis) if (e.start >= cut) emphasis.push({ ...e, start: e.start + shift, end: e.end + shift });
		}
		out.push({ text, emphasis });
	}
	return out;
}

/**
 * Project ALREADY-RENDERED section HTML to per-slide narration DISPLAY text,
 * index-aligned to `sectionHtmls`. The projection KERNEL shared by Present's
 * `projectDeckSpeech` (which renders the deck first) and the export download's
 * `shareCaptions` (which already holds the rendered sections — projecting them directly
 * avoids a SECOND full render and GUARANTEES `projected[i] ≡ sectionHtmls[i]`, so the
 * merge can never misalign a caption). Each section is sanitized (HARD RULE #22) before
 * projecting; a section that fails to parse/project yields '' at its index rather than
 * dropping — dropping would misalign every later slide's narration with its slide.
 */
export async function projectSectionsToSpeech(sectionHtmls: string[]): Promise<string[]> {
	return (await projectSectionsToScript(sectionHtmls)).map((s) => s.text);
}

/** The script form of `projectSectionsToSpeech` — identical rendering, sanitizing and index
 *  discipline, carrying the emphasis spans alongside each text. A section that fails still yields an
 *  EMPTY script at its index rather than dropping, for the same reason: dropping would misalign
 *  every later slide's narration with its slide. */
export async function projectSectionsToScript(sectionHtmls: string[]): Promise<SlideScript[]> {
	const [coreMod, sanitizeMod] = await Promise.all([loadPlayerCore(), loadSanitizeSlide()]);
	const projectDeckToScript = (coreMod as unknown as { projectDeckToScript: (s: Element[]) => SlideScript[] }).projectDeckToScript;
	const sanitize = sanitizeMod.sanitizeSlideHtml;
	const parser = new DOMParser();
	const EMPTY: SlideScript = { text: '', emphasis: [] };
	return sectionHtmls.map((secHtml) => {
		try {
			const doc = parser.parseFromString(sanitize(secHtml), 'text/html');
			const section = doc.querySelector('section');
			return section ? (projectDeckToScript([section])[0] ?? EMPTY) : EMPTY;
		} catch {
			return EMPTY; // a bad section yields '' — never drop (would misalign later slides)
		}
	});
}
