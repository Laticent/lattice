import { LifeBuoy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type BackupBusy, BackupRestore } from './BackupRestore';

// The Library's Backup and restore dialog (design §7). Its own module so the Library loads it the first time it is
// opened, never with the Studio: most visits never back up, and the Studio's eager bundle sits at its route-budget
// ceiling (check:route-budget). Workspace settings mounts BackupRestore directly.
export function BackupRestoreDialog({ open, onOpenChange, busy, onBusyChange }: { open: boolean; onOpenChange: (open: boolean) => void; busy: BackupBusy; onBusyChange: (busy: BackupBusy) => void }) {
	return (
		// A pack or a restore in flight holds the dialog open: a restore reloads the page when it is done.
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o && busy) return;
				onOpenChange(o);
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<LifeBuoy className="size-4 text-[var(--accent)]" />
						Backup and restore
					</DialogTitle>
					<DialogDescription className="sr-only">Download your whole workspace as one zip, or restore one.</DialogDescription>
				</DialogHeader>
				<BackupRestore open={open} busy={busy} onBusyChange={onBusyChange} />
			</DialogContent>
		</Dialog>
	);
}
