/**
 * Theme Studio serializer — a derived token map → a valid `themes/<name>.css`
 * text. Pure, fs-free: it returns the string; writing it to disk (graduation)
 * or registering it via `PG.addThemes([{ name, css }])` (live preview) is the
 * caller's job.
 *
 * The emitted file follows the anatomy in design/theming.md: the `@theme`
 * directive, `@import 'lattice'`, the zero-specificity light
 * default, then grouped `:root` blocks (surfaces/ink/graphical/accent/semantic, the
 * dark-variant band, hljs, categorical, chart-family), and last an EXTRAS block
 * for any name the contract does not know. Tokens not present in the map are
 * simply omitted — derivation guarantees the required set, so a round-trip parse
 * sees every contract token.
 *
 * ── Why the extras block exists ─────────────────────────────────────────────
 *
 * Without it this function is a PROJECTION onto the `REQUIRED_TOKENS` names, not
 * a bijection: `rootBlock` walks a fixed name list, so any key outside it is
 * never visited and a parse → serialize round-trip silently DELETES it. That is
 * not a hypothetical loss — measured across `themes/`, 48 distinct custom
 * properties sit outside the contract, in 19 of the 32 shipped files, and they
 * are load-bearing: `--cat-N-texture` ×12 (the categorical texture channel that
 * carries the categorical distinction for the a11y palettes,
 * `engineering/textures.md`), `--chart-catN-ink` ×8, `--hljs-params` /
 * `--hljs-tag`, the `--brand-*` family.
 *
 * And the loss cascades rather than merely thinning the file. `themes/indaco.css`
 * builds `--spectrum` — which IS in the contract and would survive — out of three
 * `--brand-*` operands that are not. Drop the operands and `--spectrum` resolves
 * invalid, and because it is read bare inside `background:` / `border-image-source:`
 * shorthands it invalidates the whole declaration at computed-value time: the
 * white-on-white divider slide of
 * `engineering/decisions/2026-08-10-no-safe-default-token-contract.md`, reproduced
 * by the round-trip itself.
 *
 * So `REQUIRED_TOKENS` is the VALIDATOR and never the EMITTER. The extras block
 * is what makes that true on the producer side; `parse.js` is the reader that
 * relies on it.
 */

const { REQUIRED_TOKENS, requiredTokenList } = require('./derive.js');

/**
 * Caller text, safe to interpolate into a `/* … *​/` block.
 *
 * `label` and `description` are free text from the Theme Studio, and `description` is
 * MODEL-populated in the normal flow (`Fabricate.tsx` seeds it from the reply), so this
 * is an untrusted string by construction — `name` has always been slug-validated below,
 * these two never were. Two characters end a CSS comment, and everything after them is
 * live CSS in a sheet that is composed straight into a preview frame.
 *
 * Neutralize rather than reject: a description legitimately containing `*​/` should
 * round-trip as readable prose, not throw in the middle of the Studio's derive loop.
 *
 * LOSSLESS, and that is a correction. The first cut DELETED the slash — so
 * `"wrap it in /* … *​/ to hide it"` came back missing a character, and `"a 2*​/3 split"`
 * silently became `"a 2*3 split"`, a changed claim rather than an escaped one. A
 * backslash between the two characters neutralizes the pair just as well and keeps every
 * byte: `\` carries no meaning inside a CSS comment, so `*\/` reads as itself and closes
 * nothing. (Found by a Munger-inversion pass, which also caught this file's own docs
 * claiming the lossless behavior it did not yet have.)
 *
 * TWO THINGS THIS DOES NOT DO, both deliberate, and the second is the important one:
 *
 *   - It does not escape `/*`. CSS comments do not nest, so an opener inside one is
 *     just text.
 *   - **It does not make the emitted sheet safe to put in a `<style>` element.** That
 *     is a different escape (`<​/style`) for a different parser, it does not go through
 *     the comment at all, and it is the one that actually reaches script execution.
 *     It belongs at the frame, where it covers every CSS channel rather than this one
 *     producer — `lib/core/sanitize-style-text.mjs`, HARD RULE #22.
 *
 * Newlines collapse to spaces so a multi-line description cannot break the header's
 * `*`-prefixed shape into something that reads as if the file ended.
 */
function commentSafe(value) {
  let out = '';
  for (const ch of String(value)) {
    // Every C0 control (newline included) plus the Unicode line/paragraph separators
    // becomes a space: the header is one line per field, and a stray control byte in a
    // stylesheet is noise at best.
    const c = ch < ' ' || ch === ' ' || ch === ' ' ? ' ' : ch;
    // Tested against what has ALREADY been emitted, not against the source: the inserted
    // backslash shifts everything after it, so `**//` has to be judged on the output or a
    // later slash pairs with a star the source scan already walked past — the same class
    // of mistake as a naive comment strip.
    if (c === '/' && out.endsWith('*')) out += '\\';
    out += c;
  }
  return out;
}

/** One `--name: value;` line, indented two spaces. */
function decl(map, name) {
  if (map[name] == null) return null;
  return `  --${name}: ${map[name]};`;
}

/** A `:root { … }` block from a list of token names; omits absent tokens. */
function rootBlock(map, names, heading) {
  const lines = names.map(n => decl(map, n)).filter(Boolean);
  if (lines.length === 0) return '';
  const head = heading ? `  /* ${heading} */\n` : '';
  return `:root {\n${head}${lines.join('\n')}\n}`;
}

/**
 * Every name in `map` that no `REQUIRED_TOKENS` section claims, in the map's own
 * insertion order.
 *
 * Order is the map's rather than sorted on purpose: a record read back by
 * `parse.js` carries its tokens in SOURCE order, so preserving insertion is what
 * lets a hand-edited theme re-serialize with its extras where the author left
 * them instead of alphabetized out from under them.
 */
function extraNames(map) {
  const known = new Set(requiredTokenList());
  // Names are VALIDATED, and that is new here. Before the extras block the emitted
  // names were a closed set of 107 constants, so `--${name}:` could not be a
  // injection point; now they are caller-supplied. A key is interpolated straight
  // into the sheet, so one containing `: red; } </style>` would close the
  // declaration, the block and the element. No production caller can reach that
  // today — override keys come from fixed UI lists — but the whole direction of
  // this work is to feed PARSED theme text back through a map, and a parse of
  // half-typed CSS can yield a "property" that is arbitrary text.
  const ident = /^[A-Za-z0-9_-]+$/;
  return Object.keys(map).filter((name) => !known.has(name) && map[name] != null && ident.test(name));
}

/**
 * Serialize a derived token `map` to theme CSS.
 * @param {object} map   flat token map (names without `--`), e.g. deriveTheme()
 * @param {object} opts  { name, label, description }
 * @returns {string} CSS text suitable for `themes/<name>.css`
 */
function serializeTheme(map, { name, label, description } = {}) {
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`theme name must be a lowercase slug, got: ${name}`);
  }
  // `name` is slug-validated above and cannot carry a comment terminator; `title` and
  // `desc` are free text and go into the SAME comment block, so both are neutralized.
  // (#1709 was reported against the description alone — the label sits two lines up in
  // the same `/* … *​/` and is populated from the same model reply.)
  const title = commentSafe(label || name);
  const desc = commentSafe(description || 'Generated by the Lattice Workbench (Theme Studio).');

  const header = `/* @theme ${name}
 *
 * Lattice · ${title}
 * ${'─'.repeat(72)}
 * ${desc}
 *
 * Token-only palette on the Lattice contract (design/theming.md). Surfaces,
 * ink, and accent are light-dark() pairs so the dark variant works from the
 * native color-scheme cascade — no per-variant file required. Every
 * text-bearing token clears WCAG AA on its paired surface in both modes
 * (derived contrast-aware; verify with \`npm run test:palette\`).
 */`;

  const blocks = [
    header,
    "@import 'lattice';",
    '/* Zero-specificity light default — author overrides always win. */\n:where(:root) { color-scheme: light; }',
    rootBlock(map, [...REQUIRED_TOKENS.surfaces, ...REQUIRED_TOKENS.ink, ...REQUIRED_TOKENS.graphical, ...REQUIRED_TOKENS.accent, ...REQUIRED_TOKENS.semantic], 'Surfaces · ink · graphical · accent · semantic signals'),
    rootBlock(map, REQUIRED_TOKENS.dark, 'Dark-variant tokens (section.dark + light-dark() dark sides)'),
    rootBlock(map, REQUIRED_TOKENS.hljs, 'highlight.js syntax'),
    rootBlock(map, [...REQUIRED_TOKENS.categorical, ...REQUIRED_TOKENS.universal], 'Categorical cycle (paired light/dark) + on-canvas ink + structural + alarm'),
    rootBlock(map, REQUIRED_TOKENS.containment, 'Containment tier — nested structural surfaces, their edges and label ink'),
    rootBlock(map, REQUIRED_TOKENS.spectrum, 'Spectrum ribbon (brand bar, divider rail, structural hairline)'),
    rootBlock(map, REQUIRED_TOKENS.sequential, 'Sequential ramp anchor (the other nine stops derive in lattice.css)'),
    rootBlock(map, REQUIRED_TOKENS.chart, 'Chart-family spectrums'),
    // LAST, and its own block, so the contract sections keep their byte layout:
    // a theme carrying no extras is emitted exactly as it was before this
    // existed, and one carrying them gains a block rather than a reshuffle.
    rootBlock(map, extraNames(map), 'Beyond the token contract — preserved as authored'),
  ].filter(Boolean);

  return `${blocks.join('\n\n')}\n`;
}

/**
 * The in-browser asset record for a crafted theme (the `kind:'theme'` shape
 * from the asset note). Pure: shaping only — persisting it (IndexedDB) is the
 * caller's job. Library-scoped by default (`deckId:null`), provenance `studio`.
 * Carries both the serialized `text` (drop-in CSS) and the `essentials` so the
 * studio can load it back for editing.
 *
 * `overrides` and `rampStrategy` ride along for the SAME reason `essentials` does,
 * and their absence used to make that promise false. A theme's CSS is derived from
 * the essentials THROUGH a ramp strategy and then has per-token overrides pinned on
 * top; re-deriving from the essentials alone reproduces neither. So a theme whose
 * author nudged one token, or picked a non-default ramp, reloaded as a DIFFERENT
 * theme from the one they saved — the record kept the right `text` while the editor
 * showed a derivation that no longer produced it. Both are optional: a record
 * written before this, or a theme that used neither, is unchanged.
 */
function themeAsset({ name, label, essentials, css, overrides, rampStrategy } = {}, { id, deckId = null, provenance = 'studio' } = {}) {
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`theme name must be a lowercase slug, got: ${name}`);
  }
  return {
    ...(id ? { id } : {}),
    deckId,
    kind: 'theme',
    name,
    label: label || name,
    text: String(css || ''),
    essentials: essentials || null,
    // Written only when there is something to write, so an untouched theme's record
    // is byte-identical to what it was before these existed.
    ...(overrides && Object.keys(overrides).length ? { overrides } : {}),
    ...(rampStrategy ? { rampStrategy } : {}),
    provenance,
    addedAt: Date.now(),
  };
}

module.exports = { serializeTheme, themeAsset, extraNames };
