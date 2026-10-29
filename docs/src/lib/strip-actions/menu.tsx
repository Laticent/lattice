// THE SLIDE MENU itself: the ⋯ and the Radix menu it anchors (2026-10-27-slide-structure-strip.md §5). Loaded on
// demand by `SlideMenuButton` in index.tsx, which is what the strips render.

import { BetweenVerticalEnd, BetweenVerticalStart, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { type StripActions, type StripSlide, type StripVia, sameSlide } from './index';
import { menuItems } from './model';

// Two shapes: a free-standing button over a map tile's corner, and INSET, the right-hand segment of the current pill
// (the owner's call, 2026-10-29: a separate ⋯ beside the pill read as a second, odd-sized control). Inset, the pill
// is the li around both buttons, so the slide button and the ⋯ stay siblings, never a button inside a button.
const STANDALONE = 'grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-[var(--accent)] data-[state=open]:border-[var(--accent)] data-[state=open]:text-[var(--accent)] [@media(pointer:coarse)]:size-11';
export const INSET = 'grid w-7 shrink-0 place-items-center self-stretch rounded-r-[7px] border-l border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-[var(--accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent)] data-[state=open]:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] [@media(pointer:coarse)]:w-11';
const menuButtonClass = (inset: boolean | undefined, className?: string) => cn(inset ? INSET : STANDALONE, className);


/** The ⋯ beside the current slide, and the menu it anchors. */
export function SlideMenuButton({ actions, at, className, inset }: { actions: StripActions; at: StripSlide; className?: string; inset?: boolean }) {
	const open = sameSlide(actions.menu?.at, at);
	const items = actions.menuState ? menuItems(actions.menuState, actions.mac) : [];
	const icons = { ...actions.icons, 'new-after': BetweenVerticalEnd, 'new-before': BetweenVerticalStart };
	// Enter or Space on the ⋯ opens the menu from the keyboard, so closing it hands focus back to the strip.
	const via = React.useRef<StripVia>('pointer');
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	// How the open menu was opened, kept past its closing (the shell has cleared `menu` by the time Radix asks where focus goes).
	const openedVia = React.useRef<StripVia>('pointer');
	if (open && actions.menu) openedVia.current = actions.menu.via;
	return (
		<DropdownMenu modal={false} open={open} onOpenChange={(o) => (o ? actions.openMenu(at, via.current) : actions.closeMenu())}>
			<DropdownMenuTrigger asChild>
				<button
					ref={triggerRef}
					type="button"
					aria-label="Slide actions"
					data-strip-menu=""
					onPointerDown={() => {
						via.current = 'pointer';
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') via.current = 'key';
					}}
					className={menuButtonClass(inset, className)}
				>
					<MoreHorizontal className="size-4" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				collisionPadding={8}
				data-strip-menu-content=""
				className="min-w-[13rem]"
				// It closes on a pick, Escape, a press outside it, or a scroll the user starts, never because focus moved: a
				// pick's editor focus can land a moment after the menu opens.
				onFocusOutside={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => {
					// Radix would focus the trigger, which an action has usually moved to another slide. A keyboard user goes back
					// to the strip's current slide; a pointer user's focus is left where the pointer put it.
					e.preventDefault();
					if (openedVia.current !== 'key') return;
					const strip = triggerRef.current?.closest('[data-strip]');
					requestAnimationFrame(() => strip?.querySelector<HTMLElement>('[data-unit][aria-current="true"]')?.focus({ preventScroll: true }));
				}}
			>
				{items.map((it) => {
					const Icon = icons[it.id];
					return (
					<React.Fragment key={it.id}>
					{/* Delete sits apart, below a rule, as destructive items do in the Studio's other menus. */}
					{it.id === 'delete' && <DropdownMenuSeparator />}
					<DropdownMenuItem
						disabled={!!it.disabled}
						variant={it.danger ? 'destructive' : 'default'}
						data-strip-action={it.id}
						onSelect={(e) => {
							if (actions.run(it.id)) e.preventDefault();
						}}
						className="gap-2 [@media(pointer:coarse)]:min-h-11"
					>
						<Icon className="size-4" />
						<span className="pr-4">{it.label}</span>
						{it.disabled ? <span className="ml-auto text-[11px] text-muted-foreground">{it.disabled}</span> : <DropdownMenuShortcut className="[@media(pointer:coarse)]:hidden">{it.keys}</DropdownMenuShortcut>}
					</DropdownMenuItem>
					</React.Fragment>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

