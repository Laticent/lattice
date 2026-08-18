import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// The ONE "Automatic / inherit-the-default" affordance across both Inspector scopes —
// the deck's Language and Theme pickers, and every per-slide override axis. One source
// so they read identically and can't drift (HARD RULE #15).
//
// THE RESOLVED VALUE IS BACK, and the reason it left is worth keeping. A long
// "Automatic — English (United States)" label used to widen its whole control, because
// the trigger mirrors the selected row and every control sized itself to its own content.
// So the value was cut to a bare "Auto" and demoted to the `title` tooltip — which fixed
// the overflow and cost the reader the one thing they wanted at a glance: what Auto
// actually lands on.
//
// That trade is gone. `SETTING_ROW` (ui/panel) gives every control an equal half of the
// row and makes it truncate rather than grow, so a label can carry its value again
// without touching the layout. The rule is now uniform: an auto option ALWAYS reads
// `Auto — <what it resolves to>`, and the tooltip explains rather than substitutes.

/** The auto/inherit glyph — a link (this deck is LINKED to the default, not pinned). */
export function AutoIcon({ className }: { className?: string }) {
	return <Link2 className={cn('size-3.5 shrink-0 text-muted-foreground', className)} aria-hidden />;
}

/** The bare word, for the rare head with genuinely nothing to resolve to. */
export const AUTO_LABEL = 'Auto';

/**
 * The head label for an option that follows a default: `Auto — <resolved>`.
 *
 * `resolved` is what the reader gets if they leave it alone — the website theme, the
 * workspace language, the deck's value for a per-slide axis. Pass the DISPLAY label, not
 * the register value.
 *
 * Four catalogs (spectrum-card, motion-speed, rule, headline) carry a value whose own
 * label is "Auto", which would render "Auto — Auto". Those entries supply an `autoLabel`
 * naming what their auto lands on, and the caller passes that instead — so the second
 * half is always informative and never an echo.
 *
 * Keep an `autoLabel` to ONE short word where you can. The control owns a fixed half of
 * its row and truncates, and the docked Inspector goes down to 260px — a resolved value
 * that reads "Auto — masthead d…" has spent the width and told the reader nothing.
 */
export function autoHeadLabel(resolved?: string | null): string {
	const value = (resolved ?? '').trim();
	if (!value || /^auto$/i.test(value)) return AUTO_LABEL;
	return `${AUTO_LABEL} — ${value}`;
}
