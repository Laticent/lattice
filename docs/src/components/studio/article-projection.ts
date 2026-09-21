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
// render, bake, split, sanitize, project — mirroring `narration-projection.ts`, which does
// the same for speech. The BAKE step is the one the export path also runs and for the same
// reason: the engine's render leaves a Mermaid fence as its source, so an un-baked article
// showed a wall of ```mermaid where the player's Read view shows the drawing. The article's STYLING is deliberately the Studio's own rather than the
// player's: the player is a standalone document sized to a reading window, this is a pane
// inside an app, and the two should look like their hosts. Both target the same `lp-*`
// class contract the shared projection emits, so the markup stays one thing.

import { currentPaletteMode, type SingleSlideOptions } from '@/lib/single-slide-render';
import { buildDeckRender, type DeckRender, type ExtraTheme } from './share-export';

export type ArticleToc = { id: string; level: number; text: string };
export type DeckArticle = { articleHtml: string; toc: ArticleToc[] };

/**
 * Does this render carry anything the RUNTIME, not the engine, draws?
 *
 * The engine's render is static, so a ```mermaid fence is still a
 * `<pre><code class="language-mermaid">`, a state chart is still un-edged nodes and a
 * function plot is still an inert config div — all three are inflated in the preview
 * iframe by `lib/runtime`, which this view never loads. Unbaked, the article showed the
 * author a wall of Mermaid source where the player's Read view shows the drawing.
 *
 * The test is a string match on the three markers the runtime itself keys on
 * (`lib/runtime/index.js`: the fence class, `.state-chart-figure[data-sc-transitions]`,
 * `div.functionplot[data-fp-config]`) because the bake is NOT free and most decks earn
 * nothing from it: `bakeDeckSections` builds a capture frame, waits for the srcdoc load,
 * for `fonts.ready` and for a paint — several hundred ms against a projection that runs
 * in 3.5-11.8 ms. A deck with no runtime content would pay all of it for a byte-identical
 * result.
 */
const RUNTIME_DRAWN = /language-mermaid|data-sc-transitions|data-fp-config/;

/**
 * Bake the runtime-drawn content into the render's own markup, or return null to say
 * "use the static sections".
 *
 * WHY THE BAKE HAS TO COME FIRST, rather than sanitizing and hoping. `projectSectionsToArticle`
 * runs `sanitizeSlideHtml` (DOMPurify) over every section, and DOMPurify deletes exactly the
 * two things a live Mermaid SVG leans on: the `<style>` block Mermaid injects (all of its type
 * and paint) and the `<foreignObject>` carrying EVERY node label. `bakeDeckSections` runs the
 * deck through the shared capture frame and then flattens each diagram SVG into a self-styled
 * twin with native `<text>` labels, which survives the sanitizer intact. This is the same
 * ordering, and the same measured reason, as the player export's own bake
 * (`share-export.ts`, "BAKE FIRST").
 *
 * Every failure mode falls back to the static render — the article we shipped before, which
 * shows the fence source. A missing drawing is a worse article; a thrown export is no article
 * at all.
 *
 * SLIDE-COUNT PARITY is the gate, as it is on the export path. Nothing here is indexed by
 * slide the way notes and narration cues are, but a bake that lost a section would silently
 * drop that slide's prose AND its table-of-contents row, and a reader has no way to tell a
 * deck that never said something from one whose article ate it.
 */
async function bakeArticleSections(render: DeckRender, staticSections: string[]): Promise<string[] | null> {
	if (!RUNTIME_DRAWN.test(render.html)) return null;
	try {
		const { bakeDeckSections } = await import('./export/deck-export.js');
		// `freezeTokens` — this pane ships no deck stylesheet, so a paint the bake leaves as
		// `var(--token)` resolves to nothing here and falls to the SVG initial, BLACK. Measured
		// on `examples/mermaid-diagram-surface.md`: every node and every connector black, with
		// black labels inside them. The export paths must NOT freeze (it would pin the diagram
		// to the export-time scheme and kill the player's dark/light toggle), which is why this
		// is the caller's call and not the bake's default.
		const result = await bakeDeckSections(render, { freezeTokens: true });
		if (!result || result.sections.length !== staticSections.length) {
			console.warn(
				`lattice: the article's diagram bake produced ${result ? result.sections.length : 0} slides for a ${staticSections.length}-slide deck; showing the un-baked article.`,
			);
			return null;
		}
		if (result.failed) {
			console.warn(`lattice: ${result.failed} diagram(s) could not be drawn; the article shows their source.`);
		}
		return result.sections;
	} catch (err) {
		console.warn('lattice: the article\'s diagram bake failed; showing the un-baked article.', err);
		return null;
	}
}

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
	const render = await buildDeckRender(options, source, palette, mode, extraTheme, extraCss);
	const { splitSections } = (await import('@/playground/deck-preview.js')) as unknown as {
		splitSections: (h: string) => string[];
	};
	const staticSections = splitSections(render.html);
	const baked = await bakeArticleSections(render, staticSections);
	return projectSectionsToArticle(baked ?? staticSections);
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
