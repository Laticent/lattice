// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import exportSettingsCore from '../../../../../lib/core/export-settings.js';
import { buildSrcdoc } from '../../../playground/deck-preview.js';
import { withExportSettings } from './deck-export.js';

// A capture frame whose bytes become an artifact says so with the export-settings block, and the
// runtime reads that block to pick the overflow marker's level. The Studio's Webpage export baked
// in a frame without one, so every player it made carried the AUTHOR marker to its reader
// (engineering/decisions/2026-10-16-player-as-library-audit.md §11.8). deck-export.js writes the
// block through the data-block kernel rather than export-settings.js (that file `require`s, which
// the dev server's CommonJS shim refuses), so this pins what that route could get wrong: the bytes,
// the place, and that the runtime's OWN reader finds it.
const srcdoc = buildSrcdoc({ html: '<div class="lattice"><section><h1>x</h1></section></div>', css: 'section{}', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/rt.js' });

describe('withExportSettings', () => {
	it('writes a block the runtime reads, in <head>, before the runtime script', () => {
		const html = withExportSettings(srcdoc, { overflowMarker: 'reader' });
		const doc = new DOMParser().parseFromString(html, 'text/html');
		expect(doc.head.querySelector(`script[type="${exportSettingsCore.EXPORT_SETTINGS_TYPE}"]`)).not.toBeNull();
		expect(html.indexOf(exportSettingsCore.EXPORT_SETTINGS_TYPE)).toBeLessThan(html.indexOf('src="/rt.js"'));
		expect(exportSettingsCore.readExportSettings(doc)).toEqual({ overflowMarker: 'reader' });
	});

	it('writes the bytes export-settings.js would, right after <meta charset>, ahead of any stylesheet', () => {
		const html = withExportSettings(srcdoc, { overflowMarker: 'reader' });
		const block = exportSettingsCore.exportSettingsBlock({ overflowMarker: 'reader' });
		expect(html).toBe(srcdoc.replace('<meta charset="utf-8">', `<meta charset="utf-8">${block}`));
		expect(html.indexOf(block)).toBeLessThan(html.indexOf('<style'));
	});

	it('a preview frame carries none: it is an authoring surface', () => {
		expect(srcdoc).not.toContain(exportSettingsCore.EXPORT_SETTINGS_TYPE);
	});
});
