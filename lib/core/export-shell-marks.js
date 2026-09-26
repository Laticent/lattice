/**
 * The comment sentinels that bracket the deck sheet inside the export shell's single
 * deck `<style>` — ONE definition, shared by the writer and its only reader.
 *
 * `lattice-emulator.js` emits one stylesheet whose middle is the engine's flat deck sheet
 * for the deck's palette (`lib/export/cli-deck-sheet.js`). `tools/palette-sweep.js`
 * re-themes an already-rendered deck by OVERWRITING that byte range in place with the
 * sheet the same builder composes for another palette, because a palette appended to
 * `<head>` lands at the wrong cascade position and reports numbers that describe no
 * rendered pixel (that tool's header note 1 records what it cost).
 *
 * WHY THE REGION IS THE WHOLE SHEET NOW, NOT THE PALETTE. Until step 4 of the
 * one-style-delivery spine the CLI concatenated `lattice.css` and the palette chain
 * unpacked, so the palette was one contiguous span opened by its own `/* @theme <name>`
 * banner and closed by an explicit end mark. The engine's pack interleaves them — it
 * inlines the base AT the palette's `@import 'lattice'` and strips every comment, the
 * banner included — so there is no palette span left to find. The sweep swaps the whole
 * composed sheet instead, which is also the stronger claim: the swapped bytes are exactly
 * what the CLI would have written for that palette.
 *
 * The START mark carries the deck's `size:` name, because the composed sheet bakes the
 * slide geometry in and the sweep has to compose the replacement for the same box. It also
 * names the palette the sheet was composed for, so the sweep can first check that its own
 * builder reproduces the shipped region byte for byte — a render made with a caller's
 * `--css` layout, say, fails loudly there instead of being scored against the default one.
 *
 * They are plain CSS comments: inert to the cascade, and they survive `sanitizeStyleText`
 * because they contain no `<`. They are NOT optional — `palette-sweep` fails loudly when
 * one is missing rather than falling back to a guess.
 *
 * THEY DO NOT SURVIVE THE `--player` EXPORT, and that is fine. `prunePlayerCss` parses the
 * stylesheet with css-tree, which discards comments. Nothing reads them there — both
 * consumers (`palette-sweep.test.js`, `tools/palette-native.js`) render through the plain
 * emulator — so pointing `palette-sweep` at a player export fails loudly for this reason,
 * not for a real cascade defect.
 */

/** Opens the deck sheet; the full mark is `/* lattice:sheet-start size=<name> theme=<name> *\/`. */
const SHEET_START_MARK = '/* lattice:sheet-start';

/** Closes it. */
const SHEET_END_MARK = '/* lattice:sheet-end */';

/** The opening mark for a deck of `sizeName` (the `size:` directive, or `hd`) in `theme`. */
function sheetStartMark(sizeName, theme) {
  return `${SHEET_START_MARK} size=${sizeName} theme=${theme} */`;
}

/** `{ size, theme }` from the start mark in `text`, or null when it carries no well-formed one. */
function readStartMark(text) {
  const at = text.indexOf(SHEET_START_MARK);
  if (at < 0) return null;
  const m = /^ size=([\w:/.-]+) theme=([\w.-]+) \*\//.exec(text.slice(at + SHEET_START_MARK.length));
  return m ? { size: m[1], theme: m[2] } : null;
}

module.exports = { SHEET_START_MARK, SHEET_END_MARK, sheetStartMark, readStartMark };
