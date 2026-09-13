/**
 * Built-in names for the `logo:` front-matter register.
 *
 * WHY A NAME AND NOT A PATH. `logo:` takes a path, and a path only means something
 * where the deck FILE is. The CLI resolves it against the `.md`; the web cannot,
 * because there is no file — so `logo: ../lib/base/_logo/lattice-mark-min.svg` is
 * correct in one surface and a 404 in the Playground and the Studio, where it also
 * takes the PDF export down with it (html-to-image rejects on the failed load). A
 * NAME has no such problem: it resolves to the same bytes everywhere, including an
 * exported `.html` opened offline and a phone with no route back to this repo.
 *
 * WHY THE SVG IS INLINED HERE. This kernel is shared with the browser bundle, which
 * has no filesystem, and the mark is 1.3 KB — small enough that a `data:` URI costs
 * nothing and buys independence from any server. The copy below is byte-for-byte the
 * contents of `lib/base/_logo/lattice-mark-min.svg` and
 * `test/unit/core/logo-builtins.test.js` fails if the two ever part, so there is one
 * source of truth in practice even though the bytes appear twice.
 *
 * WHY ONLY `lattice`. The other mark in that directory is `acme-logo.svg`, which is
 * the stand-in for YOUR brand in the demo decks. Making it a built-in would teach
 * that an author's own logo resolves everywhere, which is exactly what it cannot do.
 * A deck that wants its own mark points at a URL the viewer can fetch.
 */

/** `lib/base/_logo/lattice-mark-min.svg`, verbatim. Do not edit here — edit the file
 *  and re-run the drift test, which prints the replacement. */
const LATTICE_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none"><style>.bond{stroke:#003D66}.halo{fill:#FAF7F2}@media(prefers-color-scheme:dark){.bond{stroke:#4FA8DA}.halo{fill:#15110D}}</style><g transform="rotate(45 64 64)" stroke-linecap="round"><line x1="31" y1="31" x2="97" y2="31" stroke="#003D66" class="bond" stroke-width="6.4"/><line x1="97" y1="31" x2="97" y2="97" stroke="#003D66" class="bond" stroke-width="6.4"/><line x1="97" y1="97" x2="31" y2="97" stroke="#003D66" class="bond" stroke-width="6.4"/><line x1="31" y1="97" x2="31" y2="31" stroke="#003D66" class="bond" stroke-width="6.4"/></g><circle cx="64.0" cy="17.3" r="12.7" fill="#FAF7F2" class="halo"/><circle cx="64.0" cy="17.3" r="11.0" fill="#5B86B8"/><circle cx="110.7" cy="64.0" r="12.7" fill="#FAF7F2" class="halo"/><circle cx="110.7" cy="64.0" r="11.0" fill="#A8628A"/><circle cx="64.0" cy="110.7" r="12.7" fill="#FAF7F2" class="halo"/><circle cx="64.0" cy="110.7" r="11.0" fill="#D08C42"/><circle cx="17.3" cy="64.0" r="12.7" fill="#FAF7F2" class="halo"/><circle cx="17.3" cy="64.0" r="11.0" fill="#7B72C0"/><circle cx="64.0" cy="64.0" r="16.2" fill="#FAF7F2" class="halo"/><circle cx="64.0" cy="64.0" r="14.0" fill="#C8A040"/><circle cx="64.0" cy="64.0" r="10.4" fill="none" stroke="#7A5A10" stroke-width="1.5" opacity="0.55"/></svg>`;

/** An SVG source string as a `data:` URI an `<img src>` can load anywhere.
 *  `encodeURIComponent` over the whole document rather than a hand-picked character
 *  set: the mark is small, and a missed character here is a broken image on a surface
 *  nobody re-tests. (Script inside an SVG loaded through `<img>` does not run, so the
 *  inlined document cannot execute — HARD RULE #22.) */
function svgDataUri(svg) {
  return `data:image/svg+xml,${encodeURIComponent(String(svg).trim())}`;
}

/** name → the SVG it stands for. Lower-case keys; `resolveLogoRef` lower-cases. */
const BUILTIN_LOGOS = { lattice: LATTICE_MARK_SVG };

/**
 * Resolve a `logo:` value: a built-in NAME becomes a data URI, anything else is
 * returned untouched (a URL, a path, an already-inlined data URI).
 *
 * @param {string|null|undefined} value the sanitized front-matter scalar
 * @returns {string|null|undefined} the value a render path should use as `src`
 */
function resolveLogoRef(value) {
  if (typeof value !== 'string') return value;
  const name = value.trim().toLowerCase();
  return  Object.hasOwn(BUILTIN_LOGOS, name) ? svgDataUri(BUILTIN_LOGOS[name]) : value;
}

module.exports = { BUILTIN_LOGOS, LATTICE_MARK_SVG, resolveLogoRef, svgDataUri };
