import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// The ONE "Automatic / inherit-the-default" affordance for the deck Inspector's
// pickers (Language, Theme, …). A compact icon + short "Auto" replaces the long
// "Automatic — <resolved value>" label that made the narrow Inspector controls
// overflow (a broken window: the trigger mirrors the selected row, so a verbose
// Automatic label widened the whole control). One source so every auto picker reads
// identically and can't drift (HARD RULE #15). The FULL meaning ("Automatic —
// English (United States)" / "follow the website theme") rides in the control's
// tooltip (`title`) + the Field description; the icon signals "not pinned — follows
// the workspace / site default". Swap the icon here and every auto picker updates.

/** The auto/inherit glyph — a link (this deck is LINKED to the default, not pinned). */
export function AutoIcon({ className }: { className?: string }) {
	return <Link2 className={cn('size-3.5 shrink-0 text-muted-foreground', className)} aria-hidden />;
}

/** The short trigger/menu label paired with `AutoIcon`. */
export const AUTO_LABEL = 'Auto';
