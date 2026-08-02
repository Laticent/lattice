// The Drawing Board — Coach actions (Phase 3, deterministic). Pure + tested.
//
// The Coach console replaces a fake "chat" with structured ACTION CHIPS: each
// returns a result CARD computed entirely from the deck + the deterministic
// assessment (lint + review + scorecard). No model — honest, instant, and it
// only ever offers what it can actually answer. See
// engineering/decisions/2026-06-08-drawing-board-coach-vs-converse.md.
//
// A card is { title, body: string[], jump?: slideNumber, needMinutes?: bool }.
//
// Ask-detection and pacing are imported from review-core so the chips and the
// scorecard share ONE definition each — they can't drift apart. Via the esbuild
// bundle (not a direct CJS import) so it loads in `astro dev` — see
// tools/build-authoring-core.js.
import { reviewCore } from '../../../playground/authoring-core.generated.js';

const SEV_WEIGHT = { error: 3, warning: 2, suggestion: 1 };
const SEV_ORDER = { error: 0, warning: 1, suggestion: 2 };

// Slides split on standalone `---`, after stripping a leading YAML front-matter
// block (--- … ---) so it isn't counted as a slide. Matches the app's indexing.
export function splitSlides(source) {
  let src = source || '';
  const fm = src.match(/^\s*---\n[\s\S]*?\n---\n?/);
  if (fm) src = src.slice(fm[0].length);
  return src.split(/^---$/m).map((c) => c.trim()).filter(Boolean);
}
export function countSlides(source) {
  return splitSlides(source).length;
}

// Top fixes — the findings ranked by severity. The headline action.
export function topFixes(assessment) {
  const fs = (assessment?.findings || []).slice().sort(
    (a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || ((a.slide || 0) - (b.slide || 0)),
  ).slice(0, 5);
  if (!fs.length) return { title: 'Top fixes', body: ['Nothing flagged — every slide follows the authoring contract. 🎉'] };
  return {
    title: 'Top fixes',
    body: fs.map((f) => `• ${f.message}${f.slide ? ` (slide ${f.slide})` : ''}`),
    jump: fs[0].slide,
  };
}

// Weakest slide — the slide carrying the most / severest findings.
export function weakestSlide(assessment) {
  const bySlide = new Map();
  for (const f of assessment?.findings || []) {
    if (!f.slide) continue;
    bySlide.set(f.slide, (bySlide.get(f.slide) || 0) + (SEV_WEIGHT[f.severity] || 1));
  }
  if (!bySlide.size) return { title: 'Weakest slide', body: ['No slide stands out — nothing flagged, or issues are spread evenly.'] };
  const [slide] = [...bySlide.entries()].sort((a, b) => b[1] - a[1])[0];
  const issues = (assessment.findings || []).filter((f) => f.slide === slide).map((f) => `• ${f.message}`);
  return { title: 'Weakest slide', body: [`Slide ${slide} has the most to fix:`, ...issues], jump: slide };
}

// The ask — is there a clear decision / recommendation for the audience?
export function theAsk(source) {
  const src = source || '';
  if (/<!--\s*_class:\s*decision\b/.test(src)) {
    return { title: 'The ask', body: ['✓ You have a decision slide. Make sure it states exactly what you want the audience to approve or do.'] };
  }
  if (reviewCore.ASK_RE.test(src)) {
    return { title: 'The ask', body: ['There’s ask-like language, but no dedicated decision slide — the recommendation may be buried. A `decision` slide makes it unmissable.'] };
  }
  return { title: 'The ask', body: ['No clear ask. End with what you want the audience to decide or do — a `decision` slide states it plainly.'] };
}

// Pacing — slide count vs a stated talk length.
export function pacing(source, minutes) {
  const slides = countSlides(source);
  if (!minutes) return { title: 'Pacing', body: [`${slides} slide${slides === 1 ? '' : 's'}. Tell me your talk length and I’ll check the pace.`], needMinutes: true };
  const v = reviewCore.pacingVerdict(slides, minutes);
  return { title: 'Pacing', body: [`${slides} slides for a ${minutes}-minute talk.`, v.text] };
}

// Structure check — opening · ask · close presence.
export function structureCheck(source) {
  const slides = splitSlides(source);
  const first = slides[0] || '';
  const last = slides[slides.length - 1] || '';
  const hasOpen = /<!--\s*_class:\s*title\b/.test(first) || /^\s*#\s/.test(first.trim());
  const ask = theAsk(source).body[0];
  const askState = ask.startsWith('✓') ? '✓' : ask.startsWith('There') ? '~' : '✗';
  const hasClose = /<!--\s*_class:\s*closing\b/.test(source || '') || /\b(thank you|questions|q&a|appendix|in summary)\b/i.test(last);
  return {
    title: 'Structure check',
    body: [
      `${hasOpen ? '✓' : '✗'} Opening / title slide`,
      `${askState} Clear ask / recommendation`,
      `${hasClose ? '✓' : '✗'} Closing slide`,
    ],
  };
}
