/**
 * chart-narration — a deliberately narrow set of narrators for slide classes
 * whose real insight is a COMPUTED relationship that exists only in the
 * rendered chart, never in the raw slide Markdown `slideToSpeech` reads.
 *
 * Read-aloud/Present only ever has the slide's raw Markdown (no rendered
 * HTML) at the point narration is built, so each narrator below re-derives the
 * SAME parse its component's transform does, directly off the Markdown list
 * syntax `slideToSpeech` already understands — no HTML walker needed.
 *
 * This is a set of pilots, not a generic engine: a manifest-schema-driven
 * "spokenTemplate" covering the whole chart family is deliberately deferred —
 * speculative genericity for a pattern proven a few times over, not a
 * framework. See engineering/decisions/2026-07-09-cadenza-narration-quality.md
 * §3.2 for the funnel pilot's original reasoning and §7 for why the other
 * eight chart-family members (roadmap, gantt, timeline-list, map, word-cloud,
 * piechart, progress, kanban) got no narrator: each either authors its
 * speech-worthy numbers directly (piechart, progress: the % is typed, not
 * derived) or only computes rendering geometry with no narratable semantic
 * content (gantt's bar position, map's choropleth color-mix, word-cloud's
 * normalized rank/weight, kanban's done-column styling). A narrator here only
 * earns its place when the render computes a fact a listener needs and the
 * raw text doesn't say.
 *
 * Every narrator, when it fires, REPLACES `slideToSpeech` for that slide (see
 * `narrateChart`'s call sites in the export's writeCaptionsSidecar and Present's
 * PresentOverlay.tsx) — so each one narrates the FULL slide (heading + data),
 * not just the computed add-on, exactly like `slideToSpeech` would have. A
 * narrator returns null whenever there's nothing it can add beyond what
 * `slideToSpeech` already says correctly, deferring to it rather than
 * duplicating it questionably.
 *
 * SHARED KERNEL (HARD RULE #1): both narration producers call this ONE kernel, so
 * a given chart slide's Markdown narrates identically wherever it runs — no second
 * copy to drift. (The two surfaces agree on WHICH Markdown is a chart slide whenever
 * each rendered section is its own `---` block — the Studio's slide model and the
 * house authoring convention; the export aligns to the engine's rendered sections,
 * Present to its `---`-based editing model.) Home is `lib/core` (the Lattice shared
 * kernel, bundled to the browser via read-along-core), NOT cadenza — the narrators are
 * Lattice-component-specific and cadenza stays a domain-agnostic, spin-off-able
 * engine. Ported from docs/src/components/studio/chart-narration.ts
 * (2026-07-12, #902 Gap 1 Phase 2). Deps: the shared `slideToSpeech`
 * (lib/core/slide-speech.js) + cadenza's `numberToWords` / `toSpokenText`.
 */

const { numberToWords, toSpokenText } = require('@slidewright/cadenza');
const { slideToSpeech } = require('./slide-speech');

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]*?)\s*-->/i;

/**
 * Does the slide's `_class:` directive carry `token` as one of its
 * space-separated words? `_class: funnel` may carry a base modifier (`funnel
 * dark`, `funnel compact`, `funnel accent` — lib/base/base.docs.md; see
 * funnel.gallery.md), so this checks token membership, not the exact string —
 * and, unlike a `\bfunnel\b` regex, correctly does NOT match a hyphenated
 * class like `funnel-detail` (a `\b` word boundary sits on either side of a
 * hyphen too, so it would otherwise false-positive on that substring).
 */
function hasClassToken(markdown, token) {
  const m = markdown.match(CLASS_DIRECTIVE);
  if (!m) return false;
  return m[1].split(/\s+/).includes(token);
}

/**
 * Blank out fenced code block bodies. A slide demonstrating a component's
 * syntax as a doc example (inside a fence) must not be mistaken for an actual
 * instance of that component — used before every check below (class,
 * heading, data) so they all agree on what's fenced instead of each tracking
 * it separately. An UNTERMINATED fence (a forgotten closing ```) toggles
 * `inFence` on and never back off, so everything from that point to the end
 * of the slide is blanked too — a deliberately conservative failure mode, not
 * a bug to route around: the alternative (treating the rest of the slide as
 * un-fenced once the toggle looks unreliable) would let genuine fenced EXAMPLE
 * content be parsed as if it were real component data, which is worse than
 * under-narrating. A narrator that ends up with too little data to work with
 * simply returns null, and `slideToSpeech` (which has this same conservative
 * behavior) takes over.
 */
function withoutFences(markdown) {
  const out = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      out.push('');
      continue;
    }
    out.push(inFence ? '' : line);
  }
  return out.join('\n');
}

/**
 * Repeatedly strip trailing backtick-delimited pills off a lead line's text —
 * a direct port of state-chart.transform.js's `stripTrailingPills` (HTML
 * `<code>` spans there, raw Markdown backticks here), reused by quadrant's
 * item parser too: both a state-chart state (`` `start` ``) and a quadrant
 * `trail` item (`` `5, 60` `3, 78` `` — before/after coordinates as TWO
 * separate pills) can carry more than one trailing pill on one line.
 */
function stripTrailingPills(lead) {
  const pills = [];
  let s = lead;
  for (;;) {
    const m = s.match(/^([\s\S]*?)\s*`([^`]+)`\s*$/);
    if (!m) break;
    pills.unshift(m[2].trim());
    s = m[1];
  }
  return { label: s.trim(), pills };
}

/** A top-level (unindented) `- Name` bullet — a series/section/group/heading
 *  line, shared across journey/radar/quadrant's two-level list grammar. */
function isTopLevelBullet(raw) {
  return /^-\s+/.test(raw);
}

/** A nested (indented) `-`/`*` bullet — the data line under a top-level one. */
function isNestedBullet(raw) {
  return /^\s+[-*]\s+/.test(raw);
}

/** Add a sentence terminator if `text` doesn't already end with one. */
function terminate(text) {
  const t = text.trim();
  if (!t) return '';
  return /[.!?;:,…]\s*$/.test(t) ? t : `${t}.`;
}

/** The slide's heading (any `#`–`######`), spoken-ready with a terminator, or
 *  ''. Accepts every level — `slideToSpeech` itself speaks any heading level,
 *  and journey.manifest.json documents `h1, h2` as its valid heading slot, so
 *  a `##`-only match silently dropped an h1-headed slide's title entirely (an
 *  independent-checker finding: this narrator fully REPLACES slideToSpeech,
 *  so its own heading-recognition contract can't be narrower). */
function heading(markdown) {
  const m = markdown.match(/^#{1,6}\s+(.+)$/m);
  if (!m) return '';
  return terminate(m[1].replace(/`([^`]*)`/g, '$1'));
}

/** Leading whitespace length — used to distinguish a data line (the first
 *  nested level under a top-level bullet) from a DEEPER per-item detail
 *  sublist (a second nested level), which parses to the same `isNestedBullet`
 *  regex but is NOT itself a data point. Depth-blind parsing was a real bug
 *  (see `parseRadarSeries`/`parseQuadrantGroups`): a detail line that itself
 *  ends in a number got ingested as a phantom axis/item, corrupting the
 *  auto-fit scale with a confidently wrong number — worse than dropping it. */
function leadingSpaces(raw) {
  return raw.length - raw.trimStart().length;
}

/**
 * Classify a nested line's depth against its group's established "data"
 * level, tolerant of realistic indentation variance. An exact-match depth
 * check (the original fix for the detail-sublist bug) turned out to be a bug
 * of its own — CommonMark/markdown-it treats a sibling list item as the SAME
 * nesting level once it's indented enough to belong to the list; it does NOT
 * require exact repetition of a prior sibling's raw character count. A
 * red-team review confirmed real markdown-it renders an ordinary indentation
 * typo (2 spaces vs. 3 on a sibling axis/item/task line) as a plain sibling,
 * while the exact-match check silently excluded it from BOTH the spoken list
 * and the auto-fit scale — reintroducing the "confidently wrong number" bug
 * the depth fix exists to prevent, just via a typo instead of a genuine
 * detail sublist. A genuinely DEEPER "detail" reveal sublist
 * (lib/components/chart/_chart-family/mark-detail.js) is authored a full
 * extra list-marker's width deeper in every shipping manifest sample (`- `
 * is 2 characters), so the threshold for "detail, not data" is a full +2
 * beyond the shallowest sibling seen so far — not any nonzero difference.
 * `dataIndent` is the running per-group state (start at `null`; the FIRST
 * nested line under a group is always a genuine data line — a detail always
 * follows the data line it belongs to, never precedes it, so seeding from it
 * can't misclassify).
 */
function classifyDepth(indent, dataIndent) {
  if (dataIndent === null || indent < dataIndent) return { isData: true, nextDataIndent: indent };
  return { isData: indent - dataIndent < 2, nextDataIndent: dataIndent };
}

/** A line already accounted for by every narrator's shared grammar: blank,
 *  the `_class:` directive, or the heading itself. */
function isCommonlyConsumed(raw) {
  const line = raw.trim();
  return !line || /^<!--/.test(line) || /^#{1,6}\s/.test(line);
}

/**
 * Speak whatever lines a narrator's own grammar did NOT recognize — an intro
 * paragraph between the heading and the data, a per-item/per-stage detail
 * sublist (funnel/radar/quadrant's shared chart-family "reveal" substrate,
 * `lib/components/chart/_chart-family/mark-detail.js`), an eyebrow that
 * turned out not to be a parseable scale — via `slideToSpeech`, so a
 * full-replacement narrator never silently drops real authored content just
 * because its own grammar doesn't model it. A red-team/inversion review found
 * this: funnel/radar/quadrant's own default gallery samples all author
 * exactly this kind of content (a per-stage/per-item detail sublist, an
 * interpretive intro sentence), and it was being dropped outright — worse
 * than the pre-narrator baseline, where `slideToSpeech` read everything, just
 * without the computed insight.
 *
 * `consumed` is the exact set of LINE INDICES (into `markdown.split('\n')`)
 * the narrator's own parse already spoke — computed by the parser itself
 * (not re-derived independently here), since only it knows, e.g., which
 * nesting depth was the real data level for THIS slide. Everything else is
 * flattened through the SAME punctuation-aware pipeline `slideToSpeech` uses,
 * then APPENDED — after, not interleaved at its original authored position.
 * That ordering trade-off (a real one, not free) is deliberate: guaranteeing
 * nothing is silently dropped matters more than perfect narration order, and
 * true interleaving would require reconstructing document order across every
 * narrator — a much larger change for a comparatively small listening benefit.
 */
function speakLeftover(markdown, consumed) {
  const leftover = markdown
    .split('\n')
    .filter((raw, i) => !consumed.has(i) && !isCommonlyConsumed(raw))
    .join('\n');
  // `terminate()` guards the trailing edge specifically: slideToSpeech only
  // auto-punctuates STRUCTURAL lines, so a plain one-line paragraph (a
  // funnel/radar-adjacent tag line with no recognized structural role) comes
  // back with no terminator — and since this result is always APPENDED after
  // a narrator's own already-punctuated sentences, an unterminated tail reads
  // as a fragment trailing off mid-thought (a Munger-inversion finding).
  return terminate(slideToSpeech(leftover));
}

/** "A" | "A and B" | "A, B, and C" — for speaking a list of names. */
function joinWithAnd(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Round up to a "nice" axis maximum: 1, 2, 2.5, 5 × 10^k — a direct port of
 * the SAME function in radar.transform.js and quadrant.transform.js (kept as
 * a local copy, not an import: those are transform modules with their own
 * copies; a cross-check test pins this copy to their behavior via
 * hand-verified cases rather than a byte-diff).
 */
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const n = v / base;
  let nice;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 2.5) nice = 2.5;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

/** A standalone eyebrow line — one backtick span alone on its line — that
 *  appears BEFORE the slide's heading (radar/quadrant's `` `Scale · 0–10` ``
 *  / `` `Effort 0–10 → Reach 0–100` `` convention). Scoped to before the
 *  heading so a backtick-only line elsewhere in the body (unlikely, but not
 *  impossible in a nested list) can't be mistaken for it. Returns the line
 *  INDEX too, so a firing narrator can mark it consumed and speak it in its
 *  authored (leading) position instead of letting it fall through to
 *  `speakLeftover` and land, unplaced, after all the computed facts — a real
 *  ordering defect a Munger-inversion review found: the eyebrow ended up a
 *  disconnected, unpunctuated fragment trailing after the narration had
 *  already reached a full stop. */
function eyebrowBeforeHeading(markdown) {
  const headingIdx = markdown.search(/^#{1,6}\s/m);
  const head = headingIdx >= 0 ? markdown.slice(0, headingIdx) : markdown;
  const m = head.match(/^`([^`]+)`\s*$/m);
  if (!m) return null;
  const index = markdown.slice(0, m.index).split('\n').length - 1;
  return { text: m[1].trim(), index };
}

// ── funnel ──────────────────────────────────────────────────────────────────
// funnel.transform.js computes each stage's conversion % from the PRIOR
// stage's value at render time and burns it into SVG text — that number
// exists nowhere in the slide's Markdown.

// A top-level (unindented) stage line: `- Label `value``. An INDENTED line
// (leading whitespace before the dash) is a stage's optional detail sublist —
// not itself a stage — so this intentionally matches against the raw line,
// not its trimmed form.
const STAGE_LINE = /^- (.+?)\s*`([^`]+)`\s*$/;

function parseFunnelStages(markdown) {
  const stages = [];
  const consumed = new Set();
  markdown.split('\n').forEach((raw, i) => {
    const m = STAGE_LINE.exec(raw);
    if (!m) return;
    const label = m[1]
      .replace(/[*_~`]/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // link/image label, drop the URL
      .trim();
    if (!label) return;
    // Mirror funnel.transform.js's parseFunnel exactly: the FIRST numeric run
    // in the comma-stripped pill wins (parseFloat, not a full-string strip-
    // then-coerce), defaulting to 0 when nothing numeric is found — never
    // dropping the stage outright. A red-team review confirmed the old
    // strip-to-allowlist-then-Number() approach let a range-style value
    // ("1,200-1,500") survive the strip as "1200-1500" and then fail
    // Number() entirely (NaN), silently dropping the stage — and in a
    // 3-stage deck, dropping a MIDDLE stage this way spliced the chain and
    // spoke a fabricated conversion rate between non-adjacent stages.
    const numMatch = m[2].replace(/,/g, '').match(/-?[\d.]+/);
    const value = numMatch ? Number.parseFloat(numMatch[0]) : 0;
    stages.push({ label, value, valueSpoken: toSpokenText(m[2]) });
    consumed.add(i);
  });
  return { stages, consumed };
}

/**
 * Narrate a `funnel` slide's stages AND the stage-to-stage conversion rate the
 * transform computes at render time — the exact number `slideToSpeech`'s
 * generic Markdown flatten never sees, because it's derived, never authored.
 * Returns null for a non-funnel slide or one with fewer than two stages
 * (mirrors `funnel.transform.js`'s own `stages.length < 2` bailout).
 */
function narrateFunnel(markdown) {
  const md = withoutFences(String(markdown || ''));
  if (!hasClassToken(md, 'funnel')) return null;
  const { stages, consumed } = parseFunnelStages(md);
  if (stages.length < 2) return null;
  const parts = [];
  const h = heading(md);
  if (h) parts.push(h);
  stages.forEach((s, i) => {
    let line = `${s.label}: ${s.valueSpoken}`;
    if (i > 0 && stages[i - 1].value > 0) {
      const pct = Math.round((s.value / stages[i - 1].value) * 100);
      line += `, ${numberToWords(pct)} percent of the prior stage`;
    }
    parts.push(`${line}.`);
  });
  // A stage's optional detail sublist (an indented line, not itself a stage —
  // see STAGE_LINE's own comment) is real authored content `slideToSpeech`
  // used to read; speak it too rather than silently dropping it. STAGE_LINE
  // is anchored at column 0, so an indented detail line can never be
  // mistaken for a stage in the first place (unlike radar/quadrant/journey,
  // whose data line IS itself nested, requiring an explicit depth check).
  const extra = speakLeftover(md, consumed);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

// ── journey (weighted variant) ──────────────────────────────────────────────
// Only the `weighted` variant computes a per-task volume % of the slide's
// total (journey.transform.js: `totalVolume` summed across every task in
// every section, `volPct = round(vol/totalVolume*100)`) — burned into a CSS
// custom property for chip width, never spoken. A task with no `+N` token
// defaults to volume 1 (mirrors `t.volume ?? 1`).

/**
 * Parse journey's sections/tasks. Two correctness fixes from adversarial
 * review, both verified against `journey.transform.js`:
 *
 * 1. **Depth.** A task's own grammar has no documented third nesting level,
 *    but `journey.transform.js` defensively tolerates one (and ignores it) —
 *    an author CAN write one. This parser used to treat ANY indented line as
 *    a task regardless of depth, so a prose detail line under a task became
 *    a phantom task with the default volume, diluting every real percentage.
 *    Fixed the same way as radar/quadrant: the first nested line under a
 *    section fixes the "task" indentation for that section; anything deeper
 *    is left unconsumed (picked up by `speakLeftover` instead).
 * 2. **Label truncation.** The label used to be "everything before the FIRST
 *    backtick token," so a task that put a qualifying phrase AFTER its
 *    tokens (`` Escalate `@support` `:2` to tier 2 `+40` ``) silently lost
 *    that phrase. Fixed by stripping every backtick token from the line and
 *    keeping everything else, matching how the real transform strips
 *    `<code>` spans without disturbing surrounding text.
 */
function parseJourneySections(markdown) {
  const sections = [];
  const consumed = new Set();
  let current = null;
  let dataIndent = null;
  markdown.split('\n').forEach((raw, i) => {
    if (isTopLevelBullet(raw)) {
      current = { name: raw.replace(/^-\s+/, '').replace(/[*_~`]/g, '').trim(), tasks: [] };
      sections.push(current);
      consumed.add(i);
      dataIndent = null;
      return;
    }
    if (!current || !isNestedBullet(raw)) return;
    const { isData, nextDataIndent } = classifyDepth(leadingSpaces(raw), dataIndent);
    if (!isData) return; // a full extra level deeper = per-task detail, not a task
    dataIndent = nextDataIndent;
    const content = raw.replace(/^\s+[-*]\s+/, '');
    const tokens = [...content.matchAll(/`([^`]+)`/g)].map((t) => t[1].trim());
    const label = content
      .replace(/`[^`]+`/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[*_~]/g, '')
      .trim();
    if (!label) return;
    let volume = 1; // `t.volume ?? 1` — a task with no `+N` token still counts once
    for (const tok of tokens) {
      // Mirror journey.transform.js's parseTask exactly: `parseFloat(tok.slice(1))`
      // on any `+`-led token, tolerant of trailing non-numeric content. A
      // red-team review confirmed the old fully-anchored regex silently fell
      // back to the default volume of 1 on a token like `+45%` or `+5kg` —
      // both realistic authoring mistakes given the whole point of the
      // `weighted` variant is to DISPLAY a percentage — fabricating a wrong
      // split as fact.
      if (tok.startsWith('+')) {
        const v = Number.parseFloat(tok.slice(1));
        if (Number.isFinite(v)) volume = v;
      }
    }
    current.tasks.push({ label, volume });
    consumed.add(i);
  });
  return { sections: sections.filter((s) => s.tasks.length > 0), consumed };
}

/**
 * Narrate a `journey weighted` slide's tasks and each one's share of the
 * slide's total volume — computed only under the `weighted` variant
 * (journey.transform.js) and never present in the authored `+N` tokens
 * themselves (those are raw counts, not percentages). Returns null for a
 * non-journey slide, a journey slide without the `weighted` modifier (the
 * other four variants parse `+N` but never render it — antiPatterns says so
 * explicitly), or one with no tasks.
 */
function narrateJourneyWeighted(markdown) {
  const md = withoutFences(String(markdown || ''));
  if (!hasClassToken(md, 'journey') || !hasClassToken(md, 'weighted')) return null;
  const { sections, consumed } = parseJourneySections(md);
  const allTasks = sections.flatMap((s) => s.tasks);
  if (allTasks.length === 0) return null;
  const totalVolume = allTasks.reduce((sum, t) => sum + t.volume, 0);
  if (totalVolume <= 0) return null;
  const parts = [];
  const h = heading(md);
  if (h) parts.push(h);
  for (const s of sections) {
    const taskText = s.tasks
      .map((t) => `${t.label}, ${numberToWords(Math.round((t.volume / totalVolume) * 100))} percent`)
      .join('; ');
    parts.push(`${s.name}: ${taskText}.`);
  }
  // An intro paragraph, or a per-task detail sublist deeper than the task
  // level, is real authored content — speak it too rather than drop it.
  const extra = speakLeftover(md, consumed);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

// ── radar ────────────────────────────────────────────────────────────────────
// When the eyebrow doesn't declare a scale, radar.transform.js auto-computes
// one from the data (`resolveScale` → `niceCeil(max)`) and burns the ring-tick
// numbers into SVG text — numbers an eyes-free listener has no other way to
// learn (is "Performance 9" out of 10, or out of 100?).

/**
 * Parse radar's series/axes. `radar.manifest.json`'s `detail` slot documents a
 * REAL third nesting level — an optional reveal sublist under an axis (shared
 * `mark-detail.js` substrate). A depth-BLIND parser (any indented line with a
 * trailing number counts as an axis) mistakes a detail line that itself ends
 * in a number — a plausible reference id, date, or supporting metric — for a
 * phantom axis, corrupting BOTH the spoken axis list and the auto-fit scale
 * with a confidently wrong number (found by adversarial review: a detail line
 * `` - Verified in cycle `2024` `` under "Performance `9`" pushed the spoken
 * scale from "zero to ten" to "zero to two thousand five hundred"). Fixed by
 * classifying the axis vs. detail level tolerant of indentation variance (see
 * `classifyDepth`); anything classified as detail is left unconsumed for
 * `speakLeftover` instead of ingested.
 */
function parseRadarSeries(markdown) {
  const series = [];
  const consumed = new Set();
  let current = null;
  let dataIndent = null;
  markdown.split('\n').forEach((raw, i) => {
    if (isTopLevelBullet(raw)) {
      current = { name: raw.replace(/^-\s+/, '').replace(/[*_~`]/g, '').trim(), axes: [] };
      series.push(current);
      consumed.add(i);
      dataIndent = null;
      return;
    }
    if (!current || !isNestedBullet(raw)) return;
    const { isData, nextDataIndent } = classifyDepth(leadingSpaces(raw), dataIndent);
    if (!isData) return; // a full extra level deeper = per-axis detail, not an axis
    dataIndent = nextDataIndent;
    const content = raw.replace(/^\s+[-*]\s+/, '');
    // Mirror radar.transform.js's parseAxisItem exactly: the trailing pill can
    // hold ANY text, parsed via parseFloat (default 0 when it isn't numeric —
    // never excluding the line outright). An anchored bare-number-only regex
    // silently dropped the whole axis line — from BOTH the spoken list and
    // the auto-fit scale — whenever its value pill carried any trailing text
    // (a unit, a typo); a red-team/checker-confirmed instance of the same
    // "confidently wrong number" failure class the depth fix above targets.
    let text = content;
    let value = 0;
    const pillMatch = content.match(/`([^`]*)`\s*$/);
    if (pillMatch) {
      const n = Number.parseFloat(pillMatch[1]);
      value = Number.isFinite(n) ? n : 0;
      text = content.slice(0, pillMatch.index);
    }
    const label = text.replace(/[*_~`]/g, '').trim();
    if (!label) return;
    current.axes.push({ label, value });
    consumed.add(i);
  });
  return { series: series.filter((s) => s.name && s.axes.length > 0), consumed };
}

/**
 * Parse an explicit scale out of eyebrow text: a min–max range, or a lone
 * maximum (implicit min 0). Direct port of radar.transform.js's `parseScale`
 * / quadrant.transform.js's range-half of `pullRange` — both accept the same
 * "N–M" / "N-M" / "N to M" grammar. Returns null when the text carries no
 * usable number, exactly like the source (the caller then falls back to
 * `niceCeil` of the data, same as the render does).
 */
function parseScaleRange(text) {
  const t = String(text);
  let m = t.match(/(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)/);
  if (m) {
    const min = Number.parseFloat(m[1]);
    const max = Number.parseFloat(m[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) return { min, max };
  }
  m = t.match(/(?:^|\s)([\d.]+)\s*$/);
  if (m) {
    const max = Number.parseFloat(m[1]);
    if (Number.isFinite(max) && max > 0) return { min: 0, max };
  }
  return null;
}

/**
 * Narrate a `radar` slide's series and axis values, prefixed with the scale
 * they're plotted against — but ONLY when that scale isn't already stated in
 * the slide's own eyebrow (`slideToSpeech` reads the eyebrow paragraph as
 * plain prose already, so re-stating a declared scale would be redundant).
 * Returns null for a non-radar slide, one with an explicit, parseable scale,
 * or one with no series data.
 */
function narrateRadar(markdown) {
  const md = withoutFences(String(markdown || ''));
  if (!hasClassToken(md, 'radar')) return null;
  // The `quadrant` variant (radar.manifest.json) is a THREE-level structure —
  // group > sub-group > axis-value — not the two-level series > axis this
  // parser assumes; treating a sub-group name as if it were a series would
  // silently drop the middle grouping level. Bail rather than misnarrate;
  // `slideToSpeech` reads it as plain prose instead.
  if (hasClassToken(md, 'quadrant')) return null;
  const eyebrow = eyebrowBeforeHeading(md);
  if (eyebrow && parseScaleRange(eyebrow.text)) return null;
  const { series, consumed } = parseRadarSeries(md);
  if (series.length === 0) return null;
  if (eyebrow) consumed.add(eyebrow.index);
  let max = 0;
  for (const s of series) for (const a of s.axes) if (a.value > max) max = a.value;
  if (max <= 0) return null;
  const parts = [];
  if (eyebrow) parts.push(terminate(eyebrow.text));
  const h = heading(md);
  if (h) parts.push(h);
  parts.push(`On a scale of zero to ${numberToWords(niceCeil(max))}.`);
  for (const s of series) {
    const axisText = s.axes.map((a) => `${a.label}, ${numberToWords(a.value)}`).join('; ');
    parts.push(`${s.name}: ${axisText}.`);
  }
  // An intro paragraph, or a per-axis detail sublist deeper than the axis
  // level, is real authored content — speak it too rather than drop it.
  const extra = speakLeftover(md, consumed);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

// ── quadrant ─────────────────────────────────────────────────────────────────
// Same gap as radar, per axis independently: quadrant.transform.js's
// `resolveScale` honors an eyebrow-declared range per axis and falls back to
// `niceCeil` of that axis's data otherwise — an unlabeled auto-fit axis is
// exactly as unreadable to an eyes-free listener as radar's.

/**
 * Parse one comma-separated coordinate pill exactly like
 * quadrant.transform.js's `parseCoordPill`: split on commas, and count a part
 * as a coordinate number ONLY when it parses via `parseFloat` AND its first
 * character (after an optional sign) is a DIGIT — a real, if quirky,
 * production behavior that specifically excludes a leading-dot decimal like
 * `.5` (no leading zero) from counting as a coordinate, confirmed by an
 * independent-checker pass against the real source. A missing or fully
 * unparseable coordinate defaults to 0 (never drops the item), matching
 * `nums[0] || 0`.
 */
function parseCoordPill(pillText) {
  const parts = pillText.split(',').map((s) => s.trim()).filter(Boolean);
  const nums = [];
  for (const part of parts) {
    const n = Number.parseFloat(part);
    if (Number.isFinite(n) && /^[-+]?\d/.test(part)) nums.push(n);
  }
  return { x: nums[0] ?? 0, y: nums[1] ?? 0 };
}

/**
 * Parse quadrant's groups/items. Two things make this trickier than a single
 * anchored regex:
 *
 * 1. An item line can carry MORE THAN ONE trailing pill — the `trail` variant
 *    authors `` `5, 60` `3, 78` `` (before → after coordinates) on one line —
 *    so this uses `stripTrailingPills` to collect every pill, uses the LAST
 *    one as the item's spoken (current) position, and folds every pill's
 *    coordinates into `allX`/`allY` for scale computation, so the auto-fit
 *    axis range reflects the trail's full extent, not just its endpoint.
 *    Deliberately does not narrate the "moved from" position itself — a
 *    real, logged narrowing (the bug this fixed was garbling the label and
 *    dropping data, not "trail motion isn't spoken").
 * 2. `quadrant.manifest.json`'s `detail` slot documents a REAL third nesting
 *    level — an optional reveal sublist under an item. A depth-BLIND parser
 *    (any indented line with a comma-separated pill counts as an item)
 *    mistakes a detail line that itself ends in two comma-separated numbers
 *    — a plausible confidence range or secondary metric — for a phantom
 *    item, corrupting both the item list and the axis-scale computation
 *    (found by adversarial review). Fixed the same way as radar: the first
 *    nested line's indentation, per group, fixes the "item" level; anything
 *    deeper is left unconsumed for `speakLeftover` instead of ingested.
 */
function parseQuadrantGroups(markdown) {
  const groups = [];
  const allX = [];
  const allY = [];
  const consumed = new Set();
  let current = null;
  let dataIndent = null;
  markdown.split('\n').forEach((raw, i) => {
    if (isTopLevelBullet(raw)) {
      current = { name: raw.replace(/^-\s+/, '').replace(/[*_~`]/g, '').trim(), items: [] };
      groups.push(current);
      consumed.add(i);
      dataIndent = null;
      return;
    }
    if (!current || !isNestedBullet(raw)) return;
    const { isData, nextDataIndent } = classifyDepth(leadingSpaces(raw), dataIndent);
    if (!isData) return; // a full extra level deeper = per-item detail, not an item
    dataIndent = nextDataIndent;
    const content = raw.replace(/^\s+[-*]\s+/, '');
    const { label, pills } = stripTrailingPills(content);
    if (!label) return;
    // Mirror quadrant.transform.js's parseItem: EVERY pill's coordinates feed
    // the auto-fit scale (the `trail` variant's before AND after positions
    // both matter for the axis range); the LAST pill is the item's spoken
    // (current) position. A pill-less or fully unparseable item still counts
    // as (0, 0) — matching production's own permissiveness (`it.label ||
    // (it.x || it.y)`) — never silently dropping a labeled item outright.
    const coords = pills.length ? pills.map(parseCoordPill) : [{ x: 0, y: 0 }];
    for (const c of coords) {
      allX.push(c.x);
      allY.push(c.y);
    }
    const last = coords[coords.length - 1];
    current.items.push({ label, x: last.x, y: last.y });
    consumed.add(i);
  });
  return { groups: groups.filter((g) => g.name && g.items.length > 0), allX, allY, consumed };
}

/**
 * Pull "min–max" off the TAIL of eyebrow axis text — a direct port of
 * quadrant.transform.js's `pullRange`, anchored to end-of-string (unlike
 * radar's `parseScale`/this module's `parseScaleRange`, which radar's own
 * real source also leaves unanchored). Anchoring matters here specifically:
 * an axis NAME containing an earlier number-hyphen-number pattern (rare, but
 * quadrant's eyebrow grammar allows a free-text name before the range) must
 * not be mistaken for the trailing range. No lone-max fallback — quadrant's
 * real `pullRange` doesn't have one either.
 */
function pullQuadrantRange(text) {
  const m = String(text)
    .trim()
    .match(/(?:.*?)\s*(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)\s*$/);
  if (!m) return null;
  const min = Number.parseFloat(m[1]);
  const max = Number.parseFloat(m[2]);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
}

/**
 * Resolve one axis's auto-fit scale from its data — a direct port of
 * quadrant.transform.js's `resolveScale` per-axis math, INCLUDING negative
 * values (unlike radar, which always fixes min at 0): `min` is the data's own
 * negative minimum when one exists, `max` is `niceCeil` of the larger of the
 * positive max or the mirrored negative extent.
 */
function resolveAxisScale(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return {
    min: min < 0 ? min : 0,
    max: niceCeil(Math.max(max, min < 0 ? -min : max)),
  };
}

/** "zero to ten" | "negative twenty to twenty" — spoken form of an axis range. */
function describeRange(scale) {
  const maxWords = numberToWords(scale.max);
  return scale.min === 0 ? `zero to ${maxWords}` : `${numberToWords(scale.min)} to ${maxWords}`;
}

/**
 * Does `text` contain a parseable "tx, ty" pair? Direct port of
 * quadrant.transform.js's `parseTargets` — used only to decide whether a
 * trailing `targets …` phrase should be stripped before axis-range parsing.
 * The target VALUES are irrelevant to scale narration and are discarded.
 */
function hasParseableTargets(text) {
  const m = String(text).match(/([-+]?[\d.]+)\s*,\s*([-+]?[\d.]+)/);
  if (!m) return false;
  return Number.isFinite(Number.parseFloat(m[1])) && Number.isFinite(Number.parseFloat(m[2]));
}

/**
 * Split "Xname Xmin–Xmax → Yname Ymin–Ymax" (quadrant's eyebrow grammar) into
 * its two axis texts. Direct, simplified port of quadrant.transform.js's
 * `parseEyebrow` — the `· targets tx, ty` suffix it also parses is irrelevant
 * to scale narration and is stripped, not interpreted, here. The strip is
 * CONDITIONAL on `hasParseableTargets`, matching production exactly: an
 * unparseable `targets …` phrase (a typo, a placeholder like "targets tbd")
 * stays embedded rather than being silently discarded, so it falls through
 * to `pullQuadrantRange`'s end-anchor and correctly fails to match — the same
 * "fall back to auto-fit" outcome production has for that input. An earlier,
 * unconditional strip would have handed a clean range to a slide production
 * itself can't resolve.
 */
function splitQuadrantEyebrow(text) {
  let core = String(text || '').trim();
  const targetsMatch = core.match(/(?:[·,;]\s*)?targets?\s*[:·]?\s*(.+)$/i);
  if (targetsMatch?.index !== undefined && hasParseableTargets(targetsMatch[1])) {
    core = core.slice(0, targetsMatch.index).trim();
  }
  const arrow = core.match(/(.*?)\s*(?:→|->)\s*(.*)/);
  return arrow ? { xText: arrow[1].trim(), yText: arrow[2].trim() } : { xText: core, yText: '' };
}

/**
 * Narrate a `quadrant` slide's groups and items, prefixed with whichever
 * axis's scale isn't already stated in the eyebrow. Returns null for a
 * non-quadrant slide, one where BOTH axes already have an explicit,
 * parseable range (nothing to add), or one with no items.
 */
function narrateQuadrant(markdown) {
  const md = withoutFences(String(markdown || ''));
  if (!hasClassToken(md, 'quadrant')) return null;
  // `radar quadrant` (a radar VARIANT — radar.manifest.json) also carries the
  // literal token "quadrant"; that slide's grammar is radar's own three-level
  // structure, not this component's group/item pairs. Bail explicitly rather
  // than rely on the shape happening not to match.
  if (hasClassToken(md, 'radar')) return null;
  const { groups, allX, allY, consumed } = parseQuadrantGroups(md);
  const allItems = groups.flatMap((g) => g.items);
  if (allItems.length === 0) return null;
  const eyebrow = eyebrowBeforeHeading(md);
  const { xText, yText } = eyebrow ? splitQuadrantEyebrow(eyebrow.text) : { xText: '', yText: '' };
  const xRange = xText ? pullQuadrantRange(xText) : null;
  const yRange = yText ? pullQuadrantRange(yText) : null;
  if (xRange && yRange) return null;
  if (eyebrow) consumed.add(eyebrow.index);
  const xScale = xRange ?? resolveAxisScale(allX);
  const yScale = yRange ?? resolveAxisScale(allY);
  const parts = [];
  if (eyebrow) parts.push(terminate(eyebrow.text));
  const h = heading(md);
  if (h) parts.push(h);
  if (!xRange) parts.push(`The horizontal axis runs ${describeRange(xScale)}.`);
  if (!yRange) parts.push(`The vertical axis runs ${describeRange(yScale)}.`);
  for (const g of groups) {
    if (!g.items.length) continue;
    const itemText = g.items.map((it) => `${it.label} at ${numberToWords(it.x)}, ${numberToWords(it.y)}`).join('; ');
    parts.push(`${g.name}: ${itemText}.`);
  }
  // An intro paragraph, or a per-item detail sublist deeper than the item
  // level, is real authored content — speak it too rather than drop it.
  const extra = speakLeftover(md, consumed);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

// ── state-chart ──────────────────────────────────────────────────────────────
// state-chart.transform.js infers a start state (the first authored state,
// when none is tagged `` `start` ``) and terminal states (any state with zero
// outgoing transitions, when none is tagged `` `end` ``) — real facts about
// the machine's shape that exist only when the author DIDN'T already say them.

const STATE_LINE = /^(\d+)\.\s+(.+)$/; // top-level (unindented): a numbered state
const STATE_NESTED_LINE = /^\s+[-*]\s+(.+)$/; // nested (indented): a transition or detail bullet
// The WHOLE nested bullet is one `event => N` / `=> N` / `=> self` span; captures the target.
const STATE_TRANSITION_TOKEN = /^`\s*[^`=]*?\s*=>\s*(\d+|self)\s*`$/;

// Trailing pills state-chart.transform.js treats specially — never part of the
// spoken label (`start`/`end` decide role; a status keyword is a separate
// badge). Direct port of the STATUS_KEYWORDS set in state-chart.transform.js.
const STATE_STATUS_KEYWORDS = new Set(['on-track', 'done', 'live', 'at-risk', 'warn', 'pilot', 'blocked', 'fail', 'decision', 'deferred']);

/**
 * Classify a state's trailing pills exactly like `parseStateLi` does: `start`/
 * `end` decide role; a status keyword is dropped (it's a separate badge, never
 * part of the label); any OTHER pill is unknown and gets re-appended to the
 * label — state-chart.transform.js does the same (as an inline `<code>` span
 * in the rendered label) rather than silently discarding it. Losing an
 * unrelated annotation on an inferred start/terminal state's spoken label
 * would be a real, if narrow, content-loss bug.
 */
function parseStateLead(lead) {
  const { label: stripped, pills } = stripTrailingPills(lead);
  let isStart = false;
  let isTerminal = false;
  const unknown = [];
  for (const p of pills) {
    if (p === 'start') isStart = true;
    else if (p === 'end') isTerminal = true;
    else if (!STATE_STATUS_KEYWORDS.has(p)) unknown.push(p);
  }
  const label = unknown.length ? `${stripped} ${unknown.join(' ')}`.trim() : stripped;
  return { label, isStart, isTerminal };
}

/**
 * Parse states, then transitions in a SECOND pass (needing the total state
 * count first): a transition token is only "outgoing" — and so only
 * suppresses terminal-state inference — when its target actually resolves to
 * `self` or an in-range state index. `state-chart.transform.js` marks an
 * out-of-range target (a typo'd `=> 9` on a 3-state chart) "(unresolved)" and
 * does NOT count it as outgoing; a naive "any `event => N` counts" reading
 * would wrongly treat that state as non-terminal.
 */
function parseStateChart(markdown) {
  const lines = markdown.split('\n');
  const states = [];
  for (const raw of lines) {
    const stateMatch = STATE_LINE.exec(raw);
    if (!stateMatch) continue;
    const { label, isStart, isTerminal } = parseStateLead(stateMatch[2]);
    states.push({ index: states.length + 1, label, isStart, isTerminal });
  }
  if (!states.length) return null;
  const transitionsFrom = new Set();
  let currentIndex = 0;
  for (const raw of lines) {
    if (STATE_LINE.test(raw)) {
      currentIndex += 1;
      continue;
    }
    if (!currentIndex) continue;
    const nestedMatch = STATE_NESTED_LINE.exec(raw);
    if (!nestedMatch) continue;
    const transitionMatch = STATE_TRANSITION_TOKEN.exec(nestedMatch[1].trim());
    if (!transitionMatch) continue;
    const target = transitionMatch[1];
    const resolved = target === 'self' || (Number.isInteger(Number(target)) && Number(target) >= 1 && Number(target) <= states.length);
    if (resolved) transitionsFrom.add(currentIndex);
  }
  return { states, transitionsFrom };
}

/**
 * Narrate ONLY the inferred facts about a `state-chart` slide's shape: which
 * state is the (unlabeled) start, and which are the (unlabeled) terminal
 * states — mirroring `state-chart.transform.js`'s own inference exactly (the
 * first authored state when none is tagged `` `start` ``; any state with no
 * outgoing transition when none is tagged `` `end` ``). This does NOT replace
 * `slideToSpeech` for the rest of the machine (the numbered states and their
 * transitions read fine as literal text); it only prefixes what inference
 * would otherwise leave silent. Returns null when every state's role is
 * already explicit — there is nothing inferred to add — or when the slide
 * isn't a state-chart.
 */
function narrateStateChartInference(markdown) {
  const md = withoutFences(String(markdown || ''));
  if (!hasClassToken(md, 'state-chart')) return null;
  const parsed = parseStateChart(md);
  if (!parsed) return null;
  const { states, transitionsFrom } = parsed;
  const anyExplicitStart = states.some((s) => s.isStart);
  const anyExplicitEnd = states.some((s) => s.isTerminal);
  const parts = [];
  if (!anyExplicitStart && states[0]) parts.push(`This flow starts at ${states[0].label}.`);
  if (!anyExplicitEnd) {
    const terminal = states.filter((s) => !transitionsFrom.has(s.index));
    if (terminal.length) parts.push(`It ends at ${joinWithAnd(terminal.map((s) => s.label))}.`);
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * Narrate a `state-chart` slide fully: the heading, then the inferred
 * start/end facts, then the rest of the slide via `slideToSpeech` (the
 * numbered states and `event => N` transitions already read as reasonable,
 * if plain, prose) — heading-first, matching every other narrator here (a
 * Munger-inversion review flagged the original heading-last order as a real,
 * if minor, inconsistency: an eyes-free listener who's learned "the reader
 * always opens with the slide title" hits a different order specifically on
 * state-chart slides). The heading line is excluded from the `slideToSpeech`
 * pass so it isn't spoken twice. This is the one narrator here that composes
 * WITH `slideToSpeech` rather than replacing it outright — importing it
 * directly (slide-speech.js has no reciprocal dependency on this module, so
 * this stays one-directional) is simpler than threading it through every
 * call site as a parameter. Returns null when there's no inference to add —
 * `narrateChart` then tries the next narrator, and the caller falls through
 * to plain `slideToSpeech`.
 */
function narrateStateChart(markdown) {
  const inferred = narrateStateChartInference(markdown);
  if (!inferred) return null;
  // Fence-strip BEFORE reading the heading / building the rest — every other
  // narrator does this; this one didn't. A Munger-inversion review found that
  // a slide with a fenced doc-example above the real chart (the exact pattern
  // `narrateFunnel`'s own tests guard against) spoke the FAKE fenced heading
  // as the title and silently dropped the real one entirely — a confidently
  // wrong fact replacing a fact the plain `slideToSpeech` baseline gets right.
  const md = withoutFences(String(markdown || ''));
  const h = heading(md);
  const withoutHeading = md
    .split('\n')
    .filter((raw) => !/^#{1,6}\s/.test(raw.trim()))
    .join('\n');
  const rest = slideToSpeech(withoutHeading);
  return [h, inferred, rest].filter(Boolean).join(' ');
}

// ── diagram (Mermaid flowchart) ──────────────────────────────────────────────
// A `diagram` slide's substance is a Mermaid graph pre-rendered to SVG — topology
// (nodes + edges) that the speech projection SKIPS (it classes `diagram` as a media
// component and reads heading + caption only), so an eyes-free listener learns
// nothing of the flow. This narrator reads that topology from the Mermaid SOURCE
// (the ```mermaid fence), the way the other narrators read a chart's list Markdown.
//
// SCOPE (deliberately narrow — 2026-07-13-mermaid-diagram-narration.md §8.3): it
// narrates ONLY `flowchart`/`graph` diagrams, and only a CONSERVATIVE recognized
// grammar — `id[Label]`-style nodes and FORWARD directed edges (`-->`, `-.->`,
// `==>`, with `|label|` / inline-text / chained forms). It BAILS to null (→ the
// heading+caption projection, today's behavior) on ANY other Mermaid type AND on any
// construct it doesn't fully recognize — undirected `A --- B`, reversed `A <-- B`,
// terminators `--x`/`--o`, `&` fan-out, `%%`-mid-line, exotic node syntax. The rule
// is "bail rather than guess": on a graph whose whole message is DIRECTION, a
// mis-parsed edge would speak a confidently-wrong relationship, which is worse than
// the honest silence. Non-flowchart types (sequence, class, state, ER, gantt, …) all
// null-fall-back too — a fast-follow, not v1.

const BAIL = Symbol('bail'); // parseLine sentinel — an unrecognized construct → stand the whole narrator down

/** Strip a single pair of wrapping double quotes (Mermaid quotes any label with
 *  special characters); leaves an unquoted label untouched. */
function stripQuotes(s) {
  const t = String(s).trim();
  const m = t.match(/^"([\s\S]*)"$/);
  return m ? m[1] : t;
}

/** A node/edge label, scrubbed to spoken-ready text: Mermaid `<br>` line breaks →
 *  a pause, markdown emphasis / links / backticks dropped, whitespace collapsed —
 *  mirroring the funnel/radar label scrub so the downstream cadenza normalizer sees
 *  the same shape it does for a chart label. Raw units/glyphs (`&`, `%`, `→`) are
 *  left for that shared say-as layer, not re-implemented here. */
function scrubLabel(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Node shape wrappers, longest/most-specific delimiter FIRST so `[(`/`([`/`{{`/`((`
// win over the single-bracket forms. The label is quote-stripped after extraction, so
// a single quoted+unquoted pair per shape suffices.
const NODE_SHAPES = [
  ['(["', '"])'], ['([', '])'],
  ['[("', '")]'], ['[(', ')]'],
  ['{{', '}}'], ['((', '))'],
  ['["', '"]'], ['[', ']'],
  ['("', '")'], ['(', ')'],
  ['{"', '"}'], ['{', '}'],
  ['>', ']'],
];

/**
 * Parse ONE node reference at the head of `s`: a Mermaid id (`[A-Za-z0-9_]…`)
 * optionally carrying a shape+label. Registers id→label in `nodes` (richest non-empty
 * label wins, so a node labeled on one edge and bare on another still resolves).
 * Returns `{ id, rest }` (the text after the node) or null when `s` doesn't start with
 * an id.
 */
function parseNode(s, nodes) {
  const idm = s.match(/^([A-Za-z0-9_]\w*)/);
  if (!idm) return null;
  const id = idm[1];
  const rest = s.slice(id.length);
  for (const [open, close] of NODE_SHAPES) {
    if (rest.startsWith(open)) {
      const end = rest.indexOf(close, open.length);
      if (end === -1) continue;
      const label = scrubLabel(stripQuotes(rest.slice(open.length, end)));
      if (label && (!nodes.has(id) || !nodes.get(id))) nodes.set(id, label);
      else if (!nodes.has(id)) nodes.set(id, '');
      return { id, rest: rest.slice(end + close.length) };
    }
  }
  if (!nodes.has(id)) nodes.set(id, '');
  return { id, rest };
}

// Forward directed connectors ONLY, each capturing an optional edge label. Pipe /
// inline-text forms are tried before the plain forms so a label is never missed. Every
// alternative REQUIRES an arrowhead (`>` or `.->`) — an undirected `---`/`===` and a
// reversed `<--` match nothing here, so `parseLine` bails on them (never reads a
// direction the syntax doesn't assert).
// Mermaid lengthens links by REPEATING their run: normal by dashes (`-->`/`--->`),
// thick by `=` (`==>`/`===>`), and DOTTED by DOTS (`-.->`/`-..->`/`-...->`). The dotted
// entries below match a dot-run (`-\.+->`), and the dotted-inline label class EXCLUDES `.`
// — so a dot-lengthened UNLABELED arrow (`-...->`) falls through to the plain dotted rule
// (no label) instead of the inline rule fabricating a "." label out of the arrow's own
// dots (a red-team finding).
//
// EVERY pattern is LINEAR-TIME. A `\s*(X+?)\s*Y` where the label class `X` also matches
// whitespace/the boundary char is a polynomial-ReDoS (the CodeQL `js/redos` class): a
// long run of spaces/dashes can be split among the adjacent quantifiers O(n²) ways on a
// non-matching line. So each label class here excludes its own delimiters (pipe labels
// exclude `|`; the dotted-inline label excludes `.`, its terminator) and there is NO
// `\s*` adjacent to a whitespace-matching class — the label class absorbs its own spaces,
// trimmed later by `scrubLabel`. Inline-text SOLID/THICK forms (`-- x -->`, `== x ==>`)
// are intentionally NOT recognized: unused in practice, and their only ReDoS-safe form
// would bar hyphens/`=` from the label — such an edge bails to the heading-only
// projection, consistent with "bail rather than guess".
const CONNECTORS = [
  { re: /^(?:-{2,}>|=+>|-\.+->)\|([^|]*)\|/, label: 1 },        // pipe: -->|x|  ==>|x|  -.->|x| / -..->|x|
  { re: /^-\.([^.|]+)\.+->/, label: 1 },                         // -. x .-> dotted inline (label excludes '.', disjoint from the terminator)
  { re: /^-{2,}>/, label: 0 },                                   // -->  (length via dashes)
  { re: /^=+>/, label: 0 },                                      // ==>  (length via =)
  { re: /^-\.+->/, label: 0 },                                   // -.->  -..->  -...-> (length via dots)
];

/** Parse ONE forward connector at the head of `s`; returns `{ label, rest }` or null. */
function parseConnector(s) {
  for (const { re, label } of CONNECTORS) {
    const m = s.match(re);
    if (m) return { label: label ? scrubLabel(stripQuotes(m[label] || '')) : '', rest: s.slice(m[0].length) };
  }
  return null;
}

/**
 * Parse ONE flowchart statement line into forward edges. A clean `NODE (CONN NODE)+`
 * chain yields one edge per link (so `A --> B --> C` is A→B and B→C); a bare node
 * declaration (`A["x"]` alone) registers the label and yields no edge. ANY residue the
 * grammar can't consume — a reversed/undirected/terminator arrow, `&` fan-out, class
 * shorthand, a stray token — returns BAIL, standing the whole narrator down.
 */
function parseFlowchartLine(line, nodes) {
  let s = line.replace(/;\s*$/, '').trim(); // a trailing `;` statement terminator is fine; mid-line `;` will BAIL
  const first = parseNode(s, nodes);
  if (!first) return s ? BAIL : [];
  let fromId = first.id;
  s = first.rest;
  const edges = [];
  for (;;) {
    s = s.replace(/^\s+/, '');
    if (s === '') break;
    const conn = parseConnector(s);
    if (!conn) return BAIL; // leftover we can't parse as a forward edge
    s = conn.rest.replace(/^\s+/, '');
    const next = parseNode(s, nodes);
    if (!next) return BAIL; // a connector with no node after it
    edges.push({ from: fromId, to: next.id, label: conn.label });
    fromId = next.id;
    s = next.rest;
  }
  return edges;
}

/**
 * Parse a ```mermaid fence body as a flowchart. Returns `{ title, edges }` (edges'
 * `from`/`to` already resolved to spoken labels), or null when it isn't a
 * flowchart/graph, carries an unrecognized construct (any line BAILs), or has no
 * readable edges.
 */
function parseFlowchart(body) {
  const lines = String(body).split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  // Mermaid's own `--- \n title: X \n ---` in-fence front matter (optional).
  let title = null;
  if (lines[i] !== undefined && lines[i].trim() === '---') {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '---') {
      const tm = lines[j].match(/^\s*title:\s*(.*)$/); // greedy `.*` (not lazy `.+?` + trailing `\s*$`, a polynomial-ReDoS); scrubLabel trims
      if (tm) title = scrubLabel(stripQuotes(tm[1]));
      j++;
    }
    if (j < lines.length) i = j + 1; // consume the closing `---`
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  if (!/^(flowchart|graph)\b/.test((lines[i] || '').trim())) return null;
  i++;
  const nodes = new Map();
  const edges = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%%')) continue;
    // Grouping / styling / accessibility lines carry no spoken topology — skip (a
    // subgraph's contained edges are still narrated; nested-subgraph phrasing is a
    // logged refinement).
    if (/^(subgraph|end|direction|classDef|class|style|click|linkStyle|accTitle|accDescr)\b/.test(t)) continue;
    const res = parseFlowchartLine(t, nodes);
    if (res === BAIL) return null;
    for (const e of res) edges.push(e);
  }
  if (!edges.length) return null;
  // Return the graph by ID (nodes: id→label, edges: {from,to,label} ids) so the
  // renderers can analyze topology (in/out-degree, chains, cycles) before resolving
  // labels for the spoken prose.
  return { title, nodes, edges };
}

// ── flow-path narration (how an architecture graph is actually described) ─────
// A per-edge "A leads to B. A leads to C." enumeration is faithful but robotic — it
// repeats the verb and explodes a fan-out into identical stubs. Instead we describe the
// graph the way a person walks a diagram: follow the flow from the entry points, COALESCE
// a linear chain ("A leads to B, then C"), GROUP an unlabeled fan-out ("D fans out to X,
// Y, and Z"), bind a LABELED branch to its target unambiguously ("From D: on yes, leads to
// X; on no, leads to Y" — never a flat comma list a listener can't parse), speak a FEEDBACK
// arc as a loop ("V loops back to I"), and close at the terminal nodes. The naturalness
// comes from STRUCTURE + the authored edge LABELS — never from inventing edge semantics the
// diagram doesn't state (no "writes to"/"reads from" on an unlabeled arrow; that would be the
// confidently-wrong this narrator exists to avoid). All findings from the design's §10.1 trio
// are folded here: labeled-fan-out disambiguation, back-edge (feedback) narration instead of a
// whole-graph grouped collapse, parallel-edge de-dup, and orphan nodes excluded from terminals.

/** Adjacency (deduped: parallel edges to the SAME target collapse into one, labels merged —
 *  a red-team finding: "A fans out to B and B" for a doubled edge), degrees, first-appearance
 *  order. `out` is id → Map(to → combinedLabel). */
function analyzeGraph({ nodes, edges }) {
  const out = new Map();
  const order = [];
  const seen = new Set();
  const note = (id) => {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  for (const id of nodes.keys()) note(id);
  for (const e of edges) {
    note(e.from);
    note(e.to);
    if (!out.has(e.from)) out.set(e.from, new Map());
    const tmap = out.get(e.from);
    if (tmap.has(e.to)) {
      const merged = [tmap.get(e.to), e.label].filter(Boolean);
      tmap.set(e.to, [...new Set(merged)].join(', '));
    } else {
      tmap.set(e.to, e.label || '');
    }
  }
  const inDeg = new Map();
  const outDeg = new Map();
  for (const [u, tmap] of out) {
    outDeg.set(u, tmap.size);
    for (const v of tmap.keys()) inDeg.set(v, (inDeg.get(v) || 0) + 1);
  }
  return { out, inDeg, outDeg, order };
}

/** A node's out-edges as `{to, label}[]`, insertion order. */
function outEdges(g, u) {
  return [...(g.out.get(u) || new Map()).entries()].map(([to, label]) => ({ to, label }));
}

const BACK_SEP = ' ';

/** The FEEDBACK arcs: DFS from the entries (then any unvisited node); an edge to a node
 *  currently on the DFS stack is a back-edge. Removing exactly these yields a DAG the flow can
 *  walk — so a single retry/feedback edge no longer collapses the whole reading to a grouped
 *  dump (a Munger-inversion finding); the back-edges narrate as "loops back to". Uses an
 *  EXPLICIT stack (not recursion) so a very deep chain can't overflow the call stack. */
function backEdges(g) {
  const state = new Map(); // 1 = on stack, 2 = done
  const back = new Set();
  const entries = g.order.filter((id) => (g.inDeg.get(id) || 0) === 0);
  const starts = [...new Set([...entries, ...g.order])];
  for (const s of starts) {
    if (state.get(s)) continue;
    state.set(s, 1);
    const stack = [{ u: s, succ: outEdges(g, s), i: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.i < frame.succ.length) {
        const to = frame.succ[frame.i++].to;
        const st = state.get(to) || 0;
        if (st === 1) back.add(`${frame.u}${BACK_SEP}${to}`);
        else if (st === 0) { state.set(to, 1); stack.push({ u: to, succ: outEdges(g, to), i: 0 }); }
      } else {
        state.set(frame.u, 2);
        stack.pop();
      }
    }
  }
  return back;
}

/** Kahn topological order over the DAG view, stable by first-appearance `pos`. */
function topoSortDag(order, dagOut, dagIn, pos) {
  const indeg = new Map(order.map((id) => [id, dagIn.get(id) || 0]));
  const ready = order.filter((id) => (indeg.get(id) || 0) === 0);
  const result = [];
  while (ready.length) {
    ready.sort((a, b) => pos.get(a) - pos.get(b));
    const u = ready.shift();
    result.push(u);
    for (const { to } of dagOut(u)) {
      indeg.set(to, indeg.get(to) - 1);
      if (indeg.get(to) === 0) ready.push(to);
    }
  }
  return result.length === order.length ? result : null;
}

// How an edge LABEL is SPOKEN is a three-way GRAMMAR choice about the AUTHOR's own word —
// never an inference of meaning for an UNLABELED edge (that stays the banned fabrication):
//   • CONDITION (a branch guard: yes/no/"on X"/"if X") → "A, on yes, leads to B";
//   • VERB (a relationship the label composes as: "calls", "reads from") → "A calls B";
//   • anything else — a NOUN, code, cadence, version, slashed fragment ("data", "HTTP 200",
//     "nightly", "v2", "decide / close") → the APPOSITIVE "A, ‹label›, leads to B", which is
//     grammatical for ANY label. Reading a noun label AS a verb ("Producer data Consumer")
//     is a broken non-sentence — the whole-trio inversion this classification answers.
// The bias is toward PRECISION on the verb reading: a false "verb" is broken prose, a missed
// verb is only the slightly-wordy-but-valid appositive, so an unrecognized label defaults to
// the appositive.
function isCondition(label) {
  const t = String(label || '').trim().toLowerCase();
  if (!t) return false;
  if (/^(on|if|when|once|unless)\b/.test(t)) return true;
  return ['yes', 'no', 'true', 'false', 'else', 'default', 'otherwise'].includes(t);
}
// A curated set of common relationship/architecture verbs in their 3rd-person-singular form —
// the form authors actually type on an edge ("Web App --|calls|--> API"). Bare data NOUNS that
// also end in -s (events, requests, metrics, records, messages, results) are deliberately ABSENT
// so they fall to the appositive, not "Service events Handler".
const EDGE_VERBS = new Set(
  (
    'calls uses connects invokes triggers notifies reads writes sends receives feeds serves ' +
    'loads stores queries fetches publishes subscribes consumes produces emits routes handles ' +
    'processes validates authenticates authorizes updates creates deletes returns requires ' +
    'depends relies contains includes references extends implements imports exports wraps proxies ' +
    'forwards dispatches schedules monitors logs tracks controls manages owns provides exposes ' +
    'hosts runs executes spawns launches starts stops guards filters transforms maps joins ' +
    'streams pushes pulls polls watches renders generates computes scores ranks sorts caches ' +
    'replicates syncs mirrors restores ingests aggregates enriches normalizes parses encodes ' +
    'decodes encrypts signs verifies checks tests deploys builds compiles packages ships delivers ' +
    'powers drives orchestrates coordinates links binds mounts attaches registers resolves ' +
    'redirects blocks allows denies throttles balances scales replaces merges splits distributes ' +
    'is has needs gets holds keeps becomes'
  ).split(/\s+/),
);
// A preposition as the SECOND word signals a verb+particle phrase whose particle attaches to the
// target ("reads from" + Postgres → "reads from Postgres"). High precision — this is why a
// multi-word verb label composes, while "emits events" (no particle) stays appositive.
const EDGE_PREPS = new Set('on to from into onto upon with via for of at by through across over against around about after before'.split(' '));
/** Read this label AS the connective verb ("A ‹label› B")? True only for a curated single-word
 *  verb, or a verb+preposition phrase whose FIRST word is also a curated verb — otherwise the
 *  appositive is the safe, grammatical reading. The first word MUST be gated on EDGE_VERBS on
 *  both paths: a NOUN + preposition ("request to", "response to", "part of") is not a verb, and
 *  reading it as one ("Gateway response to Client") is the exact broken non-sentence the
 *  appositive exists to prevent — every real verb+particle phrase ("reads from", "writes to",
 *  "depends on") has its verb in the set, so the gate costs nothing. */
function isVerbLabel(label) {
  const t = String(label || '').trim();
  if (!t || isCondition(t)) return false;
  const words = t.split(/\s+/);
  if (words.length === 1) return EDGE_VERBS.has(t.toLowerCase());
  return EDGE_VERBS.has(words[0].toLowerCase()) && EDGE_PREPS.has(words[1].toLowerCase());
}
/** A condition clause "on yes, leads to X" — no double "on" when the label already carries the guard word. */
function condClause(label, toLabel) {
  const l = String(label).trim();
  const head = /^(on|if|when|once|unless)\b/i.test(l) ? l : `on ${l}`;
  return `${head}, leads to ${toLabel}`;
}
/** Depluralize a 3rd-person-singular verb for a PLURAL subject, conjugating only the FIRST word
 *  ("depends on" → "depend on", "processes" → "process", "is" → "are"). A naive trailing-"s"
 *  strip produced non-words ("processe", "i") — the trio's worst fan-in defect. */
function pluralizeVerb(label) {
  const s = String(label);
  const m = s.match(/^(\S+)([\s\S]*)$/);
  if (!m) return s;
  const [, w, rest] = m;
  const irregular = { is: 'are', has: 'have', does: 'do', was: 'were', goes: 'go' };
  const key = w.toLowerCase();
  if (Object.hasOwn(irregular, key)) return irregular[key] + rest;
  let base = w;
  if (/[a-z]ies$/i.test(w)) base = w.replace(/ies$/i, 'y'); // relies→rely, queries→query
  else if (/(iz|is|yz)es$/i.test(w)) base = w.replace(/es$/i, 'e'); // authorizes→authorize, normalizes→normalize (silent-e -ize/-ise/-yze: add only "s")
  else if (/caches$/i.test(w)) base = w.replace(/s$/i, ''); // silent-e -che stem (only such verb in EDGE_VERBS): caches→cache, not "cach"
  else if (/(sses|shes|ches|xes|zes|oes)$/i.test(w)) base = w.replace(/es$/i, ''); // passes→pass, watches→watch, fixes→fix
  else if (/[^s]s$/i.test(w)) base = w.replace(/s$/i, ''); // depends→depend, uses→use (keeps -ss: class→class)
  return base + rest;
}

/**
 * Flow-path narrative — how a person reads a flowchart aloud (design §11):
 *   • an unlabeled edge is the neutral "leads to"; a LABELED edge is spoken three ways by
 *     GRAMMAR (isCondition / isVerbLabel), never by inferring meaning: a condition guard →
 *     "on yes, leads to B"; a recognized verb/verb+preposition → "A calls B" / "app depends
 *     on core-lib"; anything else (a noun, code, cadence, version) → the appositive "A,
 *     ‹label›, leads to B", grammatical for ANY label — the reading a bare label-as-verb
 *     ("Producer data Consumer") would break;
 *   • a linear chain of UNLABELED edges coalesces ("A leads to B, then C"); a fork starts a
 *     fresh sentence ("From X: …") — no ", which" hinge;
 *   • FAN-IN coalesces: ≥2 sources sharing one verb/unlabeled relation into a target read once
 *     ("Auth and Orders both lead to the User DB") — the biggest faithful de-repetition on wide
 *     graphs (condition- and noun-labeled in-edges are NOT coalesced — "both on yes V" / "both
 *     data V" would break; each reads its own sentence);
 *   • a complex graph (multi-entry, or branch + reconvergence/loop) opens with a topological
 *     OVERVIEW ("It begins at X and ends at Y") — gated so a linear/fan-out walk that already
 *     says it isn't padded with boilerplate;
 *   • feedback arcs read as loops.
 * The naturalness comes from the author's LABELS + topology STRUCTURE — never invented semantics.
 * Returns null only on the (post-back-removal) impossible non-DAG; the grouped fallback covers it.
 */
function renderFlowNarrative(parsed) {
  const { nodes } = parsed;
  const lbl = (id) => nodes.get(id) || id;
  const g = analyzeGraph(parsed);
  const pos = new Map(g.order.map((id, i) => [id, i]));
  const back = backEdges(g);
  const dagOut = (u) => outEdges(g, u).filter(({ to }) => !back.has(`${u}${BACK_SEP}${to}`));
  const dagIn = new Map();
  const dagInFrom = new Map();
  for (const u of g.order) {
    for (const { to, label } of dagOut(u)) {
      dagIn.set(to, (dagIn.get(to) || 0) + 1);
      if (!dagInFrom.has(to)) dagInFrom.set(to, []);
      dagInFrom.get(to).push({ from: u, label });
    }
  }
  const dagOutDeg = (u) => dagOut(u).length;
  const topo = topoSortDag(g.order, dagOut, dagIn, pos);
  if (!topo) return null; // unreachable after back-edge removal; defensive

  const terminals = g.order.filter((id) => (g.outDeg.get(id) || 0) === 0 && (g.inDeg.get(id) || 0) > 0);
  const entries = topo.filter((id) => !(dagIn.get(id) > 0) && dagOutDeg(id) > 0);
  const both = (n) => (n > 2 ? 'all' : 'both');

  // A fan-IN coalesce group: ≥2 sources into V sharing the SAME relation, where that relation
  // reads cleanly in the merged "A and B both ‹rel› V" frame — i.e. UNLABELED ("both lead to")
  // or a VERB ("both depend on"). Condition guards and noun/appositive labels are excluded:
  // "both on yes V" / "both data V" are broken, so those in-edges each read their own sentence.
  const coalesceOf = (V) => {
    const byLabel = new Map();
    for (const e of dagInFrom.get(V) || []) {
      const k = e.label || '';
      if (!byLabel.has(k)) byLabel.set(k, []);
      byLabel.get(k).push(e.from);
    }
    return [...byLabel.entries()]
      .filter(([label, froms]) => froms.length >= 2 && (label === '' || isVerbLabel(label)))
      .map(([label, froms]) => ({ label, froms }));
  };
  const deferred = (u, v, label) => coalesceOf(v).some((gr) => gr.label === (label || '') && gr.froms.includes(u));

  const consumed = new Set();
  const sentences = [];
  const say = (s) => sentences.push(terminate(s)); // terminate() — never a bare `.`, so a node label ending in "?"/"." doesn't double

  const hasBranch = g.order.some((id) => dagOutDeg(id) >= 2);
  const hasMerge = g.order.some((id) => (dagIn.get(id) || 0) >= 2);
  const complex = entries.length > 1 || (hasBranch && (hasMerge || back.size > 0)); // gates the terminal close below

  // ④ GIST (layer 1) — a LEAN orientation line that says ONLY what the detail walk never does,
  // then goes quiet. The walk already enumerates fan-outs ("X fans out to A, B"), fan-in merges
  // ("A and B both lead to M"), loop targets, and terminals — so re-naming those nodes here is
  // pure pre-echo (a Munger-inversion finding on the first, richer draft). What the walk omits:
  //   • DEPTH — the longest path length; you'd otherwise count the "then"s;
  //   • a coarse SHAPE gestalt — "a diamond" / "branching and reconverging" — with NO node names
  //     and NO counts (the walk gives those);
  //   • whether there's a LOOP at all (the walk names the target; the gist just flags it).
  // It fires only when it can add one of those — a pure linear chain, a lone fan-out, and a
  // shallow one-off loop stay SILENT because the walk is already the gist. Purely topology, never
  // inferred meaning. "It"/the frame is the "A flowchart[, title]." the caller prepends.
  const nNodes = g.order.filter((id) => (g.outDeg.get(id) || 0) + (g.inDeg.get(id) || 0) > 0).length;
  const convergences = g.order.filter((id) => (dagIn.get(id) || 0) >= 2);
  const dagTerminals = g.order.filter((id) => dagOutDeg(id) === 0 && (dagIn.get(id) || 0) > 0); // DAG-based, so a loop-tail sink still counts
  const maxOut = g.order.reduce((m, id) => Math.max(m, dagOutDeg(id)), 0);
  // Longest path (in edges) over the DAG — computed ITERATIVELY in reverse topo order, so a
  // very deep chain can't blow the call stack (a recursive walk would recurse to graph depth).
  const lp = new Map(g.order.map((id) => [id, 0]));
  for (let i = topo.length - 1; i >= 0; i--) {
    const u = topo[i];
    let best = 0;
    for (const o of dagOut(u)) best = Math.max(best, 1 + lp.get(o.to));
    lp.set(u, best);
  }
  const hops = g.order.length ? Math.max(...lp.values()) : 0;
  const num = (n) => numberToWords(n);
  const renderGist = () => {
    if (!entries.length || nNodes < 4) return null;
    const pureLinear = g.order.every((id) => dagOutDeg(id) <= 1 && (dagIn.get(id) || 0) <= 1);
    const reconverges = hasBranch && convergences.length > 0;
    const deep = hops >= 4;
    if (pureLinear || (!deep && !reconverges)) return null; // the walk already conveys these
    const isDiamond = entries.length === 1 && dagTerminals.length === 1 && convergences.length === 1 && maxOut >= 2 && hops <= 3;
    let core;
    if (isDiamond) {
      core = 'a diamond';
    } else {
      const parts = [];
      if (deep) parts.push(`${num(hops)} hops deep`); // `deep` is hops>=4, so always plural
      if (reconverges) parts.push('branching and reconverging');
      core = parts.join(', ');
    }
    if (back.size) core = core ? `${core}, with a loop` : 'with a loop';
    return core ? core.charAt(0).toUpperCase() + core.slice(1) : null;
  };
  const gistText = renderGist();
  if (gistText) say(gistText);

  // One out-edge → its post-head fragment ("leads to B" / "on yes, leads to B" / "calls B" /
  // the appositive "data, leads to B"), and the same with the subject prepended.
  const frag = (o) => {
    const to = lbl(o.to);
    if (!o.label) return `leads to ${to}`;
    if (isCondition(o.label)) return condClause(o.label, to);
    if (isVerbLabel(o.label)) return `${o.label} ${to}`;
    return `${o.label}, leads to ${to}`; // appositive — grammatical for any noun/code label
  };
  const edgeClause = (head, o) => {
    const to = lbl(o.to);
    if (!o.label) return `${head} leads to ${to}`;
    if (isCondition(o.label)) return `${head}, ${condClause(o.label, to)}`;
    if (isVerbLabel(o.label)) return `${head} ${o.label} ${to}`;
    return `${head}, ${o.label}, leads to ${to}`;
  };

  // Describe U's OUT-edges (edges deferred to a fan-in merge are skipped).
  const describeOut = (U, lead) => {
    const outs = dagOut(U).filter((o) => !deferred(U, o.to, o.label));
    if (!outs.length) return null;
    const head = lead || lbl(U);
    if (outs.every((o) => !o.label)) {
      if (outs.length >= 2) return `${head} fans out to ${joinWithAnd(outs.map((o) => lbl(o.to)))}`;
      return `${head} leads to ${lbl(outs[0].to)}`;
    }
    // all out-edges share ONE verb → "U verb A, B, and C"
    const labels = new Set(outs.map((o) => o.label));
    if (outs.length >= 2 && labels.size === 1 && isVerbLabel(outs[0].label)) {
      return `${head} ${outs[0].label} ${joinWithAnd(outs.map((o) => lbl(o.to)))}`;
    }
    if (outs.length === 1) return edgeClause(head, outs[0]);
    // mixed → "From U: <frag>; <frag>" (each fragment self-contained, unambiguous)
    return `From ${lbl(U)}: ${outs.map(frag).join('; ')}`;
  };

  // ② Fan-in merge: coalesced groups read once at the target. The verb is depluralized for the
  // now-plural subject ("depends on" → "core-lib and ui-kit both depend on runtime").
  const describeMergeIn = (V) => {
    const groups = coalesceOf(V);
    if (!groups.length) return null;
    return groups
      .map(({ label, froms }) => {
        const names = joinWithAnd(froms.map(lbl));
        return label ? `${names} ${both(froms.length)} ${pluralizeVerb(label)} ${lbl(V)}` : `${names} ${both(froms.length)} lead to ${lbl(V)}`;
      })
      .join('. ');
  };

  for (const start of topo) {
    if (consumed.has(start)) continue;
    if ((g.outDeg.get(start) || 0) === 0 && (g.inDeg.get(start) || 0) === 0) { consumed.add(start); continue; } // orphan
    const merge = describeMergeIn(start); // introduces `start` via its coalesced predecessors
    if (merge) say(merge);
    if (dagOutDeg(start) === 0) { consumed.add(start); continue; } // reached sink; named by predecessors

    // Chain along UNLABELED single→single edges; a labeled hop or a fan-in target breaks it.
    const chain = [start];
    let cur = start;
    while (dagOutDeg(cur) === 1) {
      const nxt = dagOut(cur)[0];
      if (nxt.label || (dagIn.get(nxt.to) || 0) !== 1 || consumed.has(nxt.to) || chain.includes(nxt.to)) break;
      chain.push(nxt.to);
      cur = nxt.to;
    }
    for (const c of chain) consumed.add(c);
    const last = chain[chain.length - 1];

    if (chain.length > 1) {
      let s = lbl(chain[0]);
      for (let i = 1; i < chain.length; i++) s += i === 1 ? ` leads to ${lbl(chain[i])}` : `, then ${lbl(chain[i])}`;
      say(s);
      const tail = describeOut(last); // ① the fork is its OWN sentence — no ", which" hinge
      if (tail) say(tail);
    } else {
      const one = describeOut(start);
      if (one) say(one);
    }
  }

  // Feedback arcs, spoken as loops (restores the cycle signal a grouped dump would lose). The
  // label reads the same three ways as a forward edge: condition guard, verb, or appositive.
  for (const key of back) {
    const [u, v] = key.split(BACK_SEP);
    const l = g.out.get(u).get(v);
    const target = u === v ? 'itself' : lbl(v);
    if (l && isCondition(l)) {
      const head = /^(on|if|when|once|unless)\b/i.test(l.trim()) ? l.trim() : `on ${l.trim()}`;
      say(`${lbl(u)}, ${head}, loops back to ${target}`);
    } else if (l && isVerbLabel(l)) {
      say(`${lbl(u)} ${l}, looping back to ${target}`);
    } else if (l) {
      say(`${lbl(u)}, ${l}, loops back to ${target}`); // appositive (noun/code label)
    } else {
      say(`${lbl(u)} loops back to ${target}`);
    }
  }
  if (terminals.length && !complex) say(`The flow ends at ${joinWithAnd(terminals.map(lbl))}`);
  return sentences.length ? sentences.join(' ') : null;
}

/** Defensive grouped-adjacency fallback: one sentence per source node, out-edges coalesced,
 *  labeled branches bound with a verb (same disambiguation as the flow reader). Back-edge
 *  removal makes the flow reader always succeed, so this is a belt-and-suspenders guard. */
function renderGroupedNarrative(parsed) {
  const { nodes } = parsed;
  const g = analyzeGraph(parsed);
  const lbl = (id) => nodes.get(id) || id;
  const sentences = [];
  for (const u of g.order) {
    const outs = outEdges(g, u);
    if (!outs.length) continue;
    if (outs.some((o) => o.label)) {
      const clauses = outs.map((o) => (o.label ? `on ${o.label}, leads to ${lbl(o.to)}` : `leads to ${lbl(o.to)}`));
      sentences.push(`From ${lbl(u)}: ${clauses.join('; ')}.`);
    } else {
      sentences.push(`${lbl(u)} leads to ${joinWithAnd(outs.map((o) => lbl(o.to)))}.`);
    }
  }
  return sentences.length ? sentences.join(' ') : null;
}

/** The first meaningful keyword in a mermaid fence body — after an optional `--- … ---`
 *  front-matter block, `%%{init}%%` directives, `%%` comments, and blanks. Drives the type
 *  DISPATCH (`narrateMermaidFence`); an unrecognized keyword bails → heading caption. */
function firstFenceKeyword(body) {
  const lines = String(body).split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (lines[i] !== undefined && lines[i].trim() === '---') {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '---') j++;
    i = j < lines.length ? j + 1 : lines.length;
  }
  for (; i < lines.length; i++) {
    const t = lines[i].replace(/%%\{[\s\S]*?\}%%/g, '').trim();
    if (!t || t.startsWith('%%')) continue;
    return t;
  }
  return '';
}

// Sequence message arrows, LONGEST-first (so `-->>` beats `->>` beats `->`, `--x` beats `-x`,
// `--)` beats `-)`). Every form reads as the neutral "sends to": the arrow GLYPH encodes
// sync/async/reply only by Mermaid CONVENTION, not authored content — verbalizing it would be
// fabrication (design 2026-07-14 §3.4). The label after the colon is the only authored meaning.
const SEQ_ARROWS = ['<<-->>', '<<->>', '-->>', '--)', '--x', '->>', '-->', '-)', '-x', '->'];
const SEQ_MSG_CAP = 12;
// NOTE - the `-x`/`--x` "lost message" glyph is read NEUTRALLY ("sends to"), NOT as "does not
// arrive". Voicing "lost/never arrives" would read a GLYPH convention exactly as voicing "reply"
// for a dashed arrow would - the same faithfulness rule bars both, applied symmetrically (design
// 2026-07-14 s14). "Sends to" describes the authored act of sending; delivery is not claimed.

/** A structured-block opener/continuation spoken as a connective lead-in, so the next message
 *  reads inside the block. The opening `alt` is "If ‹cond›:" (NOT "Alternatively" — that falsely
 *  implies a prior option); `else` is "Otherwise, if ‹cond›:". */
const SEQ_BLOCK = {
  loop: (l) => (l ? `Repeatedly, ${l}:` : 'Repeatedly:'),
  alt: (l) => (l ? `If ${l}:` : 'One case:'),
  else: (l) => (l ? `Otherwise, if ${l}:` : 'Otherwise:'),
  opt: (l) => (l ? `Optionally, if ${l}:` : 'Optionally:'),
  par: (l) => (l ? `In parallel, ${l}:` : 'In parallel:'),
  and: (l) => (l ? `And in parallel, ${l}:` : 'And in parallel:'),
  critical: (l) => (l ? `Critically, ${l}:` : 'Critically:'),
  option: (l) => (l ? `Or, if ${l}:` : 'Or:'),
  break: (l) => (l ? `Breaking off, if ${l}:` : 'Breaking off:'),
};
function seqBlockPhrase(kw, label) {
  return (SEQ_BLOCK[kw] || ((l) => `${l || ''}:`))(label);
}

/** One message → its spoken clause. A self-message (`A->>A`) reads as internal work ("‹A›, to
 *  itself: …") rather than a send-to-self (design §14); +/- activation flags are already stripped. */
function renderSeqMsg(m) {
  if (m.src === m.tgt) return m.label ? `${m.src}, to itself: ${m.label}` : `${m.src}, to itself`;
  return m.label ? `${m.src} sends to ${m.tgt}: ${m.label}` : `${m.src} sends to ${m.tgt}`;
}

/** Coalesce a RUN (≥1) of consecutive, same-sender, labeled, non-self messages into one clause,
 *  de-repeating only the narrator's own "X sends to Y" scaffolding — every authored receiver and
 *  label is retained (design §14, the faithful sender-coalescing / lossless fan-out lift):
 *   - one receiver:  "A sends to B: first; then second; then third"
 *   - many receivers: "From A: to B, first; to C, second"  (a fan-out; no receiver dropped). */
function renderSeqRun(run) {
  if (run.length === 1) return renderSeqMsg(run[0]);
  const src = run[0].src;
  if (run.every((m) => m.tgt === run[0].tgt)) {
    return `${src} sends to ${run[0].tgt}: ${run.map((m) => m.label).join('; then ')}`;
  }
  return `From ${src}: ${run.map((m) => `to ${m.tgt}, ${m.label}`).join('; ')}`;
}

/** Walk the tagged event stream into spoken clauses. Consecutive same-sender labeled messages
 *  coalesce (renderSeqRun); a self-message, a label-less message, a note, a block lead-in, or a
 *  block close all FLUSH the run first (so a conditional/note inside a same-pair run is never
 *  swept away — a red-team guard, design §14). A `close` becomes an "Afterwards:" resume cue only
 *  when a real event follows (a trailing close speaks nothing). */
function renderSeqClauses(events) {
  const clauses = [];
  let run = [];
  const flush = () => { if (run.length) { clauses.push(renderSeqRun(run)); run = []; } };
  events.forEach((e, k) => {
    if (e.k === 'msg' && e.src !== e.tgt && e.label) {
      if (run.length && run[0].src === e.src) run.push(e);
      else { flush(); run = [e]; }
      return;
    }
    flush();
    if (e.k === 'msg') clauses.push(renderSeqMsg(e));
    else if (e.k === 'note') clauses.push(`Note: ${e.text}`);
    else if (e.k === 'block') clauses.push(e.phrase);
    else if (e.k === 'close' && events.slice(k + 1).some((x) => x.k !== 'close')) clauses.push('Afterwards:');
  });
  flush();
  return clauses;
}

/** Split a message line `SRC <arrow>[+/-]TGT [: text]` → {src, tgt, text}; BAIL on an arrow with a
 *  missing endpoint; null when there's no arrow (not a message). The first `:` isolates the
 *  SIGNATURE from the label FIRST (a participant id/signature never contains a `:`), so an
 *  arrow-like glyph inside the message text (`A->>B: prefer -->> over ->`) can't corrupt src/tgt
 *  or leak a raw glyph into the voice. The `+`/`-` activation flag glued to the target is stripped
 *  (pure lifeline bookkeeping — no authored words). */
function parseSeqMessage(line) {
  const colon = line.indexOf(':');
  const sig = colon === -1 ? line : line.slice(0, colon);
  const text = colon === -1 ? '' : line.slice(colon + 1).trim();
  for (const arrow of SEQ_ARROWS) {
    const idx = sig.indexOf(arrow);
    if (idx === -1) continue;
    const src = sig.slice(0, idx).trim();
    const tgt = sig.slice(idx + arrow.length).trim().replace(/^[+-]\s*/, '');
    if (!src || !tgt) return BAIL;
    return { src, tgt, text };
  }
  return null;
}

/**
 * Narrate a Mermaid `sequenceDiagram` as an ordered spoken SCRIPT (design 2026-07-14, first-wave
 * slice #1; reading model hardened by the §14 multi-pass trio). Opens with a message-count frame
 * ("A seven-message sequence diagram"), then walks the messages in source order as a neutral
 * "‹A› sends to ‹B›[: label]" — with consecutive same-sender messages COALESCED (de-repeating only
 * the narrator's own scaffolding: "A sends to B: x; then y" and the fan-out "From A: to B, x; to C,
 * y"), self-messages read as internal work ("A, to itself: x"), single-line notes ("Note: …"), and
 * SINGLE-LEVEL structured blocks (loop/alt/opt/par/critical/break) as a spoken connective.
 *
 * FAITHFULNESS (the §14 trio's load-bearing conclusions): every arrow reads the neutral "sends to"
 * — the glyph's sync/async/reply meaning is Mermaid convention, never authored, so it is NEVER
 * voiced; there is deliberately NO "returns/back to A" round-trip framing (a direction reversal is
 * a reply only by the banned glyph) and NO shape gist (relay/hub/request-response/polling are
 * interpretation, not authored structure). A direction reversal is already spoken faithfully as the
 * next "B sends to A".
 *
 * Bails to null (→ heading caption) on a NESTED block, a multiline `note … end note`, an
 * unrecognized arrow/line, or a malformed message — never a guessed reading. Past a message cap it
 * reads the first `SEQ_MSG_CAP` (coalesced), the remainder count, AND the final message (the payoff
 * is never truncated away). Returns null for a non-sequence fence.
 */
function narrateSequence(body) {
  const lines = String(body).split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  let title = null;
  if (lines[i] !== undefined && lines[i].trim() === '---') {
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '---') {
      const tm = lines[j].match(/^\s*title:\s*(.*)$/);
      if (tm) title = scrubLabel(stripQuotes(tm[1]));
      j++;
    }
    i = j < lines.length ? j + 1 : lines.length;
  }
  // Skip blanks, `%%` comments, and `%%{init}%%` directives before the type token — the same
  // detection hygiene the dispatcher's `firstFenceKeyword` applies (design §12.2); without it a
  // `%%{init}%%` theming line, ubiquitous in real decks, makes the token check fail and the whole
  // diagram silently bail even though the dispatcher already recognized it.
  while (i < lines.length) {
    const t = lines[i].replace(/%%\{[\s\S]*?\}%%/g, '').trim();
    if (t === '' || t.startsWith('%%')) { i++; continue; }
    break;
  }
  if (!/^sequenceDiagram\b/.test((lines[i] || '').trim())) return null;
  i++;

  const labelOf = new Map(); // id → display label (registration order preserved for the summary)
  const register = (raw) => { const id = String(raw).trim(); if (id && !labelOf.has(id)) labelOf.set(id, id); return id; };
  const events = []; // tagged: {k:'msg',src,tgt,label} | {k:'note',text} | {k:'block',phrase} | {k:'close'}
  let messageCount = 0;
  let capIndex = -1; // events.length right after the cap-th message (the prefix truncation point)
  let lastMsg = null; // the final message event — always spoken, even past the cap
  let depth = 0; // structured-block nesting; a second level bails

  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%%')) continue;
    if (/^(autonumber|activate|deactivate|title|accTitle|accDescr|link|links|properties|rect|box)\b/i.test(t)) continue;
    // A block closing back to the top level emits a resume marker, so a message AFTER the block
    // doesn't read as if still inside it (rendered as "Afterwards:" only when more follows).
    if (/^end\b/i.test(t)) { if (depth > 0) { depth--; events.push({ k: 'close' }); } continue; }
    const pm = t.match(/^(?:create\s+|destroy\s+)?(?:participant|actor)\s+([^\s:]+?)(?:\s+as\s+(.+))?$/i);
    if (pm) { const id = register(pm[1]); if (pm[2]) labelOf.set(id, scrubLabel(stripQuotes(pm[2]))); continue; }
    const nm = t.match(/^note\s+(?:left of|right of|over)\s+[^:]+:\s*(.+)$/i);
    if (nm) { events.push({ k: 'note', text: scrubLabel(nm[1]) }); continue; }
    if (/^note\b/i.test(t)) return null; // multiline note block → bail (v1)
    const bm = t.match(/^(loop|alt|opt|par|critical|break)\b\s*(.*)$/i);
    if (bm) { if (++depth > 1) return null; events.push({ k: 'block', phrase: seqBlockPhrase(bm[1].toLowerCase(), scrubLabel(bm[2])) }); continue; }
    const cm = t.match(/^(else|and|option)\b\s*(.*)$/i);
    if (cm && depth > 0) { events.push({ k: 'block', phrase: seqBlockPhrase(cm[1].toLowerCase(), scrubLabel(cm[2])) }); continue; }
    const m = parseSeqMessage(t);
    if (m === BAIL) return null;
    if (m) {
      const ev = { k: 'msg', src: labelOf.get(register(m.src)) || m.src, tgt: labelOf.get(register(m.tgt)) || m.tgt, label: scrubLabel(m.text) };
      events.push(ev);
      lastMsg = ev;
      messageCount++;
      if (messageCount === SEQ_MSG_CAP) capIndex = events.length;
      continue;
    }
    return null; // unrecognized line → bail (never guess)
  }

  if (!messageCount) return null; // nothing to say beyond a participant list
  // A message-count frame is the one faithful orientation the walk can't self-state (§14; the
  // sequence analog of the flowchart gist's DEPTH). No shape/cast gist — both are interpretation.
  // "An" before a vowel-SOUND count word (eight/eighteen/eighty-*, eleven) — a spoken-grammar fix
  // for the read-aloud path ("An eight-message …", not "A eight-message …").
  const countWord = numberToWords(messageCount);
  const frameBase = `${/^(eight|eleven)/i.test(countWord) ? 'An' : 'A'} ${countWord}-message sequence diagram`;
  const frame = title ? `${frameBase}, ${title}` : frameBase;
  if (messageCount <= SEQ_MSG_CAP) {
    return [terminate(frame), ...renderSeqClauses(events).map(terminate)].join(' ');
  }
  // Past the cap: the first `SEQ_MSG_CAP` messages (coalesced, with in-flight blocks/notes), then the
  // remainder count, then the FINAL message — the terminal outcome is never truncated into silence.
  const clauses = renderSeqClauses(events.slice(0, capIndex));
  const hidden = messageCount - SEQ_MSG_CAP - 1; // messages between the prefix and the final
  clauses.push(hidden >= 1 ? `And ${numberToWords(hidden)} more message${hidden === 1 ? '' : 's'}, ending: ${renderSeqMsg(lastMsg)}` : renderSeqMsg(lastMsg));
  return [terminate(frame), ...clauses.map(terminate)].join(' ');
}

/** Shared prelude for a typed-diagram narrator: parse an optional `--- title: … ---` frontmatter,
 *  skip `%%{init}%%` / `%%` comments / blanks (the §12.2 detection hygiene), confirm the first
 *  meaningful line matches `typeRe`, and return `{ title, first, lines }` — `first` is the whole
 *  type line (some types carry args on it, e.g. `pie showData title X`), `lines` the rest of the
 *  body. Returns null if the type token doesn't match. */
function mermaidPrelude(body, typeRe) {
  const raw = String(body).split('\n');
  let i = 0;
  while (i < raw.length && raw[i].trim() === '') i++;
  let title = null;
  if (raw[i] !== undefined && raw[i].trim() === '---') {
    let j = i + 1;
    while (j < raw.length && raw[j].trim() !== '---') {
      const tm = raw[j].match(/^\s*title:\s*(.*)$/);
      if (tm) title = scrubLabel(stripQuotes(tm[1]));
      j++;
    }
    i = j < raw.length ? j + 1 : raw.length;
  }
  while (i < raw.length) {
    const t = raw[i].replace(/%%\{[\s\S]*?\}%%/g, '').trim();
    if (t === '' || t.startsWith('%%')) { i++; continue; }
    break;
  }
  const first = (raw[i] || '').trim();
  if (!typeRe.test(first)) return null;
  return { title, first, lines: raw.slice(i + 1) };
}

// Statements Mermaid parses on ANY diagram but that carry nothing to narrate: the accessibility
// trio (`accTitle:`, `accDescr:`, and the multi-line `accDescr { … }` block) and `direction`. SKIP
// them — never bail (that drops the whole diagram to heading-only) and never fall through to a
// data-row regex (that FABRICATES content, e.g. an `accTitle:` line read as a class named
// "accTitle"). `st.acc` threads the block across lines. A retro-trio finding: every first-wave
// slice-2 narrator over-bailed or fabricated here, while `narrateRadarBeta` already had the
// single-line skip — this generalizes it into one shared helper (design §17).
function skipMermaidMeta(t, st) {
  if (st.acc) { if (/\}\s*$/.test(t)) st.acc = false; return true; } // inside an accDescr { … } block
  if (/^accDescr\s*\{\s*$/i.test(t)) { st.acc = true; return true; }
  if (/^(accTitle|accDescr)\b/i.test(t)) return true; // single-line accTitle:/accDescr:
  if (/^direction\b/i.test(t)) return true;
  return false;
}

/**
 * Narrate a Mermaid `pie` chart (design 2026-07-14, first-wave slice #2). DATA tier: read each
 * slice with its share of the whole — the % is DERIVED the way Mermaid itself derives it (invariant
 * §3.5), so speaking it is faithful. `showData` adds the raw value. Bails on <2 slices, a non-positive
 * sum, or any unrecognized row — never a guessed reading.
 */
function narratePie(body) {
  const pre = mermaidPrelude(body, /^pie\b/i);
  if (!pre) return null;
  const head = pre.first.match(/^pie\b\s*(showData\b)?\s*(?:title\s+(.*))?$/i);
  if (!head) return null;
  const showData = !!head[1];
  let title = pre.title || (head[2] ? scrubLabel(stripQuotes(head[2].trim())) : null);
  const rows = [];
  const seenLabel = new Set(); // Mermaid's `addSection` keeps the FIRST value for a repeated label
  const meta = { acc: false };
  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    if (skipMermaidMeta(t, meta)) continue; // accTitle/accDescr/direction — valid, carry nothing
    const tt = t.match(/^title\s+(.+)$/i); // `title` on its own line (or after rows) — Mermaid allows it
    if (tt) { title = title || scrubLabel(stripQuotes(tt[1].trim())); continue; }
    // Row: label in DOUBLE or SINGLE quotes (Mermaid's STRING accepts both); value is INT_PIE/FLOAT
    // — a leading-zero integer (`05`) parse-errors in Mermaid, so the regex rejects it here too
    // (else we'd narrate a chart that never renders — an over-match).
    const rm = t.match(/^(?:"([^"]*)"|'([^']*)')\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)\s*$/);
    if (!rm) return null; // unrecognized line → bail (never guess)
    const value = Number(rm[3]);
    // Mermaid's `addSection` throws only on a NEGATIVE value (`value < 0`); ZERO renders fine (the
    // slice just draws empty). Guard `< 0`, not `<= 0` — the earlier `<= 0` wrongly dropped any pie
    // with a zero slice to heading-only (a retro-checker finding vs the v11 source; §17).
    if (!Number.isFinite(value) || value < 0) return null;
    const rawLabel = rm[1] ?? rm[2];
    if (seenLabel.has(rawLabel)) continue; // duplicate label → Mermaid keeps the first, drops the rest
    seenLabel.add(rawLabel);
    rows.push({ label: scrubLabel(rawLabel), value, raw: rm[3] });
  }
  if (rows.length < 2) return null;
  const sum = rows.reduce((a, r) => a + r.value, 0);
  if (sum <= 0) return null;
  const frame = terminate(title ? `A pie chart, ${title}` : 'A pie chart');
  const parts = rows.map((r) => {
    const pct = `${numberToWords(Math.round((r.value / sum) * 100))} percent`;
    return showData ? `${r.label}, ${toSpokenText(r.raw)}, ${pct}` : `${r.label}, ${pct}`;
  });
  return `${frame} ${parts.map(terminate).join(' ')}`;
}

// Mermaid classDiagram relationship connectors → the DEFINED English verb + which end is the
// subject (§2, the authored-verb asymmetry: the symbol's meaning is Mermaid-DEFINED, so speaking it
// is faithful, unlike a flowchart's neutral arrow). `subj:'l'` reads "‹left› verb ‹right›";
// `subj:'r'` reads "‹right› verb ‹left›" (the arrowhead/diamond side is the direction). `assoc`
// marks the plain association/link forms whose authored LABEL, when present, replaces the verb.
const CLASS_REL = {
  '<|--': { verb: 'inherits from', subj: 'r' },
  '--|>': { verb: 'inherits from', subj: 'l' },
  '..|>': { verb: 'realizes', subj: 'l' },
  '<|..': { verb: 'realizes', subj: 'r' },
  '*--': { verb: 'is composed of', subj: 'l' },
  '--*': { verb: 'is composed of', subj: 'r' },
  'o--': { verb: 'aggregates', subj: 'l' },
  '--o': { verb: 'aggregates', subj: 'r' },
  '-->': { verb: 'is associated with', subj: 'l', assoc: true },
  '<--': { verb: 'is associated with', subj: 'r', assoc: true },
  '..>': { verb: 'depends on', subj: 'l', assoc: true },
  '<..': { verb: 'depends on', subj: 'r', assoc: true },
  '--': { verb: 'is linked to', subj: 'l', assoc: true },
  '..': { verb: 'is linked to', subj: 'l', assoc: true },
};
// Longest-match first so `<|--` beats `--`, `..|>` beats `..`, `-->` beats `--`.
const CLASS_CONNECTORS = ['<|--', '--|>', '..|>', '<|..', '*--', '--*', 'o--', '--o', '-->', '<--', '..>', '<..', '--', '..'];
// A connector → its regex fragment: escape EVERY regex metacharacter (incl. backslash — the
// complete-escaping CodeQL wants), then express a dash-run as a `-{n}` quantifier so the built
// pattern never spells a literal `-->`. That literal makes CodeQL's bad-tag-filter query read the
// regex as an (incomplete) HTML-comment parser — a false positive here (these match Mermaid class
// arrows, not HTML); the flowchart parser sidesteps it with the same `-{n,}` idiom.
const classConnRe = (c) => c.replace(/[.*+?^${}()|[\]\\<>]/g, '\\$&').replace(/-{2,}/g, (m) => `-{${m.length}}`);
const CLASS_REL_RE = new RegExp(
  `^([\\w~]+)\\s*(?:"([^"]*)"\\s*)?(${CLASS_CONNECTORS.map(classConnRe).join('|')})\\s*(?:"([^"]*)"\\s*)?([\\w~]+)\\s*(?::\\s*(.+))?$`,
);

const CLASS_REL_CAP = 12; // past this many relationships, summarize (§5 firehose / §7)

/** A UML multiplicity token → spoken ("1"→one, "*"→many, "0..*"→zero or more). Raw otherwise. */
function classMultiplicity(m) {
  const map = { '1': 'one', '*': 'many', n: 'many', '0..1': 'zero or one', '1..1': 'one', '0..*': 'zero or more', '1..*': 'one or more', '0..n': 'zero or more', '1..n': 'one or more' };
  return map[m] || scrubLabel(m);
}

/** Strip a member to spoken-ready text: drop leading visibility (`+ - # ~`), method `()`, generics
 *  `~T~`, and static/abstract markers (`$`/`*`) — the NAME/signature the author wrote, spoken plain. */
function classMember(s) {
  return scrubLabel(String(s).trim().replace(/^[+\-#~]\s*/, '').replace(/[$*]/g, '').replace(/~[^~]*~/g, '').replace(/\(\s*\)/g, '').trim());
}

/**
 * Narrate a Mermaid `classDiagram` (design 2026-07-14, first-wave slice #2). STRUCTURAL: reads the
 * relationship graph via the DEFINED-symbol→verb table (§2 — "‹B› inherits from ‹A›", "‹A› is
 * composed of ‹B›", "‹A› depends on ‹B›"), honoring the arrowhead/diamond side for direction; a
 * plain association's authored LABEL replaces the verb, and a `"1" --> "*"` multiplicity trails as
 * "one to many". Classes with members read "‹Class› has ‹names›". Bails to null on a `namespace`
 * (composite), a lollipop `()`, or any unrecognized line — never a guessed relationship.
 */
function narrateClass(body) {
  const pre = mermaidPrelude(body, /^classDiagram(-v2)?\b/i);
  if (!pre) return null;
  let title = pre.title;
  const labelOf = new Map();
  const label = (id) => labelOf.get(id) || id.replace(/~[^~]*~/g, ''); // strip a generic `~T~` for speech
  const seen = []; // class ids in first-seen order
  const note = (id) => { if (id && !seen.includes(id)) seen.push(id); };
  const members = new Map(); // id → [member text]
  const rels = [];
  const meta = { acc: false };
  let blockOf = null; // current `class X { … }` member-block owner, or null

  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    if (blockOf) { // inside a `class X { … }` body
      if (t === '}') { blockOf = null; continue; }
      if (/^<<.*>>$/.test(t)) continue; // annotation
      const mm = classMember(t);
      if (mm) { (members.get(blockOf) || members.set(blockOf, []).get(blockOf)).push(mm); }
      continue;
    }
    if (skipMermaidMeta(t, meta)) continue; // accTitle/accDescr/direction — valid, carry nothing
    const tt = t.match(/^title\s+(.+)$/i);
    if (tt) { title = title || scrubLabel(stripQuotes(tt[1].trim())); continue; }
    if (/^namespace\b/i.test(t)) return null; // nested/composite → bail (v1)
    // Ignorable styling/interaction statements (Mermaid renders them; they carry no relationship).
    // `classDef` was missing — it over-bailed the whole diagram (a retro finding; §17).
    if (/^(style|cssClass|classDef|click|link|callback|note)\b/i.test(t)) continue;
    const anno = t.match(/^<<[^>]*>>\s+([\w~]+)\s*$/); // `<<interface>> ClassName` — note the class, don't bail
    if (anno) { note(anno[1]); continue; }
    if (/^<<.*>>$/.test(t)) continue;
    // `class ID`, `class ID["Label"]`, `class ID:::css`, `class ID { …`
    const cm = t.match(/^class\s+([\w~]+)\s*(?:\[\s*"([^"]*)"\s*\])?\s*(?::::\S+)?\s*(\{)?\s*$/i);
    if (cm) { note(cm[1]); if (cm[2]) labelOf.set(cm[1], scrubLabel(cm[2])); if (cm[3]) blockOf = cm[1]; continue; }
    // Single member line: `ID : +type name`  (but NOT a relationship, which has a connector)
    const one = t.match(/^([\w~]+)\s*:\s*(.+)$/);
    if (one && !CLASS_REL_RE.test(t)) { note(one[1]); const mm = classMember(one[2]); if (mm) { const arr = members.get(one[1]) || []; arr.push(mm); members.set(one[1], arr); } continue; }
    const rm = t.match(CLASS_REL_RE);
    if (rm) {
      const [, a, multA, conn, multB, b, lbl] = rm;
      const def = CLASS_REL[conn];
      if (!def) return null;
      note(a); note(b);
      rels.push({ a, b, conn, multA, multB, label: lbl ? scrubLabel(lbl) : null, def });
      continue;
    }
    return null; // unrecognized line → bail (never guess)
  }

  const relSentences = rels.map((r) => {
    const [subj, obj] = r.def.subj === 'r' ? [r.b, r.a] : [r.a, r.b];
    const verb = r.label && r.def.assoc ? r.label : r.def.verb;
    let s = `${label(subj)} ${verb} ${label(obj)}`;
    // A label on a TYPED relationship annotates it (the verb is the Mermaid-defined symbol). Read it
    // as ", labeled ‹x›" so a verb-shaped label ("has") is heard as an annotation, not a dangling
    // clause tacked onto a complete sentence (a retro-Munger finding; §17).
    if (r.label && !r.def.assoc) s += `, labeled ${r.label}`;
    if (r.multA && r.multB) {
      const [ms, mo] = r.def.subj === 'r' ? [r.multB, r.multA] : [r.multA, r.multB];
      s += `, ${classMultiplicity(ms)} to ${classMultiplicity(mo)}`;
    }
    return s;
  });
  const frameText = title ? `A class diagram, ${title}` : 'A class diagram';
  // §5 firehose: a wall of relationships is unlistenable — past the cap, summarize the counts + the
  // class inventory (NAMING the count so nothing is silently dropped, §7) rather than enumerate all.
  if (relSentences.length > CLASS_REL_CAP) {
    return terminate(`${frameText}, with ${numberToWords(seen.length)} ${seen.length === 1 ? 'class' : 'classes'} and ${numberToWords(rels.length)} relationships: ${joinWithAnd(seen.map(label))}`);
  }
  const frame = terminate(frameText);
  const sentences = relSentences;
  for (const id of seen) {
    const ms = members.get(id);
    if (ms?.length) sentences.push(`${label(id)} has ${joinWithAnd(ms)}`);
  }
  if (!sentences.length) {
    if (!seen.length) return null;
    sentences.push(`${seen.length === 1 ? 'The class is' : 'The classes are'} ${joinWithAnd(seen.map(label))}`);
  }
  return `${frame} ${sentences.map(terminate).join(' ')}`;
}

const STATE_CAP = 16; // past this many transitions, summarize (§5 firehose / §7)

/**
 * Narrate a Mermaid `stateDiagram`/`stateDiagram-v2` (design 2026-07-14, first-wave slice #2).
 * STRUCTURAL, flat v1: `[*]` is start/end BY POSITION (source → "starts at", target → "can end"),
 * a `X --> Y : event` transition reads "From X, on event, goes to Y", and `state "desc" as id`
 * resolves the display label. Bails to null on a composite `{…}`, a `--` concurrency divider, or a
 * `<<fork>>`/`<<join>>` — the parallel/nested semantics a flat reading would misstate.
 */
function narrateState(body) {
  const pre = mermaidPrelude(body, /^stateDiagram(-v2)?\b/i);
  if (!pre) return null;
  let title = pre.title;
  const labelOf = new Map();
  const label = (id) => labelOf.get(id) || id;
  const events = [];
  const meta = { acc: false };
  let noteBlock = false;
  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    if (noteBlock) { if (/^end\s*note\b/i.test(t)) noteBlock = false; continue; } // swallow `note … end note`
    if (skipMermaidMeta(t, meta)) continue; // accTitle/accDescr (incl. `{ … }` block)/direction
    const tt = t.match(/^title\s+(.+)$/i);
    if (tt) { title = title || scrubLabel(stripQuotes(tt[1].trim())); continue; }
    if (t === '--') return null; // concurrency divider → bail (v1)
    if (/\{\s*$/.test(t) || t === '}') return null; // composite state block → bail (v1)
    if (/<<(fork|join)>>/i.test(t)) return null; // fork/join concurrency → bail (v1)
    // A multi-line `note … end note` opener (no inline `:`) begins a block to swallow (the body lines
    // matched nothing and over-bailed the whole diagram — a retro finding; §17).
    if (/^note\b/i.test(t) && !t.includes(':')) { noteBlock = true; continue; }
    // Statement keywords to skip — but NEVER on a transition line (a state id may equal a keyword,
    // e.g. `end --> Done`; matching `-->` first keeps the transition instead of dropping it — a
    // final-check finding). `hide …` (e.g. `hide empty description`) was missing and over-bailed.
    if (!/-{2,}>/.test(t) && /^(direction|note|classDef|class|click|style|hide)\b/i.test(t)) continue;
    // `state "long description" as id`  — the quoted text is the display label
    const sd = t.match(/^state\s+"([^"]*)"\s+as\s+([\w]+)\s*$/i);
    if (sd) { labelOf.set(sd[2], scrubLabel(sd[1])); continue; }
    // `state id <<choice>>` (choice is a branch, allowed) / bare `state id`
    if (/^state\s+[\w]+\s*(<<choice>>)?\s*$/i.test(t)) continue;
    // Transition: `A --> B` / `A --> B : event`, endpoints an id or `[*]`. The arrow is written
    // `-{2,}>` (a dash quantifier, not the literal `-->`) so CodeQL's bad-tag-filter query doesn't
    // misread it as HTML-comment parsing — the same idiom the flowchart parser uses.
    const tr = t.match(/^(\[\*\]|[\w]+)\s*-{2,}>\s*(\[\*\]|[\w]+)\s*(?::\s*(.+))?$/);
    if (tr) {
      const [, from, to, ev] = tr;
      const raw = ev ? ev.trim() : null;
      // A `[cond]` label is a UML GUARD (a condition), not a triggering event — read it as "when",
      // and keep the guard flag so it's phrased distinctly (a retro finding: it was rewritten to an
      // event "on cond" and the brackets Mermaid renders were dropped; §17).
      const guard = !!raw && /^\[.*\]$/.test(raw);
      const event = raw ? scrubLabel(raw.replace(/^\[(.*)\]$/, '$1')) : null;
      events.push({ from, to, event, guard });
      continue;
    }
    // `id : description` — Mermaid's OTHER display-label form (equivalent to `state "desc" as id`).
    // Capture it as the label so BOTH forms narrate by display label (§3), never the raw id (an
    // adversarial-check finding: the two forms were narrating inconsistently).
    const dm = t.match(/^([\w]+)\s*:\s*(.+)$/);
    if (dm) { labelOf.set(dm[1], scrubLabel(dm[2])); continue; }
    return null; // unrecognized line → bail
  }
  if (!events.length) return null;
  const frameText = title ? `A state diagram, ${title}` : 'A state diagram';
  // §5 firehose: a large machine is an unlistenable wall of transitions — past the cap, summarize the
  // counts and where it starts (NAMING the count so nothing is silently dropped, §7).
  if (events.length > STATE_CAP) {
    const states = new Set();
    for (const e of events) { if (e.from !== '[*]') states.add(e.from); if (e.to !== '[*]') states.add(e.to); }
    const starts = [...new Set(events.filter((e) => e.from === '[*]').map((e) => label(e.to)))];
    return terminate(`${frameText}, with ${numberToWords(events.length)} transitions across ${numberToWords(states.size)} states${starts.length ? `, starting at ${joinWithAnd(starts)}` : ''}`);
  }
  const frame = terminate(frameText);
  const trig = (e) => (e.guard ? `when ${e.event}` : `on ${e.event}`);
  const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const sentences = events.map(({ from, to, event, guard }) => {
    const start = from === '[*]';
    const end = to === '[*]';
    if (start && end) return null; // degenerate
    const g = event ? trig({ event, guard }) : null;
    if (start) return g ? `${upper(g)}, it starts at ${label(to)}` : `It starts at ${label(to)}`;
    if (end) return g ? `From ${label(from)}, ${g}, it can end` : `${label(from)} can end`;
    return g ? `From ${label(from)}, ${g}, goes to ${label(to)}` : `From ${label(from)}, goes to ${label(to)}`;
  }).filter(Boolean);
  if (!sentences.length) return null;
  return `${frame} ${sentences.map(terminate).join(' ')}`;
}

// Mermaid erDiagram crow's-foot cardinality tokens → spoken counts (§2 — Mermaid-DEFINED, so
// faithful). Left-of-line and right-of-line forms are mirror images of the same four counts.
const ER_CARD = { '|o': 'zero or one', 'o|': 'zero or one', '||': 'one', '}o': 'zero or more', 'o{': 'zero or more', '}|': 'one or more', '|{': 'one or more' };
// An ER entity name: `"quoted"`, or Mermaid's UNICODE_TEXT — word chars, `-`, `*`, and ANY
// non-ASCII letter (`([^\x00-\x7F]|\w|-|\*)+`), so `CAFÉ` / `LINE-ITEM` narrate, not just ASCII ids.
const ER_ENT = '(?:"[^"]*"|(?:[\\w*-]|[^\\u0000-\\u007F])+)';
// entity1  <leftcard>(--|..)<rightcard>  entity2  : label  — read BOTH counts literally, never
// gamble a single direction (design §8). The `: label` is REQUIRED: Mermaid has no labelless
// relationship production (a bare `A ||--o{ B` parse-errors), so an optional label would narrate a
// diagram that never renders (a retro-checker over-match finding; §17).
const ER_REL_RE = new RegExp('^(' + ER_ENT + ')\\s+(\\|o|\\|\\||\\}o|\\}\\|)(--|\\.\\.)(o\\||\\|\\||o\\{|\\|\\{)\\s+(' + ER_ENT + ')\\s*:\\s*(.+)$');
// Mermaid also accepts WORD-form cardinality — `CUSTOMER one to many ORDER : places` — mapping each
// word to the same count as the crow's-foot glyph (verified against the v11 lexer). `to` is
// identifying, `optionally to` non-identifying (that distinction is a deliberate scope omission —
// speaking "non-identifying" is ER jargon a listener can't decode; §17).
const ER_WORD_CARD = { 'only one': 'one', one: 'one', 'zero or one': 'zero or one', 'one or zero': 'zero or one', 'zero or more': 'zero or more', 'zero or many': 'zero or more', 'many(0)': 'zero or more', '0+': 'zero or more', many: 'zero or more', 'one or more': 'one or more', 'one or many': 'one or more', 'many(1)': 'one or more', '1+': 'one or more' };
// Longest / most-specific first (`many(0)` before bare `many`); `+`/`()` escaped for the alternation.
const ER_CARD_WORDS = '(?:many\\(0\\)|many\\(1\\)|zero or one|one or zero|zero or many|zero or more|one or many|one or more|only one|one|many|1\\+|0\\+)';
const ER_WORD_RE = new RegExp('^(' + ER_ENT + ')\\s+(' + ER_CARD_WORDS + ')\\s+(?:optionally to|to)\\s+(' + ER_CARD_WORDS + ')\\s+(' + ER_ENT + ')\\s*:\\s*(.+)$', 'i');
const ER_ATTR_CAP = 12; // past this many attributes on one entity, summarize (§5 firehose / §7)
// Entity block open `ENTITY {` / `ENTITY["Display Name"] {`, and a bare entity line — built from the
// ER_ENT STRING (not a literal) so the non-ASCII class doesn't trip biome's control-char-in-regex rule.
const ER_BLOCK_RE = new RegExp('^(' + ER_ENT + ')\\s*(\\[[^\\]]*\\])?\\s*\\{\\s*$');
const ER_BARE_RE = new RegExp('^' + ER_ENT + '\\s*$');

/**
 * Narrate a Mermaid `erDiagram` (design 2026-07-14, first-wave slice #2). STRUCTURAL+DATA: reads
 * each relationship as "‹card1› ‹Entity1› ‹label› ‹card2› ‹Entity2›" — the crow's-foot counts are
 * Mermaid-DEFINED (§2) and read LITERALLY on each side (never resolving to a single gambled
 * direction). Attribute blocks read "‹Entity› has attributes ‹names›", noting a primary/foreign
 * key. Bails to null on a malformed crow's-foot or any unrecognized line.
 */
function narrateEr(body) {
  const pre = mermaidPrelude(body, /^erDiagram\b/i);
  if (!pre) return null;
  let title = pre.title;
  const rels = [];
  const attrs = new Map(); // entity → [{ name, key }]
  const order = [];
  const labelOf = new Map(); // entity id → display label (from `ENTITY["Display Name"]`)
  const label = (e) => labelOf.get(e) || e;
  const note = (e) => { if (!order.includes(e)) order.push(e); };
  const meta = { acc: false };
  let block = null;
  // Reify a `... : label` relationship, glyph or word form, into a rel with both counts + label.
  const pushRel = (e1, c1, c2, e2, lbl) => {
    const a = stripQuotes(e1);
    const b = stripQuotes(e2);
    note(a); note(b);
    rels.push({ a, b, c1, c2, label: scrubLabel(stripQuotes(lbl)) });
  };
  // `ENTITY["Display Name"]` (with or without a trailing `{`) — note the id and its display label.
  const aliasOf = (tok) => { const m = tok.match(/^([^\s[]+|"[^"]*")\s*\[\s*"([^"]*)"\s*\]$/); return m ? { id: stripQuotes(m[1]), label: scrubLabel(m[2]) } : null; };
  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    // Handle an open attribute block FIRST (an attribute's leading token is its TYPE — a type named
    // `title`/`direction`/`accTitle` must not be mis-read as a meta statement; a checker finding that
    // this narrator, unlike narrateClass, ran the meta/title checks before the block handler; §17).
    if (block) {
      if (t === '}') { block = null; continue; }
      // attribute: `type name [PK[, FK[, UK]]] ["comment"]` — key tags are COMMA-separated only
      // (Mermaid's `attributeKeyTypeList` requires a comma; space-separated `PK FK` parse-errors, so
      // it must bail here too — a retro-checker over-match finding correcting the old space-tolerant
      // regex, whose comment wrongly claimed `PK FK` was valid; §17).
      const am = t.match(/^(\S+)\s+(\S+)((?:\s+(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?)(?:\s+"[^"]*")?\s*$/);
      if (!am) return null; // malformed attribute → bail
      const keyTag = (am[3] || '').toUpperCase();
      const key = keyTag.includes('PK') ? 'the primary key' : keyTag.includes('FK') ? 'a foreign key' : keyTag.includes('UK') ? 'a unique key' : null;
      (attrs.get(block) || attrs.set(block, []).get(block)).push({ name: scrubLabel(am[2]), key });
      continue;
    }
    if (skipMermaidMeta(t, meta)) continue; // accTitle/accDescr/direction — valid, carry nothing
    const tt = t.match(/^title\s+(.+)$/i);
    if (tt) { title = title || scrubLabel(stripQuotes(tt[1].trim())); continue; }
    // entity block open: `ENTITY {` / `ENTITY["Display Name"] {`
    const bm = t.match(ER_BLOCK_RE);
    if (bm) { const al = bm[2] ? aliasOf(bm[1] + bm[2]) : null; const e = al ? al.id : stripQuotes(bm[1]); note(e); if (al) labelOf.set(e, al.label); block = e; continue; }
    const rm = t.match(ER_REL_RE);
    if (rm) { pushRel(rm[1], ER_CARD[rm[2]], ER_CARD[rm[4]], rm[5], rm[6]); continue; }
    const wm = t.match(ER_WORD_RE);
    if (wm) { pushRel(wm[1], ER_WORD_CARD[wm[2].toLowerCase()], ER_WORD_CARD[wm[3].toLowerCase()], wm[4], wm[5]); continue; }
    // aliased bare entity `ENTITY["Display Name"]`
    const al = aliasOf(t);
    if (al) { note(al.id); labelOf.set(al.id, al.label); continue; }
    // bare entity declaration
    if (ER_BARE_RE.test(t)) { note(stripQuotes(t)); continue; }
    return null; // unrecognized line → bail
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const sentences = rels.map((r) => cap(`${r.c1} ${label(r.a)} ${r.label} ${r.c2} ${label(r.b)}`));
  for (const e of order) {
    const list = attrs.get(e);
    if (list?.length) {
      const items = list.map((a) => (a.key ? `${a.name} as ${a.key}` : a.name));
      // §5 firehose: a long attribute wall is unlistenable — past the cap, summarize with the count
      // and the first few names, NAMING the count so nothing is silently dropped (§7).
      const body = list.length > ER_ATTR_CAP
        ? `${numberToWords(list.length)} attributes, including ${joinWithAnd(items.slice(0, 3))}`
        : `${list.length === 1 ? 'attribute' : 'attributes'} ${joinWithAnd(items)}`;
      sentences.push(`${label(e)} has ${body}`);
    }
  }
  if (!sentences.length) return null;
  const frame = terminate(title ? `An entity relationship diagram, ${title}` : 'An entity relationship diagram');
  return `${frame} ${sentences.map(terminate).join(' ')}`;
}

// C4 element token (base, before an optional `_Ext`) → spoken KIND. Db/Queue variants read as the
// thing they are; the `_Ext` suffix adds "external" (§8 — only there, never inferred).
const C4_KIND = { person: 'person', system: 'system', systemdb: 'database', systemqueue: 'queue', container: 'container', containerdb: 'database', containerqueue: 'queue', component: 'component', componentdb: 'database', componentqueue: 'queue', node: 'node' };
// Elements whose args carry a TECH field before the description: Container/Component/Node families.
const C4_HAS_TECH = /^(container|component|node|deployment_node)/i;

/** Split C4 `Element(...)` inner args on commas OUTSIDE quotes (a label/description commonly
 *  contains a comma), then unquote each — the quote-aware split §8 requires. */
function c4Args(inner) {
  const args = [];
  let cur = '';
  let q = false;
  for (const ch of inner) {
    if (ch === '"') { q = !q; cur += ch; } else if (ch === ',' && !q) { args.push(cur); cur = ''; } else cur += ch;
  }
  args.push(cur);
  return args.map((a) => stripQuotes(a.trim()));
}

/**
 * Narrate a Mermaid C4 diagram — `C4Context`/`C4Container`/`C4Component`/`C4Dynamic`/`C4Deployment`
 * (design 2026-07-14, first-wave slice #2). STRUCTURAL: each typed element reads "‹label›, a ‹kind›
 * [, external]: ‹descr›"; a `Rel(a, b, "label", "tech")` reads "‹a› ‹label› ‹b›, over ‹tech›",
 * honoring `Rel_Back` (reversal) and `BiRel`, with the `_U/_D/_L/_R` LAYOUT suffixes ignored (§8);
 * a boundary reads "Within the ‹label› boundary: ‹members›" (authored containment, not an inferred
 * peer relationship — §3.2). Quote-aware arg splitting. Bails on any unrecognized construct.
 */
function narrateC4(body) {
  const pre = mermaidPrelude(body, /^C4(Context|Container|Component|Dynamic|Deployment)\b/i);
  if (!pre) return null;
  const variant = (pre.first.match(/^C4(\w+)/i) || ['', ''])[1].toLowerCase();
  let title = pre.title;
  const artA = (w) => `a${/^[aeiou]/i.test(w) ? 'n' : ''}`;
  const elemOf = new Map(); // alias → { label, kind, ext, tech, descr }
  const bLabel = new Map(); // boundary alias → display label (so a `Rel` to a boundary resolves it)
  const rootBoundaries = []; // top-level boundaries in order; each may nest `children` boundaries
  const rels = [];
  const topLevel = []; // aliases declared outside any boundary, in order
  const stack = []; // boundary NESTING stack — top is the current container
  const meta = { acc: false };
  // A C4 element/rel may carry NAMED args (`$tags="v1"`, `$link=…`, `$sprite=…`) after the positional
  // ones; they're metadata, not the description — drop them so they aren't spoken as prose (a
  // retro-checker finding: `$tags="v1"` was read as an element's description; §17). The value must be
  // a single quoted-or-unspaced token, so a quoted description that merely STARTS `$x=…` and contains
  // a space (`"$x=5 cost"`) is kept, not mistaken for a named arg (a second checker finding).
  const positional = (args) => args.filter((x) => !/^\$\w+\s*=(?:"[^"]*"|\S*)$/.test(x));

  // The inner-args group is `(.*)` (greedy to the LAST `)`), so a `)` inside a quoted label /
  // description doesn't truncate the args (a check finding). c4Args then splits quote-aware.
  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    if (skipMermaidMeta(t, meta)) continue; // accTitle/accDescr/direction — valid, carry nothing
    if (/^title\b/i.test(t)) { title = title || scrubLabel(t.replace(/^title\s+/i, '')); continue; }
    if (/^(UpdateRelStyle|UpdateElementStyle|UpdateLayoutConfig)\b/i.test(t)) continue;
    if (t === '}') { stack.pop(); continue; } // close the current boundary — pop, don't reset
    // boundary open — incl. the deployment `Node`, `Node_L`, `Node_R` variants (were over-bailed).
    const bm = t.match(/^(?:\w*_?Boundary|Node(?:_[LR])?|Deployment_Node)\s*\((.*)\)\s*\{\s*$/i);
    if (bm) {
      const a = positional(c4Args(bm[1]));
      const b = { label: a[1] || a[0] || 'a boundary', members: [], children: [] };
      if (a[0]) bLabel.set(a[0], b.label);
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(b); else rootBoundaries.push(b); // NEST inside the open boundary
      stack.push(b);
      continue;
    }
    const rm = t.match(/^(BiRel|Rel(?:_Back)?(?:_(?:[UDLR]|Up|Down|Left|Right|Neighbor))?)\s*\((.*)\)\s*$/i);
    if (rm) {
      const a = positional(c4Args(rm[2]));
      // Mermaid's `Rel` REQUIRES the label ARG be present — a 2-arg `Rel(a, b)` parse-errors, so it
      // bails (a retro-checker over-match finding: it used to invent "is connected to"). A present-
      // but-EMPTY label (`Rel(a, b, "")`) DOES render, so accept it and read a neutral connective
      // rather than drop the whole diagram (a second checker finding; §17).
      if (a.length < 3 || !a[0] || !a[1]) return null;
      const back = /_Back/i.test(rm[1]);
      rels.push({ from: back ? a[1] : a[0], to: back ? a[0] : a[1], label: a[2] ? scrubLabel(a[2]) : null, tech: a[3] ? scrubLabel(a[3]) : null, bi: /^BiRel/i.test(rm[1]) });
      continue;
    }
    const em = t.match(/^(Person|System(?:Db|Queue)?|Container(?:Db|Queue)?|Component(?:Db|Queue)?|Node(?:_[LR])?|Deployment_Node)(_Ext)?\s*\((.*)\)\s*$/i);
    if (em) {
      const base = em[1].toLowerCase().replace(/^deployment_/, '').replace(/_[lr]$/, '');
      const kind = C4_KIND[base] || 'element';
      const a = positional(c4Args(em[3]));
      const alias = a[0];
      if (!alias) return null;
      const hasTech = C4_HAS_TECH.test(em[1]);
      elemOf.set(alias, { label: a[1] || alias, kind, ext: !!em[2], tech: hasTech ? (a[2] || null) : null, descr: (hasTech ? a[3] : a[2]) || null });
      const top = stack[stack.length - 1];
      if (top) top.members.push(alias); else topLevel.push(alias);
      continue;
    }
    return null; // unrecognized construct → bail
  }

  const label = (alias) => (elemOf.get(alias) ? elemOf.get(alias).label : bLabel.get(alias) || alias);
  const describe = (alias) => {
    const e = elemOf.get(alias);
    if (!e) return null;
    let s = `${e.label}, ${artA(e.ext ? 'external' : e.kind)} ${e.ext ? 'external ' : ''}${e.kind}`;
    if (e.tech) s += `, built with ${e.tech}`;
    if (e.descr) s += `: ${e.descr}`;
    return s;
  };
  // A boundary reads its members, then its NESTED child boundaries inline — authored containment,
  // not a flattened peer list (a retro-checker finding: nested boundaries were rendered as siblings).
  const renderBoundary = (b) => {
    const parts = b.members.map(describe).filter(Boolean);
    for (const c of b.children) parts.push(renderBoundary(c));
    return parts.length ? `Within the ${b.label} boundary: ${parts.join('. ')}` : `There is ${artA(b.label)} ${b.label} boundary`;
  };
  const sentences = [];
  for (const alias of topLevel) { const d = describe(alias); if (d) sentences.push(d); }
  for (const b of rootBoundaries) sentences.push(renderBoundary(b));
  for (const r of rels) {
    let s = `${label(r.from)} ${r.label || 'is connected to'} ${label(r.to)}`;
    if (r.tech) s += `, over ${r.tech}`;
    if (r.bi) s += `, and back`;
    sentences.push(s);
  }
  if (!sentences.length) return null;
  const frame = terminate(title ? `A C4 ${variant} diagram, ${title}` : `A C4 ${variant} diagram`);
  return `${frame} ${sentences.map(terminate).join(' ')}`;
}

/**
 * Narrate a Mermaid `radar-beta` chart (design 2026-07-14, first-wave radar fast-follow). DATA tier:
 * reads the scale (`min`/`max`, or 0..`niceCeil(dataMax)` the way the render auto-fits — §3.5) then
 * each curve's axis values, pairing POSITIONAL values to axes in declaration order and KEYED values
 * by axis id. Bails to null on a positional-value/axis count mismatch, an unknown keyed axis id, no
 * axes/curves, or any unrecognized line — never a mis-paired reading.
 */
function narrateRadarBeta(body) {
  // Mermaid's detector is `/^\s*radar-beta/` — case-SENSITIVE, `-beta` REQUIRED. A bare `radar` or a
  // mis-cased `Radar-Beta` doesn't render, so it must not narrate (a checker finding vs the v11 source).
  const pre = mermaidPrelude(body, /^radar-beta\b/);
  if (!pre) return null;
  let title = pre.title;
  const axes = []; // { label } in declaration order
  const axisIndex = new Map(); // axis id → index
  const curveRaw = []; // { label, body } — resolved after all axes are known (axes may follow curves)
  let min = null;
  let max = null;

  for (const rawLine of pre.lines) {
    const t = rawLine.trim();
    if (!t || t.startsWith('%%')) continue;
    if (/^title\b/i.test(t)) { title = title || scrubLabel(t.replace(/^title\s+/i, '')); continue; }
    if (/^(showLegend|graticule|ticks)\b/i.test(t)) continue;
    if (/^acc(Title|Descr)\b/i.test(t)) continue; // valid accessibility statements — skip, don't bail (a checker finding)
    // Mermaid's NUMBER terminal is non-negative (FLOAT|INT) — a negative min/max/value parse-errors,
    // so the chart doesn't render; accept only non-negative and let a `-…` fall through to a bail.
    const mn = t.match(/^min\s+(\d+(?:\.\d+)?)\s*$/i);
    if (mn) { min = Number(mn[1]); continue; }
    const mx = t.match(/^max\s+(\d+(?:\.\d+)?)\s*$/i);
    if (mx) { max = Number(mx[1]); continue; }
    const ax = t.match(/^axis\s+(.+)$/i);
    if (ax) {
      const re = /(\w+)(?:\["([^"]*)"\])?/g;
      let m;
      while ((m = re.exec(ax[1]))) {
        // Mermaid does NOT dedupe axis ids — a repeated id becomes a SEPARATE axis, which desyncs
        // positional counts and keyed lookups from what the narrator would build. Bail rather than
        // read a curve the render draws differently (or not at all) — a Munger-inversion finding.
        if (axisIndex.has(m[1])) return null;
        axisIndex.set(m[1], axes.length);
        axes.push({ label: m[2] ? scrubLabel(m[2]) : m[1] });
      }
      continue;
    }
    const cv = t.match(/^curve\s+(.+)$/i);
    if (cv) {
      const re = /(\w+)(?:\["([^"]*)"\])?\s*\{([^}]*)\}/g;
      let m;
      let any = false;
      while ((m = re.exec(cv[1]))) { any = true; curveRaw.push({ label: m[2] ? scrubLabel(m[2]) : m[1], body: m[3] }); }
      if (!any) return null; // a `curve` line with no parseable `{…}` → bail
      continue;
    }
    return null; // unrecognized line → bail (never guess)
  }
  if (!axes.length || !curveRaw.length) return null;

  // Resolve each curve to what Mermaid actually RENDERS (verified against the v11 db/renderer):
  //   - keyed: an unknown axis id is silently IGNORED (`axes.map`/`find` never errors on it); a
  //     repeated key is FIRST-WINS (`find`); a curve that leaves any axis UNCOVERED makes Mermaid
  //     THROW → the whole chart errors → bail.
  //   - positional: a value count ≠ the axis count makes Mermaid SKIP just that curve and render the
  //     rest → skip it here too (don't bail the slide); a non-numeric/negative value parse-errors the
  //     whole chart → bail.
  const curves = [];
  for (const c of curveRaw) {
    const raw = c.body.trim();
    let pairs = [];
    if (raw.includes(':')) { // keyed
      const byAxis = new Map(); // axisIdx → value, first-wins
      let bad = false;
      for (const part of raw.split(',')) {
        const km = part.trim().match(/^(\w+)\s*:\s*(\d+(?:\.\d+)?)$/);
        if (!km) { bad = true; break; }
        const idx = axisIndex.get(km[1]);
        if (idx === undefined) continue; // unknown axis → ignored by Mermaid, not an error
        if (!byAxis.has(idx)) byAxis.set(idx, Number(km[2]));
      }
      if (bad) return null; // a malformed keyed entry → Mermaid parse-errors → bail
      if (byAxis.size !== axes.length) return null; // an axis left uncovered → Mermaid throws → bail
      pairs = [...byAxis.entries()].map(([axisIdx, value]) => ({ axisIdx, value }));
    } else { // positional
      const vals = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (vals.length !== axes.length) continue; // Mermaid skips just this curve; skip it, keep the rest
      let bad = false;
      for (let i = 0; i < vals.length; i++) {
        const n = Number(vals[i]);
        if (!Number.isFinite(n) || n < 0) { bad = true; break; }
        pairs.push({ axisIdx: i, value: n });
      }
      if (bad) return null; // a non-numeric/negative value → Mermaid parse-errors → bail
    }
    pairs.sort((a, b) => a.axisIdx - b.axisIdx);
    curves.push({ label: c.label, pairs });
  }
  if (!curves.length) return null; // every curve was skipped → nothing renders

  let dataMax = 0;
  for (const c of curves) for (const p of c.pairs) if (p.value > dataMax) dataMax = p.value;
  const lo = min !== null ? min : 0;
  // When `max` is omitted, Mermaid draws the outer ring at the RAW data maximum (`Math.max`, no
  // nice-rounding — verified against the v11 radar source), so the spoken scale must match the
  // rendered extent exactly, NOT a `niceCeil` ceiling (an adversarial-check finding).
  const hi = max !== null ? max : dataMax;
  if (hi <= lo) return null;
  const scaleText = `${numberToWords(lo)} to ${numberToWords(hi)}`;
  const named = (n, one, many) => `${numberToWords(n)} ${n === 1 ? one : many}`;
  // §5 firehose rule: past ~a dozen values a flat value list is unlistenable AND drops the shape that
  // is the point, so SUMMARIZE with trivially-derived faithful facts — the counts and each curve's
  // PEAK axis (its max; top-N=1) — rather than enumerate a wall. (Radar's terse values sit the gate a
  // little above the shared ≈8-point threshold; the summary NAMES itself as a count, so nothing is
  // silently truncated — §7.)
  const totalValues = curves.reduce((n, c) => n + c.pairs.length, 0);
  if (totalValues > 12) {
    const peaks = curves.map((c) => {
      const top = c.pairs.reduce((a, b) => (b.value > a.value ? b : a));
      return `${c.label} peaks on ${axes[top.axisIdx].label}, at ${numberToWords(top.value)}`;
    });
    const sframe = `${title ? `A radar chart, ${title}` : 'A radar chart'}, on a scale of ${scaleText}, with ${named(curves.length, 'curve', 'curves')} across ${named(axes.length, 'axis', 'axes')}`;
    return `${terminate(sframe)} ${peaks.map(terminate).join(' ')}`;
  }
  const frame = title ? `A radar chart, ${title}, on a scale of ${scaleText}` : `A radar chart on a scale of ${scaleText}`;
  const sentences = curves.map((c) => `${c.label}: ${c.pairs.map((p) => `${axes[p.axisIdx].label}, ${numberToWords(p.value)}`).join('; ')}`);
  return `${terminate(frame)} ${sentences.map(terminate).join(' ')}`;
}

/** Dispatch a mermaid fence to the per-type narrator by its first keyword: flowchart/graph → the
 *  topology walk + gist; sequenceDiagram → the message script (slice #1); pie/class/state/ER/C4 →
 *  slice #2; radar-beta → the radar fast-follow. Every other type → null (→ heading caption). */
function narrateMermaidFence(fenceBody) {
  const kw = firstFenceKeyword(fenceBody).split(/\s+/)[0].replace(/-beta$/i, '');
  if (/^(flowchart|graph)$/i.test(kw)) {
    const parsed = parseFlowchart(fenceBody);
    if (!parsed) return null;
    const frame = terminate(parsed.title ? `A flowchart, ${parsed.title}` : 'A flowchart');
    const reading = renderFlowNarrative(parsed) || renderGroupedNarrative(parsed);
    return reading ? `${frame} ${reading}` : null;
  }
  if (/^sequenceDiagram$/i.test(kw)) return narrateSequence(fenceBody);
  if (/^pie$/i.test(kw)) return narratePie(fenceBody);
  if (/^classDiagram(-v2)?$/i.test(kw)) return narrateClass(fenceBody);
  if (/^stateDiagram(-v2)?$/i.test(kw)) return narrateState(fenceBody);
  if (/^erDiagram$/i.test(kw)) return narrateEr(fenceBody);
  if (/^C4(Context|Container|Component|Dynamic|Deployment)$/i.test(kw)) return narrateC4(fenceBody);
  if (/^radar$/i.test(kw)) return narrateRadarBeta(fenceBody);
  return null;
}

/**
 * Narrate a `diagram` slide's Mermaid fence — eyebrow + heading, then the per-type reading from
 * `narrateMermaidFence` (flowchart topology, sequence script, …). Returns null for a non-diagram
 * slide, a missing fence, or a type/parse the dispatcher can't read — every null defers to the
 * projection's heading+caption (no regression).
 *
 * Fence handling (§8.3): the reading is parsed from the RAW fence (the same
 * `/```mermaid\n…```/` match `preprocessMermaid` renders, so narrator ⇔ render), but the
 * heading/eyebrow/leftover pass runs on `withoutFences(markdown)` — the fence BLANKED — so no
 * Mermaid source line can leak to the voice AND a fenced doc-example `##` can never be mistaken
 * for the slide's real heading.
 */
function narrateDiagram(markdown) {
  const src = String(markdown || '');
  if (!hasClassToken(src, 'diagram')) return null;
  const fence = src.match(/```mermaid\n([\s\S]*?)```/);
  if (!fence) return null;
  // The per-type reading (frame + body): flowchart topology, sequence script, … or null (bail).
  // `terminate` is baked into each type's frame so a title ending in "?"/"." doesn't double.
  const reading = narrateMermaidFence(fence[1]);
  if (!reading) return null;
  const blanked = withoutFences(src); // fence blanked → no source leak, no fenced-heading confusion
  const consumed = new Set();
  const parts = [];
  const eyebrow = eyebrowBeforeHeading(blanked);
  if (eyebrow) {
    parts.push(terminate(eyebrow.text));
    consumed.add(eyebrow.index);
  }
  const h = heading(blanked);
  if (h) parts.push(h);
  parts.push(reading);
  // Any authored prose outside the fence (an intro sentence, a `> note`) — spoken from
  // the BLANKED source so the Mermaid body can't leak (headings are skipped by
  // isCommonlyConsumed; the eyebrow index is marked consumed above).
  const extra = speakLeftover(blanked, consumed);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

/** One entry per narrator; the next component is a small addition here. */
const NARRATORS = [
  narrateFunnel,
  narrateJourneyWeighted,
  narrateRadar,
  narrateQuadrant,
  narrateStateChart,
  narrateDiagram,
];

/** Try each chart narrator in turn; the first that recognizes the slide wins. */
function narrateChart(markdown) {
  for (const narrate of NARRATORS) {
    const result = narrate(markdown);
    if (result) return result;
  }
  return null;
}

module.exports = {
  narrateFunnel,
  narrateJourneyWeighted,
  narrateRadar,
  narrateQuadrant,
  narrateStateChartInference,
  narrateStateChart,
  narrateDiagram,
  narrateSequence,
  narratePie,
  narrateClass,
  narrateState,
  narrateEr,
  narrateC4,
  narrateRadarBeta,
  narrateChart,
};
