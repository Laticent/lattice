/**
 * Feedback → GitHub issue, with no token anywhere.
 *
 * The docs site (Studio included) is a purely static bundle with no server in
 * the request path (GitHub Pages) — any credential capable of creating issues
 * would ship in plain text to every visitor (the same class of leak HARD RULE
 * #24 blocks for the OpenRouter key). Since the repo is public, we don't need
 * one: this builds a deep link into GitHub's own "new issue" form, pre-filled
 * via `.github/ISSUE_TEMPLATE/studio-feedback.yml`'s field ids — the user's
 * own GitHub login submits it.
 */

export type FeedbackCategory = 'bug' | 'idea' | 'confusing' | 'other';

const REPO_URL = 'https://github.com/SlideWright/lattice';
const TEMPLATE = 'studio-feedback.yml';

const CATEGORY_META: Record<FeedbackCategory, { label: string; titlePrefix: string; ghLabel: string }> = {
	bug: { label: 'Something broke', titlePrefix: 'Bug', ghLabel: 'bug' },
	idea: { label: 'Idea', titlePrefix: 'Idea', ghLabel: 'enhancement' },
	confusing: { label: 'Confusing', titlePrefix: 'Confusing', ghLabel: 'feedback' },
	other: { label: 'Other', titlePrefix: 'Feedback', ghLabel: 'feedback' },
};

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ['bug', 'idea', 'confusing', 'other'];

export function feedbackCategoryLabel(category: FeedbackCategory): string {
	return CATEGORY_META[category].label;
}

/**
 * Diagnostic lines auto-captured at submit time — raises report quality
 * without asking the user to type browser/viewport/page details themselves.
 * `extra` folds in caller-specific context (e.g. the open deck's title).
 */
export function captureFeedbackContext(extra?: Record<string, string>): Record<string, string> {
	const ctx: Record<string, string> = { ...extra };
	if (typeof window !== 'undefined') {
		ctx.Page = `${window.location.pathname}${window.location.search}`;
		ctx.Viewport = `${window.innerWidth}×${window.innerHeight}`;
	}
	if (typeof navigator !== 'undefined') ctx.Browser = navigator.userAgent;
	ctx.Time = new Date().toISOString();
	return ctx;
}

function formatDiagnostics(context: Record<string, string>): string {
	return Object.entries(context)
		.filter(([, v]) => v)
		.map(([k, v]) => `- **${k}:** ${v}`)
		.join('\n');
}

export function buildFeedbackIssueUrl(opts: {
	category: FeedbackCategory;
	summary: string;
	details: string;
	context?: Record<string, string>;
}): string {
	const meta = CATEGORY_META[opts.category];
	const title = `[${meta.titlePrefix}] ${opts.summary}`.trim();
	const labels = Array.from(new Set(['feedback', meta.ghLabel])).join(',');
	const params = new URLSearchParams({
		template: TEMPLATE,
		title,
		labels,
		details: opts.details,
		diagnostics: formatDiagnostics(opts.context ?? {}),
	});
	return `${REPO_URL}/issues/new?${params.toString()}`;
}
