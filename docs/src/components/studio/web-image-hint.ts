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
const WEB = String.raw`\s*["'<]?\s*(?:https?:|\/\/)`;
const WEB_IMAGE_HINT = new RegExp(
	[String.raw`!\[[^\]]*\]\(`, String.raw`^\s*\[[^\]]+\]:`, String.raw`\b(?:src|srcset|poster|background|xlink:href)\s*=`, String.raw`<image\b[^>]*\bhref\s*=`, String.raw`\burl\(`, String.raw`\bimage-set\(`, String.raw`\bimg\s*:`]
		.map((p) => `(?:${p})${WEB}`)
		.join('|'),
	'im',
);

export function mayReferenceWebImage(source: string): boolean {
	return !!source && WEB_IMAGE_HINT.test(source);
}
