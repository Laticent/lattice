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

/**
 * Narrate a `diagram` slide's Mermaid FLOWCHART topology — eyebrow + heading, a short
 * "A flowchart[, title]." frame, then each forward edge as "<from> leads to <to>" (an
 * edge label reads as a clause: "<from>, <label>, leads to <to>"). Returns null for a
 * non-diagram slide, a non-flowchart Mermaid type, an unrecognized flowchart, or a
 * missing fence — every null defers to the projection's heading+caption (no regression).
 *
 * Fence handling (§8.3): the topology is read from the RAW fence (the same
 * `/```mermaid\n…```/` match `preprocessMermaid` renders, so narrator ⇔ render), but the
 * heading/eyebrow/leftover pass runs on `withoutFences(markdown)` — the fence BLANKED —
 * so no Mermaid source line can leak to the voice AND a fenced doc-example `##` can never
 * be mistaken for the slide's real heading.
 */
function narrateDiagram(markdown) {
  const src = String(markdown || '');
  if (!hasClassToken(src, 'diagram')) return null;
  const fence = src.match(/```mermaid\n([\s\S]*?)```/);
  if (!fence) return null;
  const parsed = parseFlowchart(fence[1]);
  if (!parsed) return null;
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
  // `terminate` (not a hardcoded trailing `.`) so a node/title label that already ends
  // in terminal punctuation doesn't DOUBLE it — a decision node "Within policy?" reads
  // "…leads to Within policy?" not "…Within policy?." (a Munger-inversion finding).
  parts.push(terminate(parsed.title ? `A flowchart, ${parsed.title}` : 'A flowchart'));
  // Describe the graph as a FLOW (entry→terminal, chains coalesced, fan-outs grouped),
  // falling back to a grouped-adjacency reading on a cyclic/entry-less graph. Both beat
  // the old per-edge enumeration and neither invents edge semantics (§ flow-path notes).
  const body = renderFlowNarrative(parsed) || renderGroupedNarrative(parsed);
  if (body) parts.push(body);
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
  narrateChart,
};
