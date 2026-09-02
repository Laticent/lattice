import { Moon, RotateCcw, Sun } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { CodeField } from '@/components/studio/CodeField';
import { Button } from '@/components/ui/button';
import { PillTabs } from '@/components/ui/pill-tabs';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';

// CraftLab — the docs' hands-on pane: a live slide above an editable source box.
//
// It is the ONE interactive surface the Craft track uses, on every page of all
// three tracks (themes · components · finishes), because the reader's loop is the
// same every time: change a line of CSS, watch the slide change. Three kinds, one
// component:
//
//   kind="theme"      the CSS is a whole theme file  → handed to the renderer as a
//                     raw in-memory palette (`extraTheme`), the way Fabricate
//                     auditions a derived theme.
//   kind="css"        the CSS is component or finish CSS → appended after the
//                     active theme (`extraCss`), the way the Layout Studio previews
//                     a local component's styles.
//   kind="none"       no CSS box; only the markdown is editable.
//
// REUSE, NOT A NEW PREVIEW BUILDER (HARD RULE #22). Rendering goes through
// DeckPreview → createSingleSlideRenderer, which already owns the markup and
// stylesheet sanitizers, the palette/mode tracking and the frame-aligned
// coalescing. This component adds an editor and a header; it assembles no preview
// document of its own, so there is no second sink to guard.
//
// The preview follows the site's palette by default. `startMode` pins the light/
// dark canvas so a page teaching dark mode can open dark; the reader can flip it
// back either way with the header toggle.

export type CraftLabKind = 'theme' | 'css' | 'none';

export type CraftLabProps = {
	/** Renderer endpoints, built at page level from `assetBase()`. */
	options: SingleSlideOptions;
	/** What the editable CSS is, and therefore how it reaches the render. */
	kind?: CraftLabKind;
	/** Seed CSS for the CSS pane. Required for kind "theme" / "css". */
	css?: string;
	/** Seed markdown — one slide, front matter included when it matters. */
	markdown: string;
	/** Let the reader edit the markdown too (a second tab). */
	editMarkdown?: boolean;
	/** Accessible name for the whole lab; also the header label. */
	label: string;
	/** One line under the lab saying what to try. */
	hint?: string;
	/** Open on a specific canvas instead of the site's current one. */
	startMode?: 'light' | 'dark';
	/**
	 * Show the light/dark canvas toggle. Set FALSE on a lab whose seed theme cannot
	 * answer it — a theme written with flat colors instead of `light-dark()` pairs has
	 * one canvas, so the button flips its own label and nothing else changes. On the
	 * pages that teach the token groups that is the reader's first interaction with a
	 * lab, and an inert control is worse than no control. The one lab that keeps it
	 * while being inert is `light-dark`'s second, where the inertness IS the lesson and
	 * the hint says so.
	 */
	canvasToggle?: boolean;
	/** The deck needs the Mermaid runtime. */
	mermaid?: boolean;
	/** Editor height. Tall panes (a whole theme file) want "tall". */
	size?: 'short' | 'tall';
	className?: string;
};

/** The name a raw in-memory theme is registered under. Stable, so a re-render overwrites it. */
const LAB_THEME = 'craft-lab';

export function CraftLab({
	options,
	kind = 'none',
	css = '',
	markdown,
	editMarkdown = false,
	label,
	hint,
	startMode,
	canvasToggle = true,
	mermaid = false,
	size = 'short',
	className,
}: CraftLabProps) {
	const [cssText, setCssText] = React.useState(css);
	const [mdText, setMdText] = React.useState(markdown);
	const [pane, setPane] = React.useState<'css' | 'markdown'>(kind === 'none' ? 'markdown' : 'css');
	// undefined = follow the site's light/dark; a value pins the preview's canvas.
	const [mode, setMode] = React.useState<'light' | 'dark' | undefined>(startMode);

	const hasCss = kind !== 'none';
	const dirty = cssText !== css || mdText !== markdown;
	const reset = () => {
		setCssText(css);
		setMdText(markdown);
	};

	// Which of the two CSS seams this lab uses. A theme replaces the palette; component
	// and finish CSS ride after whatever palette is active, so they keep tracking the
	// site's palette picker while the reader edits.
	const extraTheme = kind === 'theme' ? { name: LAB_THEME, css: cssText } : undefined;
	const extraCss = kind === 'css' ? cssText : undefined;

	const tabs = React.useMemo(
		() => [
			...(hasCss ? [{ value: 'css', label: kind === 'theme' ? 'Theme CSS' : 'CSS' }] : []),
			...(editMarkdown || !hasCss ? [{ value: 'markdown', label: 'Slide' }] : []),
		],
		[hasCss, editMarkdown, kind],
	);

	return (
		// `not-content` is Starlight's own escape hatch: without it, the docs prose
		// stylesheet clamps every iframe to `max-width:100%; height:auto`, which
		// squashes the preview's fixed 1280x720 frame to the column width BEFORE the
		// renderer's own scale transform, so the slide paints at scale twice.
		<figure className={cn('not-content lx-ui craft-lab my-8 overflow-hidden rounded-xl border border-border bg-background', className)}>
			{/* Label left, controls right, and the controls stay a GROUP so they wrap as
			    one. The first version used a `flex-1` spacer, which wrapped first at
			    390 and dropped the buttons onto their own row LEFT-aligned — the
			    opposite of every other width. `ml-auto` on the group keeps them right
			    whether they wrap or not. */}
			<div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<span className="min-w-0 text-sm font-semibold text-foreground">{label}</span>
				<div className="ml-auto flex items-center gap-2">
					{tabs.length > 1 ? (
						<PillTabs tabs={tabs} value={pane} onValueChange={(v) => setPane(v as 'css' | 'markdown')} ariaLabel="Edit the CSS or the slide" />
					) : null}
					{/* Reset is PERMANENT, not conditional. For a reader who has never written
					    CSS, "can I break this?" is asked at rest — so the answer has to be on
					    screen before they touch anything, not after. Disabled until something
					    changes, which says the same thing without promising an undo that has
					    nothing to undo. */}
					<Button variant="outline" size="sm" onClick={reset} disabled={!dirty} title={dirty ? 'Put this lab back the way it was' : 'Nothing changed yet'}>
						<RotateCcw className="size-3.5" aria-hidden="true" /> Reset
					</Button>
					{canvasToggle ? (
					<>
					{/* The visible label names the canvas you would switch TO, which is the
					    convention the page hints depend on ("Press Dark"). That makes this an
					    ACTION, not a toggle showing its own state — so it carries an aria-label
					    matching the title and NOT `aria-pressed`. With both, a screen reader in
					    dark mode announced "Light, toggle button, pressed" — i.e. "Light is on"
					    — while the canvas was dark: the label and the state contradicting each
					    other, because they described different things. */}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
						aria-label={mode === 'dark' ? 'Show the light canvas' : 'Show the dark canvas'}
						title={mode === 'dark' ? 'Show the light canvas' : 'Show the dark canvas'}
					>
						{mode === 'dark' ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
						{mode === 'dark' ? 'Light' : 'Dark'}
					</Button>
					</>
					) : null}
				</div>
			</div>
			{/* STACKED, not side by side. The docs content column is ~720px wide, so a
			    50/50 split leaves the slide about 335px across — legible only if you
			    lean in. Full width the same slide is 720x405, which is the difference
			    between reading a preview and squinting at one. Both panes still fit on
			    one screen, so the edit-and-watch loop survives the change. */}
			<div className="p-3">
				<DeckPreview
					options={options}
					sample={mdText}
					mermaid={mermaid}
					coalesce
					paletteOverride={kind === 'theme' ? LAB_THEME : undefined}
					extraTheme={extraTheme}
					extraCss={extraCss}
					modeOverride={mode}
					className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-background shadow-[0_6px_18px_rgba(10,22,40,.10)]"
					aria-label={`${label} — live preview`}
				/>
			</div>
			{/* The hint is the EXERCISE — the only words a reader reads while doing
			    something — so it sits above the box it is about, at body size. It used
			    to render as a 12px muted figcaption BELOW a scrolling editor, where on
			    a tall lab it could be off screen at the moment the reader started
			    typing: the instruction styled as a footnote. */}
			{hint ? (
				<p className="border-t border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
					<span className="font-semibold">Try this. </span>
					{hint}
				</p>
			) : null}
			{/* `overscroll-contain` keeps a wheel gesture inside the editor from scrolling
			    the page once the box bottoms out. The pane clips ~420px of CSS on a tall
			    lab and reserved NO scrollbar track, so nothing on screen said there was
			    more — `scrollbar-thin` (see lattice.css) paints a permanent one. */}
			<div className={cn('craft-lab-editor overflow-auto overscroll-contain border-t border-border', size === 'tall' ? 'max-h-[26rem]' : 'max-h-[16rem]')}>
				{pane === 'css' && hasCss ? (
					<CodeField value={cssText} onChange={setCssText} language="css" ariaLabel={`${label} — CSS`} className="border-0" />
				) : (
					<CodeField value={mdText} onChange={setMdText} language="markdown" ariaLabel={`${label} — slide source`} className="border-0" />
				)}
			</div>
		</figure>
	);
}

export default CraftLab;
