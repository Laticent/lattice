import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { type PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject, PDFRawStream } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// The exported PDF's pages are pictures of slides. This asks whether they also
// CARRY THEIR WORDS — the thing a picture cannot do: Cmd-F, a text cursor, a screen
// reader. The oracle reads the file the way a reader does, and only that way: it
// decodes each page's content stream, walks every `Tj` string through the font's own
// `/ToUnicode` CMap, and compares what comes out against the copy on that slide.
// Nothing here reaches into the app's own modules, so the whole chain — the DOM
// measurement in the capture frame, the transfer to the worker, the code allocation,
// the CMap — is under test on the real surface.
//
// It is mutation-proof by construction: every slide carries a word no other slide
// has, so a text layer written onto the wrong page fails rather than passing on a
// word count.
test.describe.configure({ timeout: 240_000 });

/** One distinctive word per slide, so a transposed layer cannot pass. */
const MARKERS = ['Zephyr', 'Quartzite', 'Halyard', 'Bellwether'];
const DECK = MARKERS.map(
	(word, i) =>
		`<!-- _class: big-number -->\n\n\`Section ${i + 1}\`\n\n- ${(i + 1) * 11}\n  - ${word} contracts signed across the northern territories.`,
).join('\n\n---\n\n');

/** `/ToUnicode` back into code → character. The bfchar lines are the two-digit ones. */
function parseCMap(text: string) {
	const map = new Map<number, string>();
	for (const [, code, value] of text.matchAll(/<([0-9a-fA-F]{2})>\s*<([0-9a-fA-F]{4,})>/g)) {
		const units = value.match(/.{4}/g) || [];
		map.set(Number.parseInt(code, 16), String.fromCharCode(...units.map((u) => Number.parseInt(u, 16))));
	}
	return map;
}

/** Resolve a reference to the stream it points at. Untyped `lookup` + `instanceof`,
 *  because pdf-lib's typed overload does not accept `PDFRawStream` as a class arg. */
function asStream(doc: PDFDocument, ref: PDFObject | undefined): PDFRawStream {
	const resolved = doc.context.lookup(ref);
	if (!(resolved instanceof PDFRawStream)) throw new Error('expected a PDF stream');
	return resolved;
}

function streamText(stream: PDFRawStream) {
	const filter = stream.dict.get(PDFName.of('Filter'))?.toString();
	const bytes = filter === '/FlateDecode' ? new Uint8Array(inflateSync(Buffer.from(stream.contents))) : stream.contents;
	return new TextDecoder('latin1').decode(bytes);
}

/** Every page's words, plus the render modes its text blocks used. */
async function pageText(bytes: Uint8Array) {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	return doc.getPages().map((page) => {
		const raw = doc.context.lookup(page.node.get(PDFName.of('Contents')));
		const stream = streamText(asStream(doc, raw instanceof PDFRawStream ? raw : (raw as PDFArray).get(0)));
		const fonts = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
		const cmaps = new Map<string, Map<number, string>>();
		for (const [name] of fonts?.entries() || []) {
			const dict = fonts?.lookup(name, PDFDict);
			cmaps.set(name.asString().slice(1), parseCMap(streamText(asStream(doc, dict?.get(PDFName.of('ToUnicode'))))));
		}
		const words: string[] = [];
		const modes = new Set<string>();
		for (const [, body] of stream.matchAll(/BT\n([\s\S]*?)ET\n/g)) {
			const font = /\/(\S+)\s+[\d.]+\s+Tf/.exec(body)?.[1] ?? '';
			const codes = (/<([0-9a-f]*)>\s*Tj/.exec(body)?.[1].match(/../g) || []).map((h) => Number.parseInt(h, 16));
			const cmap = cmaps.get(font);
			modes.add(/(\d)\s+Tr/.exec(body)?.[1] ?? 'none');
			words.push(codes.map((c) => cmap?.get(c) ?? '�').join(''));
		}
		return { words, modes: [...modes] };
	});
}

async function exportPdf(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	const path = await file.path();
	expect(path).toBeTruthy();
	return new Uint8Array(readFileSync(path as string));
}

test('every exported page carries the words on the slide it pictures', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(MARKERS.length);
	const pages = await pageText(await exportPdf(page));
	expect(pages).toHaveLength(MARKERS.length);

	pages.forEach((p, i) => {
		const text = p.words.join(' ');
		// The slide's own copy is there…
		expect(text).toContain(MARKERS[i]);
		expect(text).toContain('contracts');
		expect(text).toContain(String((i + 1) * 11));
		// …and nobody else's is. A layer written onto the wrong page dies here.
		for (const other of MARKERS.filter((m) => m !== MARKERS[i])) expect(text).not.toContain(other);
		// Invisible, always: mode 3 is neither filled nor stroked, which is what lets
		// the words ride over the picture without changing a pixel of it.
		expect(p.modes).toEqual(['3']);
	});

	// The copy reads in order — the run sequence is the DOM's, which is the slide's.
	const first = pages[0].words.join(' ');
	expect(first).toContain('contracts signed across the northern territories.');
});
