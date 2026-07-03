// The Drawing Board — the Rehearsal planner (Practice mode's brain).
//
// Turns a deck + a target talk length into a REHEARSAL PLAN: per-slide dwell
// time, a one-line rationale ("why"), and timed COACHING BEATS — when to pause
// and let a number land, when to look up and hold eye contact, when to breathe,
// when a divider is a section hinge. Two tiers, same shape:
//
//   • deterministic floor — density + component role heuristics. Instant, no
//     model, works offline. This is the guarantee.
//   • AI refinement (optional) — when a real generation backend is connected
//     (cloud OpenRouter / Prompt API / WebLLM / WASM), the model RE-TUNES the
//     targets, sharpens the "why", and places better beats. It NEVER owns
//     correctness: a missing/failed model degrades straight back to the floor,
//     and the deterministic plan is always passed as the `fallback`.
//
// Caching: a refined plan is memoised by (deck content + minutes), so an
// unchanged deck never re-bills the cloud — but EDIT the deck (or change the
// length) and it re-assesses. Pure + Node-testable: no DOM, no window.
//
// Sibling-path note: docs-only (the Drawing Board). Does not touch the three
// engine render paths.

export const SPEAK_WPM = 135; // boardroom delivery pace, pauses folded in

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;
const TABLE_COMPS = new Set(['matrix-2x2', 'compare-table', 'list-tabular', 'obligation-matrix', 'verdict-grid', 'glossary']);
const BEAT_KINDS = new Set(['pause', 'eye', 'breathe', 'transition', 'emphasis']);

// Roles drive both the time weighting and the default beats. One word per slide
// describing what the presenter is *doing* on it.
const ROLE_MULT = { open: 1.12, section: 0.5, data: 1.28, visual: 1.16, quote: 1.12, table: 1.22, decision: 1.45, close: 0.92, body: 1 };
const WHY = {
  open: 'Set the frame — name the room and the one decision this deck drives.',
  section: 'A hinge between sections — keep it short, let it reset attention.',
  data: 'Your headline metric. Give it room — the pause is what makes it land.',
  visual: 'Let the visual carry it — silence while they read beats narration.',
  quote: 'A single line, meant to be felt. Slow down; don’t rush past it.',
  table: 'Dense reference — orient them, then point to the one row that matters.',
  decision: 'The ask. The slowest, most deliberate slide in the deck — own it.',
  close: 'The last thing they remember. End clean, on eye contact.',
  body: 'A supporting point — keep the pace up and move toward the payoff.',
};

// Cheap, stable djb2 — only for the memo key (deck text + minutes).
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Split a source into slide chunks the SAME way the app indexes them: strip a
// leading YAML front-matter block, split on standalone `---`, drop the blanks.
export function parseSlides(source) {
  let src = source || '';
  const fm = src.match(/^\s*---\n[\s\S]*?\n---\n?/);
  if (fm) src = src.slice(fm[0].length);
  return src.split(/^---$/m).map((c) => c.trim()).filter(Boolean);
}

function classOf(chunk) {
  const m = chunk.match(CLASS_DIRECTIVE);
  return m ? m[1].trim().split(/\s+/)[0] : null;
}
function wordsOf(chunk) {
  return chunk
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[#*_>`~|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}
function titleOf(chunk) {
  const body = chunk.replace(/<!--[\s\S]*?-->/g, '').trim();
  const head = body.match(/^#{1,3}\s+(.+)$/m);
  const line = (head ? head[1] : body.split('\n').find((l) => l.trim())) || '';
  return line.replace(/[#*_`>|\\-]/g, '').trim().slice(0, 64);
}
// A short prose snippet (title stripped) so the model coaches from the slide's
// CONTENT, not just its title — capped tight to keep the prompt small.
function snippetOf(chunk, title) {
  const flat = chunk
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const rest = title && flat.startsWith(title) ? flat.slice(title.length) : flat;
  return rest.trim().slice(0, 140);
}

function roleOf(comp, idx, total, chunk, bucketOf) {
  if (idx === 0) return 'open';
  const lastish = idx === total - 1;
  if (comp === 'closing' || /\b(thank you|questions|q&a|in summary)\b/i.test(chunk)) return 'close';
  if (comp === 'divider') return 'section';
  if (comp === 'decision') return 'decision';
  if (comp === 'big-number' || comp === 'kpi' || comp === 'stats') return 'data';
  if (comp === 'quote') return 'quote';
  if (comp === 'image') return 'visual';
  if (comp && TABLE_COMPS.has(comp)) return 'table';
  const b = bucketOf && comp ? bucketOf(comp) : null;
  if (b === 'evidence') return 'data';
  if (b === 'imagery' || b === 'chart' || b === 'diagram') return 'visual';
  if (lastish) return 'close';
  return 'body';
}

// The default beats for a slide, by role + density. `at` is a fraction of the
// slide's dwell; `hold` is seconds the beat stays up. Imperative, short, calm.
function beatsFor(role, words) {
  switch (role) {
    case 'open':
      return [{ at: 0, kind: 'eye', text: 'Open on the room — eye contact before the first word.', hold: 4 }];
    case 'section':
      return [{ at: 0, kind: 'transition', text: 'New section — pause, then signpost what’s next.', hold: 4 }];
    case 'data':
      return [
        { at: 0.55, kind: 'pause', text: 'Let the number land — stop talking for a beat.', hold: 3 },
        { at: 0.74, kind: 'eye', text: 'Look up — read the reaction in the room.', hold: 3 },
      ];
    case 'visual':
      return [{ at: 0.25, kind: 'pause', text: 'Hold for the visual — let them read before you talk.', hold: 3 }];
    case 'quote':
      return [{ at: 0.35, kind: 'breathe', text: 'Let the line breathe — a slow beat here.', hold: 3 }];
    case 'table':
      return [{ at: 0.4, kind: 'emphasis', text: 'Guide their eye — don’t read every cell.', hold: 4 }];
    case 'decision':
      return [
        { at: 0.38, kind: 'pause', text: 'This is the ask — slow down and state it plainly.', hold: 4 },
        { at: 0.62, kind: 'eye', text: 'Hold eye contact while the ask lands.', hold: 4 },
      ];
    case 'close':
      return [{ at: 0.2, kind: 'eye', text: 'Close on eye contact — land it, then stop.', hold: 4 }];
    default:
      return words > 70 ? [{ at: 0.5, kind: 'breathe', text: 'Breathe — don’t rush the middle.', hold: 2 }] : [];
  }
}

// A spoken-time estimate per slide (words ÷ pace + a per-role overhead for the
// pauses/transitions), summed → the SUGGESTED talk length. Honest floor math.
function suggestSeconds(metas) {
  let s = 0;
  for (const m of metas) {
    s += (m.words / SPEAK_WPM) * 60;
    s += m.role === 'section' ? 4 : m.role === 'decision' ? 12 : m.role === 'data' ? 8 : m.role === 'open' || m.role === 'close' ? 6 : 4;
  }
  return s;
}

// Distribute `totalSeconds` across slides by density × role weight.
function allocate(metas, totalSeconds) {
  const w = metas.map((m) => Math.max(0.4, (0.6 + m.words / 45) * (ROLE_MULT[m.role] || 1)));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((x) => (x / sum) * totalSeconds);
}

// The deterministic plan — the always-available floor. `bucketOf(name)` maps a
// component to its bucket (for role fallback); optional.
// ── Slide metas: two sources, one shape ───────────────────────────────────────
//
// A "meta" is { comp, words, role, title, snippet } per slide. There are two ways
// to get them, and they MUST agree with what the deck actually renders:
//
//   • metasFromSections — AUTHORITATIVE. The engine already split the deck (it
//     honours `---`, fenced code, and `split: headings`, which a source regex
//     cannot), so the rendered <section> list is the truth. Practice uses this.
//   • metasFromSource — a fallback for when the engine isn't ready. A naive
//     `---` split; correct for plain `split: rule` decks, wrong for headings/fence
//     decks — which is exactly the bug that made a big deck read as "1 slide".
function metaFromChunk(comp, words, role, title, snippet) {
  return { comp, words, role, title, snippet };
}

export function metasFromSource(source, { bucketOf } = {}) {
  const chunks = parseSlides(source);
  const total = chunks.length;
  return chunks.map((c, i) => {
    const comp = classOf(c);
    const title = titleOf(c);
    return metaFromChunk(comp, wordsOf(c), roleOf(comp, i, total, c, bucketOf), title, snippetOf(c, title));
  });
}

// The component for a rendered <section>: its `_class` becomes a class token. Pick
// a known special role-class, else a catalog-known component, else the first class.
const ROLE_CLASSES = new Set(['title', 'divider', 'decision', 'closing', 'big-number', 'kpi', 'stats', 'quote', 'image']);
function sectionComp(html, bucketOf) {
  const m = html.match(/<section[^>]*\sclass="([^"]*)"/i);
  if (!m) return null;
  const classes = m[1].split(/\s+/).filter(Boolean);
  return classes.find((c) => ROLE_CLASSES.has(c)) || (bucketOf && classes.find((c) => bucketOf(c))) || classes[0] || null;
}
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function sectionTitle(html) {
  const m = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  return m ? stripTags(m[1]).slice(0, 64) : '';
}
export function metasFromSections(sections, { bucketOf } = {}) {
  const total = sections.length;
  return sections.map((html, i) => {
    const comp = sectionComp(html, bucketOf);
    const text = stripTags(html);
    const title = sectionTitle(html);
    const snippet = (title && text.startsWith(title) ? text.slice(title.length) : text).trim().slice(0, 140);
    return metaFromChunk(comp, text.split(/\s+/).filter(Boolean).length, roleOf(comp, i, total, text, bucketOf), title, snippet);
  });
}

// The pure plan core — metas → dwell targets, beats, why, suggestion, deck read.
// Source-agnostic, so it's identical whether the metas came from the engine or the
// source fallback.
export function buildPlanFromMetas(metas, minutes) {
  const totalSeconds = Math.max(1, minutes) * 60;
  const targets = allocate(metas, totalSeconds);
  const suggestMinutes = Math.max(1, Math.round(suggestSeconds(metas) / 60));
  const slides = metas.map((m, i) => ({
    index: i,
    comp: m.comp,
    role: m.role,
    title: m.title,
    words: m.words,
    target: targets[i],
    why: WHY[m.role] || WHY.body,
    beats: beatsFor(m.role, m.words),
    snippet: m.snippet,
  }));
  return {
    source: 'deterministic',
    minutes,
    totalTarget: totalSeconds,
    suggestMinutes,
    slides,
    deck: buildDeckRead(slides, minutes, totalSeconds, suggestMinutes),
  };
}

// Convenience builders. `buildDeterministicPlan` (source) stays for the fallback +
// the unit tests; Practice prefers the sections path.
export function buildDeterministicPlan(source, minutes, ctx = {}) {
  return buildPlanFromMetas(metasFromSource(source, ctx), minutes);
}
export function buildDeterministicPlanFromSections(sections, minutes, ctx = {}) {
  return buildPlanFromMetas(metasFromSections(sections, ctx), minutes);
}

// The whole-deck READ — a structural take on the arc the per-slide cards can't
// give: how the time is split (the ask, the opening), whether the deck fits the
// length, and front-loading. Pure timing math (no model — these are honest
// percentages, not opinions), surfaced on the start screen so you plan before
// you rehearse. Returns { summary, fit, askPct, flags:[{tone,text}] }.
export function buildDeckRead(slides, minutes, totalSeconds, suggestMinutes) {
  const byRole = {};
  for (const s of slides) byRole[s.role] = (byRole[s.role] || 0) + s.target;
  const pct = (r) => Math.round(((byRole[r] || 0) / totalSeconds) * 100);
  const has = (r) => slides.some((s) => s.role === r);
  const flags = [];

  const askPct = pct('decision');
  if (!has('decision')) flags.push({ tone: 'warn', text: 'No explicit ask — end on a decision slide so the room knows what you want.' });
  else if (askPct < 10) flags.push({ tone: 'warn', text: `The ask gets only ${askPct}% of your time — it’s the point; give it more room.` });

  if (!has('open')) flags.push({ tone: 'warn', text: 'No clear opening — set the frame before the first detail.' });
  if (!has('close')) flags.push({ tone: 'info', text: 'No closing slide — land on a deliberate close, not the last data slide.' });

  const third = Math.max(1, Math.floor(slides.length / 3));
  if (slides.length >= 6) {
    const frac = (arr) => arr.reduce((a, s) => a + s.target, 0) / totalSeconds;
    if (frac(slides.slice(0, third)) > 0.5) flags.push({ tone: 'info', text: 'Front-loaded — over half your time is in the first third; make sure the payoff still breathes.' });
  }

  let fit = 'good';
  if (minutes >= suggestMinutes * 1.5) { fit = 'loose'; flags.push({ tone: 'info', text: `You’ve booked ${minutes} min for ~${suggestMinutes} min of material — slow down, or go deeper.` }); }
  else if (minutes <= suggestMinutes * 0.6) { fit = 'tight'; flags.push({ tone: 'warn', text: `~${suggestMinutes} min of material in ${minutes} — you’ll be rushing. Cut slides or extend.` }); }

  const summary = `${slides.length} slide${slides.length === 1 ? '' : 's'} · ${minutes} min — ${has('decision') ? `ask ${askPct}%` : 'no ask'}, opening ${pct('open')}%.`;
  return { summary, fit, askPct, flags: flags.slice(0, 3) };
}

// A pace-aware nudge: once you linger past ~1.3× a slide's budget, surface a live
// "over time" beat that outranks the authored delivery beats — the one place the
// coaching keys off your ACTUAL dwell vs the target, not a fixed fraction. Static
// text (so its key is stable and it doesn't re-fade each tick). Returns a beat or
// null. `kind:'over'` is styled like the behind/over pace state.
export const OVER_FACTOR = 1.3;
export function overBeat(onSlide, target) {
  if (!(target > 0) || onSlide <= target * OVER_FACTOR) return null;
  return { at: 1, kind: 'over', text: 'Over time on this slide — land it and move on.', hold: Infinity };
}

// ── AI refinement ─────────────────────────────────────────────────────────────

function digest(plan) {
  return plan.slides
    .map((s) => `${s.index} [${s.role}${s.comp ? '/' + s.comp : ''}] "${s.title || ''}" (${s.words}w)${s.snippet ? ' — ' + s.snippet : ''}`)
    .join('\n');
}

function buildMessages(plan) {
  const totalS = Math.round(plan.totalTarget);
  const sys =
    'You are a world-class presentation rehearsal coach for boardroom decks. Given a ' +
    'deck digest and a target talk length, return concise, specific, per-slide coaching ' +
    'as STRICT JSON only — no prose, no markdown. Calm, professional, executive register.';
  const user =
    `Talk length: ${plan.minutes} min (~${totalS}s). ${plan.slides.length} slides.\n` +
    'Return JSON exactly: {"slides":[{"i":<index>,"target":<seconds>,"why":"<=14 words",' +
    '"beats":[{"at":<0..1 fraction of the slide>,"kind":"pause|eye|breathe|transition|emphasis",' +
    '"text":"<=12 words, imperative","hold":<2..6>}]}]}\n' +
    `Rules: targets should SUM to about ${totalS}s — pace the whole arc, not each slide in ` +
    'isolation: spend more on the opening, the data, and the ask; less on dividers. Use ' +
    'beats for DELIVERY: "pause" to let a number/claim land, "eye" to look up and hold the ' +
    'room (especially on the ask + opening), "breathe" to slow a dense or emotional slide, ' +
    '"transition" on a divider/section change to signpost what’s next, "emphasis" to stress ' +
    'one point. 0–2 beats per slide, only where one genuinely helps. Let "why" capture the ' +
    'dwell, the slide’s job, and the cadence (e.g. "slow — let it land" vs "brisk list"). ' +
    'Use the snippet to be specific. Keep every string tight.\n\nSlides:\n' +
    digest(plan);
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user },
  ];
}

function clamp(n, lo, hi, dflt) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
}

// Fold a validated model response over the deterministic floor. Anything the
// model omits or malforms keeps the floor value — the model only ever improves.
export function mergeAiPlan(floor, ai) {
  const byI = new Map();
  const rows = ai && Array.isArray(ai.slides) ? ai.slides : [];
  for (const r of rows) {
    if (!r || typeof r.i !== 'number') continue;
    byI.set(r.i, r);
  }
  if (!byI.size) return null;
  const slides = floor.slides.map((s) => {
    const r = byI.get(s.index);
    // Clone untouched rows too — the re-normalise below mutates `target`, and the
    // floor (`det`) is already on screen sharing these objects; never mutate it.
    if (!r) return { ...s };
    const why = typeof r.why === 'string' && r.why.trim() ? r.why.trim().slice(0, 120) : s.why;
    const target = clamp(r.target, 2, floor.totalTarget, s.target);
    let beats = s.beats;
    if (Array.isArray(r.beats)) {
      beats = r.beats
        .filter((b) => b && BEAT_KINDS.has(b.kind) && typeof b.text === 'string' && b.text.trim())
        .slice(0, 3)
        .map((b) => ({ at: clamp(b.at, 0, 1, 0.5), kind: b.kind, text: b.text.trim().slice(0, 90), hold: clamp(b.hold, 2, 8, 3) }));
    }
    return { ...s, target, why, beats };
  });
  // Re-normalise targets so they sum to the requested length (the model rarely
  // sums exactly), preserving the relative dwell it chose.
  const sum = slides.reduce((a, s) => a + s.target, 0) || 1;
  const k = floor.totalTarget / sum;
  for (const s of slides) s.target *= k;
  return { ...floor, source: 'ai', slides };
}

// The planner: deterministic-now, AI-refined-soon, memoised per (deck+minutes).
// `plan()` returns { det, refined } — `det` is ready immediately; `refined` is a
// Promise resolving to an AI plan (or null when no model / it fails / unchanged
// The planner: deterministic-now, AI-refined-soon, memoised per (metas+minutes).
// It is source-agnostic — callers pass already-extracted `metas` (engine-derived
// when possible, source-derived as a fallback), so the plan always matches what
// the deck actually renders. `plan()` returns { det, refined } — `det` is ready
// immediately; `refined` resolves to an AI plan (or null when no model / it fails).
//
// `gate` (optional, injected by the browser caller so this module stays pure +
// Node-testable) enforces the same cost/quality discipline as the rest of the
// Architect WITHOUT importing the settings module:
//   • capable(generation) → only let strong tiers override the proven floor (a
//     tiny 0.5B/built-in model would replace good heuristics with bland text).
//   • allow() → respect the session budget cap before a billed cloud call.
//   • onUsage(u) → record the spend into the session tally.
function metaSig(metas) {
  return hash((metas || []).map((m) => (m.comp || '') + ':' + m.words).join('|'));
}
export function createRehearsalPlanner({ model, gate } = {}) {
  let cache = { key: null, plan: null };

  async function refine(floor) {
    const avail = model?.availability ? model.availability() : null;
    if (!avail?.modelOn || avail.generation === 'floor') return null;
    if (gate?.capable && !gate.capable(avail.generation)) return null;
    if (gate?.allow && !gate.allow()) return null;
    try {
      const out = await model.complete({ messages: buildMessages(floor), json: true, fallback: null, onUsage: gate?.onUsage });
      return mergeAiPlan(floor, out);
    } catch {
      return null;
    }
  }

  // Deterministic-only: the start screen's length suggestion must NOT trigger a
  // billed refine (it only reads `det`). Callers that just want the floor use this.
  function detOnly(metas, minutes) {
    return buildPlanFromMetas(metas, minutes);
  }

  function plan(metas, minutes) {
    const det = buildPlanFromMetas(metas, minutes);
    const key = metaSig(metas) + '@' + minutes;
    if (cache.key === key && cache.plan) return { det, refined: Promise.resolve(cache.plan) };
    const refined = refine(det)
      .then((p) => {
        if (p) cache = { key, plan: p };
        return p;
      })
      .catch(() => null);
    return { det, refined };
  }

  return { plan, detOnly };
}
