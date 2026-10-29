// Could this deck source reference a WEB image at all? The cheap pre-check before the Studio
// renders a whole deck to count its web images (web-images.ts), kept in its own tiny module so
// the Studio's eager bundle carries it without the scanner.
//
// Image-SHAPED contexts only: a markdown image `![…](…)`, a reference definition, an HTML
// attribute that fetches (`src`, `srcset`, `poster`, `background`, an SVG image's `href`), a CSS
// `url(…)` or `image-set(…)`, and a Mermaid `img:` shape, each followed by `http:`, `https:` or
// `//`. An ordinary link or a `//` code comment no longer costs a whole-deck render on every pause
// in typing. A miss here hides the strip, and with it the reader's only way to load the image:
// the placeholder and the policy still apply. A video's `poster="https://…"` word, inside its
// `@video{…}` record, is matched by the `poster=` attribute pattern below (the bullet form it replaced, written
// AFTER its address, is gone).
//
// One context is not an image: a Mermaid `click A href "https://…"` (or `click A "https://…"`). The
// scanner counts its address all the same (`blockWebImages` reports it as a `diagram` ref), so the
// strip must count it too; without this pattern a deck whose only web reference was such a link got
// no strip, and no "Load" for an address the scanner had refused (found driving the click in the
// Reading view, followups 2909-p5). The rule is the scanner's set, not "images": every address it
// refuses has to wake the count. Odd spellings (entity codes) still miss this cheap pre-check.
const WEB = String.raw`\s*["'<]?\s*(?:https?:|\/\/)`;
const WEB_IMAGE_HINT = new RegExp(
	[String.raw`!\[[^\]]*\]\(`, String.raw`^\s*\[[^\]]+\]:`, String.raw`\b(?:src|srcset|poster|background|xlink:href)\s*=`, String.raw`<image\b[^>]*\bhref\s*=`, String.raw`\burl\(`, String.raw`\bimage-set\(`, String.raw`\bimg\s*:`, String.raw`\bclick\s+[^\s"']+\s+(?:href\s+)?`]
		.map((p) => `(?:${p})${WEB}`)
		.join('|'),
	'im',
);

export function mayReferenceWebImage(source: string): boolean {
	return !!source && WEB_IMAGE_HINT.test(source);
}
