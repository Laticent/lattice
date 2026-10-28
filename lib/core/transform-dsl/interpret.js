/**
 * Transform-DSL DOM interpreter — the ONE semantics the §11 prototype proves
 * (`engineering/decisions/2026-06-29-component-transform-dsl.md`).
 *
 * `applyRulesToDom(root, rules, ctx)` runs an ordered list of validated `match →
 * do` rules against a DOM scope. It is the single interpreter both render paths
 * share: the runtime calls it on the live browser `document`; the string path
 * (`apply-to-html.js`) calls it on a jsdom fragment of the matched section's
 * inner HTML — so the two paths agree BY CONSTRUCTION (same code), which is the
 * parity risk §11 set out to retire.
 *
 * The interpreter is the attack surface (the rules came from an untrusted,
 * AI-generable manifest), so it enforces the §6 envelope itself even though the
 * schema already validated the rules — defense in depth:
 *   • SECTION SCOPING is an invariant, not a convention (§6.5): a rule only ever
 *     sees `section.<component>` subtrees of the root, so a shared component
 *     cannot fire on the importing deck's other slides.
 *   • The element/attribute allowlists are re-checked at node-creation time
 *     (§6.1/§6.2): a barred tag or attr throws rather than emitting.
 *   • SINGLE FORWARD PASS in declared order (§4): each rule runs once over the
 *     scoped section set; no rule re-matches a later rule's output, so an
 *     adversarial/oscillating rule list cannot loop.
 *   • A render-guard NODE/OP BUDGET (§7) is the hard backstop against a
 *     quadratic `partition`/walk blowup — `ctx.spend(n)` throws past the cap.
 *   • IDEMPOTENCE: a rule whose container classes are already present skips, so
 *     a double pass (engine hook + runtime refresh) is a no-op.
 *
 * Inputs MUST be pre-validated by `schema.validateTransform` — the interpreter
 * assumes null-prototype rule objects and a closed op/capability set.
 */

const { ALLOWED_ELEMENTS, attrAllowed } = require('./schema');
const { getCapability } = require('./capabilities');

const DEFAULT_BUDGET = 10000;

/** A spend()-metered budget; throws past the cap (the render-guard backstop, §7). */
function makeBudget(limit) {
  let used = 0;
  return {
    spend(n = 1) {
      used += n;
      if (used > limit) throw new Error(`transform-dsl: render-guard budget exceeded (${used} > ${limit})`);
    },
    used: () => used,
  };
}

/** Sections of THIS component within the root (the scoping invariant, §6.5). */
function scopedSections(root, component) {
  const sel = `section.${component}`;
  const out = [];
  // root may itself be (or contain) the section — handle a fragment whose top
  // node is the section, and a document/element that contains sections.
  if (typeof root.matches === 'function' && root.matches(sel)) out.push(root);
  if (typeof root.querySelectorAll === 'function') out.push(...root.querySelectorAll(sel));
  return [...new Set(out)];
}

function hasAnyClass(el, classes) {
  const list = Array.isArray(classes) ? classes : [classes];
  return list.some(c => el.classList.contains(c));
}

/** Does the section satisfy the rule's `match` (the safe subset: section / not.section)? */
function sectionMatches(section, match) {
  if (!match) return true;
  if ('section' in match && !hasAnyClass(section, match.section)) return false;
  if ('not' in match && match.not && 'section' in match.not && hasAnyClass(section, match.not.section)) return false;
  return true;
}

/** Create an allowlisted element, re-checking the §6 element/attr envelope. */
function createSafeElement(doc, into, ctx) {
  if (!ALLOWED_ELEMENTS.has(into.element)) throw new Error(`transform-dsl: element "${into.element}" not allowed`);
  ctx.budget.spend(1);
  const el = doc.createElement(into.element);
  if (typeof into.class === 'string' && into.class) el.className = into.class;
  if (into.attrs) {
    for (const name of Object.keys(into.attrs)) {
      if (!attrAllowed(name)) throw new Error(`transform-dsl: attribute "${name}" not allowed`);
      el.setAttribute(name, String(into.attrs[name]));
    }
  }
  return el;
}

/** Direct-child match for a closed-sub-grammar selector (`tag`, `.class`, `tag.class`). */
function matchesSelector(el, sel) {
  const dot = sel.indexOf('.');
  const tag = dot === -1 ? sel : sel.slice(0, dot);
  const cls = dot === -1 ? '' : sel.slice(dot + 1);
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (cls && !el.classList.contains(cls)) return false;
  return true;
}

// The classes a rule will introduce — used for the idempotence guard.
function ruleContainerClasses(rule) {
  const out = [];
  for (const op of rule.do) {
    const into = op.extract?.into || op.wrap?.into;
    if (into && typeof into.class === 'string' && into.class) out.push(...into.class.split(/\s+/));
  }
  return out;
}

/** A rule whose container classes already exist in the section has already run. */
function alreadyApplied(section, rule) {
  const classes = ruleContainerClasses(rule);
  return classes.length > 0 && classes.some(c => [...section.children].some(ch => ch.classList?.contains(c)));
}

// ── the ops ────────────────────────────────────────────────────────────────

/** extract — move the first direct child matching each slot selector, in order, into a new container appended at `at`. */
function opExtract(section, spec, ctx, created) {
  const doc = section.ownerDocument || section;
  const container = createSafeElement(doc, spec.into, ctx);
  const claimed = new Set();
  for (const sel of spec.slots) {
    const el = [...section.children].find(ch => !claimed.has(ch) && !created.has(ch) && matchesSelector(ch, sel));
    if (el) { claimed.add(el); ctx.budget.spend(1); container.appendChild(el); }
  }
  if (!container.childNodes.length) return; // moved nothing → idempotent no-op, don't append an empty container
  appendAt(section, container, spec.at);
  created.add(container);
}

/** wrap — move all remaining flow children (not <header>, not a container created this rule) into a new container. */
function opWrap(section, spec, ctx, created) {
  const doc = section.ownerDocument || section;
  const container = createSafeElement(doc, spec.into, ctx);
  const rest = [...section.children].filter(ch => ch.tagName !== 'HEADER' && !ch.classList?.contains('slide-bar') && !created.has(ch) && ch !== container);
  for (const el of rest) { ctx.budget.spend(1); container.appendChild(el); }
  appendAt(section, container, spec.at);
  created.add(container);
}

function appendAt(section, container, at) {
  if (at === 'start') section.insertBefore(container, section.firstChild);
  else section.appendChild(container);
}

/** Run a rule's `do` ops on one section (live mutation, in order). */
function runOps(section, rule, ctx) {
  const created = new Set();
  for (const op of rule.do) {
    if (op.extract) opExtract(section, op.extract, ctx, created);
    else if (op.wrap) opWrap(section, op.wrap, ctx, created);
    else if (op.capability) {
      const cap = getCapability(op.capability);
      if (cap) cap(section, ctx);
    }
  }
}

/**
 * Apply validated rules to a DOM root. `ctx`:
 *   • component (required) — the class the section scoping keys on (§6.5);
 *   • budget (optional)    — node/op cap (default 10000), the render-guard backstop.
 * Returns the same root (mutated in place).
 */
function applyRulesToDom(root, rules, ctx = {}) {
  if (!root || typeof root.querySelectorAll !== 'function' && typeof root.matches !== 'function') return root;
  if (!ctx.component) throw new Error('transform-dsl: ctx.component is required (section scoping)');
  // The scope key is interpolated into a `section.<component>` selector, so it must
  // be a bare class token — never a value that could smuggle a combinator/comma and
  // widen the scope past this component's own sections (the §6.5 invariant).
  if (!/^[a-z][a-z0-9-]*$/.test(ctx.component)) throw new Error(`transform-dsl: invalid component scope "${ctx.component}"`);
  const budget = makeBudget(ctx.budget || DEFAULT_BUDGET);
  const innerCtx = { ...ctx, budget, spend: n => budget.spend(n) };

  for (const rule of rules) {
    // pre-rule snapshot: evaluate match for every scoped section before this
    // rule mutates anything; a rule runs once over that set (single forward pass).
    const targets = scopedSections(root, ctx.component).filter(s => sectionMatches(s, rule.match) && !alreadyApplied(s, rule));
    for (const section of targets) runOps(section, rule, innerCtx);
  }
  return root;
}

module.exports = { applyRulesToDom, makeBudget, scopedSections, sectionMatches };
