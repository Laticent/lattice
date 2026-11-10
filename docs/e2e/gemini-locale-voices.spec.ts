// Gemini's locale voices behind a language filter (followups 3079-p3-gemini-locale-voices): the Gemini
// voice panel in Workspace › AI starts its Language menu on the deck's `lang:`, keeps the 30 named,
// multilingual voices first, and adds that language's locale voices grouped by region. Gemini is
// mocked with a recorded page of its live `/v1beta/voices` list; nothing reaches the network. The phone
// width is a viewport change inside the test (the editor it seeds the deck through is desktop-only).
import { readFileSync } from 'node:fs';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

const VOICES = JSON.parse(readFileSync(new URL('../src/playground/gemini-voices.recorded.json', import.meta.url), 'utf8')).voices;
const GEM = 'AIzaE2eLocaleGeminiKey000a1b2';
const SEL = JSON.stringify({ v: 1, source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore', last: {} });
const DECK = ['---', 'theme: indaco', 'lang: pt-BR', '---', '', '# Nosso trabalho', '', '---', '', '# Dois'].join('\n');
const WIDTHS = [
	{ width: 1440, height: 900 },
	{ width: 820, height: 1180 },
	{ width: 390, height: 844 },
];

test('@crosswidth @webkit-tablet @gecko the Gemini voice panel starts on the deck language and groups its locale voices by region', async ({ page }, info) => {
	test.skip(info.project.name === 'mobile', 'the phone layout hides the editor this test seeds the deck through; the 390 px screenshot is taken by resizing on the other projects');
	await page.addInitScript(
		([fake, sel]) => {
			if (sessionStorage.getItem('locale-seeded')) return;
			localStorage.setItem('lattice-db-gemini-key', fake);
			localStorage.setItem('lattice-studio-voice-selection', sel);
			localStorage.setItem('lattice-db-dedup', 'off');
			sessionStorage.setItem('locale-seeded', '1');
		},
		[GEM, SEL] as const,
	);
	await page.route('https://openrouter.ai/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }));
	await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
		const req = route.request();
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		const url = req.url().split('?')[0];
		if (url.endsWith('/v1beta/voices')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voices: VOICES }) });
		if (url.endsWith('/v1beta/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-lite-tts' }, { name: 'models/gemini-3.8-flash-tts' }] }) });
		return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
	});
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	// The panel reads the open deck from storage (Workspace › AI has no deck of its own): wait for the save.
	await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('lattice-studio-src-') && (localStorage.getItem(k) || '').includes('lang: pt-BR')))).toBe(true);

	const header = page.locator('button[aria-label="Workspace settings"]:visible');
	if (await header.count()) await header.first().click();
	else {
		await page.getByRole('button', { name: /^(Menu|More controls)$/ }).click();
		await page.getByRole('menuitem', { name: 'Workspace settings' }).click();
	}
	await page.getByRole('tab', { name: 'AI' }).click();
	await page.getByTestId('voice-model-card').getByRole('button', { name: /Change/ }).click();

	const language = page.getByRole('combobox', { name: 'Voice language' });
	await expect(language).toHaveText(/Portuguese · 10 voices/, { timeout: 30_000 });
	// The picker: the named voices first, then each Portuguese locale.
	await page.getByRole('combobox', { name: 'Gemini TTS voice', exact: true }).click();
	await expect(page.getByText('Multilingual voices', { exact: true })).toBeVisible();
	await expect(page.getByText('Portuguese · Brazil', { exact: true })).toBeAttached();
	await expect(page.getByText('Portuguese · Portugal', { exact: true })).toBeAttached();
	await expect(page.getByText('Authoritative Advisor 1 · Lawyer').first()).toBeAttached();
	// Search narrows to the locale voices, so the screenshots show the groups the filter added.
	await page.getByLabel('Search Gemini TTS voice').fill('Advisor');
	await expect(page.getByText('Portuguese · Brazil', { exact: true })).toBeVisible();

	for (const size of WIDTHS) {
		await page.setViewportSize(size);
		await page.getByRole('listbox', { name: 'Gemini TTS voice' }).scrollIntoViewIfNeeded();
		const path = test.info().outputPath(`gemini-locale-voices-${size.width}.png`);
		await page.screenshot({ path, animations: 'disabled' });
		if (process.env.SPINE_SHOTS) await page.screenshot({ path: `${process.env.SPINE_SHOTS}/gemini-locale-voices-${size.width}.png`, animations: 'disabled' });
	}

	// Choosing "Multilingual voices only" leaves just the named list. (Escape would close the whole sheet.)
	await page.setViewportSize(WIDTHS[0]);
	await page.getByRole('combobox', { name: 'Gemini TTS voice', exact: true }).click();
	await language.click();
	await page.getByRole('option', { name: 'Multilingual voices only' }).click();
	await expect(language).toHaveText('Multilingual voices only');
});
