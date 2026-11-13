/**
 * lib/core/resolve-agenda.js — the deck front-matter `agenda:` register: how the deck's agendas
 * look, and whether an agenda the engine FILLED gets page numbers. One word per axis, the
 * `progress-rail:` shape:
 *
 *   agenda: ledger pages      the default, the same as leaving the key out
 *   agenda: circles           every agenda draws as circles, filled ones with page numbers
 *   agenda: checks no-pages   every agenda draws as checks, filled ones without page numbers
 *
 * WHAT IT REACHES. The STYLE axis reaches every agenda slide that does not name a style of its own
 * (`circles`, `checks`, or `agenda-ledger` to keep the ledger on a deck that set another). The
 * PAGES axis reaches only an agenda the engine filled (lib/core/agenda-autofill.js): an agenda the
 * author wrote is theirs, page references and all, and the deck setting never edits it (the
 * owner's ruling, 2026-11-08).
 *
 * APPLIED AT THE SOURCE, NOT STAMPED ON EVERY SLIDE. Every other axis register stamps
 * `<key>-<word>` on every slide (lib/core/register-factory.js) and lets the CSS read it. This one
 * does not join AXIS_REGISTERS: a deck-wide `agenda-pages` would reach the authored agendas the
 * pages axis must leave alone, and the agenda's styles are the bare `circles` / `checks` words a
 * slide already writes. So the fill kernel resolves the register per agenda slide and writes the
 * answer onto that slide's own `_class` directive, where the engine, the runtime and an
 * Export-to-Marp bundle all read it alike. The factory still supplies the parse, the words and the
 * tokens, so the linter, the editor's completion and the Inspector read the same vocabulary.
 *
 * Design: engineering/decisions/2026-11-08-agenda-styles-and-autofill.md § The `agenda:` register.
 */

const { makeRegister } = require('./register-factory');

const STYLES = Object.freeze(['ledger', 'circles', 'checks']);
const PAGES = Object.freeze(['pages', 'no-pages']);

const REGISTER = makeRegister('agenda', [
  { axis: 'style', names: STYLES },
  // `agenda-pages` / `agenda-no-pages`: words, not an on/off switch, so the line reads as English.
  { axis: 'pages', names: PAGES },
]);

/** The style class a slide writes for each style word: the ledger is the default and has none. */
const STYLE_CLASS = Object.freeze({ ledger: '', circles: 'circles', checks: 'checks' });

/**
 * The deck's `agenda:` resolved from a front-matter BODY: `{ style, pages }`, each axis's default
 * (`ledger`, `pages`) where the line says nothing or there is no line.
 */
function agendaSettings(fm) {
  const p = REGISTER.parse(REGISTER.read(String(fm || '')) || '');
  return { style: p.style || STYLES[0], pages: (p.pages || PAGES[0]) === 'pages' };
}

module.exports = { AGENDA_REGISTER: REGISTER, AGENDA_STYLES: STYLES, AGENDA_PAGES: PAGES, AGENDA_STYLE_CLASS: STYLE_CLASS, agendaSettings };
