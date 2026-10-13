// The grammar of a Library asset name — `asset:<name>` in a deck. One tiny module so a prompt
// builder can check a name without importing the media store (IndexedDB and all).

/** One path segment of plain characters, so a name can never carry `..` or a scheme. */
export const NAME_OK = /^[a-z0-9][a-z0-9_-]*$/;

/** Is this a name a deck can write as `asset:<name>`? */
export function isMediaName(name: string): boolean {
	return NAME_OK.test(name);
}
