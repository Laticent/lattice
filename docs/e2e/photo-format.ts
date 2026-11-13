import { expect, type Page } from '@playwright/test';

/** The labels the Library's photo-format dialog gives its choices (`OPTIONS` in PhotoFormatDialog.tsx). */
export type PhotoFormatLabel = 'Keep original' | 'JPEG' | 'WebP' | 'PNG';

/**
 * Answer the "Add N photos" dialog the Library opens after a pick, as a person does: choose a format if one is named,
 * then press "Add photo(s)". Without a format it takes the dialog's default.
 *
 * Why a helper: eight specs answered this dialog from inside `page.evaluate`, polling the DOM every 50 ms and sleeping
 * 150 ms after the radio click so React could commit the new format before "Add" read it. The locators below wait for
 * the dialog itself, and `aria-checked="true"` on the chosen radio IS the commit those 150 ms were guessing at
 * (HARD RULE #32, F2). A dialog that never opens now fails here, by name, instead of after 200 silent polls.
 */
export async function confirmPhotoFormat(page: Page, format?: PhotoFormatLabel): Promise<void> {
	const dialog = page.getByRole('dialog', { name: /^Add \d+ photos?$/ });
	if (format) {
		const radio = dialog.getByRole('radio', { name: format, exact: true });
		await radio.click();
		await expect(radio).toHaveAttribute('aria-checked', 'true');
	}
	await dialog.getByRole('button', { name: /^Add photo/ }).click();
	// The dialog closing is the signal the pick was taken. A second pick made before it closes opens its dialog under
	// this one's fading overlay, and the click on ITS "Add" lands on the overlay (compose-image, measured).
	await expect(dialog).toBeHidden();
}
