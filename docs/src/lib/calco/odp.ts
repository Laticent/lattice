/**
 * The ODP writer: a Deck → an OpenDocument Presentation (ODF 1.3), the format LibreOffice
 * Impress opens natively.
 *
 * Every page is a full-bleed picture with zero or more text boxes on top. In PICTURE mode
 * the picture is the whole slide and there are no boxes; in EDITABLE mode the picture is the
 * slide with its text hidden and every paragraph is a real text box, in its own font, which
 * is embedded in the file. One code path writes both.
 *
 * Package rules a reader enforces, each learned the hard way:
 *   - `mimetype` is the FIRST zip entry and STORED, so a reader can sniff the type unzipped;
 *   - the manifest lists every part, and the zip holds no directory entries;
 *   - `styles.xml` needs an `<office:styles>` element, even an empty one, or LibreOffice
 *     ignores the page layout and falls back to its own 28 × 15.75 cm page.
 */
import { type FontMetrics, faceFor, facesUsed, readFontMetrics, uniqueFaceNames } from './fonts';
import { dominantStyle, metricsFor, placeFrame } from './layout';
import { renameFace } from './sfnt';
import type { Deck, EmbeddedFont, JSZipClass, TextStyle } from './types';

export const ODP_MIMETYPE = 'application/vnd.oasis.opendocument.presentation';

/** PowerPoint's 16:9 width, 13.333in: the page's longest edge, whatever the aspect. */
const LONGEST_EDGE_CM = 33.867;
const PT_PER_CM = 72 / 2.54;
const NO_DIRS = Object.freeze({ createFolders: false });

const NS = [
	'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
	'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
	'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
	'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
	'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
	'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
	'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
	'xmlns:xlink="http://www.w3.org/1999/xlink"',
	'xmlns:dc="http://purl.org/dc/elements/1.1/"',
	'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
	'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ');

/** Escape for an XML text node or a double-quoted attribute. */
export function xmlEscape(s: string): string {
	return (
		String(s)
			// Characters XML 1.0 forbids outright; a stray one makes LibreOffice refuse the file.
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
	);
}

/** Page size in cm for a slide box in px: longest edge 33.867cm, the deck's aspect. */
export function odpPageSize(width: number, height: number): { w: number; h: number } {
	const w = Number(width);
	const h = Number(height);
	if (!(w > 0 && h > 0)) return { w: LONGEST_EDGE_CM, h: 19.05 };
	const longest = Math.max(w, h);
	const round = (n: number) => Math.round(n * 1000) / 1000;
	return { w: round((w / longest) * LONGEST_EDGE_CM), h: round((h / longest) * LONGEST_EDGE_CM) };
}

/** Body text: runs of 2+ spaces become `<text:s>`, tabs `<text:tab/>`. */
function textBody(text: string): string {
	return xmlEscape(text)
		.replace(/\t/g, '<text:tab/>')
		.replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
}

function noteParagraphs(note: string): string {
	return String(note)
		.split(/\r?\n/)
		.map((line) => `<text:p>${textBody(line)}</text:p>`)
		.join('');
}

const pad3 = (i: number) => String(i + 1).padStart(3, '0');

/** A family name as it may appear inside a quoted CSS-style attribute value. */
function familyName(family: string): string {
	return String(family).replace(/["'<>&\\]/g, '').trim() || 'sans-serif';
}

const TRANSFORMS = new Set(['uppercase', 'lowercase', 'capitalize']);

/** The face-declaration name for an embedded face: unique per family + weight + slant. */
function faceDeclName(f: { family: string; weight: number; italic: boolean }): string {
	return `${familyName(f.family)} ${f.weight}${f.italic ? ' Italic' : ''}`;
}

/**
 * Build the package. `JSZip` is passed in. Returns the zip; call
 * `generateAsync({ ...odpZipOptions, type })`.
 */
export function buildOdp(JSZip: JSZipClass, deck: Deck) {
	if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
		throw new Error('calco: no slides to write');
	}
	const W = deck.width > 0 ? deck.width : 1280;
	const H = deck.height > 0 ? deck.height : 720;
	const page = odpPageSize(W, H);
	const cmPerPx = page.w / W;
	const cm = (px: number) => `${(px * cmPerPx).toFixed(4)}cm`;
	const pt = (px: number) => `${(px * cmPerPx * PT_PER_CM).toFixed(2)}pt`;

	// Embed only faces some run draws with; deduplicate by declaration name.
	const fonts = deck.fonts || [];
	const used: EmbeddedFont[] = [];
	for (const use of facesUsed(deck)) {
		const face = faceFor(use, fonts);
		if (face && !used.includes(face)) used.push(face);
	}
	const fontPath = (i: number) => `Fonts/face${String(i + 1).padStart(2, '0')}.ttf`;
	// Each face is written as a family of its own ("Outfit SemiBold"), renamed inside the file
	// to match. A pinned variable face still carries the variable font's names (every Outfit
	// weight says "Outfit Thin"), and a reader that goes by the font's own names, as iOS
	// does, then finds no "Outfit" at all and substitutes a wider font (measured, Collabora
	// Office on iOS). A face that cannot be renamed keeps its family and weight.
	const names = uniqueFaceNames(used);
	const embedded = used.map((f) => {
		const name = names.get(f) as string;
		try {
			return { face: f, name, bytes: renameFace(f.bytes, name), renamed: true };
		} catch {
			return { face: f, name: faceDeclName(f), bytes: f.bytes, renamed: false };
		}
	});
	const entryOf = (f: EmbeddedFont) => embedded.find((e) => e.face === f);
	const faceDecls =
		'<office:font-face-decls>' +
		embedded
			.map(
				({ face: f, name, renamed }, i) =>
					`<style:font-face style:name="${xmlEscape(name)}" svg:font-family="${xmlEscape(`'${renamed ? name : familyName(f.family)}'`)}" ` +
					`svg:font-weight="${renamed ? 'normal' : f.weight}" svg:font-style="${renamed || !f.italic ? 'normal' : 'italic'}">` +
					`<svg:font-face-src><svg:font-face-uri xlink:href="${fontPath(i)}" xlink:type="simple">` +
					`<svg:font-face-format svg:string="truetype"/></svg:font-face-uri></svg:font-face-src></style:font-face>`,
			)
			.join('') +
		'</office:font-face-decls>';

	const automatic: string[] = [
		'<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" ' +
			'draw:auto-grow-height="false" draw:auto-grow-width="false" draw:textarea-vertical-align="top" ' +
			'fo:padding-top="0cm" fo:padding-bottom="0cm" fo:padding-left="0cm" fo:padding-right="0cm"/></style:style>',
	];
	const textStyles = new Map<string, string>();
	const textStyle = (s: TextStyle): string => {
		const face = faceFor(s, used);
		const key = JSON.stringify([face ? used.indexOf(face) : s.family, s.weight, s.italic, s.size, s.color, s.alpha, s.flatColor, s.letterSpacing, s.transform, s.underline, s.strike, !!s.smallCaps]);
		const hit = textStyles.get(key);
		if (hit) return hit;
		const name = `T${textStyles.size + 1}`;
		textStyles.set(key, name);
		// Prefer the blended color: a translucent run that is ALSO letter-spaced is clipped
		// by LibreOffice at its un-spaced width (measured, LibreOffice 7). Opacity only
		// survives when there is no solid background to blend over.
		const color = s.alpha < 1 && s.flatColor ? s.flatColor : s.color;
		const opacity = s.alpha < 1 && !s.flatColor ? ` loext:opacity="${Math.round(s.alpha * 100)}%"` : '';
		const entry = face ? entryOf(face) : undefined;
		// A renamed face IS its weight and slant; asking for them again would synthesize a
		// second bold. Only a nearest-weight stand-in lighter than a bold run is made bold.
		const weight = entry?.renamed ? (s.weight >= 600 && (face as EmbeddedFont).weight < 600 ? 'bold' : 'normal') : String(s.weight);
		const italic = entry?.renamed ? s.italic && !(face as EmbeddedFont).italic : s.italic;
		const attrs = [
			entry ? `style:font-name="${xmlEscape(entry.name)}"` : `fo:font-family="${xmlEscape(familyName(s.family))}"`,
			`fo:font-size="${pt(s.size)}"`,
			`fo:color="${color}"${opacity}`,
			`fo:font-weight="${weight}"`,
			`fo:font-style="${italic ? 'italic' : 'normal'}"`,
			s.letterSpacing ? `fo:letter-spacing="${cm(s.letterSpacing)}"` : '',
			TRANSFORMS.has(s.transform) ? `fo:text-transform="${s.transform}"` : '',
			s.smallCaps ? 'fo:font-variant="small-caps"' : '',
			s.underline ? 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '',
			s.strike ? 'style:text-line-through-style="solid"' : '',
		].filter(Boolean);
		automatic.push(`<style:style style:name="${name}" style:family="text"><style:text-properties ${attrs.join(' ')}/></style:style>`);
		return name;
	};
	const paraStyles = new Map<string, string>();
	const paraStyle = (align: string, lineHeight: number): string => {
		const key = `${align}|${lineHeight.toFixed(3)}`;
		const hit = paraStyles.get(key);
		if (hit) return hit;
		const name = `P${paraStyles.size + 1}`;
		paraStyles.set(key, name);
		const foAlign = align === 'center' ? 'center' : align === 'right' ? 'end' : 'start';
		automatic.push(
			`<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties fo:text-align="${foAlign}" ` +
				`fo:line-height="${cm(lineHeight)}" fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:text-indent="0cm"/></style:style>`,
		);
		return name;
	};

	const metricsCache = new Map<EmbeddedFont, FontMetrics | null>();
	const pages = deck.slides.map((slide, i) => {
		const n = i + 1;
		const alt = (slide.description || '').trim() || `Slide ${n}`;
		const boxes = (slide.frames || [])
			.filter((f) => f.lines.length && f.lines.some((l) => l.length))
			.map((f, j) => {
				const lead = dominantStyle(f.lines.find((l) => l.length) || f.lines[0]);
				const box = placeFrame(f, W, metricsFor(lead, used, metricsCache), lead.size);
				const body = f.lines
					.map((runs, li) => (li ? '<text:line-break/>' : '') + runs.map((r) => `<text:span text:style-name="${textStyle(r.style)}">${textBody(r.text)}</text:span>`).join(''))
					.join('');
				return (
					`<draw:frame draw:style-name="gr1" draw:name="Text ${n}.${j + 1}" svg:x="${cm(box.x)}" svg:y="${cm(box.y)}" svg:width="${cm(box.w)}" svg:height="${cm(box.h)}">` +
					`<draw:text-box><text:p text:style-name="${paraStyle(f.align, f.lineHeight)}">${body}</text:p></draw:text-box></draw:frame>`
				);
			})
			.join('');
		const note = slide.notes;
		const notesXml = note
			? `<presentation:notes><draw:page-thumbnail presentation:class="page" draw:page-number="${n}" svg:x="2.1cm" svg:y="2.3cm" svg:width="16.8cm" svg:height="9.45cm"/>` +
				`<draw:frame presentation:class="notes" svg:x="2.1cm" svg:y="12.8cm" svg:width="16.8cm" svg:height="13cm"><draw:text-box>${noteParagraphs(note)}</draw:text-box></draw:frame></presentation:notes>`
			: '';
		return (
			`<draw:page draw:name="Slide ${n}" draw:master-page-name="Default">` +
			`<draw:frame draw:name="Slide ${n}" svg:x="0cm" svg:y="0cm" svg:width="${page.w}cm" svg:height="${page.h}cm">` +
			`<draw:image xlink:href="Pictures/slide${pad3(i)}.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
			// Alt text: LibreOffice reads svg:title as the picture's title, svg:desc as its description.
			`<svg:title>${xmlEscape(`Slide ${n}`)}</svg:title><svg:desc>${xmlEscape(alt)}</svg:desc>` +
			`</draw:frame>${boxes}${notesXml}</draw:page>`
		);
	});

	const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">${faceDecls}<office:automatic-styles>${automatic.join('')}</office:automatic-styles>
<office:body><office:presentation>${pages.join('')}</office:presentation></office:body>
</office:document-content>`;

	const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">${faceDecls}
<office:styles>
<style:default-style style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:default-style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${page.w}cm" fo:page-height="${page.h}cm" style:print-orientation="${page.w >= page.h ? 'landscape' : 'portrait'}"/></style:page-layout>
<style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="none" presentation:background-visible="true" presentation:background-objects-visible="true"/></style:style>
</office:automatic-styles>
<office:master-styles>
<style:master-page style:name="Default" style:page-layout-name="PM1" draw:style-name="Mdp1"/>
</office:master-styles>
</office:document-styles>`;

	// EmbedFonts keeps the faces when LibreOffice saves the file again.
	const settings = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.3"><office:settings><config:config-item-set config:name="ooo:configuration-settings"><config:config-item config:name="EmbedFonts" config:type="boolean">${used.length ? 'true' : 'false'}</config:config-item></config:config-item-set></office:settings></office:document-settings>`;

	const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.3"><office:meta>${[
		'<meta:generator>Calco</meta:generator>',
		`<dc:title>${xmlEscape((deck.title || 'deck').trim())}</dc:title>`,
		deck.subject ? `<dc:subject>${xmlEscape(deck.subject)}</dc:subject>` : '',
		`<meta:initial-creator>${xmlEscape(deck.author || 'Calco')}</meta:initial-creator>`,
		// ODF has no company field; a user-defined property keeps the provenance.
		deck.company ? `<meta:user-defined meta:name="Company">${xmlEscape(deck.company)}</meta:user-defined>` : '',
	].join('')}</office:meta></office:document-meta>`;

	const parts: Array<[string, string]> = [
		['content.xml', 'text/xml'],
		['styles.xml', 'text/xml'],
		['meta.xml', 'text/xml'],
		['settings.xml', 'text/xml'],
		...deck.slides.map((_s, i): [string, string] => [`Pictures/slide${pad3(i)}.png`, 'image/png']),
		...used.map((_f, i): [string, string] => [fontPath(i), 'application/x-font-ttf']),
	];
	const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODP_MIMETYPE}"/>
${parts.map(([p, t]) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${t}"/>`).join('\n')}
</manifest:manifest>`;

	const zip = new JSZip();
	// JSZip keeps insertion order, so `mimetype` is the first entry.
	zip.file('mimetype', ODP_MIMETYPE, { compression: 'STORE' });
	zip.file('META-INF/manifest.xml', manifest, NO_DIRS);
	zip.file('content.xml', content);
	zip.file('styles.xml', styles);
	zip.file('meta.xml', meta);
	zip.file('settings.xml', settings);
	deck.slides.forEach((slide, i) => {
		if (!slide.image?.length) throw new Error(`calco: slide ${i + 1} has no image`);
		// PNG is compressed already; deflating it again costs time and saves nothing.
		zip.file(`Pictures/slide${pad3(i)}.png`, slide.image, { ...NO_DIRS, compression: 'STORE' });
	});
	embedded.forEach((e, i) => {
		zip.file(fontPath(i), e.bytes, NO_DIRS);
	});
	return zip;
}

/** Options for `zip.generateAsync`: DEFLATE the XML, typed as an ODP. */
export const odpZipOptions = Object.freeze({ compression: 'DEFLATE', mimeType: ODP_MIMETYPE });

/** Build and serialize in one call. `type` is JSZip's output type. */
export async function writeOdp<T = Uint8Array>(JSZip: JSZipClass, deck: Deck, type = 'uint8array'): Promise<T> {
	return (await buildOdp(JSZip, deck).generateAsync({ ...odpZipOptions, type })) as T;
}

// Re-exported so a caller can measure a face without reaching into fonts.ts.
export { readFontMetrics };
