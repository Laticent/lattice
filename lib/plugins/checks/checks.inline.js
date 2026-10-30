/**
 * THE CHECKS PLUGIN's inline-code kinds (engineering/decisions/2026-10-18-checks.md §12).
 *
 *   `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`      the shortcuts: one check, drawn as a disc
 *   `@check{pass}`                          the full form: the answer, by its id
 *   `@check{yes, label=Residency}`          the answer and a label: a pill holding the check
 *
 * THE ANSWER is one of the six ids (`pass warn fail unknown todo skip`), or one of the spoken words
 * the registry lists beside each (`yes partly no open na`): both spellings are accepted, the ids are
 * canonical (§12 decision 7, confirmed by the owner 2026-10-29). Case does not matter. THE LABEL is a
 * named parameter, never text after a bracket, so a label holding a comma or a bracket is quoted the
 * way any Segno text is (`label="Audit, EU"`) and never collides with the shortcut.
 *
 * Two kinds, because they are two grammars: the shortcut is not a record (a three-character span,
 * exactly), so it keeps the narrow reader that has always dispatched it; the full form is a Segno
 * record, read by this plugin's slot. The host (lib/core/inline-code-directives.js) asks the
 * shortcut row for any span opening with `[`, and reaches the full form only by its name.
 *
 * Both render through the registry and the composer in `shared/`, so a check written either way
 * draws the same disc and, with a label, the same pill a component composes (HARD RULE #1). Pure:
 * no DOM of its own, no fs.
 */
const { compileSlot } = require('../../core/segno-spec.js');
const registry = require('./shared/registry.js');
const { composeHtml, composeElement } = require('./shared/compose.js');

const { CHECKS, parseInlineState, stateHtml, stateElement } = registry;
// The pill's own size words, so a check pill is `sm`, `md` or `lg` exactly as a pill is.
const { SIZES } = require('../pills/pills.inline.js');

/** The full form's slot: the answer first (an id, or a spoken alias), then `label=`. */
const SPEC = Object.freeze({
  label: 'a check',
  positional: [{
    name: 'answer',
    required: true,
    type: {
      type: 'oneOf',
      values: CHECKS.map((c) => c.id),
      aliases: Object.fromEntries(CHECKS.filter((c) => c.aliases.length).map((c) => [c.id, [...c.aliases]])),
    },
  }],
  params: { label: { type: 'text', named: true }, size: { type: 'oneOf', values: [...SIZES] } },
  // The brackets as Segno shortcuts for the same record, so a reader of spellings (docs/src/lib/segno/consistency.ts)
  // sees `[x]` and `@check{pass}` as one value written two ways. The kinds below still read each spelling themselves.
  shortcuts: Object.fromEntries(CHECKS.map((c) => [`[${c.marker}]`, `{${c.id}}`])),
});

let slot = null;
const checkSlot = () => slot || (slot = compileSlot(SPEC));

/** The host hands the named kind its record with the name peeled (`{…}`); lint hands the whole `@check{…}`. */
const record = (text) => (typeof text === 'string' && text.startsWith('@check{') ? text.slice(6) : text);

/**
 * `{answer, label=…, size}` → `{ marker, id, label, size }`, or null when it does not read.
 * @returns {{marker:string, id:string, label:string, size:string|null}|true|null}
 */
function read(text, _off, probe) {
  const t = record(text);
  if (typeof t !== 'string' || t.charCodeAt(0) !== 0x7b /* { */) return null;
  const r = checkSlot().read(t);
  if (!r.ok) return null;
  if (probe) return true;
  const row = CHECKS.find((c) => c.id === r.value.answer);
  return row ? { marker: row.marker, id: row.id, label: String(r.value.label ?? '').trim(), size: r.value.size || null } : null;
}

/**
 * A check with no label is the disc alone; with one, the pill holding it. A size is the pill's (`sm`
 * `md` `lg`); on a disc alone it scales the disc by the pill's own factors (checks.styles.css), so a
 * check reads the same size with or without its words.
 */
function checkHtml(text, off) {
  const c = read(text, off);
  if (!c || c === true) return null;
  if (c.label) return composeHtml(c.marker, c.label, 'pill', { size: c.size });
  const disc = stateHtml(`[${c.marker}]`);
  return c.size && disc ? disc.replace(/^<span /, `<span data-size="${c.size}" `) : disc;
}

function checkElement(doc, text, off) {
  const c = read(text, off);
  if (!c || c === true) return null;
  if (c.label) return composeElement(doc, c.marker, c.label, 'pill', { size: c.size })[0];
  const disc = stateElement(doc, `[${c.marker}]`);
  if (c.size && disc) disc.setAttribute('data-size', c.size);
  return disc;
}

/** Why an attempt does not draw (Segno's own message), or null. */
function diagnose(text) {
  const t = record(text);
  if (typeof t !== 'string' || t.charCodeAt(0) !== 0x7b) return null;
  const r = checkSlot().read(t);
  return r.ok ? null : (r.diagnostics?.[0]?.message || 'not a check');
}

/**
 * What may come next in `@check{…` for the Studio's autocomplete: the six answers while none is
 * written, then `label=`. Each answer carries its meaning, so the menu reads as the six questions.
 * @returns {{ next: string, words: {label: string, axis: string, info: string}[] } | null}
 */
function nextWords(text) {
  const t = record(String(text || ''));
  if (!t.startsWith('{')) return null;
  const body = t.slice(1).replace(/\}$/, '');
  const head = body.split(',')[0].trim().toLowerCase();
  const answered = CHECKS.some((c) => c.id === head || c.aliases.includes(head));
  // Like every kernel's `nextWords`, this answers what comes AFTER the record so far: a whole answer is followed by
  // `label=`. A caller completing the word being typed must check `next` (docs editor-complete.ts does).
  if (!answered && !body.includes(',')) {
    const words = CHECKS.filter((c) => c.id.startsWith(head) || c.aliases.some((a) => a.startsWith(head)))
      .map((c) => ({ label: c.id, axis: 'answer', info: `${c.word} · ${c.meaning}` }));
    return words.length ? { next: 'answer', words } : null;
  }
  if (answered && !/\blabel\s*=/.test(body)) return { next: 'label', words: [{ label: 'label=', axis: 'label', info: 'the words in the pill' }] };
  return null;
}

/**
 * The plugin's inline rows (manifest `contributes.inline`):
 *   state  — the shortcut, `[x]`: a `shortcut` kind (manifest), asked for any span opening with `[`. It is the row the host
 *            carried as its one first-party kind until this plugin took it, and it keeps that name, so
 *            the escape and the diagnostics read as before.
 *   check  — the full form, NAMED ONLY: `@check{…}`. The host peels the name and hands `read` the record;
 *            a bare `{pass}` stays a pill's, so the two kinds can never claim one span.
 */
const inline = Object.freeze({
  // `diagnose` answers null: a span that only LOOKS like a shortcut (`[X]`, `[data-mark]`, `[0]`) is ordinary code, never
  // a broken attempt, so there is nothing to explain and nothing for the escape to strip.
  state: Object.freeze({ resolve: (text, _off, probe) => (probe ? !!parseInlineState(text) : parseInlineState(text)), html: stateHtml, element: stateElement, diagnose: () => null }),
  check: Object.freeze({ resolve: read, html: checkHtml, element: checkElement, diagnose }),
});

module.exports = { inline, read, checkHtml, checkElement, diagnose, nextWords, SPEC };
