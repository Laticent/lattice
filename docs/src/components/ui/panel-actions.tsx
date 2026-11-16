// A pane header's shared ACTIONS (2026-11-15-one-side-pane.md §3d and §3e): the search button and the field
// it opens, and the reset. Apart from ui/panel.tsx on purpose: every route loads panel.tsx (the site's
// sheets wear PanelHeader), while only the Studio's panes draw these, so keeping them here keeps their
// bytes off the home page and the docs (the route budget measured +689 B gzip there when they lived in
// panel.tsx).

import { RotateCcw, SearchIcon } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PanelSearch } from '@/components/ui/panel';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * A panel's search, CLOSED: one icon button in the header's actions (§3d of
 * engineering/decisions/2026-11-15-one-side-pane.md). Every pane that searches opens it the same
 * way: this button, then `PanelSearchRow` under the header, focused. The Library used to keep its
 * field open in the header and Settings drew this button in its scope band, so the same job had
 * two shapes. The same outline `icon-sm` button as every other header action (Reader views' Add,
 * the Library's Import), so a header's actions share one height; PanelHeader lifts them all to the
 * 44px floor on a phone.
 */
export function PanelSearchButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<Tip label={label}>
			<Button type="button" variant="outline" size="icon-sm" aria-label={label} onClick={onClick} data-panel-search-button="" className="shrink-0">
				<SearchIcon className="size-4" />
			</Button>
		</Tip>
	);
}

/**
 * A pane's RESET, in its header beside the collapse (§3d of 2026-11-15-one-side-pane.md): every pane
 * that edits something draws it, and a pane that edits nothing (Coach, Chat, the Library) draws none.
 * It UNDOES THIS VISIT: what the pane changed since it opened goes back, as one Undo step with the
 * Undo toast, so it needs no confirm. Disabled until something changed, and drawn from the first
 * frame so the header never shifts when the pane's body loads. The name says the scope
 * ("Reset slide settings"), never a bare "Reset".
 */
export function PanelResetButton({ label, hint, disabled, onClick }: { label: string; hint: string; disabled: boolean; onClick?: () => void }) {
	// `aria-disabled`, not `disabled`: a disabled button leaves the tab order and takes no pointer events,
	// so a keyboard user could never reach it to learn why it is off, and its hint had to ride a wrapper,
	// where a screen reader never heard it (found by the checker on #3222). Off, a press does nothing.
	return (
		<Tip label={disabled ? 'Nothing to reset: no changes since you opened this' : hint}>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label={label}
				aria-disabled={disabled || undefined}
				onClick={disabled ? undefined : onClick}
				data-panel-reset=""
				// Off, hover changes nothing: the outline variant's own hover fills (light and dark) are pinned back
				// to its resting ones, since `disabled:` styles no longer apply to an aria-disabled button.
				className={cn('shrink-0', disabled && 'cursor-default opacity-50 hover:bg-background hover:text-current dark:hover:bg-input/30')}
			>
				<RotateCcw className="size-4" />
			</Button>
		</Tip>
	);
}

/**
 * A panel's search, OPEN: the field, focused as it mounts. Escape closes and clears it, and closing
 * (by Escape or by the field's own "Close search") hands focus back to the pane's search button, so a
 * keyboard user stays in the pane rather than on <body>, where the pane's own Esc would no longer reach.
 *
 * Escape is caught on WINDOW in the capture phase, the first listener there is. A sheet's dismissal
 * (Radix's `useEscapeKeydown`) listens on the document in the capture phase and runs before React
 * dispatches anything, so a React `onKeyDown` with `stopPropagation` closed the search AND the whole
 * Library sheet on a tablet (found by the checker on #3222). Stopping it at window keeps the sheet,
 * the docked pane's collapse (a window listener in StudioShell) and every other Esc handler out of it.
 */
export function PanelSearchRow({
	query,
	onQueryChange,
	onClose,
	label,
	placeholder,
	size,
	className,
}: {
	query: string;
	onQueryChange: (q: string) => void;
	/** Leave the search: the caller clears the query and shows the button again. */
	onClose: () => void;
	label: string;
	placeholder: string;
	size?: 'default' | 'sm';
	className?: string;
}) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const rowRef = React.useRef<HTMLDivElement>(null);
	const closeRef = React.useRef(onClose);
	closeRef.current = onClose;
	// Close, then put focus on the search button that replaces the field, inside the same pane.
	const close = React.useCallback(() => {
		const pane = rowRef.current?.closest<HTMLElement>('[data-studio-pane], [data-settings-dock], [role="dialog"], [data-slot="persistent-surface"]') ?? null;
		closeRef.current();
		requestAnimationFrame(() => pane?.querySelector<HTMLElement>('[data-panel-search-button]')?.focus());
	}, []);
	// Focus on OPEN only: re-focusing on every keystroke would fight a caret the user moved.
	React.useEffect(() => {
		inputRef.current?.focus();
	}, []);
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || !(e.target instanceof Node) || !rowRef.current?.contains(e.target)) return;
			e.preventDefault();
			e.stopPropagation();
			close();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [close]);
	return (
		<div ref={rowRef} data-panel-search-row="" className={cn('flex items-center gap-1.5', className)}>
			<PanelSearch
				inputRef={inputRef}
				value={query}
				onChange={onQueryChange}
				onClear={() => onQueryChange('')}
				onClose={close}
				placeholder={placeholder}
				label={label}
				size={size}
				className="flex-1 py-1.5"
			/>
		</div>
	);
}
