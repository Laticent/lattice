import * as React from 'react';
import { Frozen } from '@/components/ui/keep-mounted';
import { cn } from '@/lib/utils';

/**
 * The settings panel's CONTENT on desktop and tablet, drawn over the docked column instead of
 * inside it, so it can outlive the column.
 *
 * WHY. Closing the docked settings used to unmount the column, and the preview pool inside it with
 * it. WebKit never frees a preview document whose frame is destroyed, so the preset tiles stranded
 * ~30 MB on every close and reopen (Playwright WebKit, 8 new documents per reopen;
 * `engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md` §5).
 *
 * WHY NOT KEEP THE COLUMN. The column is a react-resizable-panels `Panel`, and the set of panels
 * rendered in the group IS the key the Studio stores each layout's widths under
 * (`splitPanelIds` in StudioShell, and the pre-paint boot that reads it). A panel that stayed in
 * the group while closed — collapsed to zero — would move every "settings closed" layout into a
 * new bucket and change what the boot restores. So the column stays exactly as it was, empty, and
 * this host sits over it: `slot` is an element inside the column, and the host copies its box.
 *
 * The host is `absolute` in `main`, which is its containing block. The whole panel moves as ONE
 * piece — scroller, tiles and frames together — so iOS still scrolls the frames natively with
 * their tiles. That is the line the frame dock crossed (frames anchored from outside their
 * scroller trailed it on every fast scroll, on a real iPad); this does not cross it. The box is
 * copied in a ResizeObserver callback, which runs after layout and before paint, so a drag of the
 * column's handle moves the host in the same frame.
 *
 * Hidden while there is no slot to cover (closed, or the Studio at another stop), and frozen then
 * too, so a closed panel does no work on a keystroke.
 */
export function SettingsDock({ slot, container, className, children }: { slot: HTMLElement | null; container: HTMLElement | null; className?: string; children: React.ReactNode }) {
	const ref = React.useRef<HTMLDivElement>(null);
	React.useLayoutEffect(() => {
		const host = ref.current;
		if (!host || !slot || !container) return;
		const place = () => {
			const a = slot.getBoundingClientRect();
			const b = container.getBoundingClientRect();
			host.style.top = `${a.top - b.top}px`;
			host.style.left = `${a.left - b.left}px`;
			host.style.width = `${a.width}px`;
			host.style.height = `${a.height}px`;
		};
		place();
		if (typeof ResizeObserver === 'undefined') return;
		// The container too: the slot's offset inside it can change without the slot's own size
		// changing (the activity rail, the window).
		const ro = new ResizeObserver(place);
		ro.observe(slot);
		ro.observe(container);
		return () => ro.disconnect();
	}, [slot, container]);
	const shown = !!slot && !!container;
	return (
		// The `hidden` CLASS does the hiding: the Studio's stylesheet has no `[hidden]` rule strong
		// enough to beat `flex`, so the attribute alone left a closed panel drawn where it last was. The
		// attribute rides along for what reads the DOM rather than the CSS (jsdom, testing-library).
		<div ref={ref} data-settings-dock="" hidden={!shown} data-hidden={shown ? undefined : ''} className={cn('absolute z-[1] flex min-h-0 min-w-0 flex-col overflow-hidden data-[hidden]:hidden', className)}>
			<Frozen active={shown}>{children}</Frozen>
		</div>
	);
}
