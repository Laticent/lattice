import { Bug, Check, Copy, Lightbulb, MessageCircleQuestion, MessageSquareHeart, MessageSquareText } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PanelBody, PanelHeader, PanelSection, PanelSheet } from '@/components/ui/panel';
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

	// A real <a href> — not window.open() — so the click is a genuine browser
	// navigation a popup blocker won't intercept, keyboard/middle-click/"open in
	// new tab" all work, and there's a real URL to inspect before following it.
	const feedbackUrl = React.useMemo(
		() =>
			buildFeedbackIssueUrl({
				category,
				summary: summary.trim(),
				details: details.trim(),
				context: captureFeedbackContext({ Area: area ?? 'Site', ...context }),
			}),
		[category, summary, details, area, context],
	);

	// On a phone with the GitHub app installed, tapping a github.com link hands
	// off to the app (iOS Universal Links / Android App Links) — and the app has
	// no "new issue, pre-filled from a URL" screen, so it just opens to nothing
	// useful. We have no server to bounce the click through a different domain
	// first (the usual fix), so the honest fallback is: let the user copy the
	// URL and paste it into their own browser's address bar — a pasted URL is a
	// typed navigation, which the OS does NOT hand off to the app.
	const [copied, setCopied] = React.useState(false);
	const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	React.useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(feedbackUrl);
			setCopied(true);
			if (copyTimer.current) clearTimeout(copyTimer.current);
			copyTimer.current = setTimeout(() => setCopied(false), 1600);
		} catch {
			/* clipboard unavailable (permissions/insecure context) — Continue on GitHub still works */
		}
	};

	return (
		<PanelSheet open={open} onOpenChange={onOpenChange} side="right" width="md">
			<PanelHeader
				icon={<MessageSquareHeart />}
				title="Send feedback"
				description="You'll finish this on GitHub — we'll have it filled in for you, and you can look it over before it posts."
			/>
			<PanelBody className="space-y-5">
					<PanelSection label="Category">
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
					</PanelSection>
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
					{canSubmit ? (
						<div className="space-y-2">
							<Button asChild className="w-full">
								<a href={feedbackUrl} target="_blank" rel="noreferrer noopener" onClick={() => onOpenChange(false)}>
									Continue on GitHub
								</a>
							</Button>
							<Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={copyLink}>
								{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
								{copied ? 'Copied' : 'Copy link instead'}
							</Button>
							<p className="text-center text-[11px] leading-relaxed text-muted-foreground">
								If GitHub's app opens instead and looks empty — long-press “Continue on GitHub” above and choose “Open in Safari/Chrome,” or copy the link and paste it into your browser's address bar.
							</p>
						</div>
					) : (
						<div className="space-y-1.5">
							<Button type="button" className="w-full" disabled aria-disabled="true">
								Continue on GitHub
							</Button>
							<p className="text-center text-[11px] text-muted-foreground">Add a summary and some details to continue.</p>
						</div>
					)}
			</PanelBody>
		</PanelSheet>
	);
}
