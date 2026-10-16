// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import exportSettingsCore from '../../../lib/core/export-settings.js';
import { buildSrcdoc, EXPORT_SETTINGS_BLOCK } from './deck-preview.js';

// A capture frame whose bytes become an artifact says so with the export-settings block, and the
// runtime reads that block to pick the overflow marker's level. The Studio's Webpage export baked
// in a frame without one, so every player it made carried the AUTHOR marker to its reader
// (engineering/decisions/2026-10-16-player-as-library-audit.md §11.8). deck-preview.js writes the
// block through the data-block kernel rather than export-settings.js (that file `require`s, which
// the dev server's CommonJS shim refuses), so this pins the one thing that copy could get wrong:
// the runtime's OWN reader has to find it.
const base = { html: '<div class="lattice"><section><h1>x</h1></section></div>', css: 'section{}', mode: 'light' as const, geom: { w: 1280, h: 720 }, runtimeUrl: '/rt.js' };

describe('buildSrcdoc — exportSettings', () => {
	it('writes a block the runtime reads, in <head>, before the runtime script', () => {
		const html = buildSrcdoc({ ...base, exportSettings: { overflowMarker: 'reader' } });
		const doc = new DOMParser().parseFromString(html, 'text/html');
		expect(doc.head.querySelector(`script[type="${exportSettingsCore.EXPORT_SETTINGS_TYPE}"]`)).not.toBeNull();
		expect(html.indexOf(exportSettingsCore.EXPORT_SETTINGS_TYPE)).toBeLessThan(html.indexOf('src="/rt.js"'));
		expect(exportSettingsCore.readExportSettings(doc)).toEqual({ overflowMarker: 'reader' });
	});

	it('writes the same bytes export-settings.js would', () => {
		expect(EXPORT_SETTINGS_BLOCK.write({ overflowMarker: 'reader' })).toBe(exportSettingsCore.exportSettingsBlock({ overflowMarker: 'reader' }));
	});

	it('writes nothing for a preview, which is an authoring surface', () => {
		expect(buildSrcdoc(base)).not.toContain(exportSettingsCore.EXPORT_SETTINGS_TYPE);
	});
});
