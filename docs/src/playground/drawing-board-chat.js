// The Drawing Board — the Architect's chat surface (Phase 2, Slice 7).
//
// A real conversation with the Architect, persisted per deck (the chats/messages
// IndexedDB stores). The model PHRASES; it never owns correctness — every reply
// is grounded in the deck + the deterministic findings handed in, and when no
// on-device model is loaded the composer still answers usefully from the
// deterministic assessment (the floor). See the Phase 2 build decision doc.
//
// Verified headless via a MockBackend (stream-render + persist + resume); the
// live phrasing path needs a capable Chrome/Edge — the panel says so when it's
// running model-free.

import { applyEdit, diffLines, EDIT_PROTOCOL, numberSlides, parseEdits, sliceSlide } from '../components/studio/ai/architect-edits.js';
import { buildLatticePrimer } from '../components/studio/ai/architect-knowledge.js';
import { orSupportsCache } from '../components/studio/ai/architect-model.js';
import { renderMarkdown, renderMarkdownStream } from '../components/studio/ai/chat-markdown.js';
import { buildCanonContext } from '../components/studio/ai/presentation-canon.js';
import { budgetStatus, readBudgetCap, readBudgetMode, readCachingEnabled, readSpend, readStandingInstructions, recordSpend } from './drawing-board-settings.js';

const BUDGET_WARNED_KEY = 'lattice-db-budget-warned'; // session flag so we toast each threshold once

const MAX_DECK_CHARS = 1200; // a short excerpt — a small model drowns in a full deck
const RICH_DECK_CHARS = 16000; // the cloud tier (Claude) reads the whole deck, not a peek
// Prompt-cache TTL for the static prefix (OpenRouter/Anthropic). Converse is a
// multi-turn conversation with think-gaps, so the 1-hour TTL keeps the ~9.7K-token
// prefix warm across a whole authoring session instead of re-writing it after every
// 5-minute lull. The 1h write costs 2× base input (vs 1.25× for 5m), but a single
// avoided re-write more than pays for the premium — it wins after one >5-min gap.
const CACHE_TTL = '1h';

// Tiers capable enough for the FULL Lattice authoring dossier + the editing
// protocol: the OpenRouter cloud tier (the user's chosen frontier model) and WebLLM (a desktop 7–8B model). The tiny universal (0.5B)
// and built-in tiers drown in the big prompt, so they stay lean and advice-only.
// Keys on capability, not "is it the cloud".
export function isCapableTier(generation) {
  return generation === 'openrouter' || generation === 'webllm';
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Build the model messages: a system brief, the score + findings as grounding,
// the recent REAL conversation, then the new turn. Two shapes by tier:
//
//   - LEAN (local/small models): a short brief + a deck PEEK (~1200 chars). A
//     long prompt + the full deck makes a small model ramble.
//   - RICH (`rich:true`, the OpenRouter cloud tier): a Lattice primer (so it
//     stops giving generic advice and knows the real `_class` layouts) + the
//     WHOLE deck. A capable model wants the full picture, not a peek.
//
// PROMPT CACHING (`cache:true`, the OpenRouter/Anthropic path): the rich system
// message is split into a STATIC prefix (persona + the Lattice primer + the edit
// protocol — byte-identical across every turn AND every deck) and a DYNAMIC
// suffix (score + findings + this deck). The static prefix carries an `ephemeral`
// cache_control breakpoint, so Anthropic bills it at ~10% on a hit instead of
// re-reading ~10K tokens each turn. Only the OpenRouter backend sends structured
// content blocks; every other backend gets the flattened string (WebLLM / the
// Prompt API read `.content` as a plain string). The flattened form is
// byte-identical to the pre-caching prompt, so behaviour is unchanged.
//
// Deterministic messages (floor replies, the greeting — marked `det`) are dropped
// from history so a small model doesn't parrot our own boilerplate (the cause of
// the degenerate "load on-device AI…" loop seen on-device). Pure string assembly.
export function buildChatMessages({ source, assessment, history, userText, catalog, rich, cache, standingInstructions }) {
  const deck = (source || '').slice(0, rich ? RICH_DECK_CHARS : MAX_DECK_CHARS).trim();
  // The author's standing instructions ride in the STATIC (cached) prefix — they
  // apply to every turn and change rarely, so caching them is correct. Editing them
  // invalidates the cache once, then steady-state hits resume.
  const standing = (standingInstructions || '').trim();
  const standingBlock = standing
    ? `\n\nThe author has given you STANDING INSTRUCTIONS — always honor these:\n${standing}`
    : '';
  const findings = (assessment?.findings || [])
    .slice(0, rich ? 12 : 5)
    .map((f) => `- ${f.message}${f.slide ? ` (slide ${f.slide})` : ''}`)
    .join('\n');
  const score = assessment?.scorecard
    ? `The deck scores ${assessment.scorecard.band} (${assessment.scorecard.overall}/100).`
    : '';

  let system;
  let systemStatic = null; // the cacheable prefix (rich only) — see PROMPT CACHING above
  let systemDynamic = null; // the per-deck/per-turn tail (never cached)
  if (rich) {
    const numbered = numberSlides(deck);
    systemStatic =
      'You are the Architect, a sharp presentation partner inside the Lattice Drawing Board. ' +
      'Help the author improve THIS deck — structure, the ask, pacing, wording, and the right ' +
      'layout for each slide. Be specific and concrete: refer to slides by number and to layouts ' +
      'by their exact `_class` name. Ground every point in the deck and the findings below — ' +
      'never invent facts about the author’s content.\n\n' +
      `${buildLatticePrimer(catalog)}\n\n` +
      `${EDIT_PROTOCOL}` +
      standingBlock;
    // Canon principles for THIS deck's findings (cloud tier only). It rides the
    // DYNAMIC tail, not the cached prefix: it's findings-derived, so caching it
    // would break the prefix every turn — and the retrieved set is small (a few
    // hundred tokens) by design. See presentation-canon.js.
    const canon = buildCanonContext({ findings: assessment?.findings || [] });
    systemDynamic =
      `\n\n${score}\n${findings ? `Mechanical issues the deterministic review found:\n${findings}\n` : 'No mechanical issues found.\n'}` +
      (canon ? `\n${canon}\n` : '') +
      (numbered ? `\nThe current deck (each slide tagged [slide N] — address slides by that number; never copy the marker into an edit body):\n${numbered}` : '');
    system = systemStatic + systemDynamic;
  } else {
    system =
      'You are the Architect, a sharp, friendly presentation coach. Answer in 1–3 short, ' +
      'concrete sentences. Do not repeat yourself or restate the question. Refer to slides ' +
      'by number. You advise; the app makes the edits. Base advice on the deck and issues below.\n\n' +
      `${score}\n${findings ? `Issues found:\n${findings}\n` : 'No mechanical issues found.\n'}` +
      (deck ? `\nDeck:\n${deck}` : '') +
      standingBlock;
  }

  const turns = (history || [])
    .filter((m) => !m.det) // drop deterministic floor/greeting — model would parrot it
    .slice(-6)
    .map((m) => ({ role: m.role === 'architect' ? 'assistant' : 'user', content: m.content }));

  // Cache only the rich path (the small one is under the cacheable-token floor and
  // not worth a breakpoint). The static block carries the breakpoint; the dynamic
  // tail follows it in the same message, sent fresh each turn (correctly uncached).
  const systemMessage = cache && rich && systemStatic
    ? { role: 'system', content: [
        { type: 'text', text: systemStatic, cache_control: { type: 'ephemeral', ttl: CACHE_TTL } },
        { type: 'text', text: systemDynamic },
      ] }
    : { role: 'system', content: system };
  return [systemMessage, ...turns, { role: 'user', content: userText }];
}

// The deterministic floor reply — no model, but NOT a single canned string. It
// reads the author's question and routes to the relevant deterministic answer
// (why it's model-free, the scorecard, a named slide, the top fixes), so a real
// back-and-forth still feels responsive on a browser without on-device AI (most
// phones). Honest about being model-free where that's the actual question; it
// doesn't pretend to converse about things the engines can't see. Pure + tested.
function scoreLine(sc) {
  return `your deck scores ${sc.band} (${sc.overall}/100)`;
}
function mustFix(assessment, n = 3) {
  return (assessment?.findings || []).filter((f) => f.severity !== 'suggestion').slice(0, n);
}
function listFindings(findings) {
  return findings.map((f) => `• ${f.message}${f.slide ? ` (slide ${f.slide})` : ''}`).join('\n');
}

export function floorReply(assessment, userText = '') {
  const sc = assessment?.scorecard;
  const q = String(userText).toLowerCase();
  const enable = 'Want a real back-and-forth? Tap the settings chip up top and load on-device AI — there’s a compact universal option (~350 MB) that runs right here in your browser, no special browser or GPU needed. It stays on your device.';

  // "why are you model-free / how do I enable it" — answer the actual question.
  if (/\b(why|model[\s-]?free|no model|offline|enable|turn on|switch on|activate|on-device|gpu|download|nano|webllm|transformers)\b/.test(q)) {
    return "I'm running deterministically because no on-device model is loaded in this browser yet. There are three tiers: the built-in AI (instant, but only recent Chrome/Edge expose it), a compact universal model that runs anywhere via WebAssembly (a one-time ~350 MB download — this is the one for Safari and phones), and an advanced WebLLM tier for WebGPU desktops. " +
      'None of that changes the review — scores, findings and fixes are computed the same way regardless. ' + enable;
  }

  if (!sc) {
    return "There’s no deck to look at yet — start writing and I’ll score it and flag anything off as you go. " +
      "(I’m running model-free in this browser, so I answer from that live review rather than free-form chat. " + enable + ')';
  }

  // A specific slide — surface that slide's findings.
  const slideM = q.match(/slide\s*(\d+)/);
  if (slideM) {
    const n = Number(slideM[1]);
    const on = (assessment.findings || []).filter((f) => f.slide === n);
    if (on.length) return `On slide ${n}:\n${listFindings(on)}\n\nThat’s what the deterministic review sees. ${enable}`;
    return `Slide ${n} looks clean to the review — no contract or clarity flags on it. ${enable}`;
  }

  // Fixes / improvement — lead with the actionable findings.
  if (/\b(fix|improve|better|tighten|sharpen|stronger|strengthen|weak|wrong|issue|problem)\b/.test(q)) {
    const fixes = mustFix(assessment, 4);
    if (fixes.length) return `Here’s what I’d fix first (${scoreLine(sc)}):\n${listFindings(fixes)}\n\nEach is also flagged in the review above with a Reveal / How-to-fix. ${enable}`;
    return `Nothing mechanical is flagged — ${scoreLine(sc)} and every slide follows the authoring contract. For wording and flow, ${enable.charAt(0).toLowerCase() + enable.slice(1)}`;
  }

  // Greeting.
  if (/^\s*(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/.test(q)) {
    return `Hey. I’ve got your deck up — ${scoreLine(sc)}. Ask me what to fix, or about a specific slide, and I’ll tell you what the review sees. ${enable}`;
  }

  // Default: thoughts / review / score / anything else — the assessment.
  const issues = mustFix(assessment, 3);
  return `Here’s my read, ${scoreLine(sc)}: ` +
    (issues.length ? `the things I’d fix first —\n${listFindings(issues)}\n\n` : 'nothing mechanical is broken, every slide follows the contract. ') +
    `Ask me about a specific slide or "what should I fix" for more. ${enable}`;
}

export function createChat({ mount, composer, model, store, getAssessment, catalog, applyFix, getSource, onApply }) {
  if (!mount || !composer) return { reload() {}, focus() {} };
  let deckId = store?.getActiveId ? store.getActiveId() : null;
  let busy = false;

  const input = composer.querySelector('textarea');
  const sendBtn = composer.querySelector('button[type="submit"]');

  // The actual scroll container is .db-arch-scroll (the panel body), not the chat
  // list — so scroll-to-bottom + the jump control target it, not the inner list.
  const scroller = mount.closest('.db-arch-scroll') || mount;

  // Architect replies are Markdown → render to safe HTML; user text stays literal.
  function setBody(bodyEl, role, text) {
    if (role === 'architect') bodyEl.innerHTML = renderMarkdown(text || '');
    else bodyEl.textContent = text || '';
  }
  function bubble(role, text, modelLabel) {
    const b = el('div', `db-msg db-msg-${role === 'architect' ? 'architect' : 'user'}`);
    const who = el('span', 'db-msg-who', role === 'architect' ? 'the Architect' : 'You');
    if (role === 'architect' && modelLabel) who.append(el('span', 'db-msg-model', ` (${modelLabel})`));
    b.append(who);
    const body = el('div', 'db-msg-body');
    setBody(body, role, text);
    b.append(body);
    mount.appendChild(b);
    return body;
  }

  // The model that produced a reply — OUR record of what we sent, NOT the model's
  // self-report (unreliable: DeepSeek & others routinely claim to be Claude/GPT, and
  // a prior identity claim in the history gets parroted forward). Stamped on the
  // Architect bubble heading so a mid-conversation model switch is visibly applied.
  function flattenModel(s) { return String(s || '').replace(/:\s*/, ' ').trim(); } // "DeepSeek: R1" → "DeepSeek R1"
  function replyAttribution(a) {
    if (!a || !a.modelOn) return null; // deterministic floor — no model
    if (a.generation === 'openrouter') return flattenModel(model.openRouterModelName?.() || model.openRouterModel?.() || '') || null;
    return null; // on-device tiers — not attributed for now
  }
  function setWho(bodyEl, modelLabel) {
    const who = bodyEl.closest?.('.db-msg')?.querySelector('.db-msg-who');
    if (who && modelLabel && !who.querySelector('.db-msg-model')) who.append(el('span', 'db-msg-model', ` (${modelLabel})`));
  }
  function scrollDown() { scroller.scrollTop = scroller.scrollHeight; }

  // ── proposed-edit cards (Slice B): a reviewable diff + one-click Apply ────────
  // The model proposes; nothing changes until the author clicks Apply. The edit
  // splices into the LIVE editor source, which re-renders and re-scores via the
  // existing onEdit path — so a bad edit shows up in Coach immediately. Pure core
  // (parse/splice/diff) is architect-edits.js; this is just the DOM.
  function editLabel(edit) {
    if (edit.action === 'replace') return `Replace slide ${edit.slide}`;
    if (edit.action === 'delete') return `Delete slide ${edit.slide}`;
    if (edit.slide <= 0) return 'Insert a slide at the top';
    if (edit.slide >= Number.MAX_SAFE_INTEGER) return 'Insert a slide at the end';
    return `Insert a slide after ${edit.slide}`;
  }

  // The one undoable step in the thread (single-level undo). A newer Apply locks
  // the previous one — so there's never an ambiguous "which undo?" question.
  let pendingUndo = null;
  function setPendingUndo(undo) {
    if (pendingUndo && pendingUndo !== undo) pendingUndo.lock();
    pendingUndo = undo;
  }

  // `frozen` cards are restored from history read-only (a reload can't honestly
  // re-offer Apply — the deck has moved on), so they show the diff + final status
  // but no buttons. `onState` persists a live card's state change for next reload.
  function editCard(edit, { frozen = false, initialState = 'open', onState, before } = {}) {
    const card = el('div', 'db-edit-card');
    if (frozen) card.classList.add('is-frozen');

    const head = el('div', 'db-edit-head');
    const toggle = el('button', 'db-edit-toggle');
    toggle.type = 'button';
    const icon = el('span', 'db-edit-icon');
    toggle.append(icon, el('span', 'db-edit-title', editLabel(edit)));
    const undoBtn = el('button', 'db-edit-undo'); undoBtn.innerHTML = '<span class="ico ico-undo" aria-hidden="true"></span> Undo';
    undoBtn.type = 'button';
    undoBtn.hidden = true;
    head.append(toggle, undoBtn);
    card.append(head);

    const body = el('div', 'db-edit-body');
    // The "before" side: the slide at PROPOSAL time. Live cards compute it from the
    // current deck (= proposal time); frozen cards get the stored snapshot, since the
    // live deck has moved on (a recompute would show a misleading no-op diff).
    const beforeText = before !== undefined
      ? (before || '')
      : (edit.action === 'insert' ? '' : sliceSlide(getSource ? getSource() : '', edit.slide));
    const after = edit.action === 'delete' ? '' : (edit.body || '').trim();
    const diff = el('div', 'db-edit-diff');
    for (const row of diffLines(beforeText, after)) {
      const sign = row.type === 'add' ? '+ ' : row.type === 'del' ? '− ' : '  ';
      diff.append(el('div', `db-diff-${row.type}`, sign + row.text));
    }
    body.append(diff);
    const actions = el('div', 'db-edit-actions');
    const applyBtn = el('button', 'db-btn db-btn-primary', 'Apply');
    applyBtn.type = 'button';
    const dismissBtn = el('button', 'db-btn', 'Discard');
    dismissBtn.type = 'button';
    actions.append(applyBtn, dismissBtn);
    body.append(actions);
    card.append(body);

    // Once acted, the head toggles the diff open/closed; while open it stays open.
    toggle.addEventListener('click', () => {
      if (card.dataset.state !== 'open') card.classList.toggle('is-collapsed');
    });

    // Paint a state. `silent` skips the persist callback (used for the initial
    // paint of a frozen/restored card, which is already saved).
    function setState(state, silent) {
      card.dataset.state = state;
      if (state === 'applied') {
        icon.className = 'db-edit-icon ico ico-check';
        card.classList.add('is-collapsed');
      } else if (state === 'dismissed') {
        icon.className = 'db-edit-icon ico ico-x';
        card.classList.add('is-collapsed');
        undoBtn.hidden = true;
      } else { // open
        icon.className = 'db-edit-icon';
        // A live open card stays expanded (it has Apply/Discard); a frozen open one
        // (proposed, never acted on at reload) collapses to a tidy "proposed" line.
        card.classList.toggle('is-collapsed', frozen);
        undoBtn.hidden = true;
      }
      actions.hidden = frozen || state !== 'open'; // read-only when frozen
      if (!silent) onState?.(state);
    }

    const api = {
      el: card,
      edit,
      isOpen: () => card.dataset.state === 'open',
      open: () => setState('open'),
      applied: () => setState('applied'),
      dismissed: () => setState('dismissed'),
    };

    if (!frozen) {
      applyBtn.addEventListener('click', () => {
        if (!getSource || !applyFix) return;
        const snapshot = getSource();
        onApply?.({ before: snapshot, label: editLabel(edit) }); // auto-checkpoint the pre-edit state
        applyFix(applyEdit(snapshot, edit));
        api.applied();
        undoBtn.hidden = false;
        const undo = {
          lock() { undoBtn.hidden = true; },
          run() { applyFix(snapshot); api.open(); if (pendingUndo === undo) pendingUndo = null; },
        };
        undoBtn.onclick = () => undo.run();
        setPendingUndo(undo);
        scrollDown();
      });
      dismissBtn.addEventListener('click', () => api.dismissed());
    }

    setState(initialState, true); // initial paint — already persisted, don't echo back
    return api;
  }

  function renderEditCards(bodyEl, edits, opts = {}) {
    const { frozen = false, states, msgId, befores } = opts;
    const msg = bodyEl.closest('.db-msg') || bodyEl.parentElement;
    const group = el('div', 'db-edit-cards');
    // The per-card states, persisted to the stored message so a reload restores them.
    const stateArr = states && states.length === edits.length ? states.slice() : edits.map(() => 'open');
    const persist = () => {
      if (frozen || msgId == null || !store?.updateChatMessage) return;
      store.updateChatMessage(msgId, { editStates: stateArr.slice() });
    };
    const cards = edits.map((edit, i) => editCard(edit, {
      frozen,
      initialState: stateArr[i],
      before: befores ? befores[i] : undefined,
      onState: (s) => { stateArr[i] = s; persist(); },
    }));

    // Batch header — live multi-edit replies only (frozen reloads are read-only).
    if (!frozen && cards.length >= 2) {
      const bar = el('div', 'db-edit-batch');
      const label = el('span', 'db-edit-batch-label', `${cards.length} proposed edits`);
      const applyAll = el('button', 'db-btn db-btn-primary', 'Apply all');
      applyAll.type = 'button';
      const dismissAll = el('button', 'db-btn', 'Dismiss all');
      dismissAll.type = 'button';
      const undoAll = el('button', 'db-edit-undo'); undoAll.innerHTML = '<span class="ico ico-undo" aria-hidden="true"></span> Undo';
      undoAll.type = 'button';
      undoAll.hidden = true;
      bar.append(label, applyAll, dismissAll, undoAll);
      group.append(bar);

      applyAll.addEventListener('click', () => {
        if (!getSource || !applyFix) return;
        const open = cards.filter((c) => c.isOpen());
        if (!open.length) return;
        const snapshot = getSource();
        onApply?.({ before: snapshot, label: `Apply all · ${open.length} edits` }); // one checkpoint for the batch
        // Apply in slide-descending order so insert/delete don't shift the targets
        // of the edits not yet applied in this batch.
        let src = snapshot;
        for (const c of [...open].sort((a, b) => b.edit.slide - a.edit.slide)) src = applyEdit(src, c.edit);
        applyFix(src);
        for (const c of open) c.applied();
        label.innerHTML = `<span class="ico ico-check" aria-hidden="true"></span> Applied ${open.length} edit${open.length > 1 ? 's' : ''}`;
        applyAll.hidden = true;
        dismissAll.hidden = true;
        undoAll.hidden = false;
        const undo = {
          lock() { undoAll.hidden = true; },
          run() {
            applyFix(snapshot);
            for (const c of open) c.open();
            label.textContent = `${cards.length} proposed edits`;
            applyAll.hidden = false;
            dismissAll.hidden = false;
            if (pendingUndo === undo) pendingUndo = null;
          },
        };
        undoAll.onclick = () => undo.run();
        setPendingUndo(undo);
        scrollDown();
      });
      dismissAll.addEventListener('click', () => {
        for (const c of cards) if (c.isOpen()) c.dismissed();
        applyAll.hidden = true;
        dismissAll.hidden = true;
        label.textContent = 'Dismissed';
      });
    }

    for (const c of cards) group.append(c.el);
    msg.append(group);
    if (!frozen) scrollDown();
  }

  function emptyState() {
    mount.innerHTML = '';
    const a = model?.availability ? model.availability() : { generation: 'floor' };
    const note = el('p', 'db-chat-empty');
    note.textContent = a.generation === 'floor'
      ? 'Ask the Architect about your deck. (Running model-free — answers come from the live review until you enable on-device AI.)'
      : 'Ask the Architect about your deck — structure, the ask, pacing, a specific slide.';
    mount.appendChild(note);
  }

  async function reload() {
    deckId = store?.getActiveId ? store.getActiveId() : null;
    mount.innerHTML = '';
    const msgs = deckId && store?.chatMessages ? await store.chatMessages(deckId) : [];
    if (!msgs.length) { emptyState(); return; }
    for (const m of msgs) {
      const body = bubble(m.role, m.content, m.via); // m.via = the model that produced this reply
      // Restore a reply's proposed edits as FROZEN cards (the diff + final status,
      // read-only) so the thread is a faithful log of what was proposed and decided.
      if (m.role === 'architect' && Array.isArray(m.edits) && m.edits.length) {
        renderEditCards(body, m.edits, { frozen: true, states: m.editStates, befores: m.editBefores });
      }
    }
    scrollDown();
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    busy = true;
    if (sendBtn) sendBtn.disabled = true;
    if (mount.querySelector('.db-chat-empty')) mount.innerHTML = '';
    bubble('user', text);
    scrollDown();
    if (deckId && store?.addChatMessage) await store.addChatMessage(deckId, 'user', text);

    // Budget guardrail (OpenRouter + 'stop' mode): if this session's spend has hit
    // the user's cap, refuse the send with a deterministic explainer — never bill past it.
    const avail = model?.availability ? model.availability() : { generation: 'floor' };
    if (avail.generation === 'openrouter' && budgetStatus({ sessionSpend: readSpend().session, cap: readBudgetCap(), mode: readBudgetMode() }).blocked) {
      const cap = readBudgetCap();
      const msg = `You've hit your $${cap.toFixed(2)} session budget (spent $${readSpend().session.toFixed(2)}). Raise or clear the cap in Settings to keep going.`;
      bubble('architect', msg);
      if (deckId && store?.addChatMessage) await store.addChatMessage(deckId, 'architect', msg, true);
      busy = false;
      if (sendBtn) sendBtn.disabled = false;
      scrollDown();
      return;
    }

    const assessment = getAssessment ? getAssessment() : null;
    const floor = floorReply(assessment, text);
    // Immediate "working" feedback, so you're never left wondering. On-device
    // tiers are slow, so the label sets expectations; the first streamed token
    // swaps it for the reply (the worker keeps the UI live so this animates).
    const a = model?.availability ? model.availability() : { generation: 'floor' };
    const slow = a.generation === 'transformers' || a.generation === 'webllm';
    const target = bubble('architect', slow ? 'Thinking on-device — this can take a few seconds…' : 'Thinking…');
    target.classList.add('db-msg-thinking');
    let full = '';
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      target.classList.remove('db-msg-thinking');
      target.classList.add('is-streaming');
      target.textContent = '';
    };
    // Render Markdown live as tokens arrive, not just once at the end — but coalesce
    // to one paint per animation frame so a fast cloud stream doesn't thrash innerHTML
    // (which would also fight text selection). renderMarkdownStream holds back the
    // trailing incomplete construct so partial syntax doesn't flicker. The final
    // setBody() below re-renders the complete, edits-stripped text, so this live
    // paint is purely cosmetic and the end state is always exact.
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    const unschedule = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
    let painting = 0;
    const paint = () => { painting = 0; target.innerHTML = renderMarkdownStream(full); scrollDown(); };
    const schedulePaint = () => { if (!painting) painting = schedule(paint); };
    try {
      // Capable tiers (OpenRouter cloud + WebLLM desktop) get the rich, Lattice-aware
      // prompt + the whole deck; the tiny local tiers keep the lean peek so they
      // don't ramble. On OpenRouter (Anthropic), cache the static prefix so the
      // ~10K-token primer is billed at ~10% on repeat turns instead of in full.
      const orModel = model.openRouterModel?.() || '';
      const messages = buildChatMessages({
        source: assessment?.source, assessment, history: await thread(), userText: text,
        catalog, rich: isCapableTier(a.generation),
        // Cache only when on OpenRouter, the user hasn't opted out, AND the model
        // supports it — matches what the settings switch offers (never a dead flag).
        cache: a.generation === 'openrouter' && readCachingEnabled() && orSupportsCache(orModel),
        standingInstructions: readStandingInstructions(),
      });
      const out = await model.complete({
        messages,
        fallback: floor,
        onToken: (tok) => { begin(); full += tok; schedulePaint(); },
        onUsage: (u) => recordSpend(u?.cost, u?.total_tokens ?? ((u?.prompt_tokens || 0) + (u?.completion_tokens || 0))), // cost + tokens for the session tally
      });
      full = (out && String(out)) || full || floor;
    } catch {
      full = floor;
    }
    // Cancel any frame still queued so a late paint can't clobber the final render.
    if (painting) { unschedule(painting); painting = 0; }
    begin(); // ensure the thinking state clears even if nothing streamed
    target.classList.remove('is-streaming');

    // On a capable tier (OpenRouter / WebLLM), the reply may carry proposed EDIT BLOCKS —
    // lift them into reviewable diff cards and show only the prose in the bubble.
    // Stored history keeps the prose (the change lives in the deck once applied), so
    // reloading the thread never re-offers a stale apply.
    let stored = full;
    let edits = [];
    if (isCapableTier(a.generation) && full && full !== floor) {
      const parsed = parseEdits(full);
      if (parsed.edits.length) {
        stored = parsed.text || '(proposed a deck edit)';
        edits = parsed.edits;
      }
    }
    // Render the finalized reply as Markdown (the streamed text was plain).
    setBody(target, 'architect', stored);
    // Mark deterministic replies (floor / model-fell-to-floor) so they're NOT fed
    // back to the model as history — that's what made the small model parrot itself.
    const det = !(a.generation !== 'floor' && full && full.trim() && full !== floor);
    // Attribute the reply to the model WE used (only for a real model reply, not a
    // fall-to-floor), and stamp it on the heading so the active model is verifiable.
    const via = det ? null : replyAttribution(a);
    if (via) setWho(target, via);
    // Persist FIRST (with the proposed edits + their initial 'open' states), then
    // render live cards wired to that record — so as the author applies/dismisses,
    // the message updates and a reload restores the cards frozen in their final state.
    // Snapshot the pre-edit slide for each proposal NOW (proposal time), so a frozen
    // reload shows the true diff even after the deck has changed.
    const befores = edits.map((e) => (e.action === 'insert' ? '' : sliceSlide(getSource ? getSource() : '', e.slide)));
    let saved = null;
    if (deckId && store?.addChatMessage) {
      const extra = {};
      if (edits.length) Object.assign(extra, { edits, editStates: edits.map(() => 'open'), editBefores: befores });
      if (via) extra.via = via;
      saved = await store.addChatMessage(deckId, 'architect', stored, det, Object.keys(extra).length ? extra : null);
    }
    if (edits.length) renderEditCards(target, edits, { msgId: saved?.id, befores });
    maybeBudgetAlert(avail); // this reply's cost is now recorded — warn at 80%, alert at 100%
    busy = false;
    if (sendBtn) sendBtn.disabled = false;
    scrollDown();
  }

  // After a reply's cost lands, toast each budget threshold once per session.
  function maybeBudgetAlert(a) {
    if (a?.generation !== 'openrouter') return;
    const cap = readBudgetCap();
    if (!(cap > 0)) return;
    const st = budgetStatus({ sessionSpend: readSpend().session, cap, mode: readBudgetMode() });
    if (st.level === 'ok') return;
    let warned = '';
    try { warned = sessionStorage.getItem(BUDGET_WARNED_KEY) || ''; } catch {}
    const toast = window.__dbStore?.toast;
    if (st.level === 'over' && warned !== 'over') {
      toast?.(`Budget reached — ${st.message}.${readBudgetMode() === 'stop' ? ' New messages are paused; raise the cap in Settings.' : ''}`);
      try { sessionStorage.setItem(BUDGET_WARNED_KEY, 'over'); } catch {}
    } else if (st.level === 'warn' && !warned) {
      toast?.(`Heads up — ${st.message}.`);
      try { sessionStorage.setItem(BUDGET_WARNED_KEY, 'warn'); } catch {}
    }
  }

  async function thread() {
    return deckId && store?.chatMessages ? await store.chatMessages(deckId) : [];
  }

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    autosize();
    send(text);
  });
  // Enter sends; Shift+Enter is a newline. (Mobile keyboards send a newline, so
  // the send button is the primary affordance there.)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      composer.requestSubmit ? composer.requestSubmit() : send(input.value);
    }
  });
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  }
  input.addEventListener('input', autosize);

  // Post an Architect message into the thread without a user turn — used by the
  // onboarding so the Architect actually "talks back" when it starts a deck
  // (Freehand / Drafting), instead of silently dropping you into the editor.
  // Re-derives the active deck so it lands in the right thread after a create.
  async function say(text) {
    if (!text) return;
    deckId = store?.getActiveId ? store.getActiveId() : deckId;
    const note = mount.querySelector('.db-chat-empty');
    if (note) note.remove();
    bubble('architect', text);
    scrollDown();
    if (deckId && store?.addChatMessage) await store.addChatMessage(deckId, 'architect', text, true);
  }

  // Reload the thread whenever the active deck changes.
  window.addEventListener('db-active-deck', reload);

  reload();
  return { reload, focus: () => input.focus(), send, say };
}
