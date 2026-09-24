// The Studio's Read · Article view — the active deck as a prose article, in the
// TOP-LEVEL DOM.
//
// The "in the top-level DOM" is the whole point and the reason this is not just another
// preview: every other slide surface on this site lives in a `srcdoc` iframe, and a
// reader-mode text extractor (Firefox's Reader View and its shake-to-summarize, Safari
// Reader, Edge and Chrome's reading modes) only sees the top-level document. Rendering
// the projection here is what makes "summarize this page" mean the deck. See
// `article-projection.ts` for the measurements behind that.
//
// COST. This subtree is `React.lazy`-mounted from `view === 'article'` and everything
// heavy — the engine render, the player-core bundle carrying `projectDeckToProse`, the
// article stylesheet — is reached through a dynamic `import()` inside it. The /studio
// route's eager payload is unchanged; the only bytes that join it are one command-palette
// row and one launcher item, both reusing icons the palette already imports.

import { ArrowLeft, FileText } from 'lucide-react';
import * as React from 'react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { type ArticleToc, projectDeckArticle } from './article-projection';
import type { ExtraTheme } from './share-export';

type Props = {
	options: SingleSlideOptions;
	source: string;
	palette?: string;
	mode?: 'light' | 'dark';
	extraTheme?: ExtraTheme;
	extraCss?: string;
	onClose: () => void;
};

/**
 * The article's own stylesheet, rendered as a `<style>` TEXT CHILD rather than through
 * `dangerouslySetInnerHTML`. That is deliberate and is the idiom `PresentOverlay` already
 * uses: `innerHTML` PARSES, and a `</style>` appearing in the string would end the
 * element early and hand the rest of it to the HTML parser as markup. A text child cannot
 * do that, so the safety here is structural rather than a guard someone has to remember.
 *
 * It targets the `lp-*` class contract the shared projection emits, so the markup stays
 * one thing across the player and this view; the VALUES are the Studio's, because this is
 * a pane inside an app and the player is a standalone reading window.
 */
const READ_ARTICLE_CSS = `
/* BREAKOUT GRID, the same shape the player's Read view uses and for the same reason:
   prose holds one readable measure in a centered track while a figure (chart, diagram,
   table) spans OUT to a wider band, so a chart uses the screen instead of being trapped
   in the text column. Every child sharing one named column is also what keeps their left
   edges aligned — centering each block independently, which is what a plain
   margin-inline:auto does, lines them up on their centers and ragged on their left. */
.st-read-article{--st-prose:68ch;--st-fig-max:1100px;
 display:grid;
 grid-template-columns:[fig-start] minmax(0,1fr) [prose-start] min(var(--st-prose),100%) [prose-end] minmax(0,1fr) [fig-end];
 color:var(--text-body);font-size:17px;line-height:1.7}
.st-read-article>*{grid-column:prose-start/prose-end;min-width:0}
/* The visual-layout placeholder note is a text card, so it stays in the prose column;
   real figures break out above it. */
.st-read-article>.lp-figure:not(.lp-figure-note){grid-column:fig-start/fig-end;justify-self:center;width:100%;max-width:var(--st-fig-max)}
.st-read-article h1{font-size:2rem;line-height:1.15;color:var(--text-heading);letter-spacing:-.02em;padding:1.3em 0 .35em}
.st-read-article h1:first-child{padding-top:0}
.st-read-article h2{font-size:1.4rem;line-height:1.2;color:var(--text-heading);padding:1.6em 0 .35em}
.st-read-article h3{font-size:1.08rem;color:var(--text-heading);padding:1.3em 0 .3em}
.st-read-article p{padding:0 0 .95em}
.st-read-article ul,.st-read-article ol{padding:0 0 1.05em 1.25em}
.st-read-article li{padding:.14em 0}
.st-read-article li>ul,.st-read-article li>ol{padding-bottom:0}
.st-read-article blockquote{border-left:3px solid var(--accent);padding:.15em 0 .15em 1em;color:var(--text-heading)}
.st-read-article .lp-cite{color:var(--text-muted);font-size:.88rem;padding:0 0 1em}
.st-read-article .lp-kicker{font-size:.76rem;letter-spacing:.09em;text-transform:uppercase;color:var(--text-muted);padding:0 0 .25em}
/* Value/label pairs, two columns — a <dl> alternates dt,dd, so auto 1fr puts the
   number and its label on one baseline instead of flowing each into its own cell. */
.st-read-article .lp-stats{display:grid;grid-template-columns:auto 1fr;gap:.35em 1em;align-items:baseline;padding:0 0 1.2em}
.st-read-article .lp-stats dt{font-size:1.5em;font-weight:700;color:var(--text-heading);font-variant-numeric:tabular-nums}
.st-read-article .lp-stats dd{margin:0;color:var(--text-muted)}
.st-read-article .lp-roster{list-style:none;padding-left:0}
.st-read-article .lp-roster>li{display:flex;align-items:baseline;gap:.6em}
.st-read-article .lp-roster>li>img{flex:none;width:1.9em;height:1.9em;border-radius:50%;object-fit:cover;align-self:flex-start}
.st-read-article .lp-roster>li>div{flex:1;min-width:0}
.st-read-article figure{padding:0 0 1.4em;margin:0}
/* THE PLAYER'S ARTICLE RULE (#lp-article .lp-figure svg), which this pane never got.
   A CHART is viewBox-only and token-driven, so it fills the figure band: width:100%,
   height:auto for the aspect, max-height so a tall or square one cannot eat the page,
   margin-inline:auto to center it. A mermaid diagram opts out of the fill on the next
   line — see there for why maximizing a diagram in prose is the wrong answer. */
.st-read-article figure svg{width:100%;height:auto;max-height:78vh;display:block;margin-inline:auto}
/* MERMAID SIZES ITSELF: width:auto takes the diagram's own viewBox size and
   max-width:100% scales it DOWN to the column, never up — forcing the band on a 238x67
   flowchart drew it at 1100x310, with labels 4x the body text beside it. NOT width:100%:
   a browser-rendered flowchart states its size as px ATTRIBUTES while every other family
   states it as an inline max-width, and auto reads both. Scoped by aria-roledescription
   so it cannot reach a chart, which is token-driven and must keep filling its band.
   The long form, with the measurements and why the rule is not in the kernel:
   lib/integrations/mermaid/mermaid.css § THE RE-HOSTED FIGURE. */
.st-read-article figure svg[aria-roledescription]{width:auto;max-width:100%}
/* A WIDE DIAGRAM STOPS SHRINKING AND SCROLLS. The kernel writes each diagram figure's
   natural width, floor width (a fixed share of natural) and aspect ratio inline, and makes
   it focusable; the values here are only defaults the inline ones override. The width is
   the column or the 78vh height cap, whichever binds, clamped between floor and natural,
   so past the floor the svg overflows and the figure pans instead. Computed outright, not
   width:auto + min-width: WebKit resolves that pair to the floor even when the diagram fits. The cue is the diagram itself, cut mid-node at the column edge; a
   scroll-shadow was tried and dropped, since a background paints UNDER the svg and showed
   only as a smudge below the nodes. Long form: engineering/mermaid.md § "How big the
   re-hosted diagram is". */
.st-read-article figure.lp-diagram{--lp-fig-w:100%;--lp-fig-min-w:0px;--lp-fig-ratio:auto;overflow-x:auto}
.st-read-article figure.lp-diagram[style] svg[aria-roledescription]{width:clamp(var(--lp-fig-min-w),min(100%,78vh * var(--lp-fig-ratio)),var(--lp-fig-w));height:auto;aspect-ratio:var(--lp-fig-ratio);max-width:none;max-height:none}
/* PAPER CANNOT SCROLL: in print the floor gives way and the diagram fits the page again,
   as it did before the floor existed. Otherwise a printed long flowchart loses its last nodes. */
@media print{.st-read-article figure.lp-diagram{overflow:visible}.st-read-article figure.lp-diagram[style] svg[aria-roledescription]{width:min(100%,var(--lp-fig-w))}}
.st-read-article figure img{max-width:100%;height:auto;display:block;margin-inline:auto}
.st-read-article figcaption{font-size:.82rem;color:var(--text-muted);padding:.5em 0 0;text-align:center}
.st-read-article .lp-figure-note{border:1px dashed var(--border);border-radius:10px;padding:1em 1.2em;background:var(--bg-alt)}
.st-read-article .lp-visual-note{font-size:.92rem;color:var(--text-muted);margin:0}
.st-read-article table{border-collapse:collapse;width:100%;font-size:.92em}
.st-read-article th,.st-read-article td{border:1px solid var(--border);padding:.4em .7em;text-align:left}
.st-read-article th{background:var(--bg-alt);font-weight:600}
.st-read-article pre{background:var(--bg-alt);padding:1em;border-radius:8px;overflow:auto;font-size:.85em}
/* HIDE THE SPENT MERMAID SOURCE. The bake leaves the source <pre> in the section on purpose
   — mermaid.css and highlight-js.css style the drawing with ADJACENT-SIBLING selectors on it,
   so removing it would unstyle the very diagram the bake exists to ship — and the engine
   hides it with this same rule. That rule travels with the deck stylesheet, which the player
   ships and this pane does not, so before the bake existed there was nothing to hide and
   after it there was: a fence on a slide whose component is not one of the MEDIA_COMPONENTS
   (a plain content slide, say) projects through the generic walk, which emits the <pre> AND
   the figure. The reader got a wall of mermaid source immediately followed by the drawing —
   the bug this view set out to remove, now shipped beside its own fix. Kept in step with
   lib/components/diagram/mermaid/... by intent, not by a gate. */
.st-read-article pre[data-mermaid-state]:not([data-mermaid-state="error"]):not([data-mermaid-state="unavailable"]){display:none}
/* Un-trim, exactly as the player's Read view does: a slide's guards:strict clamp rides
   in on the cloned DOM, and this column scrolls, so the clamp is pure content loss for a
   reader who opened this view to get the full text. display:revert, not display:block —
   block demotes an <li> out of display:list-item and the bullet vanishes. */
.st-read-article [data-lattice-trimmed]{display:revert!important;-webkit-line-clamp:none!important;overflow:visible!important}
`.trim();

export function ReadArticle({ options, source, palette, mode, extraTheme, extraCss, onClose }: Props) {
	const [state, setState] = React.useState<'loading' | 'ready' | 'failed'>('loading');
	const [html, setHtml] = React.useState('');
	const [toc, setToc] = React.useState<ArticleToc[]>([]);

	// `extraTheme` is read WHOLE and its identity is captured by (name, css). StudioShell
	// rebuilds that wrapper object on every render whenever a saved library theme is active,
	// so depending on the object itself re-runs this effect on any unrelated re-render —
	// replacing the article with the loading state and re-rendering the whole deck through
	// the engine. DeckPreview depends on the same two fields, for the same reason.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above — (name, css) is the identity.
	React.useEffect(() => {
		let canceled = false;
		setState('loading');
		projectDeckArticle(options, source, palette, extraTheme, extraCss, mode, () => canceled)
			.then((a) => {
				if (canceled) return;
				setHtml(a.articleHtml);
				setToc(a.toc);
				setState(a.articleHtml ? 'ready' : 'failed');
			})
			.catch(() => {
				if (!canceled) setState('failed');
			});
		return () => {
			canceled = true;
		};
	}, [options, source, palette, mode, extraTheme?.name, extraTheme?.css, extraCss]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<style>{READ_ARTICLE_CSS}</style>
			<div className="flex flex-none items-center gap-2 border-b px-4 py-2">
				<button
					type="button"
					onClick={onClose}
					className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<ArrowLeft className="size-4" />
					Back to the deck
				</button>
				<span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
					<FileText className="size-3.5" />
					Reading view
				</span>
			</div>

			{state === 'loading' ? (
				<div className="grid flex-1 place-items-center text-[13px] text-muted-foreground">Building the article…</div>
			) : state === 'failed' ? (
				<div className="grid flex-1 place-items-center px-6 text-center text-[13px] text-muted-foreground">
					This deck could not be turned into an article. The slides are still there — go back to the deck.
				</div>
			) : (
				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[230px_minmax(0,1fr)]">
					{/* The rail is chrome, not the article: it is hidden below lg so the prose keeps
					    the full measure on a phone, where it would otherwise eat a third of the width. */}
					<nav aria-label="Slides" className="hidden self-start overflow-auto border-r px-3 py-6 lg:block">
						{toc.map((t) => (
							<a
								key={t.id}
								href={`#${t.id}`}
								className={`block rounded-md px-2 py-1 text-[12px] text-muted-foreground no-underline hover:bg-muted hover:text-foreground ${t.level === 2 ? 'pl-5' : ''}`}
							>
								{t.text}
							</a>
						))}
					</nav>
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: the projection RE-EMITS markup
					    that `projectSectionsToArticle` sanitized with `sanitizeSlideHtml` BEFORE projecting,
					    and adds no sink of its own — the caller-sanitizes contract `prose-projection.mjs`
					    states in its own header, and the same division the player export relies on.
					    A second pass is skipped because it would find nothing, NOT — as this comment used
					    to say — because it would strip the `<foreignObject>` and `<style>` carrying
					    Mermaid's node labels. Measured against `createSlideSanitizer`: the FIRST pass
					    already removes both, and on the baked path the labels are native `<text>` by then
					    (CLAUDE.md #22). */}
					<article className="st-read-article px-6 py-8" dangerouslySetInnerHTML={{ __html: html }} />
				</div>
			)}
		</div>
	);
}
