/**
 * Journey DOM transform — Mermaid-style user-journey diagrams rendered
 * natively from a nested Markdown list. Shared between the build path
 * (lattice-emulator.js) and the owned engine (lib/engine).
 *
 * Authoring (Markdown-native, list + inline-code driven):
 *
 *   <!-- _class: journey -->
 *
 *   # My working day
 *
 *   - Go to work
 *     - Make tea `@me` `:5`
 *     - Go upstairs `@me` `:3`
 *     - Do work `@me` `@cat` `:1`
 *   - Go home
 *     - Go downstairs `@me` `:5`
 *     - Sit down `@me` `:5`
 *
 * Inline-code tokens on each task:
 *   `@name` — actor (one or more; appearance order drives legend order
 *             and the 8-step categorical color cycle)
 *   `:1`..`:5` — mood (1 worst → 5 best, default 3 if omitted)
 *   `+N`  — volume / weight (used by the `weighted` variant)
 *
 * Five variants share one DOM. CSS hides what each variant doesn't need
 * (e.g. heatmap hides the mood-face row, swimlane hides the task ribbon).
 *   journey                — default (classic Mermaid look)
 *   journey heatmap        — task chips tinted by mood
 *   journey curve          — connected polyline of mood across tasks
 *   journey swimlane       — one row per actor, dots at participation × mood
 *   journey weighted       — chip width = volume, color = mood
 *
 * Sibling implementations (must stay in sync — three-renderer parity):
 *   - lattice-emulator.js — calls transformJourneySection per slide
 *   - lattice-runtime.js  — DOM mirror for marp-vscode preview / web export
 */

const { mapSections } = require('../../../core/section-walk');
const { findOuterUL, splitTopLevelLI } = require('../_chart-family/transform-utils');
const { derivedFrom, labelSetFor, resolveLabelSet } = require('../../../core/label-set');
const { liftLabelSet } = require('../../../core/lift-label-set');
// A parsed label is tag-stripped HTML with its entities still in; `plainText` decodes it to the
// words it shows, and `escAttr` escapes those once for the `data-label` attribute.
const { plainText } = require('../../../core/plain-text');

const LABEL_SET = labelSetFor('journey');
if (!LABEL_SET) {
  throw new Error(
    '[journey] no `labelSet` row in lib/core/label-set-catalog.generated.js. The catalog is '
    + 'generated from journey.manifest.json — run `node tools/build-stage-catalog.js` and commit it.',
  );
}

/** The five ramp steps. The POLES take words; the steps between show their number. */
const MOOD_STEPS = [1, 2, 3, 4, 5];

/**
 * The mood ramp key — ONE builder, used by both render shapes.
 *
 * It was two verbatim copies, one per board orientation, each hard-coding the
 * literals `Pain` and `Delight`. Two copies of a decision is two places to
 * change it and one to forget, and this one had a live consequence: the words
 * assert a POLARITY the engine cannot derive. `Pain`/`Delight` is right for a
 * customer journey and wrong for an ops or cost journey, and the ramp decision
 * record argued exactly this about heatmap — "high retention is good; high
 * churn is bad" — before declining to ship worded defaults there.
 *
 * Here the words stay as DEFAULTS, because a journey's ramp genuinely is a
 * sentiment scale by default, and an author renames them with a label set.
 * Only the two poles are keyable; the steps between carry their number, which
 * IS the scale, and the manifest declares that refusal in `labelSet.unkeyed`.
 *
 * @param {Array|null} authored  the author's entries, or null
 */
function buildMoodLegend(authored) {
  const poles = resolveLabelSet(derivedFrom('journey', ['1', '5']), authored);
  const wordOf = (key) => poles.find((p) => p.key === key)?.label || '';
  return (
    `<li class="journey-mood-key journey-mood-key-low">${escHtml(wordOf('1'))}</li>` +
    MOOD_STEPS.map((m) =>
      `<li class="journey-mood-key" data-mood="${m}">` +
        `<span class="journey-mood-key-swatch" aria-hidden="true"></span>` +
        `<span class="journey-mood-key-label">${m}</span>` +
      `</li>`
    ).join('') +
    `<li class="journey-mood-key journey-mood-key-high">${escHtml(wordOf('5'))}</li>`
  );
}

/** The key's accessible name, which must say the same thing the poles do. */
function moodAriaLabel(authored) {
  const poles = resolveLabelSet(derivedFrom('journey', ['1', '5']), authored);
  const low = poles.find((p) => p.key === '1')?.label || '';
  const high = poles.find((p) => p.key === '5')?.label || '';
  return `${LABEL_SET.aria}: 1 (${low.toLowerCase()}) to 5 (${high.toLowerCase()})`;
}

/**
 * The actor key — also ONE builder now, for the same reason: it was duplicated
 * verbatim beside the mood key in both board shapes.
 */
function buildActorLegend(actors, actorLabel) {
  return actors.map(([name, color]) => {
    const lbl = actorLabel.get(name);
    return `<li class="journey-actor" data-actor="${escAttr(name)}" style="--actor-color:${color}">` +
      `<span class="journey-actor-dot" data-label-len="${lbl.length}" aria-hidden="true">${escHtml(lbl)}</span>` +
      `<span class="journey-actor-name">${escHtml(name)}</span>` +
    `</li>`;
  }).join('');
}

const JOURNEY_MODIFIERS = ['heatmap', 'curve', 'swimlane', 'weighted'];

const JOURNEY_ACTOR_PALETTE = [
  'var(--cat-2-mark)',  'var(--cat-1-mark)',   'var(--cat-3-mark)', 'var(--cat-4-mark)',
  'var(--cat-5-mark)',   'var(--cat-6-mark)',   'var(--cat-7-mark)',  'var(--cat-8-mark)',
];

function escAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
  }[c]));
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function clampMood(n) {
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Balanced-tag extraction (findOuterUL / splitTopLevelLI) lives in
// _chart-family/transform-utils.js — a verified byte-for-byte match of what
// used to be journey's own private copy, now deduplicated (also used by
// radar/quadrant).
// ---------------------------------------------------------------------------
// Parser: nested <ul> → { sections: [{ name, tasks: [{ label, actors, mood, volume }] }] }
// ---------------------------------------------------------------------------

function parseTask(liInner) {
  const actors = [];
  let mood = null;
  let volume = null;
  const codeRe = /<code\b[^>]*>([\s\S]*?)<\/code>/g;
  let m;
  while ((m = codeRe.exec(liInner)) !== null) {
    const tok = stripTags(m[1]);
    if (tok.startsWith('@') && tok.length > 1) {
      actors.push(tok.slice(1));
    } else if (tok.startsWith(':')) {
      const n = parseInt(tok.slice(1), 10);
      if (Number.isFinite(n)) mood = n;
    } else if (tok.startsWith('+')) {
      const n = parseFloat(tok.slice(1));
      if (Number.isFinite(n)) volume = n;
    }
  }
  // Strip all <code> and any other tags from label, but keep the text.
  let label = liInner.replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '');
  // Drop a trailing nested <ul> (defensive — tasks shouldn't nest further,
  // but if an author writes a third level, ignore it gracefully).
  const innerUl = findOuterUL(label);
  if (innerUl) label = label.slice(0, innerUl.start) + label.slice(innerUl.end);
  label = stripTags(label);
  return {
    label,
    actors,
    mood: clampMood(mood ?? 3),
    volume: volume,
  };
}

function parseSection(liInner) {
  const nested = findOuterUL(liInner);
  const nameRaw = nested ? liInner.slice(0, nested.start) : liInner;
  const name = stripTags(nameRaw);
  const tasks = nested
    ? splitTopLevelLI(nested.inner).map(parseTask).filter(t => t.label !== '')
    : [];
  return { name, tasks };
}

function parseJourney(ulInner) {
  const sections = splitTopLevelLI(ulInner)
    .map(parseSection)
    .filter(s => s.name !== '' && s.tasks.length > 0);
  return { sections };
}

// ---------------------------------------------------------------------------
// DOM emitter — one shape across all five variants; CSS varies the look.
// ---------------------------------------------------------------------------

function moodFaceSvg(mood) {
  const m = clampMood(mood);
  // Mouth path per mood, 24×24 viewBox. Eyes are filled dots; outline + mouth
  // use currentColor so theme tokens flow through.
  const mouth = {
    5: 'M7.5 14 Q12 19.5 16.5 14',
    4: 'M8.5 14.2 Q12 17 15.5 14.2',
    3: 'M8.5 14.8 L15.5 14.8',
    2: 'M8.5 15.2 Q12 12.5 15.5 15.2',
    1: 'M7.5 16 Q12 10 16.5 16',
  }[m];
  return (
    `<svg class="journey-face" data-mood="${m}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">` +
      `<circle cx="12" cy="12" r="10" fill="var(--journey-face-bg)" stroke="currentColor" stroke-width="1.2"/>` +
      `<circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/>` +
      `<circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/>` +
      `<path d="${mouth}"/>` +
    `</svg>`
  );
}

function assignActorColors(model) {
  const map = new Map();
  for (const s of model.sections) {
    for (const t of s.tasks) {
      for (const a of t.actors) {
        if (!map.has(a)) {
          map.set(a, JOURNEY_ACTOR_PALETTE[map.size % JOURNEY_ACTOR_PALETTE.length]);
        }
      }
    }
  }
  return map;
}

// Shortest uppercase prefix unique within the actor set. WCAG 1.4.1
// redundant encoding: color alone is not sufficient identification, so
// every actor dot also displays this label. Mirrored in lattice-runtime.js
// (jAssignActorLabels). One name being a proper prefix of another (e.g.
// "user", "users") falls back to the full uppercase name for the shorter.
function assignActorLabels(actorNames) {
  const labels = new Map();
  for (const name of actorNames) {
    let chosen = null;
    for (let len = 1; len <= name.length; len++) {
      const prefix = name.slice(0, len).toUpperCase();
      const collides = actorNames.some(other =>
        other !== name && other.slice(0, len).toUpperCase() === prefix
      );
      if (!collides) { chosen = prefix; break; }
    }
    labels.set(name, chosen || name.toUpperCase());
  }
  return labels;
}

/**
 * The journey in words — a text alternative for anything reading DOM text rather than the
 * rendered board.
 *
 * WHY IT EXISTS. Every other spatial chart already says what it is: `state-chart` builds a
 * `<desc>` in its own transform, the keyed charts build one through `svg-legend.js`. The
 * journey board said NOTHING anywhere — no `<desc>`, no `aria-label` beyond the mood scale,
 * nothing — so a screen-reader user got the actor initials and a run of bare digits, and the
 * Read · Article projection had nothing to recover and fell back to "this is a visual
 * layout". Both are the same gap, and it belongs here rather than in either consumer: the
 * component knows what its own board means.
 *
 * SHAPE mirrors `stateChartDesc` deliberately — `Label — items; items. Label — …` — so the
 * two spatial charts read alike when a reader meets them in the same deck.
 *
 * MOOD IS SPELLED "n of 5" rather than bare. The visible legend is a 1–5 scale with "Pain"
 * and "Delight" at its ends; a bare "4" read aloud between two labels is the welded-digit
 * noise this description exists to replace.
 */
function journeyDesc(model) {
  const actors = [];
  const parts = [];
  for (const s of model.sections) {
    const steps = s.tasks
      .map((t) => {
        for (const a of t.actors) if (!actors.includes(a)) actors.push(a);
        const who = t.actors.length ? ` (${t.actors.join(', ')})` : '';
        return `${t.label}${who}, mood ${clampMood(t.mood)} of 5`;
      })
      .join('; ');
    if (steps) parts.push(`${s.name} — ${steps}`);
  }
  if (!parts.length) return '';
  if (actors.length) parts.unshift(`Actors — ${actors.join(', ')}`);
  return parts.join('. ');
}

/**
 * The description as a visually-hidden element, or '' when there is nothing to say.
 *
 * `.journey-desc` is sr-only in `journey.styles.css` — the same shape `matrix-grid` uses for
 * `.cell-sr-label`, and NOT the shell-level `.lattice-description`, whose sr-only rule lives
 * in the player and export shells rather than in the engine CSS. Borrowing that class here
 * would print the sentence onto the slide in the Studio preview and in every raster.
 *
 * `data-lattice-desc` is the projection's general hook for "a component's own text
 * alternative" (`prose-projection.mjs`), so the kernel needs no per-component list.
 *
 * FIRST CHILD of the board, so a screen reader meets the summary before the lists it
 * summarizes.
 */
function journeyDescHtml(model) {
  const text = journeyDesc(model);
  return text ? `<p class="journey-desc" data-lattice-desc>${escHtml(text)}</p>` : '';
}

function emitJourneyBoard(model, moodSet) {
  const taskCount = model.sections.reduce((n, s) => n + s.tasks.length, 0);
  if (taskCount === 0) return '';
  const actorColor = assignActorColors(model);
  const actors = [...actorColor.entries()];
  const actorLabel = assignActorLabels(actors.map(([n]) => n));

  // Per-section total volume — drives proportional section bars in the
  // weighted variant. Each task contributes its volume (default 1).
  const sectionVolumes = model.sections.map(s =>
    s.tasks.reduce((sum, t) => sum + (t.volume ?? 1), 0)
  );

  const legendHtml = buildActorLegend(actors, actorLabel);

  // Emitted on every variant so the color encoding (heatmap, curve dots,
  // swimlane dots, weighted chips, classic faces) is always self-describing.
  // Hidden via CSS only where a variant does not use the ramp.
  const moodLegendHtml = buildMoodLegend(moodSet);

  const sectionsHtml = model.sections.map((s, i) =>
    `<li class="journey-stage" data-section="${i}" ` +
    `style="--span:${s.tasks.length}; --section-index:${i}; --section-volume:${sectionVolumes[i]}" data-label="${escAttr(plainText(s.name))}">` +
      `<span class="journey-stage-name">${escHtml(s.name)}</span>` +
    `</li>`
  ).join('');

  let col = 0;
  const taskParts = [];
  const moodParts = [];
  const polyPoints = [];
  // Total volume across all tasks — used to size weighted chip widths.
  let totalVolume = 0;
  for (const s of model.sections) for (const t of s.tasks) totalVolume += (t.volume ?? 1);

  for (let si = 0; si < model.sections.length; si++) {
    const sec = model.sections[si];
    for (const t of sec.tasks) {
      col++;
      const dots = t.actors.map(a => {
        const lbl = actorLabel.get(a);
        return `<span class="journey-actor-dot" data-actor="${escAttr(a)}" ` +
          `data-label-len="${lbl.length}" ` +
          `style="--actor-color:${actorColor.get(a)}" aria-hidden="true">${escHtml(lbl)}</span>`;
      }).join('');
      const vol = t.volume ?? 1;
      // Integer percentage — CSS counters in the weighted variant require
      // an integer, and a one-percent badge is more than precise enough.
      const volPct = totalVolume > 0 ? Math.round((vol / totalVolume) * 100) : 0;
      taskParts.push(
        `<li class="journey-task" data-mood="${t.mood}" data-section="${si}" ` +
        `style="--col:${col}; --mood:${t.mood}; --volume:${vol}; --volume-pct:${volPct}" data-label="${escAttr(plainText(t.label))}">` +
          `<span class="journey-task-actors">${dots}</span>` +
          `<span class="journey-task-label">${escHtml(t.label)}</span>` +
        `</li>`
      );
      moodParts.push(
        `<li class="journey-mood" data-mood="${t.mood}" ` +
        `style="--col:${col}; --mood:${t.mood}">` +
          `<span class="journey-mood-line" aria-hidden="true"></span>` +
          moodFaceSvg(t.mood) +
        `</li>`
      );
      // Curve: x = col - 0.5 (center of column), y = 5 - mood (top is high mood).
      polyPoints.push(`${(col - 0.5).toFixed(2)},${(5 - t.mood).toFixed(2)}`);
    }
  }

  // Swimlane: one row per actor; a dot at every task the actor participates in.
  const lanesHtml = actors.map(([name, color], ai) => {
    let lcol = 0;
    const lDots = [];
    for (const s of model.sections) {
      for (const t of s.tasks) {
        lcol++;
        if (t.actors.includes(name)) {
          lDots.push(
            `<span class="journey-lane-dot" data-mood="${t.mood}" ` +
            `style="--col:${lcol}; --mood:${t.mood}" aria-hidden="true"></span>`
          );
        }
      }
    }
    return (
      `<li class="journey-lane" data-actor="${escAttr(name)}" ` +
      `style="--actor-color:${color}; --row:${ai + 1}">` +
        `<span class="journey-lane-label">${escHtml(name)}</span>` +
        `<span class="journey-lane-track" aria-hidden="true"></span>` +
        lDots.join('') +
      `</li>`
    );
  }).join('');

  // Y-axis rules at moods 1..5 — drawn inside the SVG so they scale with
  // the curve and stay visible in PDF (CSS background-image fallbacks
  // layer beneath the SVG and get clipped by it). Strokes use
  // non-scaling-stroke so dashes stay pixel-sized regardless of the
  // non-uniform viewBox stretch.
  // currentColor inherits from the CSS-driven color on .journey-curve;
  // the polyline rides the same channel (stroke="currentColor"), so we
  // shift the polyline to a hard-coded stroke and let gridlines inherit
  // a different color. See the curve CSS for the color/opacity assignment.
  const gridLines = [0, 1, 2, 3, 4].map(y =>
    `<line class="journey-curve-grid" x1="0" y1="${y}" x2="${taskCount}" y2="${y}" ` +
    `stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" ` +
    `vector-effect="non-scaling-stroke"/>`
  ).join('');
  const curveSvg = (
    `<svg class="journey-curve" viewBox="0 0 ${taskCount} 5" preserveAspectRatio="none" aria-hidden="true">` +
      gridLines +
      `<polyline points="${polyPoints.join(' ')}" fill="none" ` +
      `stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ` +
      `vector-effect="non-scaling-stroke"/>` +
    `</svg>`
  );

  return (
    `<div class="journey-board" style="--task-count:${taskCount}; --actor-count:${actors.length}">` +
      journeyDescHtml(model) +
      `<ol class="journey-legend">${legendHtml}</ol>` +
      `<ol class="journey-mood-legend" aria-label="${escAttr(moodAriaLabel(moodSet))}">${moodLegendHtml}</ol>` +
      `<ol class="journey-stages">${sectionsHtml}</ol>` +
      `<ol class="journey-tasks">${taskParts.join('')}</ol>` +
      `<div class="journey-timeline" aria-hidden="true"></div>` +
      `<ol class="journey-moods">${moodParts.join('')}</ol>` +
      curveSvg +
      `<ol class="journey-lanes">${lanesHtml}</ol>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Vertical board (portrait) — the journey rotated 90°: stages stack down the
// page as grouped sections, each task is a ROW (actor dots + label + a mood
// marker), and mood reads along the cross-axis. The landscape board's parallel
// column-grids (stages / tasks / moods aligned by shared column count) can't
// express "a stage label grouping its task ROWS" in CSS alone, so portrait gets
// its own emission: stage groups that physically contain their task rows. Each
// row carries everything the three candidate mood treatments need (data-mood +
// --mood + the face), so the look is chosen purely in CSS.
// 2026-06-19-chart-adaptive-sizing.md §10 (journey slice).
// ---------------------------------------------------------------------------

function emitJourneyBoardVertical(model, moodSet) {
  const taskCount = model.sections.reduce((n, s) => n + s.tasks.length, 0);
  if (taskCount === 0) return '';
  const actorColor = assignActorColors(model);
  const actors = [...actorColor.entries()];
  const actorLabel = assignActorLabels(actors.map(([n]) => n));
  let totalVolume = 0;
  for (const s of model.sections) for (const t of s.tasks) totalVolume += (t.volume ?? 1);

  let col = 0;
  const stagesHtml = model.sections.map((s, si) => {
    const rows = s.tasks.map((t) => {
      col++;
      const dots = t.actors.map(a => {
        const lbl = actorLabel.get(a);
        return `<span class="journey-actor-dot" data-actor="${escAttr(a)}" data-label-len="${lbl.length}" ` +
          `style="--actor-color:${actorColor.get(a)}" aria-hidden="true">${escHtml(lbl)}</span>`;
      }).join('');
      const vol = t.volume ?? 1;
      const volPct = totalVolume > 0 ? Math.round((vol / totalVolume) * 100) : 0;
      return (
        `<li class="journey-vtask" data-mood="${t.mood}" data-section="${si}" ` +
        `style="--col:${col}; --mood:${t.mood}; --volume:${vol}; --volume-pct:${volPct}" data-label="${escAttr(plainText(t.label))}">` +
          `<span class="journey-task-actors">${dots}</span>` +
          `<span class="journey-task-label">${escHtml(t.label)}</span>` +
          `<span class="journey-vmood" data-mood="${t.mood}" style="--mood:${t.mood}" aria-hidden="true">` +
            `<span class="journey-vmood-line"></span>${moodFaceSvg(t.mood)}` +
          `</span>` +
        `</li>`
      );
    }).join('');
    return (
      `<li class="journey-vstage" data-section="${si}" style="--section-index:${si}; --span:${s.tasks.length}">` +
        `<span class="journey-vstage-name">${escHtml(s.name)}</span>` +
        `<ol class="journey-vrows">${rows}</ol>` +
      `</li>`
    );
  }).join('');

  const legendHtml = buildActorLegend(actors, actorLabel);
  // Emitted on every variant so the color encoding (heatmap, curve dots,
  // swimlane dots, weighted chips, classic faces) is always self-describing.
  // Hidden via CSS only where a variant does not use the ramp.
  const moodLegendHtml = buildMoodLegend(moodSet);

  // NOTE: the class stays EXACTLY `journey-board` (no second class) — the
  // chart-frame body matcher in chart-family.js keys on `class="journey-board"`,
  // so a second class would make the wrap silently reject the board and revert to
  // the raw list. The vertical layout is flagged by `data-orient` instead.
  return (
    `<div class="journey-board" data-orient="vertical" style="--task-count:${taskCount}; --actor-count:${actors.length}">` +
      journeyDescHtml(model) +
      `<ol class="journey-vstack">${stagesHtml}</ol>` +
      `<ol class="journey-legend">${legendHtml}</ol>` +
      `<ol class="journey-mood-legend" aria-label="${escAttr(moodAriaLabel(moodSet))}">${moodLegendHtml}</ol>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Section dispatcher
// ---------------------------------------------------------------------------

function transformJourneySection(inner, cls, orientation) {
  const tokens = cls.trim().split(/\s+/);
  if (!tokens.includes('journey')) return inner;
  // Idempotency: if we've already rewritten the section, leave it alone.
  if (/class="journey-board"/.test(inner)) return inner;
  const ul = findOuterUL(inner);
  if (!ul) return inner;
  const model = parseJourney(ul.inner);
  if (model.sections.length === 0) return inner;
  // The author's pole words, if they gave any. Lifted from the section OUTSIDE
  // the list, so it cannot disturb the journey grammar — and the paragraph is
  // removed, so the set names the poles instead of also printing as an eyebrow.
  const before = inner.slice(0, ul.start);
  const after = inner.slice(ul.end);
  const liftedBefore = liftLabelSet(before);
  const liftedAfter = liftedBefore.set ? { html: after, set: null } : liftLabelSet(after);
  const moodSet = liftedBefore.set || liftedAfter.set;
  const board = orientation === 'portrait'
    ? emitJourneyBoardVertical(model, moodSet)
    : emitJourneyBoard(model, moodSet);
  return liftedBefore.html + board + liftedAfter.html;
}

function applyToRenderedHtml(html) {
  return mapSections(html, (openTag, cls, inner) => {
    const tokens = cls.trim().split(/\s+/);
    if (!tokens.includes('journey')) return null;
    // Deck-wide orientation stamp ('portrait' selects the vertical board); absent
    // → landscape, byte-identical. Read off the same `data-orientation` the slide
    // pipeline writes on the section (mirrors chart-family's reader).
    const orientMatch = openTag.match(/\sdata-orientation="([^"]*)"/);
    const orientation = orientMatch ? orientMatch[1] : undefined;
    return transformJourneySection(inner, cls, orientation);
  });
}


/**
 * The chart-family entrypoint (see the `kernel` block in journey.manifest.json).
 *
 * The kernel rewrites the nested <ul> into a `.journey-board` in place, leaving
 * the h2 for the chart-frame wrap to lift into the header.
 */
function transformSection(html, ctx) {
  return transformJourneySection(html, ctx.cls, ctx.orientation);
}

module.exports = {
  transformSection,
  JOURNEY_MODIFIERS,
  JOURNEY_ACTOR_PALETTE,
  applyToRenderedHtml,
  transformJourneySection,
  // exposed for unit tests
  journeyDesc,
  parseJourney,
  parseSection,
  parseTask,
  emitJourneyBoard,
  moodFaceSvg,
  assignActorColors,
  assignActorLabels,
  findOuterUL,
  splitTopLevelLI,
  clampMood,
};
