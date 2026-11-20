/**
 * fit-grace renders: a slide that clips gets the smallest claim that makes it fit, and the claim it names really does.
 * A dense gantt with a key insight AND a caption clips at the normal frame and fits under `claim-hero` (measured
 * 2026-11-20, engineering/decisions/2026-11-20-coda-and-marp-parity.md §9); a short list fits as it is.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const { plan, withClaim, deckParts } = require('../../../lib/cli/fit-grace.js');

const GANTT = `<!-- _class: gantt -->

\`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]\`

## General availability depends on one contested decision.

- Framework
  - Signal taxonomy \`Q1..Q2\` \`done\`
  - Scoring model v2 \`Q2..Q3\` \`live\` \`after=Signal taxonomy\`
  - Per-team weighting \`Q3..Q4\` \`at-risk\` \`after=Scoring model v2\`
- Adoption
  - Pilot onboarding \`Q1..Q2\` \`done\`
  - Org-wide rollout \`Q3..Q4\` \`after=Per-team weighting\`
  - GA \`Q4\` \`milestone\` \`after=Org-wide rollout\`

> If the weighting decision slips past October, GA moves to Q1.

GA also needs SOC 2 sign-off, expected 20 November.`;
const LIST = '<!-- _class: list -->\n\n## A short list fits.\n\n- One\n- Two';
const FM = '---\ntheme: indaco\nheader: "Header"\nfooter: "Footer"\npaginate: true\n---\n\n';

describe('fit-grace renders and checks', { skip: skipWithoutChrome(resolveChrome()) }, () => {
  const deck = `${FM}${LIST}\n\n---\n\n${GANTT}\n`;
  const p = plan(deck);

  test('only the gantt clips', () => assert.deepEqual(p.clipped, [2]));
  test('and it fits with claim-hero, not claim-quiet', () => {
    assert.deepEqual(p.perSlide, [{ slide: 2, claim: 'claim-hero', had: null }]);
    assert.equal(p.deck, null, 'one clipped slide never earns a deck-wide claim');
  });
  test('applying the suggestion leaves nothing clipping', () => {
    const { slides } = deckParts(deck);
    const fixed = `${FM}${slides[0]}\n\n---\n\n${withClaim(slides[1], 'claim-hero')}\n`;
    assert.deepEqual(plan(fixed).clipped, []);
  });
});
