// The Drawing Board — refine actions (Phase 2, Slice 9b). Model-backed prose.
//
// "Help me refine" on a selection: Polish / Formalize / Elaborate / Shorten.
// These are inherently generative — there is no deterministic floor for "rewrite
// this prose" — so the menu is GATED on a real generation tier (built-in
// Rewriter/Summarizer → Prompt API → WebLLM). With no model it's disabled with a
// "needs on-device AI" hint, honest about why. The model PROPOSES; the engine
// APPLIES: every result lands as one undoable CodeMirror transaction (re-linted,
// re-rendered), so nothing the model writes escapes the editor's history or the
// authoring contract. Verified headless via a MockBackend (apply path) + the
// disabled state; the live rewrite needs a capable browser.

export const REFINE_ACTIONS = [
  { id: 'polish', label: 'Polish', hint: 'tighten and clarify, same meaning', instruction: 'Polish this slide text: tighten and clarify it without changing the meaning, the facts, or the markdown structure. Keep it about the same length.' },
  { id: 'formalize', label: 'Formalize', hint: 'a more formal register', instruction: 'Rewrite this slide text in a more formal, boardroom register. Keep the meaning, facts, and markdown structure; do not add new claims.' },
  { id: 'elaborate', label: 'Elaborate', hint: 'add a little supporting detail', instruction: 'Elaborate this slide text slightly: add at most one short supporting clause or sentence. Do not invent specific numbers or facts. Keep the markdown structure.' },
  { id: 'shorten', label: 'Shorten', hint: 'cut to the essential', instruction: 'Shorten this slide text to its essential point. Keep the meaning and markdown structure; cut filler. Prefer fewer words.' },
];

// Pure: build the model messages for a refine action over `text`. The system
// brief forbids the model from inventing facts or breaking markdown, and asks
// for ONLY the rewritten text back (no preamble) so it can be applied verbatim.
export function buildRefinePrompt(action, text) {
  const act = REFINE_ACTIONS.find((a) => a.id === action) || REFINE_ACTIONS[0];
  const system =
    'You are an editor for a Lattice slide deck. You rewrite the author’s selected ' +
    'text and return ONLY the rewritten text — no preamble, no quotes, no code fences, ' +
    'no explanation. Preserve the markdown structure (lists, bold, headings). Never ' +
    'invent facts or numbers. ' + act.instruction;
  return [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ];
}

// Strip anything the model wraps around the rewrite (a stray fence or quotes) so
// the applied text stays clean. Pure.
export function cleanRewrite(out, fallback) {
  if (!out || typeof out !== 'string') return fallback;
  let s = out.trim();
  const fence = s.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  if (fence) s = fence[1].trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1);
  return s || fallback;
}

export function createRefine({ trigger, menuHost, editor, model, onStatus }) {
  if (!trigger || !menuHost || !editor) return { sync() {}, close() {} };
  let open = false;
  let busy = false;

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // The button shows only with a non-empty selection; it's disabled (with a hint)
  // when no generation model is available, since refine has no deterministic floor.
  function modelReady() {
    const a = model?.availability ? model.availability() : { generation: 'floor', modelOn: false };
    return a.modelOn && a.generation !== 'floor';
  }
  function sync() {
    const sel = editor.getSelection ? editor.getSelection() : { empty: true };
    const show = !sel.empty && sel.text.trim().length > 0;
    trigger.hidden = !show;
    if (!show) { close(); return; }
    const ready = modelReady();
    trigger.disabled = !ready;
    trigger.title = ready ? 'Rewrite the selection with on-device AI' : 'Refine needs on-device AI — enable it in the Architect settings';
  }

  function render() {
    menuHost.innerHTML = '';
    const menu = el('div', 'db-refine-menu');
    for (const a of REFINE_ACTIONS) {
      const b = el('button', 'db-refine-item');
      b.type = 'button';
      b.append(el('span', 'db-refine-label', a.label), el('small', null, a.hint));
      b.addEventListener('click', () => run(a.id));
      menu.append(b);
    }
    menuHost.append(menu);
  }

  async function run(actionId) {
    if (busy) return;
    const sel = editor.getSelection();
    if (sel.empty || !sel.text.trim()) { close(); return; }
    if (!modelReady()) { close(); return; }
    busy = true;
    close();
    onStatus?.('Refining…');
    try {
      const out = await model.complete({ messages: buildRefinePrompt(actionId, sel.text), fallback: sel.text });
      const next = cleanRewrite(out, sel.text);
      if (next && next !== sel.text) { editor.replaceSelection(next); onStatus?.('Refined.'); }
      else onStatus?.('No change.');
    } catch {
      onStatus?.('Refine failed.', true);
    }
    busy = false;
  }

  function toggle() {
    if (trigger.disabled) return;
    open = !open;
    menuHost.hidden = !open;
    if (open) render();
  }
  function close() { open = false; menuHost.hidden = true; }

  trigger.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => { if (open && !menuHost.contains(e.target) && e.target !== trigger) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });

  menuHost.hidden = true;
  trigger.hidden = true;
  return { sync, close };
}
