// Trigger a client-side download for a Blob. Browser-only; a no-op-safe guard keeps
// it from throwing in a non-DOM environment (tests).
export function downloadBlob(filename: string, blob: Blob): void {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

// Trigger a client-side file download for a text blob (the Share "hand off the
// source" path).
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
