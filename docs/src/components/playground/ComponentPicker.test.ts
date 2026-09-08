import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// The picker's list cap is stated TWICE — once as a TypeScript constant the Return rule
// reads, once inside a literal Tailwind class — and it has to be, because Tailwind's
// scanner reads source text and generates no rule for an interpolated class name
// (ui/panel.tsx records what that costs: twelve drawers at twelve different heights).
// Two spellings of one number is a drift waiting to happen, so this pins them together.
const SRC = readFileSync(join(__dirname, 'ComponentPicker.tsx'), 'utf8');

describe('ComponentPicker — the list cap is stated once, in two places that agree', () => {
	const capConst = /const PANEL_CAP_PX = (\d+);/.exec(SRC);
	const capClass = /max-h-\[max\((\d+)px,min\((\d+)px,calc\(var\(--radix-popover-content-available-height\)-(\d+)px\)\)\)\]/.exec(SRC);

	test('both spellings are present', () => {
		expect(capConst, 'PANEL_CAP_PX is gone or renamed').not.toBeNull();
		expect(capClass, 'the literal max-h class is gone or was rewritten by interpolation').not.toBeNull();
	});

	test('the constant the Return rule reads is the flat arm the class ships', () => {
		expect(Number(capClass?.[2])).toBe(Number(capConst?.[1]));
	});

	test('the floor is below the flat cap, so the arms cannot inaccurately invert', () => {
		expect(Number(capClass?.[1])).toBeLessThan(Number(capClass?.[2]));
	});

	test('the SIZING uses Radix alone — it must not subtract the keyboard twice', () => {
		// floating-ui measures the available height from the VISUAL viewport, so the keyboard
		// is already off it (500px -> 164 on a WebKit iPhone raising a 336px keyboard).
		// Subtracting `--kb` as well left 206px of dead screen above the keyboard on a Pixel.
		expect(capClass?.[0]).toContain('--radix-popover-content-available-height');
		expect(capClass?.[0], 'the size arm must not subtract --kb on top of Radix').not.toContain('--kb');
	});

	test('the RETURN rule keeps both signals, because neither covers every device', () => {
		// `--kb` is 0 where the layout viewport shrinks instead; the panel barely shrinks on a
		// tall phone. Measured: iPhone 336px keyboard -> panel 152px (both fire); Pixel 7 same
		// keyboard -> panel 332px (only --kb fires).
		expect(SRC).toContain("getPropertyValue('--kb')");
		expect(SRC).toContain('PANEL_CAP_PX - SQUEEZE_MARGIN_PX');
	});

	test('the picker uses the shared publisher rather than its own listener', () => {
		expect(SRC).toContain('useKeyboardInset(open)');
		// CODE, not prose — the comments above the hook call name the API precisely to explain
		// why this file does not touch it, so a bare substring search would fail on its own
		// rationale. Strip line and block comments first, then look for a real member access.
		const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
		expect(code, 'a second visualViewport listener is the duplication HARD RULE #15 forbids').not.toMatch(/\bwindow\.visualViewport\b/);
		expect(code, 'the cap must come from --vvh, not from a hand-rolled resize listener').not.toMatch(/addEventListener\(\s*['"]resize['"]/);
	});
});
