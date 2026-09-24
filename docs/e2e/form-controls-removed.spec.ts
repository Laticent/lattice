import { expect, gotoStudio, openInspectorTab, test } from './studio-fixture';

// THE FORM CONTROLS ARE GONE FROM THE RUNNING UI — asserted on the real Studio,
// not on the source.
//
// Form is the composition model and cannot be disabled or configured (2026-09-20,
// engineering/decisions/2026-09-20-form-is-not-configurable.md). The Studio
// Inspector's "Deck chrome" toggle and the Playground's "Form" select were the two
// surfaces where a human could still change it, and both were deleted.
//
// `studio.controls.test.tsx` already asserts their absence — in jsdom, which HARD
// RULE #23 says is not verification of a running surface. It renders the component
// in isolation; it cannot see a control that survives because some other code path
// still mounts it, or a stale bundle, or a build that did not pick the change up.
// This drives the deployed build a person actually uses.
//
// THE POINT OF THE SECOND HALF IS THE NEIGHBOR. `Section rail` is a DIFFERENT
// register — it owns `class: no-progress`, it survives deliberately, and it sits
// where the deleted toggle used to. It is the easy thing to remove by mistake while
// removing the other, so its presence is asserted beside the absence.

test('the Inspector has no Form / Deck chrome control, and Section rail survives', async ({ page }) => {
	await gotoStudio(page);
	await openInspectorTab(page, 'chrome');

	// The deleted control, by every name it ever answered to.
	await expect(page.getByRole('switch', { name: 'Deck chrome' })).toHaveCount(0);
	await expect(page.getByRole('switch', { name: 'Form' })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Form' })).toHaveCount(0);

	// The neighbor that stays.
	await expect(page.getByRole('switch', { name: 'Section rail' })).toBeVisible();
});

test('no deck-settings surface offers a Form field', async ({ page }) => {
	await gotoStudio(page);
	await openInspectorTab(page, 'general');

	// A POSITIVE CONTROL FIRST. Every other assertion here is an ABSENCE, and an
	// absence passes just as happily when the panel never rendered at all — which is
	// the shape of self-fulfilling test this change was itself caught shipping once.
	// `Deck name` is a sibling field from the same `deck-config.js` vocabulary, in this
	// tab, and it is not going anywhere — so finding it proves the surface under test is
	// really there. (The first control tried was `Footer`, which lives under Chrome, not
	// General. It failed, which is the control doing its job: without it, this test's
	// three absences would have been asserted against a panel I had guessed the contents
	// of, and I would have had no way to tell a real absence from a mislocated one.)
	await expect(page.getByLabel('Deck name', { exact: true })).toBeVisible();

	// The Playground's deck-config drawer and the Studio Inspector share that
	// vocabulary, so a `Form` row returning here would mean the select came back on
	// either surface.
	await expect(page.getByRole('combobox', { name: 'Form' })).toHaveCount(0);
	await expect(page.getByLabel('Form', { exact: true })).toHaveCount(0);
});
