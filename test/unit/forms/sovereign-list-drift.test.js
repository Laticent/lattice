/**
 * NO PROSE LIST OF THE SOVEREIGN FRAMES MAY BE SHORT ONE.
 *
 * This repo has drifted that list three times, and the third time was the change whose
 * whole subject was the first two. `lib/components/manifest.schema.json` carried the
 * warning "Do NOT re-derive this list by hand — it is the `exemptFromChrome: true` set,
 * and this sentence has already drifted once", and the edit correcting it omitted
 * `topic`. Two more copies were found by hand after that, then two more after THAT — a
 * count fixed but the names beside it left at nine, twice, in different files.
 *
 * Hand-checking does not converge on a problem this shape, so this is the mechanical
 * arm. Where a list can be DERIVED it now is (`lint-core.js`'s coaching string, the
 * iteration in the sibling tests); this covers the prose that cannot be, which is most
 * of it — a sentence in a README, a docs-site page, a slide.
 *
 * THE RULE IS DELIBERATELY ONE-SIDED: a passage that names SOME sovereign Frames must
 * not omit others. It says nothing about passages that name one or two as examples,
 * because that is legitimate and common ("the sovereign-frame exemption `compare-code`
 * uses"). The trigger is a passage that reads as an ENUMERATION — four or more ids in
 * one window — which is the shape that goes stale and the shape a reader trusts as
 * complete.
 *
 * SCOPE. The prose surfaces a reader learns the model from, plus the engine comments
 * that describe it. NOT `engineering/decisions/**` (a dated archive — a 2026-06 note
 * correctly names the set as it was), and not generated files.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SOVEREIGN_FRAMES } = require('../../../lib/integrations/markdown-it/plugins');

const ROOT = path.join(__dirname, '..', '..', '..');

// The surfaces a reader learns the Frame catalog from.
const FILES = [
  'README.md',
  'design/forms.md',
  'design/design-system.md',
  'examples/form.md',
  'engineering/architecture.md',
  'lib/integrations/markdown-it/plugins.js',
  'lib/authoring/lint-core.js',
  'lib/forms/form-default.js',
  'lib/components/manifest.schema.json',
  'docs/src/content/docs/model/form-model.mdx',
  'docs/src/content/docs/craft/components/anatomy.mdx',
  'docs/src/content/docs/craft/components/css-rules.mdx',
  'docs/src/content/docs/craft/troubleshooting.md',
];

/** Four or more distinct sovereign ids in one passage reads as an enumeration. */
const ENUMERATION_FLOOR = 4;

/** Match as a whole word, so `compare-code-cover` is not `compare-code` being named. */
const word = (id) => new RegExp(`(^|[^\\w-])${id}([^\\w-]|$)`);
const namesIn = (text) => SOVEREIGN_FRAMES.filter((id) => word(id).test(text));

// A passage is only CLAIMING to name this set if it says so. Every list that drifted
// sits within a line or two of the word: "ten sovereign Frames (`title`, …)", "the
// SOVEREIGN Frames (title/divider/…)", "compose as a sovereign Frame … if you are
// styling one of". Passages that merely happen to mention several of these components
// do not — `design-system.md`'s Function axis puts `title`/`divider`/`closing` under
// Anchor and `split-panel` under Statement, and `architecture.md` splits the catalog
// into structured and unstructured. Neither claims to be the Frame catalog, and judging
// them would make this gate cry wolf, which is how a gate gets switched off.
const CLAIMS_THE_SET = /sovereign/i;
const LEAD_IN = 2; // the word usually introduces the list a line or two above it

/**
 * A PASSAGE is a maximal run of consecutive lines that each name at least one sovereign
 * Frame. Every list that drifted here wrapped across two or three lines, and a fixed
 * sliding window reports each slice of one list as its own short list — so the run is
 * what gets judged, and it is judged once.
 */
function passages(lines) {
  const out = [];
  let run = null;
  lines.forEach((line, i) => {
    if (namesIn(line).length) {
      if (!run) run = { start: i, lines: [] };
      run.lines.push(line);
    } else if (run) {
      out.push(run); run = null;
    }
  });
  if (run) out.push(run);
  return out;
}

describe('no prose list of the sovereign Frames is short one', () => {
  for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;

    test(rel, () => {
      const lines = fs.readFileSync(abs, 'utf8').split('\n');
      const problems = [];
      for (const run of passages(lines)) {
        const text = run.lines.join(' ');
        const named = namesIn(text);
        if (named.length < ENUMERATION_FLOOR) continue;
        const withLeadIn = lines.slice(Math.max(0, run.start - LEAD_IN), run.start).join(' ') + ' ' + text;
        if (!CLAIMS_THE_SET.test(withLeadIn)) continue;
        const missing = SOVEREIGN_FRAMES.filter((id) => !named.includes(id));
        if (!missing.length) continue;
        problems.push(
          `  line ${run.start + 1}: names ${named.length} of ${SOVEREIGN_FRAMES.length}, `
          + `missing ${missing.join(', ')}\n    ${run.lines[0].trim().slice(0, 110)}`,
        );
      }
      assert.equal(
        problems.length, 0,
        `${rel} enumerates the sovereign Frames and leaves some out:\n${problems.join('\n')}\n`
        + `The set is derived from lib/forms/frame/*'s exemptFromChrome — ask frameToggleSkip()\n`
        + `or SOVEREIGN_FRAMES rather than retyping it.`,
      );
    });
  }
});
