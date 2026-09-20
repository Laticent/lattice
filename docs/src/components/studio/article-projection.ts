// The deck as an ARTICLE — the Studio twin of the exported player's Read · Article view.
//
// WHY this exists, and why it is not cosmetic. Every live web surface in this project
// renders slides inside a same-origin `srcdoc` iframe: the Studio preview, the
// Playground, every embedded deck on the docs site. Reader-mode text extractors —
// Mozilla's Readability, which Firefox's Reader View and its shake-to-summarize run on,
// and the reading modes Safari and Chrome ship — only ever see the TOP-LEVEL document.
// So the deck a person is looking at is, to every one of those tools, not on the page at
// all. Measured on the built site: the hydrated `/studio` document holds 0 `<p>`, 0
// `<article>` and 1118 characters of text, all of it UI chrome.
//
// Dressing the slide stack up as prose is the wrong fix and was measured to be: wrapping
// it in an `<article>` does flip Readability's eligibility check, but its extractor then
// keeps one subtree and discards the rest, so 45–76% of the deck reached the summarizer.
// An icon that promises a summary and delivers half the deck is worse than no icon. The
// projection is the right artifact — as the page's article it extracts at 66–100%, four
// of six test decks at 100%.
//
// The TRANSFORM is the shared kernel and is not duplicated here (HARD RULE #1/#15):
// `projectDeckToProse` is the same function the CLI player export runs, reached through
// the already-lazy player-core bundle. What this module adds is the Studio's glue —
// render, split, sanitize, project — mirroring `narration-projection.ts`, which does the
// same for speech. The article's STYLING is deliberately the Studio's own rather than the
// player's: the player is a standalone document sized to a reading window, this is a pane
// inside an app, and the two should look like their hosts. Both target the same `lp-*`
// class contract the shared projection emits, so the markup stays one thing.

import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { buildDeckRender, type ExtraTheme } from './share-export';

export type ArticleToc = { id: string; level: number; text: string };
export type DeckArticle = { articleHtml: string; toc: ArticleToc[] };

/**
 * Render the whole deck once and project it to a reading article: `articleHtml` (a
 * heading spine with real `<p>`/`<ul>`/`<dl>`/`<blockquote>`/`<figure>`) plus a `toc`
 * for the side rail.
 *
 * Each section is sanitized before projecting — HARD RULE #22, and the caller-sanitizes
 * contract `prose-projection.mjs` states in its own header. Note that no gate can catch
 * a miss here: `checkPreviewHtmlSinks` keys on the split runtime-`<script>` idiom and
 * `checkDocumentStyleSinks` on a whole-document doctype line, and this module writes
 * neither (both are text matchers, so spelling those markers out here would trip the gate
 * on a comment). The
 * discipline is the guard. The projection RE-EMITS already-sanitized markup and adds no
 * sink of its own, so its output is not sanitized a second time — doing so would strip
 * the foreignObject and style elements that carry every Mermaid node label and all
 * diagram styling, which is the same measured reason the player does not re-sanitize.
 *
 * Unlike the narration twin there is no index alignment to preserve, so a section that
 * fails to parse is SKIPPED rather than yielding an empty slot — an empty slot would mint
 * a phantom row in the table of contents pointing at nothing.
 */
export async function projectDeckArticle(
	options: SingleSlideOptions,
	source: string,
	paletteOverride?: string,
	extraTheme?: ExtraTheme,
	extraCss?: string,
	modeOverride?: 'light' | 'dark',
): Promise<DeckArticle> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	const { html } = await buildDeckRender(options, source, palette, mode, extraTheme, extraCss);
	const { splitSections } = (await import('@/playground/deck-preview.js')) as unknown as {
		splitSections: (h: string) => string[];
	};
	return projectSectionsToArticle(splitSections(html));
}

/** The sanitize-then-project kernel, split out so a caller holding rendered sections
 *  (the export path, a test) can project without paying for a second deck render. */
export async function projectSectionsToArticle(sectionHtmls: string[]): Promise<DeckArticle> {
	const [coreMod, sanitizeMod] = await Promise.all([
		import('@/playground/player-core.generated.js'),
		import('@/lib/sanitize-slide-html.js'),
	]);
	const projectDeckToProse = (
		coreMod as unknown as { projectDeckToProse: (s: Element[]) => DeckArticle }
	).projectDeckToProse;
	const sanitize = sanitizeMod.sanitizeSlideHtml;
	const parser = new DOMParser();
	const sections: Element[] = [];
	for (const secHtml of sectionHtmls) {
		try {
			const doc = parser.parseFromString(sanitize(secHtml), 'text/html');
			const section = doc.querySelector('section');
			if (section) sections.push(section);
		} catch {
			// Skip — see the header: a phantom TOC row is worse than a missing slide.
		}
	}
	if (!sections.length) return { articleHtml: '', toc: [] };
	return projectDeckToProse(sections);
}
