/**
 * The `@theme <name>` directive — a theme stylesheet's identity projection
 * (engineering/decisions/2026-08-16-theme-identity-ownership.md §4).
 *
 * Split out of parse.js so the package spine (lib/packages/) can read and rewrite a
 * theme's directive without pulling in the whole derivation stack that parse.js
 * requires. parse.js re-exports both functions, so its API is unchanged.
 *
 * Pure, dependency-free.
 */

/**
 * The name a stylesheet's `@theme` directive declares, or null. Bounded and
 * first-match-wins exactly as `renameThemeDirective` below and `ThemeStore.add`
 * are, so the three agree on which directive a sheet has. The package spine
 * (lib/packages/read.js) reads it to check the `@theme` projection of a theme's name.
 */
function themeDirectiveName(css) {
  const m = /@theme\s+([A-Za-z0-9_-]+)/.exec(String(css ?? '').slice(0, THEME_SCAN_CHARS));
  return m ? m[1] : null;
}

/**
 * Rewrite the `@theme <name>` directive in place, changing NOTHING else.
 *
 * A hand-edited theme is saved as the author's own bytes — that is the product
 * claim — but the stylesheet's `@theme` directive is its IDENTITY, and the Studio
 * lets the author rename the theme after they have edited the CSS. The two have to
 * agree: `ThemeStore.add(name, css)` takes identity as an argument, but the legacy
 * one-argument form and every graduated `themes/<name>.css` read it back out of the
 * directive, and a file whose header says one thing while its record says another is
 * a trap laid for the next reader.
 *
 * So this is the ONE byte-level exception to "save what the author typed", it is
 * confined to a single token, and it happens only when the name actually differs.
 * Bounded to the head of the sheet and first-match-wins, exactly as `ThemeStore.add`
 * bounds its own scan — otherwise a theme whose free-text description mentions
 * `@theme something` could steer the rename.
 *
 * A sheet with NO directive is returned untouched: identity is the caller's argument
 * there, and inventing a header would be a bigger edit than the rename it replaces.
 */
function renameThemeDirective(css, name) {
  const text = String(css ?? '');
  if (!/^[a-z][a-z0-9-]*$/.test(String(name ?? ''))) return text;
  const head = text.slice(0, THEME_SCAN_CHARS);
  const m = /@theme\s+([A-Za-z0-9_-]+)/.exec(head);
  if (!m || m[1] === name) return text;
  // A match that ENDS at the slice boundary may be a truncated name — the file has
  // more name characters the slice cannot see, and splicing over only the visible
  // part writes a directive that is neither the old name nor the new one
  // (`@theme abcdefghijklmnop` + `harbor` → `@theme harborjklmnop`). That is the
  // record-says-one-thing / CSS-says-another mismatch `saveStudioTheme` calls "a
  // blank, unthemed render", produced by the one function that promises to touch a
  // single token. Reachable with ~4 KB of preamble, e.g. a pasted license header.
  // Leave it alone: identity is the caller's argument anyway.
  if (m.index + m[0].length === head.length && text.length > THEME_SCAN_CHARS) return text;
  const at = m.index + m[0].length - m[1].length;
  return text.slice(0, at) + name + text.slice(at + m[1].length);
}

/**
 * How far into a stylesheet the `@theme` directive is looked for, in UTF-16 code
 * units. Mirrors `THEME_SCAN_CHARS` in `lib/engine/themes.js` — the directive is a
 * header comment by construction (byte 3 of a palette), so this covers every real
 * sheet and bounds the miss.
 */
const THEME_SCAN_CHARS = 4096;

module.exports = { THEME_SCAN_CHARS, themeDirectiveName, renameThemeDirective };
