/**
 * relationship.js — the cross-slide RELATIONSHIP SIGNAL
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §0b and §8 rule 12a).
 *
 * §0b's granularity ruling atomizes a CONNECTED member — a step, a cycle stage, an authority
 * tier, a priced or scored option — to one per slide, because packing them produced the
 * "jarring uneven slides" the owner rejected. But atomizing a sequence is exactly what
 * destroys it: four steps on four slides read as four unrelated slides. So each page of the
 * run carries a small wayfinding adornment naming WHAT THE RELATIONSHIP IS (the progress rail
 * already says *where* you are, k of N):
 *
 *   · sequence    → "{next step} →"
 *   · cycle       → "{next step} →" through the run, then "back to {stage 1} ↻" on the LAST page
 *   · hierarchy   → "governs {next tier} ↓", and "under {previous tier} ↑" on the last
 *   · comparison  → "Option N of M · comparing {shared criteria}"  (no drawn mark)
 *
 * THE MARK TRAILS THE LABEL, and `sequence`/`cycle` carry NO lead-in word (owner's call,
 * 2026-09-02: "we don't need the word next, it is implied by the arrow which should be on the
 * right side of the text in the pill"). The other two kinds keep theirs, because an arrow carries
 * "next" and a `↓`/`↑` does not carry "governs"/"under" — those name a hierarchy's two directions,
 * which the shapes distinguish but do not say.
 *
 * The adornment is DERIVED FROM THE NEIGHBOR MEMBER at build time and never authored (rule
 * 12a) — that is the whole point, and the reason the rule demands a test proving that editing
 * member N+1 changes member N's emitted signal. An authored "next: …" line is a second copy
 * of the next step's title, and the second copy is the one that goes stale.
 *
 * A component opts in by declaring `capacity.relationship` in its manifest; the kernel refuses
 * an unknown kind rather than guessing one from the component name (§8 rule 5 — the derived
 * fact is recorded in the standing oracle, so a drift fails CI).
 *
 * Pure & fs-free. Operates on the RENDERED member HTML the split already cut, so it cannot
 * disagree with what the pages actually hold.
 */

const { directChildren } = require('./collections');
// Depth-aware close finder — KaTeX's a11y mirror nests <span>s, so `stripMathMirror` below
// cannot use a lazy regex (HARD RULE #15: one close finder, not a second one here).
const { findMatchingClose } = require('./find-matching-close');
const { shapeGlyphRe } = require('./shape-glyphs');

/** The four relationship kinds §0b enumerates. A manifest declaring anything else is a defect. */
const RELATIONSHIPS = Object.freeze(['sequence', 'cycle', 'hierarchy', 'comparison']);

// The text a chunk of markup carries, with its tags gone.
//
// STRIPPED TO A FIXPOINT rather than in one pass, and the honest reason is narrower than it looks:
// CodeQL's js/incomplete-multi-character-sanitization keys on the SHAPE of a one-pass
// `replace(/<[^>]*>/g, …)` — deleting a tag can, in general, splice what surrounded it into a new
// one — and it raised three high-severity alerts (206-208) on hand-rolled copies of that line that
// had accumulated in the test tree. The loop is the accepted remediation and it costs nothing.
//
// WHAT IT IS NOT: a fix for a bypass anyone has demonstrated against THIS regex. Replacing the
// loop with a single pass was mutation-tested and every test still passed, including the
// adversarial payloads below — because `<[^>]*>` consumes from a `<` to the next `>`, so a `>`
// that survives has no `<` left in front of it to pair with. The loop is defensive and it makes
// the gate's invariant true by construction; it is not load-bearing today, and a future reader
// should know that rather than infer a bug that was never there.
//
// The separator is a SPACE, not '': `<b>a</b><b>b</b>` is two words, and joining them would make
// one. The collapse afterwards puts it back to single spaces.
/**
 * Tag strip to a FIXED POINT, never a single pass.
 *
 * `<<span>span>x` is one pass away from `<span>x`, so `s.replace(/<[^>]*>/g, …)` called ONCE is an
 * incomplete sanitizer: the strip can MANUFACTURE a tag out of text that was not one. Looping to a
 * fixed point is the mitigation, and `textOf` has always done it — this helper exists so the
 * MathML read inside `stripMathMirror` cannot quietly get the single-pass version, which is what
 * it had for one commit. Sharing it also means one place to fix if the shape is ever wrong again.
 *
 * The fixed point is not a guarantee that no `<` survives — `textOf('<<span>span>x')` is
 * `'span>x'`, not `'x'` — and that is deliberate: this is a text READER, and the label it produces
 * is written back into markup raw, so it must not silently un-escape an author's `&lt;`.
 *
 * `sep` is a space for prose (two adjacent elements are two words) and empty for MathML, whose
 * tokens are character-level: a space between `<mi>X</mi><mo>⊤</mo><mi>X</mi>` re-creates the
 * "X ⊤ X" spacing the mirror read exists to avoid.
 */
const stripTags = (html, sep) => {
  let s = String(html);
  for (let prev = null; prev !== s; ) { prev = s; s = s.replace(/<[^>]*>/g, sep); }
  return s;
};

/**
 * KATEX PRINTS ITS CONTENT THREE TIMES, and a tag strip reads all three.
 *
 * `$X$` renders as `<span class="katex">` holding a MathML mirror — `<mi>X</mi>` AND
 * `<annotation encoding="application/x-tex">X</annotation>` — beside the visual
 * `<span class="katex-html">`. Flattened, that is the string "X X X", and it went straight onto
 * a rendered slide the first time a component whose members contain math was enrolled in
 * splitting: `math`'s legend pages pointed at "→ X X X" (measured on
 * `examples/math-split-structure.md` at portrait, #2136).
 *
 * Of the three, the MathML mirror is the one worth keeping: it is the same symbols as plain
 * Unicode, which is what the visual half draws and what a screen reader announces. The visual
 * half is per-glyph boxes padded with U+200B and the annotation is TeX source, so both set a
 * wayfinding label badly — see the note inside. Depth-aware throughout: the mirror contains
 * nested `<span>`s, so a lazy `[\s\S]*?</span>` stops at the first inner close and leaves the
 * rest of the MathML behind.
 */
const stripMathMirror = (html) => {
  if (!html.includes('katex')) return html;
  let s = html;
  // PREFER THE CHARACTERS KaTeX PUT IN ITS MathML MIRROR — not the author's TeX source.
  //
  // Removing the a11y mirror stopped `$X$` reading "X X X", but what was left is KaTeX's VISUAL
  // half — one `<span>` per glyph box, plus the zero-width space it pads with — so a tag strip
  // turned `$y_i$` into "y i ␀" and `$X^\top X$` into "X ⊤ X". Reading the
  // `<annotation encoding="application/x-tex">` instead fixed that and introduced a worse one:
  // the annotation is SOURCE, so the forward pointer on `examples/math-split-structure.md` p13
  // shipped a literal `\sigma →` and p10 a literal `X^\top X →`. A backslash command on a
  // rendered slide is not a wayfinding label.
  //
  // The MathML mirror carries the SAME symbols as Unicode — `<mi>σ</mi>`, `<mo>⊤</mo>` — which is
  // both what the reader sees and what a screen reader announces. Joined WITHOUT a separator
  // (MathML tokens are character-level, so a space between them re-creates the "X ⊤ X" spacing
  // defect), `\sigma` reads `σ`, `X^\top X` reads `X⊤X`, `n \times p` reads `n×p`.
  //
  // Two shapes are honestly imperfect and are kept rather than special-cased: an ACCENT is
  // written base-then-mark, so `\hat\beta` reads `β^`, and a SUBSCRIPT loses its level, so
  // `y_i` reads `yi`. Both are the right glyphs in a chrome chip; both are pinned in
  // `test/unit/core/relationship.test.js` so a future change to the join says so.
  //
  // The annotation is a GUARD, not a live path, and this comment used to say otherwise. It claimed
  // the annotation covers `output: 'html'` — but the annotation LIVES INSIDE the MathML, so a
  // render with no `<math>` has no annotation either and falls through to the visual half. And no
  // shipping path passes `output: 'html'`: `lattice-emulator.js` sets `htmlAndMathml`, and the
  // `'html'` option was removed there for accessibility. So the branch is defensive — it costs one
  // line and would keep a pointer readable if a caller ever configured KaTeX differently — and the
  // real no-MathML fallback is the mirror-strip below plus the caller's tag walk, which degrade to
  // the visual half rather than to nothing. (Found by the HARD RULE #25 checker, which measured
  // both halves of the old claim.)
  const KATEX_SPAN = /<span[^>]*\sclass="[^"]*(?<![\w-])katex(?![\w-])/;
  const ANNOTATION = /<annotation[^>]*encoding="application\/x-tex"[^>]*>([\s\S]*?)<\/annotation>/;
  const MATHML = /<math\b[^>]*>([\s\S]*?)<\/math>/;
  for (let from = 0; from < s.length;) {
    const rel = s.slice(from).search(KATEX_SPAN);
    if (rel < 0) break;
    const at = from + rel;
    const end = findMatchingClose(s, 'span', at);
    if (end < 0) break;
    const span = s.slice(at, end);
    const mathml = MATHML.exec(span);
    // Character-level join, annotation dropped first so the source is never counted twice.
    // U+2061 FUNCTION APPLICATION, U+2062 INVISIBLE TIMES, U+2063 INVISIBLE SEPARATOR and
    // U+2064 INVISIBLE PLUS are real MathML content — KaTeX writes `\log x` as `log⁡x` with one
    // between — and they are INVISIBLE, so a label carrying them looks right and is not. U+200B
    // is the visual half's padding, on the same footing. All four go before the label does.
    const chars = mathml ? stripTags(mathml[1].replace(ANNOTATION, ''), '').replace(INVISIBLE, '').trim() : '';
    const tex = chars ? null : ANNOTATION.exec(span);
    const label = chars || (tex ? tex[1] : null);
    if (!label) { from = at + 1; continue; }
    const head = `${s.slice(0, at)} ${label} `;
    s = head + s.slice(end);
    from = head.length;
  }
  // A `.katex` span with no annotation, or a bare mirror, still has its mirror removed.
  for (;;) {
    const at = s.search(/<span[^>]*\bkatex-mathml\b[^>]*>/);
    if (at < 0) return s;
    const end = findMatchingClose(s, 'span', at);
    if (end < 0) return s;
    s = `${s.slice(0, at)} ${s.slice(end)}`;
  }
};

const textOf = (html) => stripTags(stripMathMirror(String(html)), ' ').replace(/\s+/g, ' ').trim();

// The signal is one line of --fs-meta chrome, so a member title has a length budget. Trailing
// sentence punctuation goes: card titles are authored as "Draft the policy." and the signal reads
// "Draft the policy →", not "…policy. →".
//
// (Every "→ next: X" quoted in the comments BELOW is a past render, recorded as it looked at the
// time. The lead-in word went on 2026-09-02 and the mark moved to the trailing edge; the defects
// those quotes describe are unchanged, so they are left as the measurements they are.)
//
// IT NO LONGER TRUNCATES, because nothing reaches it that could be truncated. This used to end
// `t.length > LABEL_MAX ? clip to LABEL_MAX-1 + '…' : t`, and that branch was UNREACHABLE: both
// call sites bound the length THEMSELVES and DECLINE rather than clip, because a truncated
// fragment ("→ next: A page carries one structural elem…") reads as a rendering bug rather than
// wayfinding. Measured by making the branch throw: 34 unit tests and five real deck renders —
// including the two decks whose whole subject is this signal — never entered it. The call is a
// no-op at both sites for the same reason (each passes a string it has already stripped).
//
// So a function that says it clips, called by two sites that say they never clip, was a
// contradiction a reader had to resolve before touching anything nearby — and the "clip can slice
// through an HTML entity" hazard it carried was a hazard in code that cannot run. `LABEL_MAX` is
// still the budget; it is enforced where the decision to decline is made, which is where it is
// visible.
/**
 * Where an authored NAME ends and its description begins — an em/en dash between spaces, a
 * colon, or a SENTENCE period.
 *
 * ONE definition, because there were two and they drifted into the same bug twice over. The
 * sentence-period arm was `\.\s+`, which fires on an ABBREVIATION: "FTC v. Avast" printed as
 * "next: FTC v" — a truncated, mis-spelled party name shown as wayfinding — and the same would
 * happen to "Inc.", "No.", "Art." or a middle initial. Three reviewers found it independently on
 * three different decks; none of the 34 unit tests did, because none carried an abbreviation.
 *
 * The discriminator is the token BEFORE the period, not the one after it. Looking AFTER cannot
 * work: "FTC v. Avast" and "Draft the policy. Then circulate" both put a capitalised word there.
 * What separates them is that a sentence ends on a WORD and an abbreviation ends on a stub — "v",
 * "Inc", "No", "Art", "Dr", a middle initial. So the period must follow at least three lower-case
 * letters to count as a sentence end.
 *
 * A heuristic, and its edges are worth stating: a two-letter word ("go.", "be.") will not break,
 * and a long abbreviation would. Both fail toward KEEPING the whole name, which the length budget
 * then judges — the opposite direction from printing half of one, which is what shipped.
 */
const CLAUSE_BREAK = /\s+[—–]\s+|:\s+|(?<=[a-z]{3})\.\s+/;

const LABEL_MAX = 42;
function trimTail(s) {
  return String(s).replace(/[.:;,]+$/, '').trim();
}

/**
 * AN EQUATION IS NOT A NAME — the math twin of the "a figure is not a name" rule below.
 *
 * A `derivation`'s table row is `| equation | what you did |`, so the flat path took the whole row
 * and the pointer on `examples/math-split-structure.md` p5.3 read
 * `limh→0f(x+h)−f(x)h=f′(x) take the limit →`: 24 characters of run-together operators in front of
 * the three words that actually say where the reader is going. It fit the budget, so nothing
 * declined it.
 *
 * The discriminator is a RELATION. A symbol names a thing and is a fine label — a legend member
 * authored `$\sigma$ — the logistic link` should still point at `σ`, and `X⊤X` and `n×p` are names
 * too. An equation makes a CLAIM, and a claim is not a name: the moment the leading math carries
 * `=`, `≠`, `<`, `≤`, `→` or a cousin, it is a statement about the symbols and the member's own
 * prose is the better label.
 *
 * So a leading equation is dropped and whatever follows it becomes the name. Dropping it is
 * refused when nothing follows — a member that is ONLY an equation keeps the equation, exactly as
 * a member that is only a figure keeps the figure — and the length budget still judges the result,
 * so a row whose prose is a sentence declines to the un-labeled pointer rather than clipping.
 */
// A RELATION, by Unicode BLOCK rather than by enumeration. The first cut listed the characters by
// hand and missed five commands an author would reach for on any ordinary slide — `\equiv` (U+2261),
// `\simeq` (U+2243), `\supset` (U+2283), `\longrightarrow` (U+27F6) and `\implies` (U+27F9) — so
// those rows kept the run-together equation the rule exists to remove. An enumeration keeps losing
// that race: the sixth miss is `\coloneqq` (U+2254), which nobody would think to list. The ranges
// are Arrows (2190–21FF) and Supplemental Arrows-A (27F0–27FF) whole, the RELATION half of
// Supplemental Math Operators (2A74–2AFF), and the relation slices of Mathematical Operators —
// set membership, similarity and equality, inequality, order, subset/superset and the turnstiles —
// plus the three ASCII ones.
//
// Three deliberate holes, each of which a wider range got wrong when tried:
//   · `+ − × ÷` and the n-ary operators (2A00–2A73, `\bigoplus` and friends) — an operator
//     COMBINES, it does not claim, so `n×p` stays a name;
//   · U+22A4 `\top` — this repo writes transpose as `X^\top X`, and the whole 22A2–22AF turnstile
//     block swallowed it, retitling the `X⊤X` legend page after its description;
//   · U+22A5 `\perp` goes with it. It IS a relation, but it is also lattice-theory bottom, and one
//     character is not worth guessing the author's intent over.
const RELATION = /[\u2190-\u21FF\u27F0-\u27FF\u2A74-\u2AFF\u2208-\u220D\u223C-\u2255\u2260-\u226F\u227A-\u228B\u22A2-\u22A3\u22A6-\u22AF\u221D=<>]/;
// KaTeX's invisible math operators, plus the zero-width space the visual half pads with.
const INVISIBLE = /[\u200B\u2061-\u2064]/g;
const WS = /\s/;
// One tag-name/attributes split, two consumers: the anchored single tag, and the `{1,3}` run the
// `<strong>` path leads with. Both used `<[a-zA-Z][\w-]*[^>]*>`, whose two overlapping quantifiers
// are quadratic on a tag that never closes — measured at 6.0s for a 40,000-character one through
// `labelOf`, and 0.02s after. Nothing in a real member is that shape; the point is that the cost is
// linear in what a member IS.
const TAG_OPEN_SRC = '<[a-zA-Z][^\\s>]*(?:\\s[^>]*)?>';
const TAG_OPEN = new RegExp(`^${TAG_OPEN_SRC}`);
const LEADING_STRONG = new RegExp(`^(?:${TAG_OPEN_SRC}\\s*){1,3}<strong>([\\s\\S]*?)</strong>`);
const CLASS_ATTR = /\sclass="([^"]*)"/;
const isKatexSpanTag = (tag) => /^<span[\s>]/.test(tag)
  && (CLASS_ATTR.exec(tag)?.[1] ?? '').split(/\s+/).includes('katex');
function dropLeadEquation(html) {
  const h = String(html);
  // Walk the OPENING tags a member leads with (`<td>`, `<p>`, a display wrapper) and stop at the
  // first `.katex` span. A single greedy tag-run regex cannot do this: it would swallow the span's
  // own opening tag and leave nothing to find.
  //
  // Both regexes here are deliberately UNAMBIGUOUS. `<[a-zA-Z][\w-]*[^>]*>` reads naturally and is
  // quadratic — `[\w-]` is a subset of `[^>]`, so `<aaaa…` with no `>` makes the engine re-split
  // the name at every position — and `[^>]*\sclass=` is the same trap with whitespace. Splitting
  // the tag NAME from its attributes on a mandatory space removes the overlap, and the class test
  // reads the attribute once and compares TOKENS, which is also more precise than a lookaround
  // hack: `katex-display` and `katex-mathml` are not `katex`, and `includes` says so directly.
  let at = 0;
  for (;;) {
    while (at < h.length && WS.test(h[at])) at += 1;
    const tag = TAG_OPEN.exec(h.slice(at));
    if (!tag) return h;
    if (isKatexSpanTag(tag[0])) break;
    at += tag[0].length;
  }
  const end = findMatchingClose(h, 'span', at);
  if (end < 0) return h;
  // `<` and `>` reach here as `&lt;` / `&gt;` — markdown-it escapes them and nothing decodes on the
  // way, because the label is written into the signal's markup RAW (`relSignal`, below) and the
  // browser decodes it there. That round-trip is why the label itself is left alone; only this
  // TEST decodes, so `$f(x) < y$` is recognized as the claim it is.
  const decoded = textOf(h.slice(at, end)).replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  if (!RELATION.test(decoded)) return h;
  // THE SEPARATOR GOES WITH THE EQUATION IT SEPARATED. A legend member is authored
  // `- $<math>$ — <description>`, so removing the span alone leaves the dash leading, and
  // `CLAUSE_BREAK` cannot fire on a dash with nothing before it: the chip shipped reading
  // `— its right adjoint →`. Rendered and read on a probe deck by the HARD RULE #25 checker.
  // `(?:\s*(?:<[^>]*>)?)*` is what this was, and it is CATASTROPHIC: the inner group can match
  // empty, so the outer `*` has exponentially many ways to split a failing input. An alternation of
  // two NON-EMPTY, disjoint branches — whitespace or one tag — walks the same prefix once.
  const rest = h.slice(0, at) + h.slice(end).replace(/^(?:\s|<[^>]*>)*[—–:;,]\s*/, ' ');
  return textOf(rest).trim() ? rest : h;
}

/**
 * `dropLeadEquation` to a FIXED POINT — a member can lead with two.
 *
 * `| $a = b$ $c = d$ | combine |` dropped only the first, so the label kept the second equation
 * it was supposed to remove. Looping reads `combine`. The loop terminates because every drop
 * shortens the string and every refusal (no leading span, no relation, nothing left) returns the
 * input unchanged.
 *
 * WHAT IT STILL DOES NOT REACH, stated rather than papered over: an equation that is not LEADING.
 * `| $a = b$ and $c = d$ | combine |` reads `and c=d combine`, because after the first drop the
 * remainder leads with the word "and". Going further would mean deleting math from the middle of
 * an author's sentence, which is a different and much less safe rule than "the thing in front is
 * not the name". No deck in the corpus is shaped this way.
 */
function dropLeadEquations(html) {
  let s = String(html);
  for (let prev = null; prev !== s; ) { prev = s; s = dropLeadEquation(s); }
  return s;
}

/**
 * A math-derived label that carries a CURATED SHAPE GLYPH says nothing (HARD RULE #29).
 *
 * Reading KaTeX's MathML mirror puts the author's own `\to` into the chip as U+2192 — and the chip
 * is set in the deck's TEXT face, not its math face, so that arrow falls back to whatever the
 * rendering machine has while the engine draws the pointer's own arrow two characters to its right
 * from `--shape-arrow-right`. One pill, two arrows, two faces. Measured on a probe deck by the
 * HARD RULE #25 checker; `→ ← ↑ ↓ ↔ ⇒` are all in `SHAPE_GLYPHS`.
 *
 * The label DECLINES rather than deleting the glyph, because deleting it would change what the
 * author wrote (`F:A→B` is not `F:AB`) and because '' degrades to the caller's un-labeled pointer,
 * which still points — the same "say nothing rather than something broken" the flat path already
 * takes for a sentence with no name in it. It is scoped to math because that is the channel this
 * branch opened; an author's typed arrow in prose is #29's `lint:deck` warning, which coaches
 * rather than refuses, and silently dropping their wayfinding here would not coach anything.
 *
 * `≠` and the other relations are NOT shape glyphs (`NOT_SHAPES` in the kernel says so), so
 * `divide by h≠0` is unaffected.
 */
function mathSafe(text, src) {
  const t = String(text);
  // A SUBSTRING test, not a class-attribute regex: `[^"]*katex` is the polynomial shape this file
  // has been trimming out, and precision buys nothing here. The only false positive is prose that
  // literally says "katex" AND carries a shape glyph, where declining the label is harmless.
  if (!String(src).includes('katex')) return t;
  return shapeGlyphRe().test(t) ? '' : t;
}

/**
 * A member's own title. Card-shaped members lead with `<strong>` (the nested `- Title` /
 * `  - body` contract, HARD RULE #5); a component that renders a real subheading uses
 * `<h3>`+; anything else falls back to the member's leading text before its nested list.
 */
function labelOf(memberOuter) {
  const html = String(memberOuter || '');
  // LEADING `<strong>` only — the card contract puts the title first (`- **Build in region.**`),
  // so anchor the match to the member's opening tag. Matching a `<strong>` ANYWHERE let a bolded
  // phrase buried in the body become the label: a member reading "Sign off — the chair signs the
  // **policy hash**" signaled "→ next: policy hash". Found by the HARD RULE #25 red team.
  // `{1,3}` opening tags: markdown-it wraps a LOOSE list item's first run in a `<p>`
  // (`<li><p><strong>…`) and a table member leads `<tr><td><strong>…`.
  //
  // EVERY path declines the same way, and the guard has to be here rather than only on the flat
  // run below. `<strong>` was read as "the author named this, so it is short" — but a component
  // TRANSFORM can wrap a member's whole text in `<strong>`, and `list-criteria` does exactly
  // that. So the named path clipped full sentences: the shipped `examples/split-structure.pdf`
  // carried "next: A heading that says which run it belongs…" and "next: A way back to the whole
  // — the k-of-N rail…", which are character-for-character the shape the decision record claims
  // was removed. Found by the HARD RULE #25 independent checker, against the committed artifact.
  // CUT AT THE CLAUSE BREAK FIRST, then decline if what is left is still not a name. This is the
  // same two-step the flat path below already does, and applying it here is what keeps the fix
  // from trading truncated labels for no labels at all: "A way back to the whole — the k-of-N
  // rail in the footer band" is 59 characters and becomes "A way back to the whole". Only a run
  // with no break AND no end in sight declines to the un-labeled pointer.
  //
  // THE SECOND EXAMPLE THIS COMMENT USED TO GIVE WAS WRONG, and the way it was wrong is worth
  // keeping. It claimed "A heading that says which run it belongs to" is "a genuine 42-character
  // name and survives whole". The string is 43 characters — hand-counted, never re-derived — so
  // against `LABEL_MAX = 42` it declines by ONE, and the page pointing at it reads the un-labeled
  // "continues" instead. Found on the shipped `examples/split-structure.pdf` by a visual
  // reviewer who noticed that one page in a run of five was generic while its four neighbors
  // named their successor; the comment right here asserted the opposite.
  //
  // The budget is deliberately NOT changed to accommodate it. `LABEL_MAX` bounds every pointer
  // in every deck and was set with the footer band in mind, so moving it is a decision about how
  // long a pointer may be rather than a fix for one deck's 43-character bullet. What is fixed is
  // the claim: a name at the budget's edge declines, and this comment no longer says otherwise.
  const named = (text) => {
    // `dropLeadEquations` here as well as on the flat path: "an equation is not a name" was scoped
    // to the flat run at first, so a card-shaped or subheading-shaped math member still labelled
    // its neighbor page with an equation. No shipped deck hits it; the rule should not depend on
    // which shape the author reached for. (Found by the HARD RULE #25 checker.)
    const t = mathSafe(textOf(dropLeadEquations(text)), text);
    const head = t.split(CLAUSE_BREAK)[0].replace(/[.:;,]+$/, '').trim();
    return head && head.length <= LABEL_MAX ? trimTail(head) : '';
  };
  //
  // A FIGURE IS NOT A NAME. `stats` and `kpi` lead their member with the VALUE — `<strong>119%
  // </strong>` above a nested "Net revenue retention" — so taking the leading `<strong>` pointed a
  // whole run at its own numbers: "next: $0.9M" on every page, and a cover reading "$48.2M →".
  // The reader is told which figure comes next, never which metric. Measured on
  // `examples/adaptive-sizing.pdf`.
  //
  // So when the lead is a bare VALUE TOKEN — carries a digit and no space, which is what a
  // figure looks like and what a name does not — the member's following text is preferred if it
  // yields one. That also settles the "next: 31" case the record already carries: a bullet led by
  // a bolded count falls through to its own sentence, which has no clause break and is too long,
  // so it declines to the un-labeled pointer rather than naming a number.
  // A figure with NOTHING after it keeps the figure — a roadmap horizon authored as `2026` alone
  // still points at 2026, because there the numeral IS the name.
  const isFigure = (t) => /\d/.test(t) && !/\s/.test(t.trim());
  // THE CAROUSEL'S OWN TITLE SLOT, checked first because it is the most explicit signal there
  // is: `coverWindow` (lib/core/carousel.js) re-authors each member as
  // `<span class="split-pt-t">title</span><span class="split-pt-b">body</span>`, so the title is
  // not inferred from shape — it is labeled.
  //
  // Without this every re-authored run declined to the un-labeled pointer. The member carries no
  // `<strong>` and no `<h3>`, so the flat path took the whole run ("Recency Time-decay against a
  // configurable half-life."), found no clause break, ran past the 42-character budget and
  // returned ''. Measured on a `list-tabular` split: every page read "→ continues" while the page
  // it pointed at was plainly named "Recency". That is the §0b failure the signal exists to
  // prevent — atomised members with no adornment joining them — reintroduced on the five
  // strategies that re-author their body.
  const slotTitle = html.match(/<span class="split-pt-t">([\s\S]*?)<\/span>/);
  if (slotTitle) return named(slotTitle[1]);
  const strong = html.match(LEADING_STRONG);
  if (strong) {
    const lead = textOf(strong[1]).trim();
    if (!isFigure(lead)) return named(strong[1]);
    // The member's own following text — its nested list's first item (the `stats`/`kpi` shape,
    // where the metric name sits under the figure), else whatever runs on after the `</strong>`
    // (a bullet led by a bolded count). Both go through `named`, so a run that is a sentence
    // rather than a name still declines instead of printing a fragment.
    const nested = html.match(/<(?:ul|ol)\b[^>]*>\s*<li[^>]*>([\s\S]*?)<\/li>/);
    const after = html.split(/<\/strong>/)[1] || '';
    const source = nested ? nested[1] : after.split(/<(?:ul|ol)\b/)[0];
    const follow = named(source);
    // A figure with following text that yields no NAME declines rather than falling back to the
    // figure: "31 keep whole and ring on overflow…" points at nothing useful either way, and
    // "continues" at least does not claim a number is the next page's subject. A figure with
    // NOTHING after it keeps the figure, because there the numeral is all the author wrote.
    if (follow) return follow;
    return textOf(source).trim() ? '' : named(strong[1]);
  }
  const head = html.match(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/);
  if (head) return named(head[1]);
  // The FLAT authoring form, which is what a component's docs usually teach: `list-steps` §
  // Authoring is literally `1. First step — a sentence describing what you do here.` — one text
  // run, no `<strong>`, no nested list. Taking the whole run and clipping it at the adornment
  // budget produced "→ next: Match — accounts payable matches the invo…" on every page of a real
  // render: a truncated sentence, not wayfinding. So cut at the first CLAUSE BREAK — an em/en dash
  // between spaces, a colon, or a sentence period — which is exactly where the authored NAME ends
  // and its description begins. Falls through to the whole run when there is no break (a bare
  // label), and `clip` still bounds it.
  // `TAG_OPEN` rather than the `<[a-zA-Z][\w-]*[^>]*>` this line used to inline: same tags, and the
  // name/attribute split keeps it linear (see `dropLeadEquation`).
  const flatSrc = html.replace(TAG_OPEN, '').split(/<(?:ul|ol)\b/)[0];
  const lead = mathSafe(textOf(dropLeadEquations(flatSrc)), flatSrc);
  const name = lead.split(CLAUSE_BREAK)[0];
  const flat = (name || lead).replace(/[.:;,]+$/, '').trim();
  // A member with no `<strong>`, no subheading and no clause break has no NAME to point at —
  // only a sentence. Clipping one produces a truncated fragment ("→ next: A page carries one
  // structural element; no…"), which reads as a rendering bug rather than wayfinding, and it
  // is the same failure the clause-break split above exists to prevent — it just cannot fire
  // when there is no break to find. So say nothing rather than something broken: '' degrades
  // to the caller's un-labeled pointer, which still points.
  //
  // This became reachable when the carousel went universal (2026-09-01). Before that, the
  // signal ran only on four components whose members are all card-shaped or named, so every
  // member had a real label and the flat-run path effectively never truncated.
  if (flat.length > LABEL_MAX) return '';
  return trimTail(flat);
}

/**
 * The SHARED CRITERIA a comparison is scored on — the badge labels a verdict/pricing member
 * carries (`<span class="badge …">`, markdown-it's `verdictGridBadges`). Read from the FIRST
 * member because §0c's contract is that every option carries the same criteria in the same
 * order; reading them per page would let a drifting card silently rewrite the signal.
 */
function criteriaOf(memberOuter) {
  return [...String(memberOuter || '').matchAll(/<span class="badge[^"]*">([\s\S]*?)<\/span>/g)]
    .map((m) => textOf(m[1]))
    .filter(Boolean);
}

/**
 * The MEMBERS a page holds, as outer HTML, on the split axis. Reads the same primary
 * collection the partition cut (`ul`/`ol` → its `li` children, `table` → its `tr` rows), so
 * the signal describes the members that are really on the page.
 */
function membersIn(pageInner, axis) {
  const html = String(pageInner || '');
  if (axis === 'row') {
    const at = html.search(/<tbody\b/);
    // No `<tbody>` (a hand-written table in raw HTML — markdown-it always emits one): scan from
    // after `</thead>` instead of from 0, or the HEADER row counts as a member and the signal
    // says "Option 1 of 4" for a three-option table. The `<th>`s are the criteria, never a member.
    const headEnd = html.search(/<\/thead\s*>/i);
    const from = at >= 0
      ? html.indexOf('>', at) + 1
      : (headEnd >= 0 ? html.indexOf('>', headEnd) + 1 : 0);
    const region = html.slice(from);
    return directChildren(region, 'tr').map((s) => region.slice(s.start, s.end));
  }
  const ulAt = html.indexOf('<ul');
  const olAt = html.indexOf('<ol');
  let at = -1;
  let tag = '';
  if (ulAt >= 0 && (olAt < 0 || ulAt < olAt)) { at = ulAt; tag = 'ul'; }
  else if (olAt >= 0) { at = olAt; tag = 'ol'; }
  if (at < 0) return [];
  const [span] = directChildren(html.slice(at), tag);
  if (!span) return [];
  const open = html.indexOf('>', at) + 1;
  const region = html.slice(open, at + span.end - `</${tag}>`.length);
  return directChildren(region, 'li').map((s) => region.slice(s.start, s.end));
}

// The signal's MARK is drawn, not typed (HARD RULE #29). `mark` names a shape and the CSS
// paints it with a mask token (`--shape-arrow-right` / `-down` / `-up` / `--shape-refresh`);
// the text beside it carries no glyph at all.
//
// These used to be HTML entities — `&rarr;`, `&#8635;`, `&darr;`, `&uarr;` — written straight
// into the rendered DOM. #29 exists because the deck's own type family carries almost none of
// those characters, so each one fell back to whatever face the rendering machine had, and one
// deck rendered three ways across the three surfaces it reaches. The #29 gate did not catch
// them: `checkTypedGlyphs` matches literal CHARACTERS, and an entity is not one until the
// parser has run.
// The LABEL is wrapped, and that is structural rather than cosmetic. The mark and the words
// are different things — one is drawn by the engine, one is the run's own text — and only an
// element can carry `text-overflow: ellipsis`: it never applies to a flex CONTAINER, so a bare
// text node beside the mark could be clipped mid-word but never ellipsised. Measured across the
// six shipped decks: 98 signals, median label 16 characters, 7 past 40. The wrapper is what lets
// those 7 stay one pill instead of becoming a two-line lozenge.
//
// NOT `lat-split-rel-t`, which is what it was called for about an hour. That name CONTAINS the
// parent's class as a prefix, and this codebase matches HTML as TEXT in a lot of places — the
// signal's own strip regex in auto-split.js, and `(html.match(/lat-split-rel/g)).length`
// counters in two test files, every one of which silently started counting each signal twice.
// A child class never repeats its parent's class as a prefix here, for that reason.
const marker = (body, mark) =>
  `<div class="lat-split-rel" data-mark="${mark}"><span class="lat-split-label">${body}</span></div>`;

/**
 * The signal for every body page of a run — one HTML string per page, `''` where that kind
 * has nothing to say there (a sequence's last page has no next step).
 *
 * `pageMembers` is the per-page member list (`membersIn` over each page inner). Taking the
 * whole matrix rather than one page at a time is what makes the signal derived: page k's
 * signal reads page k+1's first member, so it CANNOT be produced without its neighbor, and
 * editing that neighbor necessarily changes it.
 *
 * Returns null for an unknown kind (the caller then emits no signal at all — never a guess).
 */
function relationshipSignals(kind, pageMembers) {
  if (!RELATIONSHIPS.includes(kind)) return null;
  const pages = Array.isArray(pageMembers) ? pageMembers.map((ms) => (Array.isArray(ms) ? ms : [])) : [];
  if (pages.length < 2) return null;
  const total = pages.reduce((a, ms) => a + ms.length, 0);
  // No members resolved on ANY page — the axis the caller passed found no collection here. Say
  // nothing rather than guess: the comparison branch below floors its range at one member, so an
  // empty matrix would have printed the human-visible nonsense "Option 1 of 0" on every page.
  // (HARD RULE #25 checker.) The three narrative kinds already degrade to '' via empty labels;
  // this makes the degradation uniform and explicit.
  if (total === 0) return pages.map(() => '');
  const lead = pages[0][0] || '';
  const firstLabel = labelOf(lead);
  const criteria = criteriaOf(lead).slice(0, 3);
  // 1-based index of each page's FIRST member, so "Option N of M" counts members, not pages —
  // correct even if a comparison ever paces more than one option to a page.
  const starts = [];
  let acc = 0;
  for (const ms of pages) { starts.push(acc + 1); acc += ms.length; }

  return pages.map((ms, k) => {
    const last = k === pages.length - 1;
    const next = labelOf(pages[k + 1]?.[0] || '');
    const prev = labelOf(pages[k - 1]?.at(-1) || '');
    // A next page always gets a pointer; the LABEL is what may be missing (an unnamed member —
    // see `labelOf`). "→ continues" is the honest un-labeled form: it still tells the reader the
    // run has not ended, which is the signal's whole job, without naming something it cannot name.
    if (kind === 'sequence') return last ? '' : marker(next ? next : 'continues', 'next');
    if (kind === 'cycle') {
      if (!last) return next ? marker(next, 'next') : '';
      return firstLabel ? marker(`back to ${firstLabel}`, 'loop') : '';
    }
    if (kind === 'hierarchy') {
      if (!last) return next ? marker(`governs ${next}`, 'down') : '';
      return prev ? marker(`under ${prev}`, 'up') : '';
    }
    const from = starts[k];
    const to = from + Math.max(1, ms.length) - 1;
    const range = from === to ? `Option ${from} of ${total}` : `Options ${from}&ndash;${to} of ${total}`;
    return marker(criteria.length ? `${range} &middot; comparing ${criteria.join(' &middot; ')}` : range, 'count');
  });
}

module.exports = { RELATIONSHIPS, relationshipSignals, membersIn, labelOf, criteriaOf, textOf,
  signalMarkup: marker,
};
