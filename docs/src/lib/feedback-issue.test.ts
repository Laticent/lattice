import { describe, expect, it } from 'vitest';
import { buildFeedbackIssueUrl, captureFeedbackContext, FEEDBACK_CATEGORIES, feedbackCategoryLabel } from './feedback-issue';

describe('buildFeedbackIssueUrl', () => {
	it('points at the studio-feedback issue template with no token/credential params', () => {
		const url = buildFeedbackIssueUrl({ category: 'bug', summary: 'Export hangs', details: 'It just spins.' });
		const parsed = new URL(url);
		expect(parsed.origin + parsed.pathname).toBe('https://github.com/SlideWright/lattice/issues/new');
		expect(parsed.searchParams.get('template')).toBe('studio-feedback.yml');
		expect([...parsed.searchParams.keys()]).not.toContain('token');
	});

	it('prefixes the title by category and carries a feedback + category label', () => {
		const url = buildFeedbackIssueUrl({ category: 'idea', summary: 'Add dark-mode preview', details: '...' });
		const params = new URL(url).searchParams;
		expect(params.get('title')).toBe('[Idea] Add dark-mode preview');
		expect(params.get('labels')).toBe('feedback,enhancement');
	});

	it('deduplicates the label when the category label is already "feedback"', () => {
		const url = buildFeedbackIssueUrl({ category: 'other', summary: 'x', details: 'y' });
		expect(new URL(url).searchParams.get('labels')).toBe('feedback');
	});

	it('maps details and diagnostics onto the template field ids', () => {
		const url = buildFeedbackIssueUrl({
			category: 'confusing',
			summary: 'Where is Present?',
			details: 'Could not find the button.',
			context: { Page: '/studio/', Viewport: '1440×900' },
		});
		const params = new URL(url).searchParams;
		expect(params.get('details')).toBe('Could not find the button.');
		expect(params.get('diagnostics')).toBe('- **Page:** /studio/\n- **Viewport:** 1440×900');
	});

	it('omits empty context entries from the diagnostics block', () => {
		const url = buildFeedbackIssueUrl({ category: 'bug', summary: 's', details: 'd', context: { Deck: '', Page: '/studio/' } });
		expect(new URL(url).searchParams.get('diagnostics')).toBe('- **Page:** /studio/');
	});
});

describe('feedbackCategoryLabel', () => {
	it('has a human label for every category', () => {
		for (const c of FEEDBACK_CATEGORIES) expect(feedbackCategoryLabel(c).length).toBeGreaterThan(0);
	});
});

describe('captureFeedbackContext', () => {
	it('folds in extra context and always stamps a Time', () => {
		const ctx = captureFeedbackContext({ Area: 'Studio', Deck: 'My deck' });
		expect(ctx.Area).toBe('Studio');
		expect(ctx.Deck).toBe('My deck');
		expect(ctx.Time).toBeTruthy();
	});
});
