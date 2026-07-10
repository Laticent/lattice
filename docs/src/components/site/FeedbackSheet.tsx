import { Bug, Lightbulb, MessageCircleQuestion, MessageSquareHeart, MessageSquareText } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
	buildFeedbackIssueUrl,
	captureFeedbackContext,
	FEEDBACK_CATEGORIES,
	type FeedbackCategory,
	feedbackCategoryLabel,
} from '@/lib/feedback-issue';

const CATEGORY_ICON: Record<FeedbackCategory, React.ComponentType<{ className?: string }>> = {
	bug: Bug,
	idea: Lightbulb,
	confusing: MessageCircleQuestion,
	other: MessageSquareText,
};

/**
 * The one "send feedback" surface, shared by the sitewide header and the
 * Studio topbar. No GitHub token: it builds a pre-filled issue URL
 * (feedback-issue.ts) and hands the user to GitHub to review and submit it
 * under their own account.
 */
export function FeedbackSheet({
	open,
	onOpenChange,
	area,
	context,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	/** Where this was opened from — folds into the auto-captured context (e.g. "Studio"). */
	area?: string;
	/** Extra diagnostic lines specific to the calling surface (e.g. the open deck's title). */
	context?: Record<string, string>;
}) {
	const [category, setCategory] = React.useState<FeedbackCategory>('bug');
	const [summary, setSummary] = React.useState('');
	const [details, setDetails] = React.useState('');

	// Reset to a blank form every time the sheet re-opens, so it never lands
	// showing a stale draft from a previous report.
	React.useEffect(() => {
		if (open) {
			setCategory('bug');
			setSummary('');
			setDetails('');
		}
	}, [open]);

	const canSubmit = summary.trim().length > 0 && details.trim().length > 0;

	const submit = () => {
		if (!canSubmit) return;
		const url = buildFeedbackIssueUrl({
			category,
			summary: summary.trim(),
			details: details.trim(),
			context: captureFeedbackContext({ Area: area ?? 'Site', ...context }),
		});
		window.open(url, '_blank', 'noopener,noreferrer');
		onOpenChange(false);
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 sm:max-w-[420px]">
				<SheetHeader className="border-b border-border">
					<SheetTitle className="flex items-center gap-2 text-[17px]">
						<MessageSquareHeart className="size-5 text-[var(--accent)]" />
						Send feedback
					</SheetTitle>
					<SheetDescription className="text-xs text-muted-foreground">
						Opens a pre-filled GitHub issue — you review and submit it yourself, so we never need to store a GitHub credential.
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 space-y-5 overflow-y-auto p-5">
					<section className="space-y-2">
						<h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Category</h3>
						<div className="grid grid-cols-2 gap-2">
							{FEEDBACK_CATEGORIES.map((c) => {
								const Icon = CATEGORY_ICON[c];
								const active = category === c;
								return (
									<button
										key={c}
										type="button"
										onClick={() => setCategory(c)}
										aria-pressed={active}
										className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-semibold ${
											active
												? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
												: 'border-border bg-background text-[var(--text-heading)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]'
										}`}
									>
										<Icon className="size-4 shrink-0" />
										{feedbackCategoryLabel(c)}
									</button>
								);
							})}
						</div>
					</section>
					<section className="space-y-1.5">
						<label htmlFor="feedback-summary" className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
							Summary
						</label>
						<Input
							id="feedback-summary"
							value={summary}
							onChange={(e) => setSummary(e.target.value)}
							placeholder="One line — what happened, or what you'd like"
							maxLength={120}
						/>
					</section>
					<section className="space-y-1.5">
						<label htmlFor="feedback-details" className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
							Details
						</label>
						<Textarea
							id="feedback-details"
							value={details}
							onChange={(e) => setDetails(e.target.value)}
							rows={5}
							placeholder="What were you doing, what did you see, and what did you expect instead?"
						/>
					</section>
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						Your page, viewport, and browser ride along automatically — you don't have to type them.
					</p>
					<Button type="button" className="w-full" disabled={!canSubmit} onClick={submit}>
						Continue on GitHub
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}
