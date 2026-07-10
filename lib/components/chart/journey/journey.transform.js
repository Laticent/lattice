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

function emitJourneyBoard(model) {
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

  const legendHtml = actors.map(([name, color]) => {
    const lbl = actorLabel.get(name);
    return `<li class="journey-actor" data-actor="${escAttr(name)}" style="--actor-color:${color}">` +
      `<span class="journey-actor-dot" data-label-len="${lbl.length}" aria-hidden="true">${escHtml(lbl)}</span>` +
      `<span class="journey-actor-name">${escHtml(name)}</span>` +
    `</li>`;
  }).join('');

  // Mood ramp legend — emitted on every variant so the color encoding
  // (used by heatmap, curve dots, swimlane dots, weighted chips, and
  // classic faces) is always self-describing. Hidden via CSS only when
  // a variant doesn't use the color ramp.
  const moodLegendHtml = (
    `<li class="journey-mood-key journey-mood-key-low">Pain</li>` +
    [1, 2, 3, 4, 5].map(m =>
      `<li class="journey-mood-key" data-mood="${m}">` +
        `<span class="journey-mood-key-swatch" aria-hidden="true"></span>` +
        `<span class="journey-mood-key-label">${m}</span>` +
      `</li>`
    ).join('') +
    `<li class="journey-mood-key journey-mood-key-high">Delight</li>`
  );

  const sectionsHtml = model.sections.map((s, i) =>
    `<li class="journey-stage" data-section="${i}" ` +
    `style="--span:${s.tasks.length}; --section-index:${i}; --section-volume:${sectionVolumes[i]}">` +
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
        `style="--col:${col}; --mood:${t.mood}; --volume:${vol}; --volume-pct:${volPct}">` +
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
      `<ol class="journey-legend">${legendHtml}</ol>` +
      `<ol class="journey-mood-legend" aria-label="Mood scale: 1 (pain) to 5 (delight)">${moodLegendHtml}</ol>` +
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

function emitJourneyBoardVertical(model) {
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
        `style="--col:${col}; --mood:${t.mood}; --volume:${vol}; --volume-pct:${volPct}">` +
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

  const legendHtml = actors.map(([name, color]) => {
    const lbl = actorLabel.get(name);
    return `<li class="journey-actor" data-actor="${escAttr(name)}" style="--actor-color:${color}">` +
      `<span class="journey-actor-dot" data-label-len="${lbl.length}" aria-hidden="true">${escHtml(lbl)}</span>` +
      `<span class="journey-actor-name">${escHtml(name)}</span></li>`;
  }).join('');
  const moodLegendHtml = (
    `<li class="journey-mood-key journey-mood-key-low">Pain</li>` +
    [1, 2, 3, 4, 5].map(m =>
      `<li class="journey-mood-key" data-mood="${m}"><span class="journey-mood-key-swatch" aria-hidden="true"></span>` +
      `<span class="journey-mood-key-label">${m}</span></li>`).join('') +
    `<li class="journey-mood-key journey-mood-key-high">Delight</li>`
  );

  // NOTE: the class stays EXACTLY `journey-board` (no second class) — the
  // chart-frame body matcher in chart-family.js keys on `class="journey-board"`,
  // so a second class would make the wrap silently reject the board and revert to
  // the raw list. The vertical layout is flagged by `data-orient` instead.
  return (
    `<div class="journey-board" data-orient="vertical" style="--task-count:${taskCount}; --actor-count:${actors.length}">` +
      `<ol class="journey-vstack">${stagesHtml}</ol>` +
      `<ol class="journey-legend">${legendHtml}</ol>` +
      `<ol class="journey-mood-legend" aria-label="Mood scale: 1 (pain) to 5 (delight)">${moodLegendHtml}</ol>` +
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
  const board = orientation === 'portrait'
    ? emitJourneyBoardVertical(model)
    : emitJourneyBoard(model);
  return inner.slice(0, ul.start) + board + inner.slice(ul.end);
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

module.exports = {
  JOURNEY_MODIFIERS,
  JOURNEY_ACTOR_PALETTE,
  applyToRenderedHtml,
  transformJourneySection,
  // exposed for unit tests
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
