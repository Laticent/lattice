/**
 * css-closed-string — is a string token, as written, a valid CSS string?
 *
 * Closed by its quote, or by the end of the text (`atEnd`), which CSS accepts: a style attribute's
 * `image-set("a.png` or `url("a.png` is fetched. A string a newline ends is a BAD string, and the browser drops its
 * declaration, so an embedder must not read it. The two exports read it before they embed a string span that
 * `cssRefSpans` reports (lib/export/html-player.js, lib/export/inline-url-media.mjs). It lives here and not in
 * lib/core/css-ref-reader.js because that reader is eager on three docs-site routes that never embed a picture.
 * Requires nothing.
 * @param {string} raw the string span as written, quote included
 * @param {boolean} atEnd the span reaches the end of the text
 */
function isClosedString(raw, atEnd) {
	// A bad string stops BEFORE its newline, so a span that reaches the end of the text was ended by the end.
	if (atEnd) return true;
	const q = raw[0];
	if (raw.length < 2 || raw[raw.length - 1] !== q) return false;
	let slashes = 0;
	for (let k = raw.length - 2; k > 0 && raw[k] === '\\'; k--) slashes++;
	return slashes % 2 === 0;
}

module.exports = { isClosedString };
