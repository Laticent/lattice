// @vitest-environment node
// Node, not jsdom: jsdom's Blob has no `arrayBuffer()` / `stream()`, and the browser this
// runs in for real has both. Nothing here needs a DOM.
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import latticeDoc from '../../../../lib/core/lattice-doc.js';
import { NO_SOURCE_PDF, NO_SOURCE_PPTX, readDeckFile, sniffDeckFile } from './deck-import';
import { EMBED_FILENAME, embedInPdf, embedInPptx, extractFromPdf, inflateCapped, PPTX_EMBED_PART, PPTX_EMBED_REL } from './embedded-source';
import { exportLatticeBlob } from './lattice-file';

// A deck that would break a careless carrier: CRLF, a `</script>`, a `%%EOF`, non-ASCII.
const SRC = '---\ntheme: indaco\n---\n\n# Q3 — revue\n\n```html\n</script>%%EOF\n```\n\n<!-- notes: say the number -->\n\n---\n\n# Two\r\n';

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const file = (b: Blob | Uint8Array | string, name: string) => new File([b as BlobPart], name);

async function payload(comments = []) {
	return bytesOf(await exportLatticeBlob(SRC, 'Q3 review', comments, 7));
}

async function plainPdf(): Promise<Blob> {
	const doc = await PDFDocument.create();
	doc.addPage([960, 540]);
	doc.setTitle('Q3 review');
	return new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** The smallest package that reads as a PowerPoint: the OPC root parts + one `ppt/` part. */
async function plainPptx(): Promise<Blob> {
	const zip = new JSZip();
	zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
	zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
	return zip.generateAsync({ type: 'blob' });
}

describe('sniffDeckFile — the bytes decide, the name only breaks a tie', () => {
	const enc = (s: string) => new TextEncoder().encode(s);
	it('reads each format from its head', () => {
		expect(sniffDeckFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0]), 'x.pptx')).toBe('zip');
		expect(sniffDeckFile(enc('%PDF-1.7\n'), 'deck.download')).toBe('pdf');
		expect(sniffDeckFile(enc('﻿  <!DOCTYPE html><html>'), 'deck')).toBe('html');
		expect(sniffDeckFile(enc('# Title\n'), 'deck.md')).toBe('markdown');
	});
	it('a deck that MENTIONS %PDF- is still a deck; a PDF with junk in front still opens when named .pdf', () => {
		expect(sniffDeckFile(enc('# File formats\n\nA PDF begins with `%PDF-1.7`.\n'), 'formats.md')).toBe('markdown');
		expect(sniffDeckFile(enc('\r\n\r\n%PDF-1.4\n'), 'scan.pdf')).toBe('pdf');
	});
	it('UTF-16 text is text, not a binary — its NULs are the encoding', () => {
		const le = new Uint8Array([0xff, 0xfe, 0x23, 0, 0x20, 0, 0x48, 0]);
		expect(sniffDeckFile(le, 'notepad.md')).toBe('markdown');
	});
	it('refuses a binary it does not open, rather than handing it to the editor', () => {
		expect(sniffDeckFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'slide.png')).toBeNull();
	});
});

describe('readDeckFile — every format ends in the same import shape', () => {
	it('a .lattice opens with its comments', async () => {
		const c = [{ id: 'a', slide: 1, author: 'Ada', body: 'note', createdAt: 1, resolved: false }];
		const got = await readDeckFile(file(await exportLatticeBlob(SRC, 'Q3 review', c as never, 7), 'deck.lattice'));
		expect(got.source).toBe(SRC);
		expect(got.title).toBe('Q3 review');
		expect(got.comments).toHaveLength(1);
	});

	it('Markdown comes back byte-for-byte (line endings are the funnel’s job, not the reader’s)', async () => {
		const got = await readDeckFile(file(SRC, 'deck.md'));
		expect(got).toMatchObject({ source: SRC, title: '', comments: [] });
	});

	it('UTF-16 Markdown (Notepad’s "Unicode" save) opens as readable text', async () => {
		const body = '# Hallo — Grüße\n';
		const le = new Uint8Array(2 + body.length * 2);
		le.set([0xff, 0xfe]);
		for (let i = 0; i < body.length; i++) {
			le[2 + i * 2] = body.charCodeAt(i) & 0xff;
			le[3 + i * 2] = body.charCodeAt(i) >> 8;
		}
		expect((await readDeckFile(file(le, 'notepad.md'))).source).toBe(body);
	});

	it('a webpage export opens from its envelope', async () => {
		const html = `<!doctype html><html><head><title>x</title></head><body>${latticeDoc.buildEnvelope({ source: SRC, title: 'Q3 review' }, { now: 1 })}</body></html>`;
		const got = await readDeckFile(file(html, 'deck.html'));
		expect(got.source).toBe(SRC);
		expect(got.title).toBe('Q3 review');
	});

	it('a webpage with no envelope says so', async () => {
		await expect(readDeckFile(file('<!doctype html><p>hi</p>', 'page.html'))).rejects.toThrow(/no Lattice deck inside/);
	});

	it('a re-openable PDF round-trips the source exactly', async () => {
		const pdf = await embedInPdf(await plainPdf(), await payload());
		const got = await readDeckFile(file(pdf, 'Q3 review.pdf'));
		expect(got.source).toBe(SRC);
		expect(got.title).toBe('Q3 review');
		expect(got.comments).toEqual([]);
	});

	it('embedding keeps the PDF’s own metadata and pages', async () => {
		const pdf = await embedInPdf(await plainPdf(), await payload());
		const doc = await PDFDocument.load(await bytesOf(pdf), { updateMetadata: false });
		expect(doc.getTitle()).toBe('Q3 review');
		expect(doc.getPageCount()).toBe(1);
	});

	it('a PDF without a payload is refused with the way forward — never scraped', async () => {
		await expect(readDeckFile(file(await plainPdf(), 'board.pdf'))).rejects.toThrow(NO_SOURCE_PDF);
	});

	it('a PDF attachment with another name is not mistaken for the deck', async () => {
		const doc = await PDFDocument.load(await bytesOf(await plainPdf()));
		await doc.attach(await payload(), 'other.lattice', { mimeType: 'application/zip' });
		const pdf = new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>]);
		expect(await extractFromPdf(pdf)).toBeNull();
		expect(EMBED_FILENAME).toBe('deck.lattice');
	});

	it('a re-openable PowerPoint round-trips, and its package stays well-formed', async () => {
		const pptx = await embedInPptx(await plainPptx(), await payload());
		const got = await readDeckFile(file(pptx, 'Q3 review.pptx'));
		expect(got.source).toBe(SRC);
		const zip = await JSZip.loadAsync(await bytesOf(pptx));
		expect(zip.file(PPTX_EMBED_PART)).not.toBeNull();
		// A part, not a directory: OPC has none, and a strict reader flags a folder entry.
		// (The fixture's own `_rels/` and `ppt/` folders are JSZip's, not the embed's.)
		expect(zip.files['lattice/']).toBeUndefined();
		expect(await zip.file('[Content_Types].xml')!.async('string')).toMatch(/<Default Extension="lattice" ContentType="application\/vnd\.lattice\+zip"\/><\/Types>$/);
		const rels = await zip.file('_rels/.rels')!.async('string');
		expect(rels).toContain(`Type="${PPTX_EMBED_REL}" Target="${PPTX_EMBED_PART}"`);
		// The original relationship survives, and ids do not collide.
		expect(rels).toContain('Id="rId1"');
		expect(rels).toContain('Id="rIdLattice1"');
	});

	it('embedding twice does not stack a second relationship', async () => {
		const once = await embedInPptx(await plainPptx(), await payload());
		const twice = await embedInPptx(once, await payload());
		const rels = await (await JSZip.loadAsync(await bytesOf(twice))).file('_rels/.rels')!.async('string');
		expect(rels.split(PPTX_EMBED_REL).length - 1).toBe(1);
	});

	it('a PowerPoint without a payload is refused with the way forward', async () => {
		await expect(readDeckFile(file(await plainPptx(), 'board.pptx'))).rejects.toThrow(NO_SOURCE_PPTX);
	});

	it('a zip that is neither is refused for what it is', async () => {
		const zip = new JSZip();
		zip.file('photo.txt', 'hi');
		await expect(readDeckFile(file(await zip.generateAsync({ type: 'blob' }), 'x.zip'))).rejects.toThrow(/not a Lattice deck/);
	});

	it('an image is refused, not opened as Markdown', async () => {
		await expect(readDeckFile(file(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), 'x.png'))).rejects.toThrow(/can’t open that kind of file/);
	});
});

describe('the inflate cap — a PDF stream is untrusted', () => {
	it('stops a deflate bomb at the cap instead of inflating it whole', async () => {
		const zeros = new Uint8Array(4 * 1024 * 1024);
		const deflated = await bytesOf(await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate'))).blob());
		expect(deflated.byteLength).toBeLessThan(64 * 1024);
		await expect(inflateCapped(deflated, 1024 * 1024)).rejects.toThrow(/too large/);
		expect((await inflateCapped(deflated, zeros.byteLength)).byteLength).toBe(zeros.byteLength);
	});
});
