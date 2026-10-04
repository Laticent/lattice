/**
 * journey-step.js — what the pills on a journey task say: who took the step, how it felt, and
 * how many went through it.
 *
 * Decision 11 of the Segno note (engineering/decisions/2026-09-28-segno-unified-inline-notation.md):
 * a step is one record, `{who=Customer, mood=4, volume=120}`, read by the `step` slot the journey
 * manifest declares; `@Customer` is the declared shortcut for `who=`. The old `:4` mood and `+120`
 * volume pills are gone. A task with two actors writes the second as its own `@` pill, because a
 * record names `who` once: `{who=me, mood=1}` `@cat`.
 *
 * The transform and the narrator both read a task through here, so the chart and the voice agree
 * on every actor and every score (HARD RULE #1). Pure, no fs.
 */

const { componentSlot } = require('./segno-slots.js');

let slot = null;
const stepSlot = () => (slot ??= componentSlot('journey', 'step'));

/**
 * Read a task's pills (each one's text, entity-decoded).
 * @param {string[]} texts
 * @returns {{actors: string[], mood: number|null, volume: number|null}}
 *   `mood` is as written (the caller clamps it to 1–5); a pill that is not a step record is
 *   ignored, as any other pill on a task always was.
 */
function readJourneyStep(texts) {
  const out = { actors: [], mood: null, volume: null };
  for (const t of texts) {
    const b = stepSlot().read(String(t ?? '').trim());
    if (!b.ok) continue;
    const v = b.value;
    if (v.who?.trim()) out.actors.push(v.who.trim());
    if (v.mood && Number.isFinite(v.mood.value)) out.mood = v.mood.value;
    if (v.volume && Number.isFinite(v.volume.value)) out.volume = v.volume.value;
  }
  return out;
}

module.exports = { readJourneyStep };
