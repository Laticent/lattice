import { Check, Eye, X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { sliceSlide, slideCount } from '@/components/studio/ai/architect-edits.js';
import { cn } from '@/lib/utils';
import type { SingleSlideOptions } from '@/playground/single-slide-render';
import { frontMatterBlock } from '../../lib/front-matter';
import DeckPreview from '../DeckPreview';
import type { ChatDraft } from './change-card';
import { hasDrawnFence } from './slide-thumb';

// PREVIEW FOR REAL (engineering/decisions/2026-11-19-chat-card-apply-undo.md §4). The chat's change card asks the
// Studio to show its proposed deck before anything is applied. This is that view: the real renderer, with the
// live preview's own options, palette, theme, mode and extra CSS, drawing the DRAFT deck at the changed slide,
// under a band that says plainly it is not applied. It writes nothing: no undo step, no History entry, the
// editor untouched. Any change to the deck closes it (the chat clears the draft), and so do Close and Esc.
//
// On a desktop or tablet it lies over the preview pane (`pane`): the band at the top, the slide in the same
// box the live preview fills. On a phone the chat is a sheet over the preview, so it opens full screen
// (`sheet`) with its buttons at the bottom, in thumb reach.

export type DraftRender = {
	options: SingleSlideOptions;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	extraCss?: string;
	webOrigins?: string[];
};

function DraftSlide({ source, slide, render, label }: { source: string; slide: number; render: DraftRender; label: string }) {
	const count = slideCount(source);
	const i = Math.min(Math.max(1, slide), Math.max(1, count));
	const sample = source;
	return (
		<DeckPreview
			key={`${i}:${sample.length}`}
			options={render.options}
			sample={sample}
			drawn={hasDrawnFence(sample)}
			slideIndex={i - 1}
			slideCount={count}
			slideMarkdown={`${frontMatterBlock(source)}${sliceSlide(source, i)}`}
			paletteOverride={render.paletteOverride}
			extraTheme={render.extraTheme}
			modeOverride={render.modeOverride}
			extraCss={render.extraCss}
			webOrigins={render.webOrigins}
			className="size-full"
			aria-label={label}
		/>
	);
}

export function ChatDraftPreview({ draft, current, render, variant, frameStyle, onClose }: { draft: ChatDraft; current: string; render: DraftRender; variant: 'pane' | 'sheet'; frameStyle?: React.CSSProperties; onClose: () => void }) {
	const [before, setBefore] = React.useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new draft starts on After.
	React.useEffect(() => setBefore(false), [draft]);
	React.useEffect(() => {
		// On the window, in the CAPTURE phase, so it runs before a dialog underneath hears the key: on a phone the
		// chat is itself a modal sheet, and one Esc closing both the preview and the chat lost the author's place.
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t?.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return;
			// A menu or popover open above the preview owns Esc.
			if (document.querySelector('[role="menu"], [data-radix-popper-content-wrapper]')) return;
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				e.preventDefault();
				onClose();
			} else if (e.key === 'b' || e.key === 'B') setBefore((v) => !v);
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [onClose]);

	// On a phone the chat is a modal sheet, whose dialog dismisses itself on any pointer-down or focus OUTSIDE it,
	// and this preview is outside it (a portal on <body>): tapping Close here closed the chat too, and the author
	// lost their card. Stop those events at this sheet's edge, before they reach the document where it listens.
	const sheetRef = React.useRef<HTMLDivElement>(null);
	React.useEffect(() => {
		const el = sheetRef.current;
		if (!el) return;
		const stop = (e: Event) => e.stopPropagation();
		const kinds = ['pointerdown', 'mousedown', 'touchstart', 'focusin', 'focusout'] as const;
		for (const k of kinds) el.addEventListener(k, stop);
		return () => {
			for (const k of kinds) el.removeEventListener(k, stop);
		};
	}, []);

	// The phone sheet is a dialog: it takes focus when it opens and gives it back when it closes.
	const closeRef = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (variant !== 'sheet') return;
		const back = document.activeElement as HTMLElement | null;
		closeRef.current?.focus();
		return () => {
			if (back?.isConnected) back.focus();
		};
	}, [variant]);

	const btn = 'inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-[12px] font-semibold disabled:opacity-50 h-8 px-2.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3.5';
	const showBefore = before && draft.beforeSlide != null;
	const band = (
		<section aria-label="Preview of the AI's changes" aria-live="polite" className={cn('pointer-events-auto flex flex-wrap items-center gap-2 border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-[12.5px] text-foreground', variant === 'pane' ? 'rounded-lg shadow-sm' : 'border-x-0 border-b-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]')}>
			<Eye className="size-4 shrink-0 max-sm:hidden" aria-hidden />
			<span className={cn('min-w-0 flex-1 font-semibold', variant === 'sheet' && 'basis-full')}>Previewing {draft.title} · not applied</span>
			<fieldset className="m-0 flex overflow-hidden rounded-md border border-border p-0" aria-label="Before or after">
				{(['Before', 'After'] as const).map((l) => {
					const on = (l === 'Before') === showBefore;
					return (
						<button key={l} type="button" aria-pressed={on} disabled={l === 'Before' && draft.beforeSlide == null} title={l === 'Before' && draft.beforeSlide == null ? 'A new slide has no before' : `${l} (B)`} onClick={() => setBefore(l === 'Before')} className={cn(btn, 'rounded-none', on ? 'bg-background text-foreground' : 'text-muted-foreground')}>
							{l}
						</button>
					);
				})}
			</fieldset>
			<button type="button" onClick={onClose} aria-keyshortcuts="Escape" className={cn(btn, 'text-muted-foreground hover:text-foreground')}>
				Close
			</button>
			<button type="button" onClick={draft.apply} className={cn(btn, 'bg-primary text-primary-foreground')}>
				<Check className="size-3.5" /> {draft.count > 1 ? `Apply ${draft.count} changes` : 'Apply'}
			</button>
		</section>
	);
	const slide = <DraftSlide source={showBefore ? current : draft.source} slide={showBefore ? (draft.beforeSlide ?? 1) : draft.slide} render={render} label={showBefore ? 'The slide as it is now' : 'The slide with the AI’s change, not applied'} />;

	if (variant === 'sheet')
		return createPortal(
			// `pointer-events-auto`: on a phone the chat is a modal sheet, whose dialog turns pointer events off on
			// everything outside it, this portal included.
			<div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Preview of the AI's changes" data-chat-draft className="lx-ui pointer-events-auto fixed inset-0 z-[70] flex flex-col bg-background">
				<div className="flex items-center justify-between px-4 pt-3 pb-2">
					<span className="text-[13px] font-semibold">Preview</span>
					<button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground">
						<X className="size-5" />
					</button>
				</div>
				<div className="flex min-h-0 flex-1 items-center justify-center px-2">
					<div className="relative aspect-video w-full overflow-hidden rounded-md border border-[var(--accent)]" style={frameStyle?.aspectRatio ? { aspectRatio: frameStyle.aspectRatio } : undefined}>
						{slide}
					</div>
				</div>
				{band}
			</div>,
			document.body,
		);
	return (
		<div data-chat-draft className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card p-4 sm:p-5">
			<div className="absolute inset-x-3 top-3 z-10">{band}</div>
			<div className="relative overflow-hidden rounded-[2px] outline outline-2 outline-[var(--accent)]" style={frameStyle}>
				{slide}
			</div>
		</div>
	);
}
