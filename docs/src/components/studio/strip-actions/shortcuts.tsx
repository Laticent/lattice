// THE "?" LIST: the one place every strip shortcut is written down, beside the menu that shows each action's keys
// (2026-10-27-slide-structure-strip.md §5). The shortcuts serve keyboard users, so they are listed where a keyboard
// user looks: "?" anywhere outside a text field, or "Keyboard shortcuts" in the command palette.

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { stripShortcutRows } from './model';

export function ShortcutsDialog({ open, onOpenChange, mac }: { open: boolean; onOpenChange: (open: boolean) => void; mac: boolean }) {
	const sections: [string, { keys: string[]; does: string }[]][] = [
		['Slide strip', stripShortcutRows(mac)],
		[
			'Studio',
			[
				{ keys: [mac ? '⌘K' : 'Ctrl+K'], does: 'Search and run a command' },
				{ keys: [mac ? '⌘Z' : 'Ctrl+Z'], does: 'Undo, from anywhere' },
				{ keys: [mac ? '⇧⌘Z' : 'Ctrl+Shift+Z'], does: 'Redo' },
				{ keys: ['?'], does: 'This list' },
			],
		],
	];
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent data-shortcuts-dialog="">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>The slide strip’s keys work while a slide in the strip has keyboard focus: Tab to it, then use the arrows.</DialogDescription>
				</DialogHeader>
				{/* One table, so both sections share their columns. */}
				<div className="max-h-[min(70vh,600px)] overflow-y-auto overscroll-contain">
					<table className="w-full border-collapse text-[12.5px]">
						{sections.map(([title, rows]) => (
							<tbody key={title}>
								<tr>
									<th colSpan={2} scope="colgroup" className="pt-3 pb-1 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground first:pt-0">
										{title}
									</th>
								</tr>
								{rows.map((r) => (
									<tr key={r.does} className="border-b border-border last:border-0">
										<td className="py-1.5 pr-4 align-middle whitespace-nowrap">
											<span className="flex flex-wrap gap-1">
												{r.keys.map((k) => (
													<Kbd key={k}>{k}</Kbd>
												))}
											</span>
										</td>
										<td className="w-full py-1.5 text-[var(--text-heading)]">{r.does}</td>
									</tr>
								))}
							</tbody>
						))}
					</table>
				</div>
			</DialogContent>
		</Dialog>
	);
}
