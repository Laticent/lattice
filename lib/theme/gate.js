/**
 * Theme Studio — the deterministic GATE for hand-edited theme CSS.
 *
 * The Form-layer sibling of `lib/layout/gate.js`, and NOT a reuse of it. Pure,
 * `fs`-free, dependency-free, so it bundles into the browser core and unit-tests
 * in Node with no fixtures.
 *
 * ── Why this is not `gateCss` ───────────────────────────────────────────────
 *
 * `gateCss` rejects **all 32** shipped themes, and not for one reason — so a
 * theme gate that called it would be red before the author touched anything, on
 * every palette in the catalog. Measured over `themes/`:
 *
 * | rung | on the 19 palettes that declare color | on the 13 `*-dark` wrappers |
 * |---|---|---|
 * | `no-hex` (#3) | 22–194 findings each (`a11y-achromatopsia` 22 … `cuoio` 194) | 0 — they declare nothing |
 * | `scope` | 1–41 each | 1 each — their one `:root` block |
 * | `css-import` | 1 each | 1 each |
 *
 * The first two are not near-misses to be tuned; they are the gate disagreeing
 * with what a theme IS. A palette is hex literals at `:root` — that is the one
 * place in the system where a raw color is the correct thing to write, because
 * `:root` is where the tokens the rest of the system spends come from. And a
 * theme is unscoped by construction: its whole job is to reach every slide.
 *
 * So this gate is COMPOSED from the `find*` primitives rather than layered on
 * `gateCss`, exactly as
 * `engineering/decisions/2026-08-25-hand-editing-generated-assets.md` §Component
 * specifies. What carries over is the SAFETY half — the exfiltration scan — plus
 * a conformance rung `gateCss` has no counterpart for.
 *
 * ── The `@import` allowlist is a security decision, not a convenience ────────
 *
 * `CSS_EXFIL_RULES[0]` bans `@import` unconditionally, which is right for a
 * component (one never needs it) and impossible for a theme (32 of 32 have one,
 * and it is the entire token content of 13). The obvious move — drop the rule for
 * themes — opens a live channel, so this writes an ALLOWLIST instead:
 *
 *   ALLOWED   a bare quoted import of a REGISTERED theme name, nothing after it:
 *             `@import 'lattice';` · `@import "ardesia";`
 *   REJECTED  everything else, by name: `@import url(…)`, a quoted path or URL, a
 *             quoted name that is not registered, an unquoted target, and any
 *             target carrying a `layer()` / `supports()` / media-query tail.
 *
 * The tail matters as much as the target, and that is not a style preference. The
 * engine's two theme-import grammars both END AT THE CLOSING QUOTE —
 * `THEME_IMPORT_RE` (`lib/engine/css.js`) and `THEME_NAME_IMPORT_RE`
 * (`lib/engine/themes.js:45`) — so an import with a tail does not resolve against
 * the registry at all. And what happens to one that does not resolve is the whole
 * point: `ThemeStore.resolveThemeImports` leaves unknown names in place, and
 * `hoistImports` USED TO lift every surviving quoted import to the TOP of the
 * composed sheet, specifically so it survives the "@import must come first" rule.
 * A target the registry did not know was therefore a live fetch, hoisted into
 * first position, in a frame that holds the user's BYOK key (HARD RULE #24).
 *
 * WHAT CHANGED, AND WHY THIS GATE DID NOT SHRINK. `hoistImports` now DROPS a
 * quoted import whose (escape-decoded) target is a bare theme name, so the engine
 * no longer promotes a dangling name into a fetch — for the `.zip` path and every
 * other producer, not just this one. That fixes the root cause one layer down; it
 * does not make this rung redundant, for two reasons. A `url(…)` target and a
 * quoted PATH still hoist, by design, because a theme author may legitimately want
 * one — and those are precisely the targets this gate rejects outright. And the
 * gate's job is to tell the AUTHOR their import will not work, which a silent drop
 * by the engine does not do.
 *
 * What used to make the hazard inert was that theme CSS is never first in the
 * `<style>` — `single-slide-render.ts` and `deck-preview.js` both prepend rules,
 * so CSS ignores the import. That was an accident of concatenation order, gated by
 * nothing, one refactor from being false; it is no longer what the safety rests on.
 *
 * **The registry is an ARGUMENT, not a search** — the same discipline
 * `ThemeStore.add(name, css)` adopted. `knownThemes` defaults to the base theme
 * alone, so a caller that forgets to pass its registry gets the strictest
 * behavior rather than the loosest: the generated template still passes, and
 * every palette-to-palette import is rejected until someone says which palettes
 * exist.
 *
 * ── Conformance, and the two tokens that are not the author's problem ────────
 *
 * `REQUIRED_TOKENS` is the VALIDATOR here and never the emitter (see
 * `serialize.js`). It is applied only to a SELF-CONTAINED theme: a theme that
 * imports a palette inherits that palette's tokens, and indicting it for ~106
 * "missing" names is the false indictment the design note argues against.
 *
 * Two contract names are missing from **every** self-contained shipped palette,
 * all 14 of them: `--on-accent-soft` and `--accent-soft-body`. They are in
 * `REQUIRED_TOKENS` because `deriveTheme` solves them for contrast, but the
 * engine DOES give them a safe default (`lib/base/base.tokens.css:682-683`:
 * `var(--accent)` and `var(--text-body)`), so a theme that omits them renders as
 * intended. Reporting them as errors would fail two thirds of the catalog for
 * writing correct CSS. They are warnings, they are enumerated rather than
 * pattern-matched, and `test/unit/palette/theme-gate.test.js` re-derives the set
 * from the corpus so the list cannot rot into a silent exemption.
 */

const { findCssExfil, findCssImports } = require('../core/css-scan.js');
const { parseTheme, themeRecordView } = require('./parse.js');
const { requiredTokenList } = require('./derive.js');

/**
 * The base theme every palette imports for the engine contract. Importing it is
 * NOT composition — the base supplies no palette tokens (by construction: a token
 * belongs in `REQUIRED_TOKENS` precisely when the engine gives it no `:root`
 * default), so a theme whose only import is `lattice` still owes the full set.
 *
 * PINNED AS A LITERAL rather than imported from `lib/engine/themes.js`, which is
 * not `fs`-free-safe to pull into the browser theme core. The duplication is made
 * safe the way `SEPARATION_FLOOR`'s is: a test reads the literal out of that
 * module's source and asserts the two agree.
 */
const BASE_THEME = 'lattice';

/**
 * THE WHOLE ALLOW PREDICATE, and it is deliberately a copy of the ENGINE's grammar
 * rather than a re-derivation of it.
 *
 * `THEME_NAME_IMPORT_RE` (`lib/engine/themes.js`) is what actually decides whether an
 * import resolves against the theme registry. This is that regex, ANCHORED — so what
 * this gate allows is a strict subset of what the resolver consumes, and the
 * subset relation is the invariant (`test/unit/palette/theme-gate.test.js` re-reads
 * the engine's regex from source and asserts it matches every statement this allows,
 * capturing the same name).
 *
 * IT IS APPLIED TO THE RAW SOURCE BYTES, and that is the correction that matters.
 * The first cut tested a re-derived name grammar (`/^[A-Za-z0-9_-]+$/`) against
 * `findCssImports`'s DECODED target — so `@import '\61 rdesia'` read as the
 * registered theme `ardesia` and passed, while the engine (which matches raw bytes,
 * case-sensitively) left it in place for `hoistImports` to lift into first position
 * of the composed sheet as a live fetch. Measured: `{ok: true, blocked: false}` over
 * a sheet whose composed output began `@import '\61 rdesia';`. `@IMPORT 'ardesia';`
 * reached the same state by the other half of the same mistake — the scan is
 * case-insensitive because browsers are, the resolver is not.
 *
 * So: DETECT with browser semantics (decoded, case-insensitive — `findCssImports`
 * does that), JUDGE with the resolver's (raw, exact). Anything the browser would
 * honor that the resolver would not is, by construction, rejected.
 */
const ENGINE_THEME_IMPORT_RE = /^@import\s*(['"])([A-Za-z0-9_-]+)\1$/;

/**
 * `@theme <name>` — the directive `ThemeStore` reads to learn a sheet's own identity,
 * mirrored here so a SELF-IMPORT can be rejected. Bounded to the head of the sheet
 * exactly as `ThemeStore.add` bounds it, and first-match-wins for the same reason.
 */
const THEME_DIRECTIVE_RE = /@theme\s+([A-Za-z0-9_-]+)/;
const THEME_SCAN_CHARS = 4096;

/**
 * Contract tokens the ENGINE already defaults, so a theme omitting one still
 * renders correctly. Missing → warning, not error. Justification per entry; the
 * corpus test fails on a stale entry as well as a missing one.
 */
const ENGINE_DEFAULTED_TOKENS = Object.freeze({
  'on-accent-soft': 'lib/base/base.tokens.css declares `--on-accent-soft: var(--accent)`; no shipped palette declares it.',
  'accent-soft-body': 'lib/base/base.tokens.css declares `--accent-soft-body: var(--text-body)`; no shipped palette declares it.',
});

/** `{ rule, level, blocking?, line?, message }`, the shape `gateCss` findings use. */
const finding = (rule, level, message, extra = {}) => ({ rule, level, message, ...extra });

/**
 * Gate hand-edited theme CSS.
 *
 * @param {string} css
 * @param {{knownThemes?: Iterable<string>|((name: string) => boolean)}} [opts]
 *   `knownThemes` — WHAT THE LIVE `ThemeStore` HOLDS, not the shipped catalog. The
 *   distinction is the difference between an import that resolves and one that gets
 *   hoisted and fetched: `resolveThemeImports` leaves a name it cannot resolve in
 *   place, and `hoistImports` lifts it to the top of the composed sheet. A host that
 *   passes `themes/*.css` filenames is claiming every palette is registered, which is
 *   false until each has been fetched. Defaults to `[BASE_THEME]` — fail closed. A
 *   PREDICATE is accepted for the same reason, so a host that can answer a harder
 *   question than set membership (registered AND not already in this theme's import
 *   chain) can say so.
 * @returns {{ok: boolean, blocked: boolean, composes: boolean, findings: object[]}}
 *   `ok` ⇔ no error-level finding. `blocked` ⇔ a finding on the SAFETY rung, which
 *   is the signal to pause the CSS out of the preview frame — the
 *   `extraCss={cssBlocked ? '' : css}` pattern at `LayoutStudio.tsx:126`. The two
 *   are separate on purpose: a theme missing a contract token is wrong and still
 *   renders, so it must stay visible while the author fixes it.
 */
function gateThemeCss(css, { knownThemes = [BASE_THEME] } = {}) {
  const findings = [];
  const text = typeof css === 'string' ? css : '';
  if (!text.trim()) {
    return { ok: false, blocked: false, composes: false, findings: [finding('empty-css', 'error', 'the theme stylesheet is empty.')] };
  }

  // ── Safety: every exfil rule EXCEPT the blanket @import ban ────────────────
  for (const e of findCssExfil(text)) {
    if (e.rule === 'css-import') continue; // decided by the allowlist below, per target
    findings.push(finding(e.rule, 'error', e.message, { line: e.line, blocking: true }));
  }

  // ── Safety: the theme-import allowlist ────────────────────────────────────
  const isKnown = typeof knownThemes === 'function'
    ? (n) => !!knownThemes(n)
    : ((set) => (n) => set.has(n))(new Set(knownThemes ?? []));
  // The sheet's own name, so a SELF-IMPORT can be rejected. `resolveThemeImports`
  // breaks a cycle by leaving the import in place, and `hoistImports` then lifts it
  // into first position — so `@import 'probe'` inside `probe` is a live fetch of a
  // registered name that no set-membership check can catch.
  const own = THEME_DIRECTIVE_RE.exec(text.slice(0, THEME_SCAN_CHARS))?.[1] ?? null;
  let composes = false;
  for (const imp of findCssImports(text)) {
    const engine = ENGINE_THEME_IMPORT_RE.exec(imp.raw);
    const name = engine?.[2] ?? null;
    // Intent to INHERIT is read from the grammar, not from the verdict: a theme
    // naming a parent is a composing theme whether or not that parent is
    // registered, and running the conformance rung over it would bury the import
    // error under ~106 phantom missing tokens. Read from the DECODED target too, so
    // an obfuscated `@import '\61 rdesia'` is a rejected import rather than a
    // rejected import that ALSO silences the contract.
    const declaresParent = name ?? (imp.kind === 'string' && /^[A-Za-z0-9_-]+$/.test(imp.target) ? imp.target : null);
    if (declaresParent && declaresParent !== BASE_THEME) composes = true;
    if (name && !imp.tail && name !== own && isKnown(name)) continue;
    findings.push(finding('theme-import', 'error', importMessage(imp, name, own), { line: imp.line, blocking: true }));
  }

  // ── Conformance: the contract, for a self-contained theme only ────────────
  const view = themeRecordView(parseTheme(text));
  if (!composes) {
    const declared = new Set(view.tokens.map(t => t.name));
    for (const name of requiredTokenList()) {
      if (declared.has(name)) continue;
      const why = ENGINE_DEFAULTED_TOKENS[name];
      findings.push(why
        ? finding('token-default', 'warning', `--${name} is not declared. The engine supplies a default, so this renders — but the derivation sets it explicitly. ${why}`)
        : finding('token-missing', 'error', `--${name} is not declared, and the engine gives it no default — a render that reads it gets an invalid value (engineering/decisions/2026-08-10-no-safe-default-token-contract.md).`));
    }
  }

  // ── Advisory: rules outside the theme's root scope ────────────────────────
  // A theme is unscoped by design, so this can never be an error — but the tail is
  // the one part of a theme that paints slides directly rather than through a
  // token, and a `.zip` import (`Library.tsx`) can carry arbitrary CSS there into
  // every export. Naming it is the honest counterpart to the component `scope` rung.
  for (const rule of view.tail) {
    findings.push(finding('non-root-rule', 'warning', `"${firstLine(rule.selector)}" paints slides directly rather than through a token — it reaches every deck this theme is applied to.`));
  }

  return {
    ok: findings.every(f => f.level !== 'error'),
    blocked: findings.some(f => f.blocking),
    composes,
    findings,
  };
}

/**
 * Why one import was rejected — named, so the author knows what to change.
 *
 * Quotes the RAW source bytes, never the decoded reading: telling an author who wrote
 * `\61 rdesia` that `ardesia` was rejected describes a line that is not in their file.
 */
function importMessage(imp, name, own) {
  // The whole statement, at-keyword included, capped — an author who wrote `@IMPORT`
  // or `@imp\ort` needs to see the part that is wrong, and it is not the target.
  const shown = imp.raw.length > 90 ? `${imp.raw.slice(0, 87)}…` : imp.raw;
  const closer = 'An import the engine cannot resolve is hoisted to the top of the composed sheet and fetched as a URL.';
  if (imp.kind === 'url') {
    return `${shown} — url() fetches a remote stylesheet. A theme may import another THEME by name (@import 'ardesia'), nothing else.`;
  }
  if (imp.tail) {
    return `${shown} — a layer()/supports()/media qualifier stops this resolving against the theme registry. Drop the qualifier. ${closer}`;
  }
  if (!name) {
    return `${shown} — only a bare quoted theme name, spelled literally, is allowed (@import 'ardesia'). A path, a URL, an escape (\\61 rdesia), a different case (@IMPORT) or an unquoted target is not something the theme registry will resolve. ${closer}`;
  }
  if (name === own) {
    return `@import '${name}' — a theme cannot import itself. The engine breaks the cycle by leaving the import in place, so it survives into the composed sheet. ${closer}`;
  }
  return `@import '${name}' — no theme by that name is registered here. ${closer}`;
}

/** First line of a selector, for a message — a selector list can be many lines. */
function firstLine(selector) {
  const one = String(selector).split('\n')[0].trim();
  return one.length > 80 ? `${one.slice(0, 77)}…` : one;
}

module.exports = { gateThemeCss, BASE_THEME, ENGINE_THEME_IMPORT_RE, ENGINE_DEFAULTED_TOKENS };
