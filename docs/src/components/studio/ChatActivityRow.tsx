import { ChevronRight, ListChecks } from 'lucide-react';
import { activitySentence } from './chat-activity';

// What the Architect did on a finished reply, as ONE line under it.
//
// It used to be a sentence of up to five lines ("Read about the big number layout, read about the
// cards grid layout, …") plus a separate "Show work" link, under every reply, for the life of the
// thread. The sentence is now clipped to a single line with an ellipsis and the whole row is the
// button that opens the full trace in a sheet, the way Claude Code's mobile app folds its tool use
// into one tappable line. A reply saved before traces existed has the sentence but nothing to open,
// so it renders as plain text with no chevron.

export function ChatActivityRow({ activity, hasTrace, onOpen }: { activity: readonly string[] | undefined; hasTrace: boolean; onOpen: () => void }) {
	const sentence = activitySentence(activity);
	if (!sentence && !hasTrace) return null;
	const label = sentence || 'Show work';
	if (!hasTrace) return <p className="truncate text-[11.5px] leading-snug text-muted-foreground">{label}</p>;
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={sentence ? `Show work: ${sentence}` : 'Show work'}
			data-testid="chat-activity-row"
			className="flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-lg border border-border/70 px-2 py-1 text-left text-[11.5px] leading-snug text-muted-foreground hover:border-[var(--accent)] hover:text-foreground pointer-coarse:min-h-11"
		>
			<ListChecks className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<ChevronRight className="size-3.5 shrink-0" aria-hidden />
		</button>
	);
}
