/**
 * notes-core — the pure, browser-safe presenter-notes extractor.
 *
 * LFM treats a non-directive HTML comment on a slide as that slide's speaker
 * note (Marp-faithful). This module is the SINGLE SOURCE for *what counts as a
 * note* — the note/non-note boundary — which is the part HARD RULE #1 protects
 * from drift. It does NOT itself materialize notes; each render path surfaces
 * them through its own channel, and they only stay consistent if they agree on
 * the boundary. Where each path stands today:
 *
 *   - lattice-emulator.js     — uses this module to embed each note as a
 *                               per-page PDF text annotation and a hidden
 *                               `aside.lattice-notes` element in the HTML
 *                               sidecar. This is the only path that materializes
 *                               notes itself.
 *   - lib/engine            — does NOT post-process notes; the engine collects
 *                               the *same* comments natively (its exclusion set
 *                               is the one mirrored below), so a user who runs
 *                               `marp --pdf-notes` / exports PPTX gets notes with
 *                               an identical boundary. The shipped Lattice PDF is
 *                               produced by the emulator, not marp.
 *   - dist/lattice-runtime.js — the VS Code preview does not surface notes today
 *                               (future work); when it does, it MUST extract them
 *                               through this module so the boundary still agrees.
 *
 * Like lint-core, this is pure and fs-free so it runs identically in Node, a CI
 * gate, and the browser.
 *
 * It operates on engine-RENDERED slide HTML, where Marpit/lib-engine has already
 * consumed directive comments (`_class`, `paginate`, …). What survives is either
 * a genuine note or a tooling pragma (markdownlint / prettier / remark-lint).
 * The pragma set below was copied verbatim from Marpit's own comment plugin
 * (magicCommentMatchers) when Marp was still a render path, so this extractor excludes
 * what marp-core excluded. NOTHING ENFORCES THAT NOW: Marp is retired (HARD RULE #1),
 * `@marp-team` is not a dependency any more, and no test reads Marpit's source — the
 * "parity test" this line used to claim does not exist and cannot be written. Treat the
 * set as a historical copy, not a mirror kept in step with an upstream.
 */

// Copied verbatim from Marpit's comment plugin (magicCommentMatchers) while Marp was a
// render path. Tested against the trimmed comment body. NOT kept in sync by anything — see
// the module docblock; the dependency is gone, so there is no upstream left to drift from.
const MAGIC_COMMENT_MATCHERS = [
  // Prettier
  /^prettier-ignore(-(start|end))?$/,
  // markdownlint
  /^markdownlint-((disable|enable).*|capture|restore)$/,
  // remark-lint (remark-message-control)
  /^lint (disable|enable|ignore).*$/,
];

// Matches one HTML comment, capturing its body. Mirrors Marpit's commentMatcher
// (tolerant of extra dashes). Constructed fresh per call site to avoid shared
// lastIndex state. The body is trimmed in JS (notesFromHtml) rather than with
// `\s*` inside the pattern: a `\s*` adjacent to the non-greedy `[\s\S]*?` makes
// matching quadratic on an unterminated `<!--` (catastrophic backtracking / a
// render-DoS on a malformed deck). It is quadratic, not exponential, on that input —
// removing the `\\s*` killed the catastrophic case, not the polynomial one.
//
// TERMINATES ON `--!>` AS WELL AS `-->`, because the HTML parser does: `--!>` closes a
// comment (as a parse error, but it closes). Recognizing only `-->` made a one-character
// typo merge a note with whatever followed it into ONE match — and that merged body then
// entered the `--strip-notes` scrub set, so `stripNotesFromSource` deleted the whole span
// from the envelope source, taking a `_class:` directive, a tooling pragma, or a WCAG
// `describe:` with it. Reading the same bytes the same way the browser does is what keeps
// the note boundary and the DOM's boundary from disagreeing.
const COMMENT_SOURCE = '<!--+([\\s\\S]*?)--+!?>';

/**
 * Is this (trimmed) comment body a tooling pragma rather than a speaker note?
 * @param {string} body comment body, leading/trailing space already irrelevant
 * @returns {boolean}
 */
function isToolingComment(body) {
  const t = String(body == null ? '' : body).trim();
  return MAGIC_COMMENT_MATCHERS.some((re) => re.test(t));
}

// LATTICE'S OWN structured pragmas — the analogue of MAGIC_COMMENT_MATCHERS for markers this
// repo invented rather than inherited.
//
// KEPT SEPARATE from that set, and the reason is provenance, not a gate. The set above is a
// verbatim copy of Marpit's `magicCommentMatchers`, made when Marp was still a render path;
// Marp is retired (HARD RULE #1) and `@marp-team` is no longer even a dependency, so no
// parity test locks it to anything — a claim the docblocks above used to make, now corrected
// in all three places it appeared. Do not add a Lattice entry there on the belief that a gate
// would catch it: it would not. The sets stay apart because one records what an upstream
// project excluded and the other records what THIS repo emits, and merging them would lose
// which is which.
//
// Why they need excluding at all: an unrecognized `key: value` comment is not a directive the
// engine consumes, so it survives into the rendered section and `noteBodiesFromHtml` lifts it as
// a speaker note. The author never wrote a note; an INTERNAL BUILD MARKER becomes reader-visible
// text in the presenter-notes field of every format we export — measured on all four (#1350).
//
// EVERY MATCHER IS VALUE-CONSTRAINED AND SINGLE-LINE, because the expensive failure here is the
// opposite one: over-stripping eats a real note silently, and an author who finds one missing has
// no way to tell what ate it. Two rules earn their keep, and both were found by review rather
// than by reasoning:
//   · Constrain the VALUE to the producer's real domain, never to "a single token". An early
//     draft matched `color-mode:\s*[a-z-]+`, which swallowed `<!-- color-mode: TBD -->` — a note
//     an author might plausibly write. Worse, a swallowed pragma also leaves the `--strip-notes`
//     scrub set, so that note then SHIPPED verbatim in the envelope source with `auditStrippedSource`
//     reporting nothing: both failure directions at once, out of one loose character class.
//   · Anchor the END. `$` without the `m` flag is end-of-INPUT, so an unanchored key matcher
//     swallows a whole multi-line body — `galleryAuthored: yes\n\nRemember the Q3 numbers.` was
//     one match, and the second paragraph was a real note.
// MIRROR THE PRODUCER EXACTLY, including what it does NOT accept — in BOTH directions, and
// each direction has already been got wrong here once. Being LOOSER than the producer hides
// the producer's own miss: `tier-filter.js` tolerates no space before the colon, so neither
// does this, and a malformed `tier : full` therefore stays VISIBLE as a note instead of being
// silently suppressed by a marker that never filtered anything. Being STRICTER than the
// producer LEAKS: `galleryAuthored`'s marker takes a bare word, and requiring a colon here
// meant `<!-- galleryAuthored — curated tour -->` opted the gallery out of generation AND
// shipped as that slide's speaker note — #1350 verbatim, reintroduced by the fix for it.

// A case-INSENSITIVE literal, spelled per character. The `i` flag is per-REGEX, and several
// matchers below must be insensitive on the VALUE while staying sensitive on the KEY — which
// is exactly what their producers do.
const anyCase = (word) => {
  // ASCII only. `'ß'.toUpperCase()` is `'SS'`, which would emit the class `[ßSS]` — ß or S,
  // not the pair intended. Unreachable with today's four words, and this is here so the next
  // one does not land silently wrong. (`toUpperCase()` is locale-INDEPENDENT, so the Turkish
  // dotless-i does not bite; a Cyrillic lookalike fails matcher and producer alike, which is
  // consistent.)
  if (!/^[\x20-\x7e]+$/.test(word)) throw new RangeError(`anyCase: ASCII only, got ${JSON.stringify(word)}`);
  return [...word].map((c) => (c.toUpperCase().length === 1 ? `[${c}${c.toUpperCase()}]` : c)).join('');
};

/**
 * A matcher for a register the producer reads through `frontMatterValue` → `frontMatterScalar`
 * and then COLLAPSES to one of a few words. Mirroring the key alone is not enough, and review
 * found the gap: `frontMatterScalar` strips a whitespace-preceded `#` comment and, for a quoted
 * value, returns the quoted SPAN and discards whatever trails it. So all of these are read as
 * `brand` by `readDeckLogoFrontMatter`, and an anchored `["']?word["']?$` matched none of them —
 * meaning each still shipped as the slide's speaker note, which is the #1350 shape:
 *
 *     logo-style: brand # our brand mark
 *     logo-style: "brand" only on the cover
 *
 * What the producer does NOT read stays a note, and is still excluded here: `brand extra words`
 * (unquoted, so the whole string is the value) and `brand#nospace` (the `#` needs whitespace
 * before it to start a comment).
 */
const wordRegister = (key, words) =>
  `^${key}:[ \\t]*(?:`
  + `["'](?:${words.map(anyCase).join('|')})["'].*` // quoted span; trailing text discarded
  // Bare, then EITHER a whitespace-preceded `#` comment or trailing whitespace. The whitespace
  // before `#` is required, mirroring `frontMatterScalar`'s `search(/[ \t]#/)`: `brand#nospace`
  // is not a comment, so the producer reads the whole string and ignores it.
  + `|(?:${words.map(anyCase).join('|')})(?:[ \\t]+#.*|[ \\t]*)`
  + ')$';

const LATTICE_PRAGMA_MATCHERS = [
  // Exemplar length-variant marker, read by lib/exemplars/tier-filter.js (554 in the tree). Its
  // own docblock asserts the marker is "inert to the renderer and simply dropped from the visible
  // output" — true of the SLIDE, false of the note channel, which is how this survived. The three
  // names and the no-space-before-colon shape both mirror that file's TIER_RE.
  /^tier:\s*(short|standard|full)\s*$/i,
  // Gallery build marker: tools/build-bucket-galleries.js reads it to leave a hand-authored
  // gallery alone. Its value is free-text build prose, so this is the one key-only matcher —
  // safe because it is a camelCase tool word no speaker note opens with. Anchored to ONE line
  // so it cannot swallow prose that follows a blank line inside the same comment.
  //
  // The COLON IS OPTIONAL, mirroring the producer: `GALLERY_AUTHORED_MARKER` is
  // `/<!--\s*galleryAuthored\b/` (build-bucket-galleries.js), which takes a bare word. Requiring
  // one here was stricter than the producer, and being stricter than the producer LEAKS — a
  // marker written `<!-- galleryAuthored — curated tour -->` opts the gallery out of generation
  // and shipped as that slide's speaker note, which is #1350 verbatim. `\b` keeps it from
  // matching a longer word.
  /^galleryAuthored\b[^\n]*$/,
  // The comment form of the `color-mode:` FRONT-MATTER register (lib/core/resolve-color-mode.js).
  // It belongs in front matter, so the comment form is an authoring slip the engine cannot consume
  // either way: directives.js matches `[A-Za-z_][\w]*` and `\w` excludes `-`, so a hyphenated key
  // is never recognized as a directive in EITHER form. It silently does nothing AND lands in the
  // note field — the double failure #1350 names. Constrained to the register's ACTUAL four values
  // plus the `print` alias, so `<!-- color-mode: TBD -->` and `<!-- color-mode: we should discuss
  // the palette -->` both stay notes.
  //
  // It was NOT the only hyphenated key a resolver reads, despite an earlier claim here. The
  // other six follow (#1986). They landed a change later than this one because each domain had
  // to be read off its producer and measured against it — a matcher written from the key's name
  // is the over-strip defect above, waiting to happen.
  /^color-mode:\s*(light|dark|system|inherited|print)\s*$/i,
  // ── The five DECK-LOGO registers ────────────────────────────────────────────────────────
  // Hyphenated, so exactly like `color-mode:` the engine can never read the comment form as a
  // directive: it silently does nothing AND lands in the note field. Both render paths read
  // them from the same front matter — `readDeckLogoFrontMatter`
  // (lib/integrations/markdown-it/plugins.js) and `applyDeckLogoFromFrontMatter`
  // (lib/runtime/index.js) — so there is one domain to mirror, not two.
  //
  // THE KEY IS CASE-SENSITIVE AND THE VALUE IS NOT, and that split is why the case-insensitive
  // words are spelled out per character instead of with a `/i` flag. Measured on the producer:
  // `LOGO-STYLE: brand` reads as NOTHING (the key regex `frontMatterValue` builds carries no
  // `i`), while `logo-style: BRAND` reads as brand (the value is lowercased). A blanket `/i`
  // here would suppress the first as a pragma — silently hiding a marker that never configured
  // anything, which is the "looser than the producer" failure this file's docblock names.
  //
  // `logo-style` and `logo-on` COLLAPSE rather than validate: the producer asks one question of
  // the lowercased value (`=== 'brand'`, `=== 'title'`) and every other word means the default.
  // So the domain is the two documented words each — `auto|brand`, `all|title` — and anything
  // outside it (`<!-- logo-on: the second half -->`) is prose the author wrote, which stays a
  // note. The optional quotes mirror `frontMatterScalar`, which strips a wrapping pair.
  new RegExp(wordRegister('logo-style', ['auto', 'brand'])),
  new RegExp(wordRegister('logo-on', ['all', 'title'])),
  // `logo-x` / `logo-y` / `logo-scale` mirror the producer's regex `["']?(-?[\d.]+)["']?` AND
  // the `Number.isFinite` gate behind it, which the character class alone does not express.
  // Measured, both directions: `1`, `1.5`, `-2`, `.5`, `1.`, `"1.5"` and `'2'` all read; `1.2.3`,
  // `.`, `-`, `abc` and `1e3` all read as null. `[\d.]+` alone would have matched the first four
  // of those five and suppressed a marker the producer ignores.
  /^logo-x:[ \t]*["']?-?(?:\d+\.?\d*|\.\d+)["']?[ \t]*$/,
  /^logo-y:[ \t]*["']?-?(?:\d+\.?\d*|\.\d+)["']?[ \t]*$/,
  /^logo-scale:[ \t]*["']?-?(?:\d+\.?\d*|\.\d+)["']?[ \t]*$/,
  // ── The finish override ─────────────────────────────────────────────────────────────────
  // A BLOCK key, not a scalar one: `parseFinishOverride`
  // (docs/src/components/studio/front-matter.ts) finds `finish-override` among the front
  // matter's nested blocks and reads its layers off the indented lines below it.
  //
  // THIS IS THE ONE MATCHER LOOSER THAN ITS PRODUCER, and an earlier comment here claimed the
  // opposite — that the bare header "is the only single-line form the producer can read". It
  // reads NONE: `parseFm` only files a header under `blocks` when it HAS indented children, so
  // a childless `finish-override:` goes to `pairs` and is dropped. Review caught the claim.
  //
  // The entry stays anyway, deliberately, and this is the exception that proves the rule the
  // docblock above states. Suppressing a marker the producer ignores normally HIDES the
  // producer's own miss — but only when a human might have meant it, which is why `tier : full`
  // and `LOGO-STYLE: brand` stay visible. Nobody opens a speaker note with a bare
  // `finish-override:`; there is no note to eat, so the leak this would otherwise cause has no
  // victim. Case-sensitive, because the block lookup is `k === 'finish-override'`.
  //
  // A comment carrying the whole indented block stays a note, deliberately. Every matcher in
  // this array is single-line: `$` is end-of-INPUT without the `m` flag, so a matcher that
  // spans lines is precisely the shape that swallowed `galleryAuthored: yes\n\nRemember the Q3
  // numbers.` whole. A leaked header is visible and recoverable; an eaten note is neither.
  /^finish-override:[ \t]*$/,
];

/**
 * Is this (trimmed) comment body one of Lattice's own structured pragmas rather than a
 * speaker note? Separate from `isToolingComment`, which mirrors Marpit's set verbatim.
 * @param {string} body comment body
 * @returns {boolean}
 */
function isLatticePragma(body) {
  const t = String(body == null ? '' : body).trim();
  return LATTICE_PRAGMA_MATCHERS.some((re) => re.test(t));
}

// The accessible-description channel: a `<!-- describe: … -->` comment is the
// slide's WCAG SC 1.1.1 text alternative — an OBJECTIVE equivalent of what the
// slide shows, for someone who can't see it. It is NOT a speaker note (opposite
// register: notes are what you SAY, descriptions are what's THERE), and it must
// never be spoken or land in the presenter-notes field. So it is a CONSUMED
// structured comment: skipped by notesFromHtml, read by descriptionFromHtml, and
// (like notes) stripped from the rendered HTML by stripCommentNodes. It routes to
// its own sinks — PPTX image altText, HTML aria — never to addNotes.
// See engineering/decisions/2026-07-04-accessible-descriptions.md.
const DESCRIBE_MATCHER = /^describe\s*:/i;

/**
 * Is this (trimmed) comment body the slide's `describe:` accessibility
 * description (not a speaker note)?
 * @param {string} body
 * @returns {boolean}
 */
function isDescriptionComment(body) {
  return DESCRIBE_MATCHER.test(String(body == null ? '' : body).trim());
}

// The caption channel: a `<!-- caption: … -->` comment is the slide's read-as
// TEXT — the exact words a slide narrates (read-aloud, the HTML player's
// Read-Article, the export `.vtt`, a11y, future translation). It is the HIGHEST
// precedence in the narration chain (caption → front-matter caption → projection;
// a speaker note is not a rung), and — like `describe:` — it is a CONSUMED comment, NOT
// a speaker note: it must never be embedded as a PDF presenter note or read as
// one. So it is skipped by noteBodiesFromHtml, read by captionFromHtml, and
// stripped from rendered HTML by stripCommentNodes. See
// engineering/decisions/2026-07-11-manifest-speech-contract.md §16 (Layer 1).
const CAPTION_MATCHER = /^caption\s*:/i;

/**
 * Is this (trimmed) comment body the slide's `caption:` read-as text (not a
 * speaker note)?
 * @param {string} body
 * @returns {boolean}
 */
function isCaptionComment(body) {
  return CAPTION_MATCHER.test(String(body == null ? '' : body).trim());
}

// The DIRECTIVE names, mirrored from lib/engine/directives.js `KNOWN_DIRECTIVES` — this module
// stays dependency-free, and the parity test in test/unit/authoring/notes-core.test.js fails if
// the two drift.
//
// NOT "the same way the pragma set above is mirrored from Marpit", which this line used to say.
// The two mirrors are opposites and the sentence advertised the wrong one's guarantee: THIS one
// has a real test that reads the engine's registry, while the Marpit copy has none and cannot
// have one — the dependency is gone (see the module docblock). A reader who took the analogy at
// face value would believe a gate guards `MAGIC_COMMENT_MATCHERS`. Nothing does (#1987).
//
// Why a note extractor needs to know these at all: normally the engine CONSUMES a directive,
// so `<!-- _class: title -->` never reaches rendered HTML and cannot be mistaken for a note.
// `stripNotesFromSource` relied on exactly that for its directive safety. But the guarantee
// is the ENGINE's, not this module's, and it does not hold on a deck where the directive
// survives into the section — a malformed neighboring comment is enough. The directive is
// then lifted as a "note", enters the --strip-notes scrub set, and is DELETED from the
// verbatim source the envelope carries: the recipient re-imports a deck whose slide has
// silently lost its class. Classifying directives here makes that structurally impossible
// rather than conditional on an upstream parse succeeding.
const KNOWN_DIRECTIVE_NAMES = [
  'theme', 'paginate', 'header', 'footer', 'class', 'backgroundColor',
  'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize',
  'color', 'size', 'style', 'lang', 'marp', 'logo',
  'focus', 'focusStyle', 'focusSteps',
  'build', 'debug', 'lens',
];
// Bare-form directives (no `: value`) — mirrors FLAG_DIRECTIVES. Every other directive
// REQUIRES a colon, so prose like `<!-- color -->` stays a note rather than being silently
// treated as a directive.
const FLAG_DIRECTIVE_NAMES = ['build', 'debug', 'lens'];
// SPOT form ONLY — the leading `_` is required. The bare form (`color: …`, `class: …`) is
// the deck-scope directive, and it is genuinely ambiguous with prose: `<!-- color: we should
// discuss the palette -->` is a speaker note that a bare-form matcher reads as a directive.
// Holding it out of the note set means `--strip-notes` never removes it and it ships in the
// exported file — a LEAK, and leaking is the worse direction (a scrubbed directive costs the
// author a class on re-import; a leaked note costs them the confidence of whoever is in the
// room). Reproduced before this narrowing: `<!-- color: SECRET we should discuss the palette
// -->` survived a --strip-notes export verbatim.
//
// `_class:` carries no such ambiguity — nobody opens a speaker note with it — so the spot
// form still gets the protection this classifier exists for, and the deck-scope form falls
// back to being treated as a note, which is what the engine's own model says a comment it
// did not consume IS. The envelope audit in stripNotesFromSource is the backstop for the
// residue either way.
const DIRECTIVE_LINE = new RegExp(
  `^_(?:${KNOWN_DIRECTIVE_NAMES.join('|')})\\s*:|^_(?:${FLAG_DIRECTIVE_NAMES.join('|')})\\s*$`
);

// The DECK-SCOPE form, bare of the `_` prefix. Used ONLY by `auditStrippedSource` — see the
// note there on why the audit's question is wider than the scrub's.
const DECK_SCOPE_DIRECTIVE_LINE = new RegExp(
  `^(?:${KNOWN_DIRECTIVE_NAMES.join('|')})\\s*:|^(?:${FLAG_DIRECTIVE_NAMES.join('|')})\\s*$`
);

/**
 * Is this comment body a deck-scope directive (`class: …`), bare of the `_` prefix?
 * @param {string} body
 * @returns {boolean}
 */
function isDeckScopeDirectiveComment(body) {
  const lines = String(body == null ? '' : body).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => DECK_SCOPE_DIRECTIVE_LINE.test(l) || DIRECTIVE_LINE.test(l));
}

// The directives whose VALUE domain is tight enough that prose is distinguishable from a
// real value. Everything else — `header`, `footer`, `style`, `logo`, `class`, `focus*`,
// `backgroundImage` — takes free text by nature and can never be told apart from a note,
// so it is never reported. Every key here must be a real directive name; the parity test in
// test/unit/authoring/notes-core.test.js fails on a key the engine does not have, so a
// rename cannot leave a dead entry behind that quietly stops reporting.
//
// A color is a hex literal, a bare keyword (`crimson`, `currentColor`, `transparent`), or
// any CSS function (`rgb(…)`, `color-mix(…)`, `var(--x)`) — i.e. never two bare words.
const COLOR_VALUE = /^(#[0-9A-Fa-f]{3,8}|[A-Za-z][A-Za-z0-9-]*|[A-Za-z-]+\([\s\S]*\))$/;
const DIRECTIVE_VALUE_SHAPES = {
  theme: /^[A-Za-z0-9_-]+$/,
  size: /^[A-Za-z0-9_:.-]+$/,
  lang: /^[A-Za-z0-9-]+$/,
  marp: /^(true|false)$/i,
  paginate: /^(true|false|skip|hold)$/i,
  color: COLOR_VALUE,
  backgroundColor: COLOR_VALUE,
};

// The engine's own test for "is this whole comment a directive" (lib/engine/directives.js
// parseCommentDirectives): the ENTIRE trimmed body is `key: value`, value unconstrained.
const DIRECTIVE_BODY = /^(_?)([A-Za-z][\w]*)\s*(?::\s*([\s\S]*))?$/;

/**
 * A directive comment the engine consumed whose VALUE reads as prose rather than as a
 * value of that directive — `<!-- color: we should discuss the palette -->`.
 *
 * The engine's directive test accepts any value at all, so a note that opens with a
 * directive keyword and a colon is silently consumed as a directive: it never reaches
 * rendered HTML, never enters the note set, and `--strip-notes` therefore has nothing to
 * match. Returns the directive NAME when the body is that shape, else null.
 *
 * Deliberately a REPORT and not a scrub. Removing it from the source would corrupt every
 * deck using the ordinary `<!-- paginate: true -->` idiom, and it would not close the leak
 * anyway: the engine applies the value, so the same text also ships baked into the
 * section's `data-color` attribute and `--color` custom property. Only the author can fix
 * it, by rewriting the note — which is exactly what the warning asks for.
 *
 * @param {string} body comment body
 * @returns {string|null} the directive name, or null when this is not prose-in-a-directive
 */
function directiveShapedProse(body) {
  const m = DIRECTIVE_BODY.exec(String(body == null ? '' : body).trim());
  if (!m) return null;
  const [, , key, value] = m;
  const shape = Object.hasOwn(DIRECTIVE_VALUE_SHAPES, key) && DIRECTIVE_VALUE_SHAPES[key];
  if (!shape) return null;
  // Read the value the way the ENGINE reads it, or the report fires on values it applies
  // perfectly. Two rules, both from `frontMatterScalar` (lib/core/front-matter-key.js):
  //   · a QUOTED value is the author writing a deliberate literal, and nobody quotes a
  //     speaker note — the quoted span is the value, a trailing comment is not part of it;
  //   · an UNQUOTED value is cut at the first whitespace-preceded `#`, so `theme: cuoio
  //     # brand` is `cuoio` — the exact form that file documents as a real authored value.
  // Missing either rule turns a working directive into the false privacy alarm this whole
  // classifier exists to avoid.
  const raw = String(value ?? '').trim();
  if (/^(['"])[\s\S]*\1$/.test(raw)) return null;
  const cut = raw.search(/[ \t]#/);
  const v = (cut === -1 ? raw : raw.slice(0, cut)).trim();
  return v && !shape.test(v) ? key : null;
}

/**
 * Blank out every CODE region of a markdown source — fenced blocks and inline spans —
 * replacing their characters with spaces so offsets and line structure stay put.
 *
 * ONE definition, three readers. A comment sitting in a code region is a documentation
 * SAMPLE the slide displays, not speaker text: the audit must not report it (a false
 * privacy alarm is the worst kind — the rational response is to stop trusting the strip)
 * and the scrubs must not delete it (that destroys content the recipient can still see on
 * the slide). Those two rules only stay consistent if they read the same regions.
 *
 * Fences follow CommonMark rather than the obvious regex, because the two disagree exactly
 * where it costs the most. A run of N markers is closed only by a run of N OR MORE of the
 * SAME character, so a ````-fenced block that DEMONSTRATES ``` fences — how this repo's own
 * docs show fenced examples — is one region, not two with a live gap between them. A regex
 * pairing the nearest two markers reads that gap as ordinary prose, and the scrub would then
 * delete a note-shaped comment out of the middle of a code sample (or the audit would report
 * one as a leak). An UNCLOSED fence runs to the end of the document, which is what markdown-it
 * does with it too — everything after it renders as code, so nothing in there is a note.
 *
 * A fence-shaped LINE is not always a fence, and this is where the two failure directions
 * stop being symmetric: a phantom region hides a real note from the scrub (a LEAK, the worst
 * outcome this module has), while a missed region deletes a code sample the audience can
 * still read off the slide. So the scan refuses to open a fence in the two places markdown-it
 * would not either — inside an HTML COMMENT (a note that quotes an unclosed ```js block used
 * to blank the rest of the deck, so every later note shipped) and inside a raw HTML BLOCK
 * (`<details>` … a ``` line … `-->` — the phantom swallowed the note between them). The HTML
 * rule is deliberately CRUDE — any `<`-leading line opens a block, any blank line closes it,
 * which is CommonMark's type-6 shape — because over-reading HTML costs a deleted sample and
 * under-reading it costs a leaked note.
 *
 * @param {string} source raw markdown
 * @returns {string} same length as the input, code characters replaced with spaces
 */
function maskCodeRegions(source) {
  const src = String(source == null ? '' : source);
  // `split('')` and NOT `[...src]`: the spread iterates CODE POINTS, so one emoji in a deck
  // would shift every offset after it and the callers index this buffer against the ORIGINAL
  // string. UTF-16 units keep index parity exactly.
  const chars = src.split('');
  const blank = (from, to) => {
    for (let i = from; i < to; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  };
  // Comment spans, in source order, so a fence marker inside one can be stepped over.
  const comments = [];
  for (const m of src.matchAll(new RegExp(COMMENT_SOURCE, 'g'))) comments.push([m.index, m.index + m[0].length]);
  let ci = 0;
  const inComment = (i) => {
    while (ci < comments.length && comments[ci][1] <= i) ci++;
    return ci < comments.length && i >= comments[ci][0];
  };
  // FENCES, line by line. Up to three leading spaces are indentation, per CommonMark; a
  // deeper indent inside a fence is content and cannot close it.
  const OPEN = /^ {0,3}(`{3,}|~{3,})/;
  let at = 0;
  let fence = null; // { marker, len, start }
  let html = false; // inside a raw HTML block (type 6): opened by `<`, closed by a blank line
  for (const line of splitKeepEnds(src)) {
    const text = line.replace(/[\r\n]+$/, '');
    if (fence) {
      const close = OPEN.exec(text);
      // No comment guard on the CLOSER: inside a fence the content is code, so a `<!--` in
      // the sample above it is not a comment at all — treating it as one would swallow the
      // closing fence and blank the rest of the deck, which is the leak this scan avoids.
      if (close && close[1][0] === fence.marker && close[1].length >= fence.len && !text.slice(close[0].length).trim()) {
        blank(fence.start, at + line.length);
        fence = null;
      }
    } else if (html) {
      if (!text.trim()) html = false;
    } else {
      const open = OPEN.exec(text);
      // An info string may not contain the marker character (CommonMark), which is what
      // keeps ```` ```js ```` an opener and a bare ``` ``` ``` `` line a closer.
      if (open && !text.slice(open[0].length).includes(open[1][0]) && !inComment(at)) {
        fence = { marker: open[1][0], len: open[1].length, start: at };
      } else if (/^ {0,3}</.test(text)) {
        html = true;
      }
    }
    at += line.length;
  }
  if (fence) blank(fence.start, chars.length); // unclosed → code to the end, as markdown-it reads it
  // INLINE SPANS, in what the fence pass left. Same line only, so a stray backtick cannot
  // swallow a note three paragraphs down. Runs on the already-masked text, so a backtick
  // inside a fenced block (now a space) cannot open a span.
  for (const m of chars.join('').matchAll(/`[^`\n]*`/g)) blank(m.index, m.index + m[0].length);
  return chars.join('');
}

/**
 * Is this comment body a Marpit/Lattice DIRECTIVE rather than a speaker note?
 *
 * Requires EVERY non-empty line to be a directive line, which is what keeps the two failure
 * modes apart. Too loose (e.g. treating any `word:` prefix as a directive) would exclude a
 * genuine note like `Note: mention the caveat` from the scrub set — a privacy LEAK, the
 * worse direction. Too strict re-opens the source-corruption above. Anchoring on the known
 * NAMES makes a false positive require a note whose every line begins with a real directive
 * keyword and a colon.
 *
 * @param {string} body comment body
 * @returns {boolean}
 */
function isDirectiveComment(body) {
  const lines = String(body == null ? '' : body)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 && lines.every((l) => DIRECTIVE_LINE.test(l));
}

/**
 * Extract the speaker note for one slide from its rendered HTML.
 * Collects every surviving HTML comment, drops tooling pragmas AND the
 * accessibility-description comment (a different channel), trims, and joins
 * multiple comments with a blank line — matching Marpit, which records one entry
 * per comment per slide.
 * @param {string} sectionHtml rendered `<section>…</section>` HTML for a slide
 * @returns {string|null} the slide's note, or null when it has none
 */
function noteBodiesFromHtml(sectionHtml) {
  const re = new RegExp(COMMENT_SOURCE, 'g');
  const bodies = [];
  for (const m of String(sectionHtml == null ? '' : sectionHtml).matchAll(re)) {
    const body = m[1].trim();
    if (!body || isToolingComment(body) || isLatticePragma(body) || isDescriptionComment(body) || isCaptionComment(body)) continue;
    if (isDirectiveComment(body)) continue; // never a note, and never scrubbable — see above
    bodies.push(body);
  }
  return bodies;
}

function notesFromHtml(sectionHtml) {
  const bodies = noteBodiesFromHtml(sectionHtml);
  return bodies.length ? bodies.join('\n\n') : null;
}

/**
 * Extract the accessibility description for one slide from its rendered HTML —
 * the `describe:` comment's body, prefix stripped. Multiple describe comments
 * join with a space (a slide's description is conceptually one string).
 * @param {string} sectionHtml rendered `<section>…</section>` HTML for a slide
 * @returns {string|null} the description, or null when the slide has none
 */
function descriptionFromHtml(sectionHtml) {
  const re = new RegExp(COMMENT_SOURCE, 'g');
  const parts = [];
  for (const m of String(sectionHtml == null ? '' : sectionHtml).matchAll(re)) {
    const body = m[1].trim();
    if (!isDescriptionComment(body)) continue;
    const text = body.replace(DESCRIBE_MATCHER, '').trim();
    if (text) parts.push(text);
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Per-slide accessibility descriptions, index-aligned with the input slides
 * (mirrors extractSlideNotes). `descriptions[i]` is the description for
 * `slides[i]` (or null).
 * @param {string[]|string} slidesHtml
 * @returns {(string|null)[]}
 */
function extractSlideDescriptions(slidesHtml) {
  const arr = Array.isArray(slidesHtml) ? slidesHtml : [slidesHtml];
  return arr.map(descriptionFromHtml);
}

/**
 * Extract the read-as caption for one slide from its rendered HTML — the
 * `caption:` comment's body, prefix stripped. Unlike a note or a description, a
 * caption REPLACES the slide's whole narration, so two of them are contradictory:
 * the LAST non-empty one wins (an override supersedes, not concatenates).
 * @param {string} sectionHtml rendered `<section>…</section>` HTML for a slide
 * @returns {string|null} the caption, or null when the slide has none
 */
function captionFromHtml(sectionHtml) {
  const re = new RegExp(COMMENT_SOURCE, 'g');
  let caption = null;
  for (const m of String(sectionHtml == null ? '' : sectionHtml).matchAll(re)) {
    const body = m[1].trim();
    if (!isCaptionComment(body)) continue;
    const text = body.replace(CAPTION_MATCHER, '').trim();
    if (text) caption = text; // last-wins
  }
  return caption;
}

/**
 * Per-slide read-as captions, index-aligned with the input slides (mirrors
 * extractSlideNotes). `captions[i]` is the caption for `slides[i]` (or null).
 * @param {string[]|string} slidesHtml
 * @returns {(string|null)[]}
 */
function extractSlideCaptions(slidesHtml) {
  const arr = Array.isArray(slidesHtml) ? slidesHtml : [slidesHtml];
  return arr.map(captionFromHtml);
}

/**
 * Extract per-slide notes from an array of rendered slide-HTML strings.
 * The result is index-aligned with the input, so `notes[i]` is the note for
 * `slides[i]` (or null). Pass the same array the renderer paginates from so the
 * indices never drift.
 * @param {string[]|string} slidesHtml
 * @returns {(string|null)[]}
 */
function extractSlideNotes(slidesHtml) {
  const arr = Array.isArray(slidesHtml) ? slidesHtml : [slidesHtml];
  return arr.map(notesFromHtml);
}

/**
 * Remove every HTML comment node from a slide's HTML. The note/pragma comments
 * are invisible authoring artifacts in the rendered output; once their text has
 * been lifted into the structured channel, stripping them keeps the note text
 * from appearing twice in the HTML sidecar.
 * @param {string} sectionHtml
 * @returns {string}
 */
function stripCommentNodes(sectionHtml) {
  return String(sectionHtml == null ? '' : sectionHtml).replace(
    new RegExp(COMMENT_SOURCE, 'g'),
    ''
  );
}

/**
 * Extract the whole comment CHANNEL for a deck, once, as a per-slide record.
 *
 * This is the shape every consumer should read, and it exists because the channel
 * cannot survive the pipelines that carry it. Notes, `describe:` and `caption:` ride
 * as HTML comments, and a comment is destroyed by any DOM round trip — the Studio's
 * export bakes each slide through a sanitizing capture frame, and `sanitizeSlideHtml`
 * deletes comment nodes. Repairing the markup afterwards is possible but fragile: it
 * depends on re-deriving the same slide boundaries a second time, and the naive
 * splitter that job reached for truncates a slide at the first `</section>`, so a deck
 * containing a hand-authored `<section>` silently loses its comments — with the slide
 * COUNT still matching, so a parity check waves it through. Extracting once, up front,
 * removes the round trip from the problem entirely.
 *
 * Takes ALREADY-SPLIT section HTML rather than the whole document, so the caller owns
 * the choice of splitter and this module keeps its dependency-free contract. Feed it a
 * DEPTH-AWARE split (`lib/core/split-sections.js`); the flat "next `</section>`" scan
 * in `docs/src/playground/preview-virtual.js` is wrong here, and its own comment says
 * why it thought it was safe ("user content is escaped, so no stray section tags
 * appear inside a slide") — an invariant `lib/forms/cell/masthead/masthead.transform.js`
 * exists to handle the violation of.
 *
 * @param {string[]} sections engine-rendered `<section>…</section>` HTML, one per slide
 * @returns {{note: string|null, description: string|null, caption: string|null}[]}
 */
function slideNoteRecord(sections) {
	return (Array.isArray(sections) ? sections : []).map((html) => ({
		note: notesFromHtml(html),
		// The INDIVIDUAL note bodies, kept alongside the display-joined `note`. The strip
		// matcher compares a comment's WHOLE trimmed body, and `note` joins a slide's notes
		// with a blank line — so re-deriving the bodies by splitting `note` on '\n\n' is not
		// its inverse: a SINGLE note containing a blank line shatters into fragments, none of
		// which equals the body, and the note then survives a --strip-notes export. Carrying
		// the pre-join array removes the guesswork.
		noteBodies: noteBodiesFromHtml(html),
		description: descriptionFromHtml(html),
		caption: captionFromHtml(html),
	}));
}

/**
 * Remove ONLY the speaker-note comments from raw LFM source, leaving directives
 * (`<!-- _class: X -->`), tooling pragmas, and `describe:` comments intact. This is
 * the privacy strip for the self-contained player's envelope: the note text lives
 * in the verbatim `source` the envelope carries, so a "strip notes" export must
 * re-serialize `source` without it (design doc §Notes on export).
 *
 * Directive-SAFE: it removes a comment ONLY when its trimmed body is in `noteBodies`, and
 * `noteBodiesFromHtml` CLASSIFIES directives out of that set itself (`isDirectiveComment`).
 * That safety used to rest on the ENGINE having consumed every directive before this module
 * saw the HTML — true of a well-formed deck, but a property of the engine rather than of
 * this module, and it did not hold when a directive survived into the rendered section (one
 * malformed neighboring comment is enough). The directive was then lifted as a note and
 * DELETED from the verbatim source the envelope carries, so the recipient re-imported a deck
 * whose slide had silently lost its class. The check is local now, and holds regardless.
 *
 * Pass the INDIVIDUAL note bodies — `noteBodiesFromHtml`, or a record's `noteBodies`.
 * Do NOT reconstruct them by splitting a joined `note` on the blank line: matching is on
 * a comment's whole trimmed body, so a single note that CONTAINS a blank line splits into
 * fragments that match nothing and the note ships in a --strip-notes export.
 *
 * POSITION-AWARE. Body-set membership alone says WHAT a comment is, never WHERE it sits,
 * and the two are not the same question. A deck that DOCUMENTS the note syntax — a fenced
 * `<!-- Remember to pause here. -->` inside a ```markdown sample — has that comment as
 * visible slide content, and a real note elsewhere with the same body used to delete it
 * from the source the recipient re-imports, while the slide they can see still showed it
 * (#1636). A comment in a code region can never be the leak this strip exists to stop:
 * the audience is already reading it off the slide. So the match is now "a note body, in a
 * position where a note can live" — code regions are held out via `maskCodeRegions`.
 *
 * LINE-AWARE, AND STRUCTURE-PRESERVING. A note on its own line takes the line with it; an
 * inline note takes only its span, because deleting the whitespace beside it would join two
 * words. That much is the counterfactual — the source as if the author had never typed the
 * comment — and it matters because `--strip-notes` RE-RENDERS this source: an emptied line
 * left behind named WHICH slides carried a note, one byte per slide, in a file the recipient
 * can re-render themselves (#1985).
 *
 * BUT A COMMENT LINE IS ALSO A BLOCK BOUNDARY, and deleting it outright moves the deck. Both
 * of these were measured on the real CLI:
 *
 *     Some text                 First paragraph.
 *     <!-- note -->             <!-- note -->
 *     ---                       Second paragraph.
 *
 * Delete the middle line and `Some text\n---` is a SETEXT H2, not a slide break — the export
 * gained a phantom slide (3 pages where the author wrote 2), and the `.vtt` bound the author's
 * caption for slide 2 onto it. On the right, two paragraphs collapse into one with a `<br>`.
 * A privacy flag must not restructure a deck, so the cut is decided per line:
 *
 *   · blank line on BOTH sides → take the note's line AND one of the blanks, leaving the one
 *     blank line the author would have had. No residue.
 *   · text on BOTH sides → replace the line with an EMPTY one. The block boundary the comment
 *     was providing survives, which is what keeps the two cases above intact.
 *   · one of each → take the line; the surviving blank still separates the blocks.
 *
 * ALL THREE HAVE AN END-OF-INPUT CASE, and it is the one that leaked. End-of-file counts as
 * blank on the right, but it is the file ENDING rather than a line that can be taken — so "one
 * of the two blanks goes" took neither, and the blank ABOVE a trailing comment survived. That
 * is a one-byte tell in the source the export ships, and this repo's own note-free twin fixture
 * is what it was measured against. At end of input the blank on the LEFT goes instead: there is
 * no block below for it to be separating, so every variant lands on `text\n`.
 *
 * "End of input" is NOT "the comment's newline is the last byte", and the first cut of this fix
 * got that wrong. A file ending with a BLANK LINE after the comment still has a newline to find,
 * so the blank-below branch fired and left the one above — the same residue, one keystroke away,
 * on a deck this repo ships. The test is whether the REMAINDER is all whitespace.
 *
 * All three converge on `text\n\ntext`, which is why there is no shape left that says a note
 * was here. Measured across the 23 decks this repo ships with notes: the delete-outright rule
 * added a blank-line RUN to 16 of them (a `grep -c $'\n\n\n'` tell, cheaper than the one
 * #1985 closed); this rule adds one to none, diverges on zero slide counts, and renders
 * byte-identical to the same deck written without notes.
 *
 * "Own line" is judged against what has been EMITTED, not against the source offsets. Two
 * inline notes after real text — `hello <!-- a --> <!-- b -->` — used to let the second one
 * see "nothing since the cursor", conclude whole-line, and eat the newline, joining it to the
 * line below.
 *
 * TWO CANDIDATE CUTS, because no local test can pick between them. The `text / text` case is
 * genuinely ambiguous, and review found both answers being right on different decks:
 *
 *     Some text                     - Revenue up 12 percent
 *     <!-- note -->                   <!-- note -->
 *     ---                           - Costs flat
 *
 * On the left the comment IS the block boundary — delete the line and `Some text\n---` becomes
 * a setext H2, so an empty line has to take its place. On the right the comment is inside a
 * list item, and an empty line makes a TIGHT list LOOSE (`<li>Revenue…` becomes
 * `<li><p>Revenue…`), while simply deleting the line reproduces the author's own tight list
 * exactly. Same neighbours — text above, text below — opposite correct answers.
 *
 * So this function does not decide. `boundary: 'preserve'` puts an empty line in place of the
 * comment; `boundary: 'drop'` takes the line and nothing else. The CALLER renders both and
 * keeps whichever reproduces the deck the author wrote, which is a measurement rather than a
 * guess. Both callers take the candidates from `SCRUB_BOUNDARIES` below rather than
 * writing the list out, because two hand-kept copies of it is precisely how the CLI and the
 * Studio came to disagree on the decks this measurement exists for.
 *
 * @param {string} source raw LFM source
 * @param {Set<string>|string[]} noteBodies trimmed note texts from the rendered deck
 * @param {object} [opts]
 * @param {'preserve'|'drop'} [opts.boundary] what replaces a whole-line note that has TEXT on
 *   both sides — an empty line (default), or nothing.
 * @returns {string} source with those note comments removed, and their lines with them
 */
function stripNotesFromSource(source, noteBodies, { boundary = 'preserve' } = {}) {
  const set = noteBodies instanceof Set ? noteBodies : new Set(noteBodies);
  const src = String(source == null ? '' : source);
  if (set.size === 0) return src;
  // The set entries come from RENDERED slide HTML, where markdown-it has normalized
  // newlines to `\n`. The raw source comment may be CRLF (a Windows-authored deck),
  // so normalize the candidate body the SAME way before matching — else a multi-line
  // note on a CRLF deck never matches and leaks into the frozen file.
  const norm = (s) => String(s).replace(/\r\n?/g, '\n').trim();
  return removeCommentSpans(src, (body) => set.has(norm(body)), boundary);
}

// The candidate cuts, IN THE ORDER THEY ARE TRIED — the one piece of this measurement every
// scrub path must agree on, so it lives here rather than in each of them. `preserve` first is
// deliberate and not a tie-break: it is the conservative cut (it can only leave a blank line
// where a comment was), so a deck that reads correctly either way keeps the shape that changes
// least. Adding a candidate, or reordering these, changes every path at once — which is the
// point. `stripNotesCut` (docs) and `strippedSlidesOrAuthored` (lattice-emulator.js) both read
// this list; `test/unit/authoring/notes-core.test.js` pins that neither writes its own.
//
// NOT note-specific, despite where it started: `stripCaptionsFromSource` takes the same cut,
// and the CLI measures ONE boundary for the combined source both flags produce. It was named
// `NOTE_SCRUB_BOUNDARIES` while the note channel was the only one that re-rendered (#2003).
const SCRUB_BOUNDARIES = Object.freeze(['preserve', 'drop']);

/**
 * The line-aware, structure-preserving comment cut — shared by BOTH privacy strips.
 *
 * Its rules are written out on `stripNotesFromSource`, which is where they were measured; the
 * caption strip is the same cut over a different predicate, and sharing the body is what keeps
 * the two channels from diverging the way they did before #2003 (the note strip took the line,
 * the caption strip took the span, and the leftover blank line named which slides had a
 * caption).
 *
 * @param {string} src raw LFM source
 * @param {(body: string) => boolean} removes is THIS comment body one to remove?
 * @param {'preserve'|'drop'} boundary what replaces a whole-line comment with TEXT on both sides
 * @returns {string} source with those comments, and their lines, removed
 */
function removeCommentSpans(src, removes, boundary) {
  // A masked source keeps every offset, so a comment that OPENS inside a code region is
  // the one whose `<` has become a space. A comment that opens outside one is stripped
  // exactly as before, including the case where a stray fence swallows its terminator.
  const masked = maskCodeRegions(src);
  const re = new RegExp(COMMENT_SOURCE, 'g');
  let out = '';
  let cursor = 0;
  for (const m of src.matchAll(re)) {
    if (masked[m.index] !== '<' || !removes(m[1])) continue;
    out += src.slice(cursor, m.index);
    cursor = m.index + m[0].length;
    const nl = src.indexOf('\n', cursor);
    const tail = nl === -1 ? src.slice(cursor) : src.slice(cursor, nl);
    // OWN LINE? Nothing but whitespace has been EMITTED on this output line, and nothing but
    // whitespace is left on the source line after the comment. Asking the OUTPUT rather than
    // the source offsets is what keeps `hello <!-- a --> <!-- b -->` inline: by the time `b`
    // is judged, `a`'s span is gone from the source but `hello` is in the output.
    // `\r?` so a CRLF deck's terminator counts as end-of-line here and travels with the line
    // below rather than being left dangling as a lone carriage return.
    if (!/^[ \t]*\r?$/.test(tail) || !/(^|\n)[ \t]*$/.test(out)) continue;
    out = out.replace(/[ \t]*$/, ''); // the comment's own indent goes with its line
    const term = nl === -1 ? '' : (src[nl - 1] === '\r' ? '\r\n' : '\n');
    cursor = nl === -1 ? src.length : nl + 1;
    // Start-of-file counts as blank on the left, end-of-file as blank on the right: in both
    // cases there is no block on that side for the comment to have been separating.
    const prevBlank = out === '' || /(^|\n)[ \t]*\r?\n$/.test(out);
    const nl2 = src.indexOf('\n', cursor);
    const nextBlank = /^[ \t\r]*$/.test(nl2 === -1 ? src.slice(cursor) : src.slice(cursor, nl2));
    // END OF INPUT — nothing but whitespace follows the comment's line. Not the same test as
    // `nl2 === -1`, and the difference is the whole bug: a file that ends with a BLANK LINE
    // after the comment still has a newline to find, so the "blank below goes too" branch fired,
    // took the blank below, and left the blank ABOVE. Same one-byte residue, one keystroke away
    // from the shape that was fixed. There is no block below for a blank to separate here, and a
    // trailing blank line is itself the tell: 1318 of the 1325 markdown files in this repo end
    // with a single newline. So take the whole whitespace tail, and one blank line off what has
    // already been emitted — every end-of-input shape lands on `text\n`, whichever side the
    // author's blank was on.
    const atEnd = /^\s*$/.test(src.slice(cursor));
    if (atEnd) {
      cursor = src.length;
      // `prevBlank` is what makes this safe: it holds only when `out` is empty or ends with a
      // genuinely blank line, so the trim can never eat a line with content on it.
      if (prevBlank) out = out.replace(/[ \t]*\r?\n$/, '');
    } else if (prevBlank && nextBlank) {
      cursor = nl2 + 1; // the blank line BELOW goes too — no run left
    } else if (!prevBlank && !nextBlank && boundary === 'preserve') {
      out += term; // the comment MAY have been the block boundary; the caller measures which
    }
  }
  return out + src.slice(cursor);
}

/**
 * FAIL-CLOSED audit of a scrubbed source: what comments are still in here that a reader
 * would call speaker text?
 *
 * Every `--strip-notes` leak this codebase has had was a new way for the two sides of the
 * scrub to disagree — the bodies lifted from RENDERED html vs. the comments present in
 * SOURCE. An empty set, a joined-then-split body, a `--!>` terminator, a flat splitter, a
 * directive-shaped note: five mechanisms, one shape. Matching is inherently open-ended, so
 * this checks the OUTPUT instead of the matcher: after the scrub, anything still wearing
 * `<!-- … -->` that is not a directive, a tooling pragma, a `describe:` or a `caption:` is
 * suspected speaker text that survived.
 *
 * It cannot itself leak — it only reports — and it is independent of the matcher, so it
 * catches a failure of the matcher rather than sharing its assumptions. Callers surface it:
 * the CLI warns, the Studio puts it in the export toast.
 *
 * @param {string} strippedSource source AFTER stripNotesFromSource
 * @returns {string[]} suspected surviving note bodies (trimmed), empty when clean
 */
function auditStrippedSource(strippedSource) {
  const survivors = [];
  const src = String(strippedSource == null ? '' : strippedSource);
  // Mask CODE REGIONS first — a fenced block or an inline span showing `<!-- class: … -->`
  // as documentation is not a surviving note, and reporting it is a FALSE PRIVACY ALARM,
  // which is the worst kind: the rational response is to stop trusting the strip. The
  // sibling rule in lint-core makes exactly this argument; the audit is the one users
  // actually see, so it has to hold the same standard. Measured:
  // `examples/deck-class-register.md` and `examples/slide-class-forms.md` — two decks this
  // repo ships — raised 4 and 2 alarms. `maskCodeRegions` is shared with the scrubs, which
  // must skip exactly the same regions for the opposite reason (see stripNotesFromSource).
  const masked = maskCodeRegions(src);
  for (const m of masked.matchAll(new RegExp(COMMENT_SOURCE, 'g'))) {
    const body = m[1].trim();
    if (!body) continue;
    // isLatticePragma here for the same reason it is in noteBodiesFromHtml, but with the
    // opposite consequence: a pragma is no longer in the scrub set, so it SURVIVES the strip
    // by design. Without this the audit would report every one of them as a note that leaked —
    // a false privacy alarm, which this function's own docblock calls the worst kind.
    if (isToolingComment(body) || isLatticePragma(body) || isDescriptionComment(body) || isCaptionComment(body)) continue;
    // A directive whose VALUE reads as prose is the one directive-shaped comment worth
    // reporting: the engine consumed it, so it never became a note and the scrub never saw
    // it, yet its text ships — in the source AND on the section as `data-<name>`. Checked
    // BEFORE the directive exclusions below, which would otherwise swallow it.
    const prose = directiveShapedProse(body);
    if (prose) {
      survivors.push(`${body} … (the engine read this as a "${prose}" directive, so its text ships in the source and on the slide)`);
      continue;
    }
    // DIRECTIVE SYNTAX in either form — spot (`_class:`) or deck-scope (`class:`) — is not
    // suspicious residue. This is deliberately WIDER than the scrub's own test, and the two
    // answer different questions: the scrub asks "is this scrubbable?" and must say yes to
    // the bare form, so a note shaped like a directive still gets removed; the audit asks
    // "is this unexpected?" and a comment in directive syntax that survived is one the
    // ENGINE consumed as a directive, which is what it is for. A note that merely LOOKS like
    // one would have been scrubbed upstream, because it reached the rendered HTML as a note.
    if (isDirectiveComment(body) || isDeckScopeDirectiveComment(body)) continue;
    survivors.push(body);
  }
  // An UNTERMINATED `<!--` never matches the comment pattern at all, so neither the scrub nor
  // the loop above can see it — and its text ships verbatim. "Reported, never silent" has to
  // mean this case too, or the claim is false for the shape most likely to be an accident.
  if (/<!--(?![\s\S]*?--!?>)/.test(masked)) {
    const at = masked.search(/<!--(?![\s\S]*?--!?>)/);
    survivors.push(`${src.slice(at, at + 60).split('\n')[0].trim()} … (comment never closed)`);
  }
  return survivors;
}

// Matches the leading front-matter fence block, capturing the open fence, the body, and
// the close fence separately so the body can be surgically rewritten. Tolerates a BOM and
// trailing fence whitespace (parity with the app's other front-matter readers).
const FRONT_MATTER_BLOCK = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;

// Split a string into lines that KEEP their trailing terminator (`\r\n`, `\r`, or `\n`);
// the final line has none. Rejoining with `''` is byte-exact — unlike `split(/\r?\n/)` +
// `join('\n')`, which silently rewrites CRLF to LF. Guards the empty tail match so it
// terminates. Pure, linear.
function splitKeepEnds(str) {
  const out = [];
  const re = /[^\r\n]*(?:\r\n|\r|\n)?/g;
  let m;
  while ((m = re.exec(str)) && m[0] !== '') out.push(m[0]);
  return out;
}

/**
 * Remove the TOP-LEVEL `captions:` block from a deck's FRONT MATTER (the read-as map, keyed
 * by slide number — the documented caption channel). The caption text there is NOT a comment,
 * so `stripCaptionsFromSource`'s comment pass can't reach it — this drops the top-level
 * `captions:` key line plus every deeper-indented map line, stopping at the next top-level key
 * or the closing fence. Two invariants the adversarial trio pinned:
 *   - **Top-level only** (`^captions` — column 0, no leading whitespace): a NESTED key named
 *     `captions` (e.g. `speaker:\n  captions: …`) is a different key and is left intact.
 *   - **Byte-identical for everything else**: lines keep their ORIGINAL terminator (a CRLF
 *     deck stays CRLF), so a no-captions deck round-trips unchanged.
 * Only the leading fenced block is scanned, so a `captions:` word in the body is safe.
 *
 * LEAVES NO BLANK LINE WHERE THE BLOCK WAS, for the reason the comment cut does not either
 * (#2003): the front-matter map is caption material, and a blank line where it stood is residue
 * that says one was removed, in a source the recipient can read.
 *
 * THE REWRITE IS SCOPED TO THE BLOCK, and the first cut of it was not — which is the failure
 * worth writing down, because it was silent. That cut normalized the rebuilt body's tail
 * unconditionally, on the belief that `FRONT_MATTER_BLOCK`'s close fence always carries the last
 * body line's terminator so `body` can never end with one. It can: the close group is a SINGLE
 * `\r?\n---`, so an author's BLANK LINE before the fence leaves its newline inside `body`. A deck
 * with no `captions:` key at all then came back one byte shorter — `themes/palette-audit.md`,
 * shipped in this repo, was the measured case — and with an EMPTY front matter the whole fence was
 * deleted. Both broke the invariant two lines up, both changed a source the envelope calls
 * verbatim, and neither could trip the fidelity guard, because neither changes the render. So:
 * a source with no top-level `captions:` key is returned BYTE-IDENTICAL, by an early return that
 * cannot be reasoned past, and the tail is touched only when the block itself ran to the fence.
 *
 * Where it IS touched, two things go, both of them residue rather than the author's:
 *   - the removed block's own last terminator, which the close fence would otherwise double;
 *   - a blank line the author put ABOVE the block, which was their separator FROM it. The
 *     `skipping` branch already eats the blanks BELOW; leaving the one above was the asymmetry
 *     that let a blank line sit against the close fence and name where the map had been.
 * When a sibling key FOLLOWS the block, neither applies: the last line of the body is the
 * author's own and survives verbatim, and a blank line between two remaining keys is ordinary
 * front matter that says nothing about what was removed.
 *
 * A front matter left with NO keys is a deck with no front matter, so the whole block goes (BOM
 * kept) rather than an empty fence: `---\n---\n` is not front matter to `parseFrontMatter`
 * (measured — it parses as BODY, so the deck would gain a thematic break where its front matter
 * used to be).
 *
 * @param {string} source raw LFM source
 * @returns {string} source with its front-matter `captions:` block removed
 */
function stripCaptionsFrontMatter(source) {
  const s = String(source == null ? '' : source);
  const m = s.match(FRONT_MATTER_BLOCK);
  if (!m) return s;
  const [, open, body, close] = m;
  const out = [];
  let removed = false;
  let blockAt = -1; // out.length when the last captions block started — did anything follow it?
  let skipping = false;
  for (const line of splitKeepEnds(body)) {
    const content = line.replace(/[\r\n]+$/, '');
    if (!skipping) {
      // top-level captions key — drop
      if (/^captions[ \t]*:/.test(content)) { skipping = true; removed = true; blockAt = out.length; continue; }
      out.push(line);
      continue;
    }
    // Inside the block: a blank line or a deeper (indented) map line belongs to it.
    if (content === '' || /^[ \t]/.test(content)) continue;
    skipping = false; // a column-0 sibling key → block over
    out.push(line);
  }
  if (!removed) return s; // no captions key — byte-identical, whatever shape the front matter is
  const before = s.slice(0, m.index);
  const after = s.slice(m.index + m[0].length);
  // The block ran to the closing fence, so the last line of the body went with it. Drop the
  // residue it left: any blank line the author had put above the block, and then the surviving
  // line's terminator (the close fence supplies one).
  //
  // DONE ON THE LINE ARRAY, NOT WITH ONE REGEX OVER THE JOINED STRING. The obvious
  // `/(?:[ \t]*(?:\r\n|\r|\n))*$/` is a nested quantifier anchored at `$`, and it has TWO
  // backtracking behaviors — the second one is the bad one, and it is not the one you find by
  // guessing at the input:
  //   · POLYNOMIAL on a long run of spaces with no newline (the engine retries every split of
  //     the run at every start position): 10k trailing spaces 163 ms, 20k 627 ms, 40k 2.5 s,
  //     80k 10 s — 4x for every 2x.
  //   · EXPONENTIAL on repetitions of `\r\n`, which is what CodeQL actually named. The
  //     alternation is AMBIGUOUS: `\r\n` matches either as one `\r\n` branch or as `\r` then
  //     `\n` on the next iteration of the outer `*`, so a failing tail forces a 2^n search.
  //     Measured: 20 pairs 100 ms, 22 pairs 400 ms, 24 pairs 1.6 s — 2x per added pair. That is
  //     48 characters for a second and a half, i.e. a hostile deck needs no size at all.
  // Both are a render-DoS through an author-controlled path, and both are the hazard class the
  // comment matcher at the top of this file already carries a note about. The loop below is
  // linear on both (100k `\r\n` pairs in 99 ms) and says what it means without a regex.
  if (blockAt === out.length) {
    while (out.length && out[out.length - 1].replace(/[\r\n]+$/, '') === '') out.pop();
    if (out.length) out[out.length - 1] = out[out.length - 1].replace(/(\r\n|\r|\n)$/, '');
  }
  const kept = out.join('');
  if (kept === '') return before + (open.startsWith('﻿') ? '﻿' : '') + after;
  return before + open + kept + close + after;
}

/**
 * Remove ALL caption text from raw LFM source for `--strip-captions`: BOTH the inline
 * `<!-- caption: … -->` read-as comments AND the front-matter `captions:` map. The caption
 * sibling of `stripNotesFromSource` — the caption text lives verbatim in the `source` an
 * `--embed-source` / player envelope carries, so a "strip captions" export must re-serialize
 * `source` without it (else the privacy flag leaks). Leaves speaker notes, `describe:` a11y
 * comments, directives, tooling pragmas, and every other front-matter key intact. Directive-
 * SAFE: a `<!-- _class: … -->` body never matches `caption:`, and only the `captions:` key is
 * dropped from front matter. POSITION-AWARE for the same reason its note sibling is: a deck
 * documenting the caption syntax inside a fenced sample must keep the sample it displays.
 *
 * LINE-AWARE, AND STRUCTURE-PRESERVING — the same cut as `stripNotesFromSource`, through the
 * same `removeCommentSpans`, and for the same reason it needed one (#2003). A span-only replace
 * left the caption comment's line behind as an empty one, and the CLI re-renders this source:
 * one byte per slide named WHICH slides carried a caption, in the envelope the recipient can
 * re-render themselves. It also left a `\n\n\n` run wherever a caption had sat between two
 * blank lines, which is the cheaper tell a `grep -c` reads off the shipped file. The three
 * per-line rules and the two candidate cuts are written out on `stripNotesFromSource`; the
 * caller measures which cut reproduces the deck, and passes ONE for the combined source when
 * both flags are set.
 *
 * @param {string} source raw LFM source
 * @param {object} [opts]
 * @param {'preserve'|'drop'} [opts.boundary] what replaces a whole-line caption comment that has
 *   TEXT on both sides — an empty line (default), or nothing.
 * @returns {string} source with all caption text removed
 */
function stripCaptionsFromSource(source, { boundary = 'preserve' } = {}) {
  return stripChannelsFromSource(source, { captions: true, boundary });
}

/**
 * BOTH privacy channels in ONE pass — what `--strip-notes --strip-captions` actually runs.
 *
 * The two single-channel strips above are the API each flag uses alone. Running them in
 * SEQUENCE is not the same thing, and the emulator did exactly that until an independent
 * checker measured it: 350 of 13,122 (source × cut) pairs come out differently depending on
 * which scrub goes first. They no longer interact through comment BODIES — a `caption:` body is
 * never a note body, which is all "order-independent" ever claimed — but they interact through
 * BLANK-LINE ACCOUNTING, which is what the line-aware cut added. A note comment on the line
 * above a caption comment is the small case: the first scrub takes its line and, under
 * `preserve`, may leave an empty one, so the second scrub reads different neighbours than the
 * author wrote and leaves a byte behind. That byte is the #2003 disclosure itself, surviving in
 * the combined path — one shipped example measured at a 1-byte delta against the deck written
 * with neither comment.
 *
 * One pass fixes it at the root instead of ordering the two: every comment is judged against
 * the SOURCE'S OWN neighbours, so the composition cannot depend on an order it no longer has.
 * The front-matter map has no such interaction (it is not a comment) and runs after.
 *
 * @param {string} source raw LFM source
 * @param {object} [opts]
 * @param {Set<string>|string[]|null} [opts.noteBodies] note bodies to scrub, or null for none
 * @param {boolean} [opts.captions] also scrub the caption channel
 * @param {'preserve'|'drop'} [opts.boundary] the cut, per `SCRUB_BOUNDARIES`
 * @returns {string} source with both requested channels removed
 */
function stripChannelsFromSource(source, { noteBodies = null, captions = false, boundary = 'preserve' } = {}) {
  const src = String(source == null ? '' : source);
  const set = noteBodies instanceof Set ? noteBodies : (noteBodies ? new Set(noteBodies) : null);
  const notes = !!set?.size;
  if (!notes && !captions) return src;
  // The set entries come from RENDERED slide HTML, where markdown-it has normalized newlines to
  // `\n`. The raw source comment may be CRLF (a Windows-authored deck), so normalize the
  // candidate body the SAME way before matching — else a multi-line note on a CRLF deck never
  // matches and leaks into the frozen file.
  const norm = (s) => String(s).replace(/\r\n?/g, '\n').trim();
  const out = removeCommentSpans(
    src,
    (body) => (notes && set.has(norm(body))) || (captions && isCaptionComment(body)),
    boundary
  );
  return captions ? stripCaptionsFrontMatter(out) : out;
}

/**
 * The per-PAGE speaker notes of a FINAL, post-split render.
 *
 * Notes are authored per SLIDE and injected as a `<aside class="lattice-notes">`
 * before the split runs, so the authored array is indexed by slide. Once a slide
 * paginates, that array is shorter than the page count, and a consumer that guards on
 * length — `embedNotesInPdf` does, correctly, so it can never land a note on the wrong
 * page — drops EVERY annotation in the deck. One split slide, and a deck loses all of
 * its notes, silently apart from a single stderr line.
 *
 * Survivable while splitting was opt-in. Not survivable once it is intrinsic, so the
 * binding moves to the rendered pages. The splitter already carries each body page's
 * `<aside>` along with the content it belongs to, so the note is sitting on the page
 * that needs it — nothing is re-derived or guessed.
 *
 * The one page with no aside of its own is the COVER: it is built fresh from masthead
 * material rather than copied from the source inner. It inherits its run's note via
 * `data-split-run`, which is what a presenter expects — whichever page of a run you
 * are on, the note for that content is on it.
 *
 * `sections` is the caller's already-parsed list of `{ openTag, inner }` (the emulator
 * passes `splitSections(...)`), so this module stays dependency-free.
 */
function notesPerRenderedPage(sections) {
  const list = Array.isArray(sections) ? sections : [];
  // Undo the escaping applied on injection, so the text matches what the author wrote
  // (and what the un-split path has always emitted). `&amp;` LAST — unescaping it
  // first would let `&amp;lt;` collapse to `<`.
  const unescapeEntities = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const noteOf = (p) => {
    const m = String(p?.inner || '').match(/<aside class="lattice-notes"[^>]*>([\s\S]*?)<\/aside>/);
    return m ? unescapeEntities(m[1]) : null;
  };
  const runOf = (p) => (String(p?.openTag || '').match(/\sdata-split-run="([^"]*)"/) || [])[1] || null;
  const notes = list.map(noteOf);
  const byRun = new Map();
  list.forEach((p, i) => {
    const r = runOf(p);
    if (r && notes[i] && !byRun.has(r)) byRun.set(r, notes[i]);
  });
  return notes.map((n, i) => (n || (runOf(list[i]) && byRun.get(runOf(list[i]))) || null));
}

module.exports = {
  // Exported for its own test only: the multi-character-uppercase guard is invisible from the
  // matchers it builds, and unreachable with today's four words.
  anyCase,
  MAGIC_COMMENT_MATCHERS,
  LATTICE_PRAGMA_MATCHERS,
  KNOWN_DIRECTIVE_NAMES,
  FLAG_DIRECTIVE_NAMES,
  isToolingComment,
  isLatticePragma,
  isDescriptionComment,
  isCaptionComment,
  isDirectiveComment,
  isDeckScopeDirectiveComment,
  DIRECTIVE_VALUE_SHAPES,
  directiveShapedProse,
  maskCodeRegions,
  noteBodiesFromHtml,
  notesFromHtml,
  extractSlideNotes,
  notesPerRenderedPage,
  descriptionFromHtml,
  extractSlideDescriptions,
  captionFromHtml,
  extractSlideCaptions,
  slideNoteRecord,
  stripCommentNodes,
  stripNotesFromSource,
  SCRUB_BOUNDARIES,
  auditStrippedSource,
  stripCaptionsFromSource,
  stripChannelsFromSource,
  stripCaptionsFrontMatter,
};
