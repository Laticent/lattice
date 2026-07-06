import { LayoutGrid } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export type GalleryItem = { id: string; label: string; slides: number };
export type GalleryGroup = { key: string; hint: string; items: GalleryItem[] };

/**
 * "Load a deck" — the galleries drawer, fully rebuilt as a shadcn Sheet
 * (replacing the vanilla pg-drawer + scrim and its open/close/Esc wiring, which
 * Radix Dialog now owns accessibly). Two sections: reset to the picked
 * component's example, and load a full showcase / family deck. Selecting either
 * closes the Sheet and hands the action up to the controller.
 *
 * "Insert blank skeleton" is deliberately GONE (2026-07-05 Specimen Book
 * decision §0.4): skeleton insertion is an authoring affordance the Studio does
 * properly; in a playground it produced an empty scaffold that renders badly
 * and teaches nothing.
 *
 * Reset names its target and arm-confirms over a dirty draft (`resetArm`): the
 * first press arms, the second replaces — and the controller parks a backup
 * with an undo toast either way.
 */
export function GalleriesSheet({
	groups,
	resetTarget,
	resetArm,
	onLoadGallery,
	onResetExample,
}: {
	groups: GalleryGroup[];
	resetTarget: string;
	resetArm: boolean;
	onLoadGallery: (id: string) => void;
	onResetExample: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	const [armed, setArmed] = React.useState(false);
	const close = () => {
		setOpen(false);
		setArmed(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen} modal={false}>
			<SheetTrigger asChild>
				<Button id="pg-galleries-trigger" variant="outline" size="sm" aria-label="Galleries" title="Galleries — load a showcase or family deck">
					<LayoutGrid />
					<span className="hidden sm:inline">Galleries</span>
				</Button>
			</SheetTrigger>
			<SheetContent overlay={false} className="w-[360px] max-w-[88vw] gap-0 overflow-y-auto">
				<SheetHeader>
					<SheetTitle className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
						Load a deck
					</SheetTitle>
					<SheetDescription className="sr-only">
						Scaffold the selected component, or load a full showcase or family survey deck into the editor.
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-col gap-5 px-4 pb-5">
					<section>
						<h3 className="m-0 mb-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">This component</h3>
						<p className="m-0 mb-2 text-xs leading-snug text-muted-foreground">
							Scaffold the component selected in the bar.
						</p>
						<div className="flex flex-col gap-1.5">
							<DrawerAction
								disabled={!resetTarget}
								onClick={() => {
									if (resetArm && !armed) {
										setArmed(true);
										return;
									}
									onResetExample();
									close();
								}}
							>
								{armed
									? `Replace your draft with the ${resetTarget} example?`
									: resetTarget
										? `Reset to the ${resetTarget} example`
										: 'Reset to example'}
							</DrawerAction>
							{armed && (
								<button
									type="button"
									onClick={() => setArmed(false)}
									className="self-start px-2.5 text-xs text-muted-foreground hover:text-foreground"
								>
									Keep my draft
								</button>
							)}
						</div>
					</section>
					{groups.map((grp) => (
						<section key={grp.key}>
							<h3 className="m-0 mb-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">{grp.key}</h3>
							<p className="m-0 mb-2 text-xs leading-snug text-muted-foreground">{grp.hint}</p>
							<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
								{grp.items.map((g) => (
									<li key={g.id}>
										<button
											type="button"
											onClick={() => {
												onLoadGallery(g.id);
												close();
											}}
											className="flex w-full items-baseline justify-between gap-3 rounded-md border border-border bg-background px-2.5 py-2 text-left hover:border-primary hover:bg-accent"
										>
											<span className="text-sm font-semibold text-foreground">{g.label}</span>
											<span className="shrink-0 font-mono text-[10.5px] tracking-wide text-muted-foreground">
												{g.slides} {g.slides === 1 ? 'slide' : 'slides'}
											</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
}

function DrawerAction({
	children,
	disabled,
	onClick,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className="rounded-md border border-border bg-background px-2.5 py-2 text-left text-sm text-foreground hover:border-primary hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
		>
			{children}
		</button>
	);
}
