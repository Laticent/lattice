/** The journey chart's reader (lib/runtime/chart-redraw.js). */

const { esc, uncarried } = require('./shared');
// The kernel's own readers: the step record grammar and the mood key's default pole words.
const { readJourneyStep } = require('../../core/journey-step');
const { derivedFrom, resolveLabelSet } = require('../../core/label-set');

// `esc` writes `'` as `&#39;`; markdown-it leaves it bare. A bare `'` in element text is inert, so
// matching markdown-it keeps a redraw byte-identical and stays HARD RULE #22-safe.
const escText = (s) => esc(s).replace(/&#39;/g, "'");
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]);

/**
 * A stage or task name as the kernel printed it. The kernel prints the name as markdown-it wrote it
 * (entities kept, tags dropped), so the page text IS the source. Re-encode it from the decoded text,
 * and refuse a name that does not come back the same: a non-breaking space, a doubled space where a
 * pill sat mid-name, or a name forged with raw markup.
 */
function nameOf(el) {
  const src = el ? el.textContent : '';
  const back = escText(decode(src));
  return src && back === src ? back : null;
}

/** A Segno value needs no quoting when it holds none of the record's own punctuation. */
const PLAIN_WHO = /^[^,{}=[\]"'`\\]+$/;

/** One task's step records, proven by reading them back with the kernel's own reader. */
function recordsOf(task) {
  const actors = [...task.querySelectorAll('.journey-task-actors > .journey-actor-dot')].map((d) => d.dataset.actor || '');
  const mood = Number(task.dataset.mood);
  const volume = Number((/--volume:\s*([^;]+)/.exec(task.getAttribute('style') || '') || [])[1]);
  if (!Number.isInteger(mood) || !Number.isFinite(volume)) return null;
  if (actors.some((a) => a !== a.trim() || !PLAIN_WHO.test(a))) return null;
  // Volume 1 is the default, so it is written only when it says something.
  const extra = `mood=${mood}${volume === 1 ? '' : `, volume=${volume}`}`;
  const records = actors.length
    ? [`{who=${actors[0]}, ${extra}}`, ...actors.slice(1).map((a) => `{who=${a}}`)]
    : [`{${extra}}`];
  const back = readJourneyStep(records);
  const same = back.actors.join('\n') === actors.join('\n') && back.mood === mood && (back.volume ?? 1) === volume;
  return same ? records : null;
}

/**
 * JOURNEY. Stages, then tasks: each task (`li.journey-task`, or `li.journey-vtask` on a portrait board)
 * carries its stage (`data-section`), its mood (`data-mood`, already clamped to 1..5), its volume
 * (`--volume`) and an actor dot per step record (`data-actor`). The variant (heatmap, curve, swimlane,
 * weighted) rides on the section's class, not the list.
 */
function readJourney(body) {
  if (uncarried(body)) return null;
  // A journey callout is the kernel's own (a marker on a task and a notes list), not the shared layer's.
  if (body.querySelector('.journey-callout, [data-callout]')) return null;
  const board = body.querySelector('.journey-board');
  if (!board) return null;
  // The author's pole words ride in a paragraph outside the list, which the reader does not rebuild:
  // keep the exported drawing unless the key shows the default words.
  const poles = resolveLabelSet(derivedFrom('journey', ['1', '5']), null);
  const word = (k) => poles.find((p) => p.key === k)?.label || '';
  const low = board.querySelector('.journey-mood-key-low');
  const high = board.querySelector('.journey-mood-key-high');
  if (!low || !high || low.textContent !== word('1') || high.textContent !== word('5')) return null;
  const stageNames = [...board.querySelectorAll('.journey-stage-name, .journey-vstage-name')].map(nameOf);
  if (!stageNames.length || stageNames.some((n) => n == null)) return null;
  const stages = stageNames.map((name) => ({ name, tasks: [] }));
  for (const t of board.querySelectorAll('li.journey-task, li.journey-vtask')) {
    const stage = stages[Number(t.dataset.section)];
    const label = nameOf(t.querySelector('.journey-task-label'));
    const records = recordsOf(t);
    if (!stage || label == null || !records) return null;
    stage.tasks.push(`<li>${label} ${records.map((r) => `<code>${escText(r)}</code>`).join(' ')}</li>`);
  }
  // The kernel drops a stage with no task, so every drawn stage holds at least one.
  if (stages.some((s) => !s.tasks.length)) return null;
  return `<ul>${stages.map((s) => `<li>${s.name}<ul>${s.tasks.join('')}</ul></li>`).join('')}</ul>`;
}

module.exports = { kind: 'journey', read: readJourney };
