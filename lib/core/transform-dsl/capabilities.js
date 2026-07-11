/**
 * Transform-DSL capability registry — §8 of
 * `engineering/decisions/2026-06-29-component-transform-dsl.md`.
 *
 * The declarative core (extract/wrap/…) is deliberately INERT — no codegen, no
 * measurement, no URL resolution. Everything imperative is reached BY NAME from a
 * rule (`{ "capability": "panel-eyebrow" }`) through this CLOSED first-party
 * allowlist. The manifest *wires* a capability; it never *contains* one. An
 * unknown name is rejected by the schema before the interpreter runs.
 *
 * This is the headroom hinge: a power we can only do in reviewed JS becomes
 * declaratively wireable the moment it is registered here — with no grammar
 * change and no widening of the untrusted surface.
 *
 * PROTOTYPE (§11): exactly one real capability — `panel-eyebrow` — proving the
 * bridge composes with the declarative extract/wrap ops on a real component
 * (split-panel). Each capability:
 *   • operates on the matched section's OWN DOM scope (section-scoping holds);
 *   • is DOM-based, so the string path and the runtime path share its code
 *     (parity by construction);
 *   • inherits the render-guard budget via `ctx.spend()`;
 *   • emits only allowlisted elements, and validates any URL before emitting
 *     (none here — `panel-eyebrow` is text-only).
 *
 * No dependency on `schema.js` (it depends on us) — keep this leaf-level.
 */

/** The single code-only `<p><code>…</code></p>` lead, if present (the eyebrow source). */
function findCodeOnlyP(scope) {
  return [...scope.children].find(
    el => el.tagName === 'P' && el.childNodes.length === 1 && el.firstChild && el.firstChild.tagName === 'CODE',
  );
}

/**
 * panel-eyebrow — convert the lead code-only paragraph into a
 * `<span class="panel-eyebrow">` carrying its (escaped) text, in place. This is
 * the one imperative bit of split-panel's left feature: text extraction + a
 * styled re-tag, which the inert grammar deliberately can't express as a single
 * op. Idempotent (a second pass finds no code-only `<p>` and no-ops).
 */
function panelEyebrow(scope, ctx) {
  const doc = scope.ownerDocument || scope;
  const codeP = findCodeOnlyP(scope);
  if (!codeP) return;
  ctx.spend(1);
  const span = doc.createElement('span');
  span.className = 'panel-eyebrow';
  span.textContent = codeP.textContent; // textContent → escaped text, never raw markup
  codeP.replaceWith(span);
}

// The CLOSED allowlist. Unknown name → the schema rejects the manifest (§6/§8).
const CAPABILITIES = Object.freeze({
  'panel-eyebrow': panelEyebrow,
});

const CAPABILITY_NAMES = new Set(Object.keys(CAPABILITIES));

/** Resolve a capability by name, or null if not registered. */
function getCapability(name) {
  return Object.hasOwn(CAPABILITIES, name) ? CAPABILITIES[name] : null;
}

module.exports = { CAPABILITIES, CAPABILITY_NAMES, getCapability };
