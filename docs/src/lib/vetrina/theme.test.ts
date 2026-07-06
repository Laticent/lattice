import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme — color validation (corrected I4)', () => {
	it('rejects a url() exfiltration sink', () => {
		expect(() => resolveTheme({ accent: 'url(https://evil/leak)' })).toThrow(/unsafe/i);
	});
	it('rejects image()/expression() sinks', () => {
		expect(() => resolveTheme({ accent: 'image(foo.png)' })).toThrow(/unsafe/i);
		expect(() => resolveTheme({ accent: 'expression(alert(1))' })).toThrow(/unsafe/i);
	});
	it('rejects a control char', () => {
		expect(() => resolveTheme({ accent: `red${String.fromCharCode(0)}` })).toThrow(/unsafe/i);
	});
	it('validates token overrides too', () => {
		expect(() => resolveTheme({ tokens: { captionBg: 'url(x)' } })).toThrow(/unsafe/i);
	});
});

describe('resolveTheme — legibility floor (F4: adaptive co-stroke)', () => {
	it('a light accent gets a DARK co-stroke so the cursor never goes invisible', () => {
		const t = resolveTheme({ accent: '#f6f6f6' });
		expect(t.tokens['--vt-cursor-stroke']).toBe('#0c0e13');
		expect(t.tokens['--vt-ring-halo']).toBe('#0c0e13');
	});
	it('a dark accent keeps a WHITE co-stroke', () => {
		expect(resolveTheme({ accent: '#123456' }).tokens['--vt-cursor-stroke']).toBe('#ffffff');
	});
	it('an explicit token override wins over the adaptive default', () => {
		const t = resolveTheme({ accent: '#ffffff', tokens: { cursorStroke: '#abcdef' } });
		expect(t.tokens['--vt-cursor-stroke']).toBe('#abcdef');
	});
	it('sets --vt-accent from the accent value', () => {
		expect(resolveTheme({ accent: '#2b6ef2' }).tokens['--vt-accent']).toBe('#2b6ef2');
	});
	it('emits --vt-cursor-fill inline so the cursor BODY tracks a JS accent (not the :root default)', () => {
		// The derived token defaults to var(--vt-accent) on :root; on the JS-theme path it must
		// be written inline on the same layer as --vt-accent, or the body stays the house default.
		expect(resolveTheme({ accent: '#123456' }).tokens['--vt-cursor-fill']).toBe('var(--vt-accent)');
		expect(resolveTheme().tokens['--vt-cursor-fill']).toBeUndefined(); // no accent → no inline fill (pure CSS-first)
	});
	it('an explicit cursorFill override wins over the accent-derived default', () => {
		expect(resolveTheme({ accent: '#123456', tokens: { cursorFill: '#abcdef' } }).tokens['--vt-cursor-fill']).toBe('#abcdef');
	});
});

describe('resolveTheme — pacing / pointer / cues', () => {
	it('speed maps to a followable pace multiplier (slow > 1 > fast)', () => {
		expect(resolveTheme({ speed: 'slow' }).pace).toBeGreaterThan(1);
		expect(resolveTheme().pace).toBe(1);
		expect(resolveTheme({ speed: 'fast' }).pace).toBeLessThan(1);
	});
	it('pointer defaults to arrow', () => {
		expect(resolveTheme().pointer).toBe('arrow');
		expect(resolveTheme({ pointer: 'ring' }).pointer).toBe('ring');
	});
	it('cues:{x:false} silences x', () => {
		const t = resolveTheme({ cues: { intro: false, press: false } });
		expect(t.silenced.has('intro')).toBe(true);
		expect(t.silenced.has('press')).toBe(true);
		expect(t.silenced.has('circle')).toBe(false);
	});
	it('empty theme is all defaults, no tokens', () => {
		const t = resolveTheme();
		expect(Object.keys(t.tokens)).toHaveLength(0);
		expect(t.silenced.size).toBe(0);
	});
});
