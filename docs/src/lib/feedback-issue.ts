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

/**
 * GitHub rejects a request line over roughly 8 KB with a bare **414 URI Too
 * Long** error page. Measured against the real endpoint: an 8,095-character URL
 * redirects normally, 9,095 does not.
 *
 * That was reachable in practice, not in theory. A hand-typed feedback report
 * never comes close, but an auto-generated Studio crash report does: a modest
 * one with a full breadcrumb trail and a stack already measures ~7.8 KB, leaving
 * a few hundred bytes of headroom, and the caps allow ~17 KB. So the primary
 * "Report on GitHub" action failed on precisely the richest reports — the
 * long-session, full-trail ones most worth filing — and failed as a raw GitHub
 * error page with no explanation.
 *
 * The body is therefore budgeted. Truncation keeps the HEAD of the report (the
 * verdict, the context and the observed signals lead; the breadcrumb trail
 * trails) and says plainly that it was cut, pointing at the copy action which
 * carries the whole thing. Cutting beats a 414: a slightly short issue is still
 * a filed issue.
 */
const URL_BUDGET = 7000;

export function buildFeedbackIssueUrl(opts: {
	category: FeedbackCategory;
	summary: string;
	details: string;
	context?: Record<string, string>;
}): string {
	const meta = CATEGORY_META[opts.category];
	const title = `[${meta.titlePrefix}] ${opts.summary}`.trim();
	const labels = Array.from(new Set(['feedback', meta.ghLabel])).join(',');
	const diagnostics = formatDiagnostics(opts.context ?? {});
	const build = (details: string) =>
		`${REPO_URL}/issues/new?${new URLSearchParams({ template: TEMPLATE, title, labels, details, diagnostics }).toString()}`;

	let url = build(opts.details);
	if (url.length <= URL_BUDGET) return url;

	// Binary-search the longest body that fits. Percent-encoding means a byte of
	// markdown can cost three in the URL, so the ratio is not knowable up front —
	// and the note itself has to fit inside the budget.
	const NOTE = '\n\n---\n\n_This report was truncated to fit GitHub\'s URL length limit. Use **Copy report** in the Studio for the full trail._\n';
	let lo = 0;
	let hi = opts.details.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (build(opts.details.slice(0, mid) + NOTE).length <= URL_BUDGET) lo = mid;
		else hi = mid - 1;
	}
	url = build(opts.details.slice(0, lo) + NOTE);
	return url;
}
