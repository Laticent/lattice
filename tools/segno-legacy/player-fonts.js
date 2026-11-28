/**
 * player-fonts.js — the `@font-face` readers of lib/export/player-fonts.js as they were before Segno P5b read them with
 * the one CSS tokenizer: `FACE`, `DATA_URI` and `faceClass`'s family read.
 *
 * Frozen verbatim from lib/export/player-fonts.js at 893ade75. It is the ORACLE for
 * test/unit/export/player-fonts-differential.test.js. Nothing in lib/ may read it. Do not fix bugs here. Delete it when
 * nobody reads it.
 */
const FACE = /@font-face\s*\{[^}]*\}/g;
const DATA_URI = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;

/** The family the old `faceClass` read, lower case. */
function faceFamily(face) {
	const m = face.match(/font-family\s*:\s*['"]?([^;'"}]+)/i);
	return (m ? m[1] : '').trim().toLowerCase();
}

/** Each face the old walk found, with its family and its woff2 payloads, in order. */
const faces = (css) => [...css.matchAll(FACE)].map((m) => ({ text: m[0], family: faceFamily(m[0]), payloads: [...m[0].matchAll(DATA_URI)].map((d) => d[1]) }));

module.exports = { FACE, DATA_URI, faceFamily, faces };
