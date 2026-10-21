// The starting alt text for a Library photo, shared by the Markdown editor's completion (editor-complete.ts) and Compose's
// photo picker (components/studio/ComposeView.tsx). Its own module so neither editor pulls the other's dependencies in.

/** `team-photo` → `Team photo`: a starting alt text the author is expected to replace. */
export function altFromAssetName(name: string): string {
	const words = name.replace(/[-_]+/g, ' ').trim();
	return words ? words[0].toUpperCase() + words.slice(1) : 'Photo';
}
