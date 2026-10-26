// The live preview announces which slide it has just drawn (a full-deck chunk index), so a surface that builds something
// from the frame can rebuild it once the frame shows the slide the author is on. The editor's `thin-card-no-ink` tooltip
// reads the photo from the frame and is the one listener today.
export const PREVIEW_RENDER_EVENT = 'lattice:preview-render';

export function announcePreviewRender(unit: number | undefined): void {
	if (unit !== undefined) window.dispatchEvent(new CustomEvent<{ unit: number }>(PREVIEW_RENDER_EVENT, { detail: { unit } }));
}
