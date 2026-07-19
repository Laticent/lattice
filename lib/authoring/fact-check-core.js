/**
 * Pure, dependency-free fact-check CORE — the deterministic floor of the deck
 * fact-checking feature (engineering/decisions/2026-06-16-deck-fact-checking.md).
 * Sibling to lint-core (authoring footguns) and review-core (presentation traps):
 * this one builds the **claim inventory + verifiability triage** a deck's factual
 * claims need before any verdict is reached.
 *
 * It has NO `fs` and NO `require` of lib/components, so it bundles cleanly for the
 * browser (the Drawing Board fact-check panel) and the Node CLI alike — the same
 * constraint lint-core/review-core hold to.
 *
 * THE DIVISION OF LABOUR (the ADR's founding rule, mirroring ArchitectModel's
 * "the model NEVER owns correctness"): everything in this file is deterministic —
 * it LOCATES candidate claims, classifies their *verifiability* (can this even be
 * checked, and by whom?), derives provisional freshness, and encodes the
 * `needs_deeper` formula. It deliberately does NOT reach a verdict, assign a
 * confidence, or fetch a source — those are the model layer's job, landed
 * separately (and an LLM "verdict from memory" is hedged by exactly the
 * confidence/freshness/cross-model signals this floor sets up). A record's
 * model-owned fields (`verdict`, `verdict_conf`, `sources`) stay null until that
 * layer fills them.
 *
 * Conservative by design — like review-core, a false "this is a claim" is worse
 * than a miss, so extraction only fires on lines carrying a *checkable signal*
 * (a statistic, a date, a ranking/superlative, or an attribution) plus every
 * blockquote (a quotation is inherently checkable). Pure prose with no such
 * signal is not a factual claim and is skipped.
 */

const { splitTopLevel } = require('./slide-split');

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;

// Front matter occupies the first two `---`-split chunks (the empty pre-fence
// text + the YAML body) when the deck opens with a complete `---…---` block. A
// claim's `slide` is the HUMAN 1-based slide number with front matter excluded —
// matching lint-core/review-core, the preview's "Slide N", and the Reveal jump.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
function fmChunks(source) {
  return FRONT_MATTER.test(String(source || '')) ? 2 : 0;
}

// ── Signal detectors — what makes a line a *checkable* factual claim ──────────

// A statistic: a percentage/multiplier, a currency figure, a magnitude-word
// figure (3.2bn, 14k), or a grouped/decimal number (1,200 — 4.2). A bare small
// integer is intentionally NOT a stat (it's usually a list counter or "3 ways").
// NB: the unit boundaries are TRAILING-only (`x\b`, not `\bx\b`) because the unit
// abuts the digit ("4.2x", "120bps") — a leading `\b` there is word→word and
// never matches.
const PERCENT_MULT_RE = /\d[\d,.]*\s?(?:%|×|x\b|pp\b|bps\b)/i;
const MONEY_RE = /[$€£¥]\s?\d|\b\d[\d,.]*\s?(?:bn|k|m|billion|million|trillion)\b/i;
const BIGNUM_RE = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b/;
// Global form (for `.match()` in yearsIn — never `.test()`, which would carry
// lastIndex) and a stateless literal for boolean checks.
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const YEAR_LITERAL = /\b(?:19|20)\d{2}\b/;
// A ranking / superlative — "first to ship", "market leader", "#1", "largest".
// `#1` is broken out of the `\b…\b` group: a leading `\b` before `#` is
// non-word→non-word after a space and never matches.
const RANKING_RE = /\b(?:first|1st|number one|largest|biggest|smallest|fastest|leading|market leader|only|world'?s|best-selling)\b|#1\b/i;
// An attribution — names a source, so the claim's *provenance* is checkable.
// Broad on purpose: this is an EXTRACTION signal (does the line cite anything?),
// not a verifiability verdict.
const ATTRIBUTION_RE = /\b(?:according to|per\s|reported by|cited|gartner|forrester|idc|mckinsey|nielsen|statista|says|stated|study|survey|research)\b/i;
// A NAMED, EXTERNAL source — a research house, a wire, a regulator/filing. Only
// this (not the broad ATTRIBUTION_RE) flips a first-person claim out of `insider`
// in triage: "per Gartner" is external, but "per our internal study" is NOT — the
// generic word "study" must never launder the deck's own number into a
// verifiable one (the insider gate's whole reason to exist; ADR §1/§8 fail-safe).
const EXTERNAL_SOURCE_RE = /\b(?:gartner|forrester|idc|mckinsey|bain|deloitte|nielsen|statista|bloomberg|reuters|the economist|sec\b|10-?k|annual report|census|world bank|imf|oecd|eurostat)\b/i;

function hasStat(text) {
  return PERCENT_MULT_RE.test(text) || MONEY_RE.test(text) || BIGNUM_RE.test(text);
}
function detectSignals(text) {
  return {
    stat: hasStat(text),
    year: YEAR_LITERAL.test(text),
    money: MONEY_RE.test(text),
    ranking: RANKING_RE.test(text),
    attribution: ATTRIBUTION_RE.test(text),
  };
}
function hasSignal(sig) {
  return sig.stat || sig.year || sig.ranking || sig.attribution;
}

// ── Triage vocabularies — the verifiability classes (ADR §1) ──────────────────

// Puffery: marketing adjectives that aren't factual claims at all. Routed to
// `opinion` (editorial's concern, not fact-check's) — but ONLY when the line
// carries no hard figure, since "best-in-class, 99.9% uptime" has a checkable
// number riding alongside the boast.
const PUFFERY_RE = /\b(?:best-in-class|best-of-breed|best-in-breed|world-class|world'?s best|industry-leading|cutting-edge|state-of-the-art|game[-\s]?chang(?:ing|er)|revolutionary|seamless|next-gen(?:eration)?|unparalleled|unrivall?ed|premier|turnkey|frictionless|effortless|synerg(?:y|istic))\b/i;
// First-person subject: the deck's OWN metrics — its revenue, its NPS, its pilot
// results. Externally unverifiable; the author is the only source. Fails safe
// toward `insider` (the ADR's chosen error direction) unless the line attributes
// an outside source, in which case the figure is external/sourced.
const FIRST_PERSON_RE = /\b(?:our|we|we're|we've|us|my|in-house|internal(?:ly)?|proprietary|unpublished)\b/i;
// Forward-looking language — only the forecast's source/method is checkable, not
// the outcome (which hasn't happened).
const FORWARD_RE = /\b(?:will|going to|expected to|projected|forecaste?d?|anticipated?|set to|on track to|poised to|estimated to|aims? to|plans? to|by\s+(?:19|20)\d{2})\b/i;

function yearsIn(text) {
  return (String(text).match(YEAR_RE) || []).map(Number);
}

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Classify a claim's VERIFIABILITY (ADR §1). Returns `{ class, basis }` where
 * class is one of: 'opinion' (not a factual claim), 'insider' (the author's own /
 * externally-unverifiable figure), 'forward' (the future — only the source is
 * checkable), or 'external' (a public record could confirm it). `basis` records
 * WHY, so the model layer can see — and, for the ambiguous public/private case,
 * override — the deterministic call. Order is most-specific first.
 */
function triageClaim(text, opts = {}) {
  const now = opts.now || CURRENT_YEAR;
  const figure = hasStat(text) || YEAR_LITERAL.test(text);
  if (PUFFERY_RE.test(text) && !figure) return { class: 'opinion', basis: 'puffery' };
  // Only a NAMED external source pulls a first-person claim out of `insider` —
  // "per Gartner" is external, "per our internal study" stays insider.
  const externallySourced = EXTERNAL_SOURCE_RE.test(text);
  if (FIRST_PERSON_RE.test(text) && !externallySourced) {
    return { class: 'insider', basis: 'first-person subject' };
  }
  const futureDated = yearsIn(text).some((y) => y > now);
  if (FORWARD_RE.test(text) || futureDated) {
    return { class: 'forward', basis: futureDated ? 'future-dated' : 'forward-looking language' };
  }
  // Default. Provisional: a third-party PRIVATE company's figure is also
  // unverifiable, but telling public from private is a model judgement — the
  // basis flags this as the floor's best guess, not a settled call.
  return { class: 'external', basis: 'default-external' };
}

/**
 * A high-stakes figure — the headline number on a "money slide" the ADR singles
 * out for escalation: a currency amount or a growth multiplier. Deterministic.
 */
function highStakesFigure(text) {
  // Trailing boundary only on the ASCII `x` (`x\b`); `×` is non-word and needs no
  // boundary — a leading `\b` here would never match the digit-abutting unit.
  return MONEY_RE.test(text) || /\d+(?:\.\d+)?\s?(?:×|x\b)/i.test(text);
}

/**
 * The latest year a claim mentions — a deterministic `as_of` hint and the input
 * to the provisional staleness prior. Returns a number, or null if undated.
 */
function extractAsOf(text) {
  const ys = yearsIn(text);
  return ys.length ? Math.max(...ys) : null;
}

/**
 * Provisional staleness from the `as_of` year alone (the model may override with
 * real knowledge of whether the fact actually moved). Undated → null (can't tell
 * deterministically). Current/last year → low; 2–4 years → med; older → high.
 */
function provisionalStaleness(asOf, nowYear) {
  if (asOf == null) return null;
  const age = (nowYear || CURRENT_YEAR) - asOf;
  if (age <= 1) return 'low';
  if (age <= 4) return 'med';
  return 'high';
}

/**
 * The `needs_deeper` derivation (ADR §2/§4) — pure, the SINGLE place the
 * escalation rule lives. Returns `{ flag, reason }`. Note the two classes deep
 * web research can't help are *not* escalated: `opinion` (nothing factual to
 * check) and `insider` (no external record exists — the author confirms it, so
 * it gets the "attach your source" affordance instead, never a research spend).
 * `opts.tau` is the verdict-confidence threshold (default 0.7).
 */
function needsDeeper(record, opts = {}) {
  const tau = opts.tau != null ? opts.tau : 0.7;
  if (record.class === 'opinion') return { flag: false, reason: 'not a factual claim' };
  if (record.class === 'insider') {
    return { flag: false, reason: 'insider — no external record; confirm your own source' };
  }
  if (record.class === 'forward') {
    return { flag: true, reason: 'forward-looking — only the forecast source is checkable' };
  }
  if (record.verdict_conf == null) return { flag: true, reason: 'not yet verified' };
  if (record.verdict_conf < tau) return { flag: true, reason: 'low verdict confidence' };
  if (record.staleness_risk === 'high') return { flag: true, reason: 'likely outdated since cutoff' };
  if (record.high_stakes) return { flag: true, reason: 'high-stakes figure' };
  return { flag: false, reason: 'verified with confidence' };
}

// ── Extraction — walk the deck, pull candidate claims with their locations ────

// Inline markdown that should be stripped to recover the readable proposition,
// while KEEPING link text (`[text](url)` → text) and dropping a trailing inline-
// code "pill" value (`… `48.2`` → …), mirroring lint-core's map-name handling.
function cleanInline(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/`([^`]*)`/g, '$1') // inline code → its text — KEEP the value: a
    // pill is often the figure itself (`$5M`), and dropping it would erase the
    // claim's only signal and lose the line entirely.
    .replace(/[*_]/g, '') // emphasis marks
    .replace(/\s+/g, ' ')
    .trim();
}

// Classify a raw source line into a claim KIND + its readable text, or null if
// the line carries no proposition (blank, directive, image, table rule, HTML,
// fence marker). List markers and heading hashes are stripped.
function lineToClaim(raw) {
  const line = raw.replace(/\s+$/, '');
  const t = line.trim();
  if (!t) return null;
  // Directives / HTML tags — but NOT a bare `<` before a digit ("<5% churned",
  // "<$1M cost"), which is a real claim, not markup.
  if (/^<!--/.test(t) || /^<[a-zA-Z/!]/.test(t)) return null;
  if (/^!\[/.test(t)) return null; // image
  if (/^[|>\s-]*\|[-:|\s]*\|?\s*$/.test(t) && /[-:]/.test(t)) return null; // table rule row
  if (/^(?:```|~~~)/.test(t)) return null; // fence marker (handled by caller too)
  if (/^-{3,}$/.test(t)) return null; // horizontal rule

  const heading = t.match(/^(#{1,3})\s+(.+)$/);
  if (heading) return { kind: 'heading', text: cleanInline(heading[2]) };
  const quote = t.match(/^>\s+(.+)$/);
  if (quote) return { kind: 'quote', text: cleanInline(quote[1]) };
  const item = t.match(/^([-*]|\d+\.)\s+(.+)$/);
  if (item) return { kind: 'bullet', text: cleanInline(item[2]) };
  return { kind: 'prose', text: cleanInline(t) };
}

/**
 * Extract candidate factual claims from deck source. Returns an array of
 *   { slide, line, component, kind, text, signals }
 * where `slide` is the human 1-based number and `line` is the trimmed source line
 * (the lint-core/review-core finding convention — the panel maps it to an editor
 * position the same way it does lint findings). Code fences, math blocks, front
 * matter, and signal-free prose are skipped. Pure; no model.
 */
function extractClaims(source) {
  const claims = [];
  const slides = splitTopLevel(source);
  const fm = fmChunks(source);

  slides.forEach((slide, idx) => {
    if (idx < fm) return; // front matter / pre-fence empty chunk
    const human = idx - fm + 1;
    const tokensMatch = slide.match(CLASS_DIRECTIVE);
    const component = tokensMatch ? tokensMatch[1].trim().split(/\s+/)[0] : null;

    let inFence = false;
    for (const raw of slide.split('\n')) {
      if (/^\s*(?:```|~~~)/.test(raw)) { inFence = !inFence; continue; }
      if (inFence) continue; // code / mermaid / fenced math
      const parsed = lineToClaim(raw);
      if (!parsed?.text) continue;
      const signals = detectSignals(parsed.text);
      // A quote is inherently checkable; otherwise require a checkable signal.
      if (parsed.kind !== 'quote' && !hasSignal(signals)) continue;
      claims.push({
        slide: human,
        line: raw.trim(),
        component,
        kind: parsed.kind,
        text: parsed.text,
        signals,
      });
    }
  });
  return claims;
}

/**
 * Build a per-claim RECORD (ADR §3) from an extracted claim, with the
 * deterministic fields filled and the model-owned fields left null until the
 * verifier runs. `overrides` lets the model layer (or a test) supply verdict /
 * confidence / sources. Pure.
 */
function makeRecord(claim, opts = {}) {
  const now = opts.now || CURRENT_YEAR;
  const { class: cls, basis } = triageClaim(claim.text, { now });
  const asOf = extractAsOf(claim.text);
  const base = {
    claim: claim.text,
    slide: claim.slide,
    line: claim.line,
    component: claim.component || null,
    kind: claim.kind,
    class: cls,
    basis,
    as_of: asOf,
    high_stakes: highStakesFigure(claim.text),
    // Model-owned — null/empty until the verifier (a separate layer) runs.
    verdict: null,
    verdict_conf: null,
    staleness_risk: provisionalStaleness(asOf, now), // a deterministic prior
    sources: [],
    suggested_fix: null,
    ...opts.overrides,
  };
  base.needs_deeper = needsDeeper(base, { tau: opts.tau });
  return base;
}

/**
 * The deterministic floor end-to-end: extract → triage → provisional records.
 * Returns an array of records (ADR §3) with NO verdicts — the claim inventory a
 * Drawing Board panel or CLI can render immediately (which claims are
 * insider-gated, which are forward-looking, which already look high-stakes) and
 * the model verification layer consumes. `opts.now` pins the year for
 * deterministic tests; `opts.tau` sets the needs_deeper confidence threshold.
 */
function factCheckSource(source, opts = {}) {
  return extractClaims(source).map((c) => makeRecord(c, opts));
}

module.exports = {
  CLASS_DIRECTIVE,
  PUFFERY_RE,
  FIRST_PERSON_RE,
  FORWARD_RE,
  RANKING_RE,
  ATTRIBUTION_RE,
  EXTERNAL_SOURCE_RE,
  detectSignals,
  hasStat,
  triageClaim,
  highStakesFigure,
  extractAsOf,
  provisionalStaleness,
  needsDeeper,
  cleanInline,
  lineToClaim,
  extractClaims,
  makeRecord,
  factCheckSource,
};
