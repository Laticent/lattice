import { Moon, RotateCcw, Sun } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { CodeField } from '@/components/studio/CodeField';
import { Button } from '@/components/ui/button';
import { PillTabs } from '@/components/ui/pill-tabs';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';

// CraftLab — the docs' hands-on pane: an editable source box beside a live slide.
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
			<div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
				<span className="text-sm font-semibold text-foreground">{label}</span>
				{tabs.length > 1 ? (
					<PillTabs tabs={tabs} value={pane} onValueChange={(v) => setPane(v as 'css' | 'markdown')} ariaLabel="Edit the CSS or the slide" className="ml-1" />
				) : null}
				<span className="flex-1" />
				{dirty ? (
					<Button variant="ghost" size="sm" onClick={reset}>
						<RotateCcw className="size-3.5" aria-hidden="true" /> Reset
					</Button>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					aria-pressed={mode === 'dark'}
					onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
					title={mode === 'dark' ? 'Show the light canvas' : 'Show the dark canvas'}
				>
					{mode === 'dark' ? <Sun className="size-3.5" aria-hidden="true" /> : <Moon className="size-3.5" aria-hidden="true" />}
					{mode === 'dark' ? 'Light' : 'Dark'}
				</Button>
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
			<div className={cn('overflow-auto border-t border-border', size === 'tall' ? 'max-h-[22rem]' : 'max-h-[14rem]')}>
				{pane === 'css' && hasCss ? (
					<CodeField value={cssText} onChange={setCssText} language="css" ariaLabel={`${label} — CSS`} className="border-0" />
				) : (
					<CodeField value={mdText} onChange={setMdText} language="markdown" ariaLabel={`${label} — slide source`} className="border-0" />
				)}
			</div>
			{hint ? <figcaption className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{hint}</figcaption> : null}
		</figure>
	);
}

export default CraftLab;
