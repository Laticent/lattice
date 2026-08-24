/**
 * The comment sentinels that bracket the palette inside the export shell's single
 * deck `<style>` — ONE definition, shared by the writer and its only reader.
 *
 * `lattice-emulator.js` emits one stylesheet holding the engine bundle and the deck's
 * palette chain, in that order (#1527). `tools/palette-sweep.js` re-themes an
 * already-rendered deck by OVERWRITING the palette's byte range in place, because a
 * palette appended to `<head>` lands at the wrong cascade position and reports numbers
 * that describe no rendered pixel (that tool's header note 1 records what it cost).
 *
 * Overwriting in place needs both ends of the region. The START is the palette's own
 * `/* @theme <name>` banner, which Marp requires of every theme file and all 32 carry.
 * The END used to be the engine bundle's `/* dist/lattice.css` banner, because the
 * palette came FIRST — with the palette last there is no banner after it, and a sweep
 * that guessed the end (the next literal rule in the shell, say) would silently measure
 * a hybrid the moment that rule moved. So the boundary is declared rather than inferred.
 *
 * It is a plain CSS comment: inert to the cascade, and it survives `sanitizeStyleText`
 * because it contains no `<`. It is NOT optional — `palette-sweep` fails loudly when it
 * is missing rather than falling back to a guess.
 *
 * IT DOES NOT SURVIVE THE `--player` EXPORT, and that is fine. `prunePlayerCss` parses the
 * stylesheet with css-tree, which discards comments; `csstree.generate` emits none, so a
 * player export carries none of these three markers. Nothing reads them there — both
 * consumers (`palette-sweep.test.js`, `tools/palette-native.js`) render through the plain
 * emulator — and the OLD markers were equally absent from that path, so this is not
 * something the sentinel changed. Verified on a real `--player` export, all three markers
 * absent. Recorded because the paragraph above otherwise reads as a survival guarantee, and
 * the next person to point `palette-sweep` at a player export deserves to know it will fail
 * loudly for this reason rather than a real cascade defect.
 */

/** Closes the palette region in the export shell's deck stylesheet. */
const PALETTE_END_MARK = '/* lattice:palette-end */';

/** Opens it — every `themes/*.css` file's Marp banner. */
const PALETTE_START_MARK = '/* @theme ';

/** Opens the engine bundle `tools/build-css.js` generates. */
const BASE_MARK = '/* dist/lattice.css';

module.exports = { PALETTE_END_MARK, PALETTE_START_MARK, BASE_MARK };
