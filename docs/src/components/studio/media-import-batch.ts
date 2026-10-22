// The photo import loop, shared by the Library (Library.tsx `importPicked`) and the photo picker
// (PhotoPicker.tsx), so a photo added from either lands through the same checks: classify, decode and
// re-encode to the chosen format, name it against the shelf and against its own batch, save it.
// A failure costs that file, never the batch. followups.d/2846-p3.

import { classifyMedia, importImage, MediaImportError, type PhotoFormat, uniqueName } from './media-import';
import { listMedia, MEDIA_REFUSAL_PREFIX, namesOf, saveMedia } from './media-store';

export interface PhotoBatchResult {
	/** The names the saved photos took, in the order the files were given. */
	saved: string[];
	/** One line per photo whose wanted name was taken, saying the name it got instead. */
	renamed: string[];
	/** One line per file that could not be added, in words a person can act on. */
	failed: string[];
	/** How many saved photos arrived with a description in the file. */
	described: number;
}

export async function importPhotoBatch(files: File[], scope: string, format: PhotoFormat): Promise<PhotoBatchResult> {
	const taken = new Set((await listMedia()).flatMap(namesOf));
	const out: PhotoBatchResult = { saved: [], renamed: [], failed: [], described: 0 };
	for (const file of files) {
		try {
			if (classifyMedia(file) !== 'image') throw new MediaImportError(`${file.name} isn't an image.`);
			const rec = await importImage(file, scope, format);
			const wanted = rec.name;
			rec.name = uniqueName(rec.name, taken);
			if (rec.name !== wanted) out.renamed.push(`“${wanted}” was taken, so ${file.name} is “${rec.name}”`);
			await saveMedia(rec, Date.now());
			taken.add(rec.name);
			out.saved.push(rec.name);
			if (rec.fileCaption) out.described++;
		} catch (e) {
			// The person is told by the caller; the cause goes to the console for whoever has to debug a browser
			// that refuses (a private window, a full quota, an engine that cannot store a Blob).
			console.warn('lattice: could not add an image', file.name, e);
			const msg = String((e as Error)?.message ?? '');
			out.failed.push(e instanceof MediaImportError || msg.startsWith(MEDIA_REFUSAL_PREFIX) ? msg : `${file.name}: could not be added.`);
		}
	}
	return out;
}
