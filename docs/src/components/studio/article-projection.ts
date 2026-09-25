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
/** The Reading view's article plus the deck stylesheet its figures need (see `scopedArticleCss`). */
export type StyledDeckArticle = DeckArticle & { css: string };

/** The Reading view's article root. The scoped deck sheet and the container rules key on it. */
export const ARTICLE_ROOT = '.st-read-article';

/**
 * Does this render carry anything the RUNTIME, not the engine, draws?
 *
 * The engine's render is static, so a ```mermaid fence is still a
 * `<pre><code class="language-mermaid">`, a state chart is still un-edged nodes and a
 * function plot is still an inert config div — all three are inflated in the preview
 * iframe by `lib/runtime`, which this view never loads. Unbaked, the article showed the
 * author a wall of Mermaid source where the player's Read view shows the drawing.
 *
 * TWO markers, not three, and the two omissions are deliberate.
 *
 * `data-sc-transitions` (state-chart) is NOT here. A state-chart is in
 * `SPATIAL_PLACEHOLDER_COMPONENTS`, and `projectDeckToProse` takes that branch first — so the
 * slide projects to its placeholder (plus the description the transform already wrote into
 * the static render) whether or not anything was baked. Gating on it bought a byte-identical
 * article for the full bake cost, on 8 of the shipped example decks. An independent checker
 * found it; the gate's own rationale below is the argument against it.
 *
 * The Mermaid arm matches the FENCE MARKUP rather than the bare string `language-mermaid`,
 * because a deck that merely writes that class name in prose or in an inline code span — and
 * one shipped deck does, `examples/mermaid-tilde-fences.md` — would otherwise pay the bake
 * for a deck with no diagram in it at all.
 *
 * The gate exists because the bake is NOT free and most decks earn nothing from it:
 * `bakeDeckSections` builds a capture frame, waits for the srcdoc load, for `fonts.ready` and
 * for a paint — several hundred ms against a projection that runs in 3.5-11.8 ms. A deck with
 * no runtime-drawn content would pay all of it for a byte-identical result.
 */
// The leading `\s` is required, not cosmetic: a bare `class="` also matches `data-class="`,
// which carries the author's RAW `_class:` payload rather than the resolved list (#1358), and
// `check-ownership.js` rejects the unguarded form.
const RUNTIME_DRAWN = /<code[^>]*\sclass="[^"]*language-mermaid|data-fp-config/;

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
async function bakeArticleSections(render: DeckRender, staticSections: string[], isStale?: () => boolean): Promise<string[] | null> {
	if (!RUNTIME_DRAWN.test(render.html)) return null;
	try {
		const { bakeDeckSections } = await import('./export/deck-export.js');
		// A view switch or a palette toggle while the bake is in flight makes this render
		// obsolete before it finishes. Checked HERE, after the dynamic import and before the
		// capture frame, which is the last point where abandoning costs nothing.
		if (isStale?.()) return null;
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
 * sink of its own, so its output is not sanitized a second time: a second pass has nothing
 * left to find.
 *
 * THE OLD REASON GIVEN HERE WAS FALSE, and it is worth saying so rather than quietly
 * deleting it, because it is the sentence a future reader would lean on when deciding
 * whether a new sink owes a guard. It claimed a second pass would strip the
 * `<foreignObject>` and `<style>` carrying every Mermaid node label. Measured directly
 * against `createSlideSanitizer`: the FIRST pass — the one above, on the input — already
 * removes both, label text and all. And on the baked path they are not there to remove,
 * because the bake replaced them with native `<text>`. Either way, nothing is being
 * preserved by skipping the second pass; it is skipped because it buys nothing, which is a
 * different claim and the true one.
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
	isStale?: () => boolean,
): Promise<StyledDeckArticle> {
	const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
	const mode = modeOverride ?? docMode;
	// `styles: 'flat'` — this view shows slide content OUTSIDE a slide, which is the flat
	// mode's whole definition (2026-09-24-one-style-delivery-spine.md §4.1). `render.css` stays
	// the scoped shape for the diagram bake's capture frame.
	const render = await buildDeckRender(options, source, palette, mode, extraTheme, extraCss, 'flat');
	// THE DEPTH-AWARE SPLITTER, which is what the export twin uses (`share-export.ts` →
	// `slideChannelRecord`). A flat "scan to the next `</section>`" counts a slide holding a
	// hand-authored `<section>` as two — and this count is only used as the bake's parity
	// denominator, so a miscount silently DISCARDS a good bake and hands the reader the
	// un-baked article. `deck-export.js` documents the same trap at its own call. (The
	// Playground's `splitSections` was that flat scan until it moved onto this same walker.)
	const { splitSectionsCore } = (await import('@/playground/authoring-core.generated.js')) as unknown as {
		splitSectionsCore: (h: string) => { type: string; openTag: string; inner: string }[];
	};
	const staticSections = splitSectionsCore(render.html)
		.filter((p) => p.type === 'section')
		.map((p) => `${p.openTag}${p.inner}</section>`);
	if (!staticSections.length) return { articleHtml: '', toc: [], css: '' };
	const baked = await bakeArticleSections(render, staticSections, isStale);
	const article = await projectSectionsToArticle(baked ?? staticSections);
	return { ...article, css: await scopedArticleCss(article.articleHtml, render.flatCss, mode) };
}

/**
 * The deck stylesheet for the Reading view's figures — the `flat` delivery mode, SCOPED and
 * PRUNED (the owner's fork-2 pick, 2026-09-25).
 *
 * WHY THIS VIEW NEEDS ITS OWN SHAPE. It renders in the app's top-level document on purpose
 * (see the header), so it cannot take the player's whole-document sheet: ~0.9 MB of deck CSS,
 * `:root` tokens and all, would restyle the Studio around the article. Before this it shipped
 * no deck CSS at all, so every chart painted SVG-initial black or lost its layout
 * (followups.d/2344-p1, now closed).
 *
 * So the sheet is (1) pruned to the rules the projected article's own DOM matches, with the
 * same kernel the player export uses; (2) fenced by `scopeReHostedCss`, which rewrites every
 * selector to match only inside a figure of this article and turns `:root` into the figure,
 * so deck rules reach only the figures and the palette tokens land on each figure rather than
 * on the app's `<html>`; (3) passed through
 * `sanitizeStyleText`, because this is a `<style>` in the top-level document and a
 * `</style>` in theme or author CSS would end it (HARD RULE #22). The pruner is a css-tree
 * parse→generate, which normalizes an escaped `<\/style` back into a live terminator, so the
 * guard has to run AFTER it. `scopeReHostedCss` fails CLOSED: on any doubt the figures stay
 * unstyled and the app is never touched.
 *
 * The figure container rules (`.lp-chart`, `.lp-spatial`) come from `rehostContainerCss`,
 * the same rules the player writes under `#lp-article`.
 */
export async function scopedArticleCss(articleHtml: string, flatCss: string | undefined, mode: 'light' | 'dark'): Promise<string> {
	if (!articleHtml || !flatCss) return '';
	const [pruneMod, coreMod, sanitizeMod] = await Promise.all([
		import('@/playground/player-prune.generated.js'),
		import('@/playground/player-core.generated.js'),
		import('../../../../lib/core/sanitize-style-text.mjs'),
	]);
	const { collectBaseSelectors, scopeReHostedCss } = pruneMod as unknown as {
		collectBaseSelectors: (css: string, o?: { legacyPseudoElements?: boolean }) => string[];
		scopeReHostedCss: (css: string, isUsed: (b: string) => boolean, o: { root: string; within: string; colorScheme?: string }) => { css: string; applied: boolean };
	};
	const { rehostContainerCss } = coreMod as unknown as { rehostContainerCss: (root: string) => string };
	// The AUTHORITATIVE match, as in the player's prune: real `querySelector` against the
	// article's own DOM. A parsed, inert document is enough — every base is structural.
	const doc = new DOMParser().parseFromString(`<article class="${ARTICLE_ROOT.slice(1)}">${articleHtml}</article>`, 'text/html');
	const used = new Set<string>();
	// `legacyPseudoElements`: this bundle's sheet is minified, which writes `::before` as `:before`.
	for (const base of collectBaseSelectors(flatCss, { legacyPseudoElements: true })) {
		try {
			if (doc.querySelector(base)) used.add(base);
		} catch {
			used.add(base); // a selector querySelector rejects: keep it, as the player's prune does
		}
	}
	const scoped = scopeReHostedCss(flatCss, (b) => used.has(b), { root: ARTICLE_ROOT, within: '.lp-figure', colorScheme: mode });
	return sanitizeMod.sanitizeStyleText(`${rehostContainerCss(ARTICLE_ROOT)}\n${scoped.css}`);
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
