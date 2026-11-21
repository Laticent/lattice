// @vitest-environment node
// Node, not jsdom: jsdom's Blob has no `arrayBuffer()`, which the deck reader needs. The one
// browser API the reference reader uses that Node lacks, FileReader, is stood in below.
//
// Unit: a deck imported into the Library (2026-11-20). Which zip is a deck and which a
// package, what reference text a deck leaves, and which cards may offer "Open as deck".
// The picker and the card are driven on the real Studio in e2e/library-deck-import.spec.ts.
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import latticeDoc from '../../../../lib/core/lattice-doc.js';
import { embedInPdf, embedInPptx } from './embedded-source';
import { exportLatticeBlob } from './lattice-file';
import { deckReferenceText, pptxReferenceText, readDeckReference, readLibraryReference, routeByBytes } from './library-deck-ref';
import { MAX_DECK_REF_BYTES } from './reference-doc-store';

// readReferenceDoc reads text and PDFs with FileReader, a browser API Node does not have.
beforeAll(() => {
	if (typeof (globalThis as { FileReader?: unknown }).FileReader !== 'undefined') return;
	class NodeFileReader {
		result: string | null = null;
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		readAsText(f: Blob) {
			f.text().then((t) => { this.result = t; this.onload?.(); }, () => this.onerror?.());
		}
		readAsDataURL(f: Blob) {
			f.arrayBuffer().then((b) => { this.result = `data:${f.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onload?.(); }, () => this.onerror?.());
		}
	}
	(globalThis as { FileReader?: unknown }).FileReader = NodeFileReader;
});

// Two slides, a directive and three of the four notes (engineering/decisions/2026-11-20-four-notes.md): the speaker
// note (`@note`) is the one channel that must reach the reference text, and the directive, `@say` and `@alt` must not
// pass as one.
const SRC = [
	'---\ntheme: indaco\n---\n\n# Halcyon quarterly',
	'<!-- _class: content -->\n\n## Retention held\n\n- 94% of accounts renewed.\n\n<!-- @note{Open with the retention number.} -->\n\n<!-- @say{Retention held at ninety-four percent.} -->\n\n<!-- @alt{A bullet list.} -->',
].join('\n\n---\n\n');

const file = (b: Blob | Uint8Array | string, name: string, type = '') => new File([b as BlobPart], name, { type });
const lattice = () => exportLatticeBlob(SRC, 'Halcyon quarterly', [], 7);
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** Names of the files `claimsSize` made that something read whole. */
const readWhole = new Set<string>();
/** A file that CLAIMS `size` bytes and records it if anything reads it whole: a size check must come before any read. */
function claimsSize(name: string, size: number, head: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04])): File {
	const f = new File([head as BlobPart], name);
	Object.defineProperty(f, 'size', { value: size });
	f.arrayBuffer = () => {
		readWhole.add(name);
		throw new Error(`${name} was read whole`);
	};
	return f;
}

/** A Library package zip: a folder holding a component's parts, no `deck.md` at the root. */
async function packageZip(): Promise<Blob> {
	const zip = new JSZip();
	zip.file('probe-content/probe-content.manifest.json', '{}');
	zip.file('probe-content/probe-content.styles.css', '');
	return zip.generateAsync({ type: 'blob' });
}

/** A PowerPoint made elsewhere: two slides, notes on the second, linked through the slide's own rels. */
async function foreignPptx(): Promise<Blob> {
	const zip = new JSZip();
	zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
	zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
	zip.file('ppt/slides/slide1.xml', '<p:sld><p:txBody><a:p><a:r><a:t>Opening &amp; agenda</a:t></a:r></a:p></p:txBody></p:sld>');
	zip.file('ppt/slides/slide2.xml', '<p:sld><p:txBody><a:p><a:r><a:t>Revenue </a:t></a:r><a:r><a:t>grew</a:t></a:r></a:p></p:txBody></p:sld>');
	zip.file('ppt/slides/_rels/slide2.xml.rels', '<Relationships><Relationship Id="rId2" Target="../notesSlides/notesSlide7.xml"/></Relationships>');
	zip.file('ppt/notesSlides/notesSlide7.xml', '<p:notes><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Pause on the chart.</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>2</a:t></a:r></a:p></p:txBody></p:sp></p:notes>');
	return zip.generateAsync({ type: 'blob' });
}

async function plainPdf(): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([960, 540]);
	return doc.save();
}

describe('routeByBytes — a .zip is a deck or a package, and the archive says which', () => {
	it('sends a .lattice saved as .zip to the decks, and a package zip on to the package import', async () => {
		const r = await routeByBytes({ zips: [file(await lattice(), 'halcyon.zip'), file(await packageZip(), 'probe-content.zip')], rejected: [] });
		expect(r.decks.map((f) => f.name)).toEqual(['halcyon.zip']);
		expect(r.zips.map((f) => f.name)).toEqual(['probe-content.zip']);
		expect(r.rejected).toEqual([]);
	});

	it('finds a deck that lost its extension, and still names a file that is no archive', async () => {
		const r = await routeByBytes({ zips: [], rejected: [file(await lattice(), 'halcyon'), file(await foreignPptx(), 'talk'), file('just text', 'Makefile')] });
		expect(r.decks.map((f) => f.name)).toEqual(['halcyon', 'talk']);
		expect(r.rejected.map((f) => f.name)).toEqual(['Makefile']);
	});

	it('leaves a damaged zip with the package import, which names the problem as it always has', async () => {
		const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
		const r = await routeByBytes({ zips: [file(broken, 'broken.zip')], rejected: [] });
		expect(r.zips.map((f) => f.name)).toEqual(['broken.zip']);
		expect(r.decks).toEqual([]);
	});

	it('never hands a zip-shaped file with another extension (.docx, .key, a damaged one) to the package import', async () => {
		const broken = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
		const r = await routeByBytes({ zips: [], rejected: [file(await packageZip(), 'report.docx'), file(broken, 'talk.key')] });
		expect(r.zips).toEqual([]);
		expect(r.decks).toEqual([]);
		expect(r.rejected.map((f) => f.name)).toEqual(['report.docx', 'talk.key']);
	});

	it('checks the size before reading: a .zip over the deck cap goes to the package import unread', async () => {
		const big = claimsSize('huge.zip', MAX_DECK_REF_BYTES + 1);
		const odd = claimsSize('huge.docx', MAX_DECK_REF_BYTES + 1);
		const r = await routeByBytes({ zips: [big], rejected: [odd] });
		expect(r.zips).toEqual([big]);
		expect(r.rejected).toEqual([odd]);
		expect(readWhole.has('huge.zip') || readWhole.has('huge.docx')).toBe(false);
	});
});

describe('deckReferenceText — the words on each slide, then its speaker note', () => {
	it('keeps slide text and the note, and drops directives, say and describe lines', async () => {
		const text = await deckReferenceText(SRC, 'Halcyon quarterly');
		expect(text).toBe(['Deck: Halcyon quarterly', 'Slide 1\n# Halcyon quarterly', 'Slide 2\n## Retention held\n\n- 94% of accounts renewed.\nSpeaker notes: Open with the retention number.'].join('\n\n'));
		expect(text).not.toContain('theme:');
		expect(text).not.toContain('_class');
		expect(text).not.toContain('ninety-four');
		expect(text).not.toContain('A bullet list');
	});

	it('is capped like every reference text', async () => {
		const long = Array.from({ length: 2000 }, (_, i) => `## Slide ${i}\n\n${'word '.repeat(10)}`).join('\n\n---\n\n');
		const text = await deckReferenceText(long);
		expect(text.endsWith('…[truncated]')).toBe(true);
		expect(text.length).toBeLessThanOrEqual(40_000 + '\n…[truncated]'.length);
	});
});

describe('readDeckReference — a deck file lands as reference text and keeps its file', () => {
	it('reads a .lattice through the deck importer and keeps the file for "Open as deck"', async () => {
		const f = file(await lattice(), 'halcyon.lattice');
		const r = await readDeckReference(f);
		expect(r.doc).toMatchObject({ name: 'halcyon.lattice', kind: 'text' });
		expect(r.doc.text).toContain('Speaker notes: Open with the retention number.');
		expect(r.doc.bytes).toBe(new TextEncoder().encode(r.doc.text as string).length);
		// A COPY of the bytes, not the picker's own File: that is a handle on a file the device can change or remove.
		expect(r.deck).not.toBe(f);
		expect(await bytesOf(r.deck as Blob)).toEqual(await bytesOf(f));
		expect(r.note).toBeUndefined();
	});

	it('refuses a deck over the Library\'s cap before reading it, and names the way to open it', async () => {
		await expect(readDeckReference(claimsSize('big.lattice', MAX_DECK_REF_BYTES + 1))).rejects.toThrow(/over the 50 MB the Library keeps for one deck\. Open it with Import deck/);
	});

	it('reads a webpage Lattice exported, and an .mdx, as decks; names a webpage that holds none', async () => {
		const html = `<!doctype html><html><head><title>x</title></head><body>${latticeDoc.buildEnvelope({ source: SRC, title: 'Halcyon quarterly' }, { now: 1 })}</body></html>`;
		const page = await readDeckReference(file(html, 'halcyon.html'));
		expect(page.doc.text).toContain('Speaker notes: Open with the retention number.');
		expect(page.deck).not.toBeNull();
		const mdx = await readDeckReference(file('# One\n\n---\n\n# Two', 'talk.mdx'));
		expect(mdx.doc.text).toBe('Slide 1\n# One\n\nSlide 2\n# Two');
		await expect(readDeckReference(file('<!doctype html><p>hi</p>', 'page.html'))).rejects.toThrow(/no Lattice deck inside/);
	});

	it('reads a re-openable PowerPoint as its deck', async () => {
		const pptx = await embedInPptx(await foreignPptx(), new Uint8Array(await (await lattice()).arrayBuffer()));
		const f = file(pptx, 'halcyon.pptx');
		const r = await readDeckReference(f);
		expect(r.doc.text).toContain('Retention held');
		expect(await bytesOf(r.deck as Blob)).toEqual(await bytesOf(f));
	});

	it('keeps a PowerPoint made elsewhere as its own words, with no "Open as deck"', async () => {
		const r = await readDeckReference(file(await foreignPptx(), 'talk.pptx'));
		expect(r.doc.text).toBe('Slide 1\nOpening & agenda\n\nSlide 2\nRevenue grew\nSpeaker notes: Pause on the chart.');
		expect(r.deck).toBeNull();
		expect(r.note).toContain('no editable deck inside');
	});

	it('throws the importer\'s own message for a broken deck', async () => {
		await expect(readDeckReference(file(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9]), 'broken.lattice'))).rejects.toThrow(/not a valid archive/);
	});
});

describe('pptxReferenceText', () => {
	it('orders slides by number, not by name (slide10 after slide9)', async () => {
		const zip = new JSZip();
		for (const n of [10, 9, 1]) zip.file(`ppt/slides/slide${n}.xml`, `<a:p><a:t>S${n}</a:t></a:p>`);
		const text = await pptxReferenceText(file(await zip.generateAsync({ type: 'blob' }), 'x.pptx'));
		expect(text).toBe('Slide 1\nS1\n\nSlide 2\nS9\n\nSlide 3\nS10');
	});

	it('reads an untrusted archive within the zip limits: too many parts is refused before any inflates', async () => {
		const zip = new JSZip();
		for (let n = 1; n <= 2001; n++) zip.file(`ppt/slides/slide${n}.xml`, '<a:p><a:t>x</a:t></a:p>');
		await expect(pptxReferenceText(file(await zip.generateAsync({ type: 'blob' }), 'x.pptx'))).rejects.toThrow(/too large to read as reference text/);
	});

	it('counts only the parts it reads: a PowerPoint with media past the inflate limit is still read', async () => {
		const zip = new JSZip();
		zip.file('ppt/slides/slide1.xml', '<a:p><a:t>Hello</a:t></a:p>');
		// 70 MB of picture, over the 64 MB the read budget allows, never inflated by this reader.
		zip.file('ppt/media/image1.bmp', new Uint8Array(70 * 1_048_576), { compression: 'DEFLATE' });
		const text = await pptxReferenceText(file(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), 'heavy.pptx'));
		expect(text).toBe('Slide 1\nHello');
	});
});

describe('readLibraryReference — a reference file stays one, and gains "Open as deck" where the importer reads it', () => {
	it('keeps a .md as plain reference with no second copy, and marks it openable only when the text is the file', async () => {
		const r = await readLibraryReference(file('# Brief\n\nThree points.', 'brief.md', 'text/markdown'));
		expect(r.doc).toMatchObject({ name: 'brief.md', kind: 'text', text: '# Brief\n\nThree points.' });
		expect(r.deck).toBeNull();
		expect(r.sourceExact).toBe(true);
		// A byte-order mark is dropped when the text is read, so the text is no longer the file: a copy of the file is kept
		// instead, so it still opens as a deck (never turn down a deck).
		const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x41]);
		const bom = await readLibraryReference(file(bomBytes, 'bom.md', 'text/markdown'));
		expect(bom.sourceExact).toBeUndefined();
		expect(new Uint8Array(await (bom.deck as Blob).arrayBuffer())).toEqual(bomBytes);
		// The same when the text was cut at the reference cap: a long Markdown deck keeps its whole file for "Open as deck".
		const longSrc = `# Long\n\n${'x'.repeat(41_000)}`;
		const long = await readLibraryReference(file(longSrc, 'long.md', 'text/markdown'));
		expect(long.sourceExact).toBeUndefined();
		expect(await (long.deck as Blob).text()).toBe(longSrc);
	});

	it('keeps a .txt as plain reference, with no deck', async () => {
		const r = await readLibraryReference(file('notes', 'notes.txt', 'text/plain'));
		expect(r.doc.kind).toBe('text');
		expect(r.deck).toBeNull();
	});

	it('keeps a plain PDF as a PDF reference, with no deck', async () => {
		const r = await readLibraryReference(file(await plainPdf(), 'guide.pdf', 'application/pdf'));
		expect(r.doc.kind).toBe('pdf');
		expect(r.deck).toBeNull();
	});

	it('reads a re-openable PDF as its deck: slide text and notes, and the file kept', async () => {
		const pdf = await embedInPdf(new Blob([(await plainPdf()) as Uint8Array<ArrayBuffer>]), new Uint8Array(await (await lattice()).arrayBuffer()));
		const f = file(pdf, 'halcyon.pdf', 'application/pdf');
		const r = await readLibraryReference(f);
		expect(r.doc.kind).toBe('text');
		expect(r.doc.text).toContain('Speaker notes: Open with the retention number.');
		expect(await bytesOf(r.deck as Blob)).toEqual(await bytesOf(f));
	});

	it('checks a PDF\'s size first: over the deck cap it is refused unread', async () => {
		const pdfHead = new TextEncoder().encode('%PDF-1.7');
		await expect(readLibraryReference(claimsSize('huge.pdf', MAX_DECK_REF_BYTES + 1, pdfHead))).rejects.toThrow(/50\.0 MB\. The Library keeps a reference PDF up to 5 MB and a Lattice deck up to 50 MB/);
	});

	it('keeps the 5 MB reference limit for a PDF that holds no deck', async () => {
		const f = file(await plainPdf(), 'scan.pdf', 'application/pdf');
		Object.defineProperty(f, 'size', { value: 6 * 1024 * 1024 });
		await expect(readLibraryReference(f)).rejects.toThrow(/the limit is 5 MB/);
	});
});
