// jsPDF's `processPNG`, callable on its own: what pdf-image-worker.js runs per page, and what its test holds to the
// main thread's result. It reads only jsPDF's shared image plug-in state, never a document's pages.
import { jsPDF } from 'jspdf';

let doc = null;

/** jsPDF's image object for `bytes` (a PNG) at `compression`, with a placeholder index and alias the caller replaces. */
export function processPng(bytes, compression) {
	doc ??= new jsPDF();
	return doc.processPNG(bytes, 0, 'pooled', compression);
}
