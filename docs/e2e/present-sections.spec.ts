import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE PRESENT RAIL GROUPS SLIDES BY SECTION, on the real Present overlay
// (docs/src/components/studio/present-sections.ts, engineering/decisions/2026-11-23-cover-layout.md §7).
//
// Since 2026-11-23 `light` on a divider is the color mode, not the small layout: `divider light` is a
// full section start on the light accent field, and the within-section waypoint is `divider subsection`.
// The unit test (present-sections.test.ts) pins the predicate; this reads the grouping where a presenter
// sees it: each rail segment's accessible name ends with its section's name.
const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'<!-- @meta{layout=title} -->',
	'',
	'# A deck',
	'',
	'---',
	'',
	'<!-- @meta{layout=divider} -->',
	'',
	'## Part one',
	'',
	'---',
	'',
	'## A content slide',
	'',
	'---',
	'',
	'<!-- @meta{layout=divider, class=subsection light} -->',
	'',
	'## A finer turn',
	'',
	'---',
	'',
	'## Another content slide',
	'',
	'---',
	'',
	'<!-- @meta{layout=divider, class=light} -->',
	'',
	'## Part two',
	'',
	'---',
	'',
	'## The last content slide',
	'',
].join('\n');

test.describe('Present — the section rail', () => {
	test.beforeEach(async ({ page }) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
	});

	// One body, two titles: desktop (the per-PR project) skips a test tagged for WebKit, so the
	// untagged copy runs there and the tagged one on real WebKit and Gecko.
	const grouped = async ({ page }: { page: import('@playwright/test').Page }) => {
		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		const seg = (n: number) => dialog.getByRole('button', { name: new RegExp(`^Go to slide ${n}\\b`) });
		// The subsection (slide 4) and the slide after it belong to "Part one"...
		await expect(seg(3)).toHaveAccessibleName(/— Part one/);
		await expect(seg(4)).toHaveAccessibleName(/— Part one/);
		await expect(seg(5)).toHaveAccessibleName(/— Part one/);
		// ...and the light-mode divider opens "Part two" (it was the waypoint before 2026-11-23).
		await expect(seg(6)).toHaveAccessibleName(/— Part two/);
		await expect(seg(7)).toHaveAccessibleName(/— Part two/);
	};
	test('a subsection stays inside its section, and `divider light` starts one', grouped);
	test('a subsection stays inside its section, and `divider light` starts one, on WebKit and Gecko @webkit-tablet @gecko', grouped);
});
