---
status: proposed
summary: >
  The app has one shadcn `Button` with six variants and no written rule for which
  means what. `secondary` fills with `--bg-alt`, 1.09:1 against a dialog surface in
  Cuoio light, so it all but disappears; `outline` is used for Cancel, for supporting
  actions and, by look, for form fields; 242 raw `<button>` elements bypass the
  component. Proposed: Primary `default`, Secondary `outline`, Cancel `ghost`,
  Destructive `destructive`, Tertiary `link`; retune `secondary`; add a lint gate for
  hand-styled buttons. Proposal only. Nothing here is built.
---

# One button convention: primary, secondary, cancel

## 1. The symptom

Building the Library's photo detail view, we could not say which button variant a
"Suggest with AI" action should use, and the first two choices read wrongly:

- `secondary` (a filled button) nearly vanished against the dialog in light theme.
- A small `outline` button on a label row read as a pill, not a button, on a phone.

The owner asked whether Lattice and shadcn have the usual primary, secondary and
cancel roles. They have two of the three, and no document says how to use them.

## 2. What the code does today

`docs/src/components/ui/button.tsx` is the shadcn `Button`. Its variants and what each
resolves to through the bridge in `docs/src/styles/tailwind.css`:

| Variant | Fill | Notes |
|---|---|---|
| `default` | `--accent` (gold) with `--on-accent` text | Primary. |
| `secondary` | `--bg-alt` with `--text-heading` text | The same token as `--color-card` and `--color-muted`. |
| `outline` | transparent, `border`, `shadow-xs` | The same border token the inputs use. |
| `ghost` | transparent, hover fill | |
| `destructive` | `--lx-ui-destructive` | |
| `link` | text only | |

Counts over `docs/src/components` (a `grep` of `<Button … variant="…">`, rerunnable):

| Use | Count |
|---|---|
| `default`, written out or left implicit | about 53 (no `variant` prop) |
| `outline` | 38 |
| `ghost` | 39 |
| `secondary` | 2 |
| `destructive` | 2 |
| `link` | 1 |
| raw `<button>` elements, not `Button` | 242 |

Every explicit Cancel, Close or Dismiss `Button` (3 of them) is `outline`. That is a
habit, not a rule.

## 3. What is wrong

1. **`secondary` cannot be seen.** In Cuoio light, `--bg-alt` is `#F3EDE4` and the
   dialog surface (`--bg`) is `#FAF7F2`: a 1.09:1 contrast ratio. Cards use the same
   fill, so a secondary button on a card has no contrast at all. Two call sites use
   it; the others learned to avoid it.
2. **`outline` carries three meanings.** It is Cancel, a supporting action, and (by
   appearance) an input. An outline button beside an input with the same border and
   height reads as one more field.
3. **Cancel has no variant.** Nothing separates "dismiss" from "do a lesser thing".
4. **242 raw buttons** each carry their own classes, so they cannot follow any rule
   changed in `button.tsx`.

## 4. Proposal

| Role | Variant | Use it for |
|---|---|---|
| Primary | `default` | The one action a surface exists for: Save, Add, Present. One per surface. |
| Secondary | `outline` | A supporting action: Suggest with AI, Use as description, Add image. |
| Cancel | `ghost` | Dismissing without acting: Cancel, Close, Not now. It sits beside Primary and recedes. |
| Destructive | `destructive` | Delete, Disconnect, Clear. |
| Tertiary | `link` | An inline "Learn more". |

Sizes: `default` (h-9) for form and dialog actions, so a button is the height of the
inputs beside it; `sm` (h-8) only in dense rows; `icon` sizes for icon-only controls.

Three changes follow:

1. **Retune `secondary`** so it holds at least 3:1 against `--bg` and against
   `--bg-alt`, in light and dark, in every palette (the contrast tooling already
   measures token pairs). Retuning is better than leaving a variant nobody dares use.
2. **Document the table** in `engineering/development.md` and as a comment above
   `buttonVariants`, so the rule sits where the variants are.
3. **Gate hand-styled buttons.** A check in `tools/check-ownership.js`, like the hex
   and margin gates, that fails a raw `<button>` whose classes duplicate what
   `Button` provides, with a budget (the 242 today) that ratchets down and an allowlist
   for the cases that are not buttons (tabs, menu items, toggles).

## 5. Options not taken

- **Add a `cancel` variant.** It is `ghost` under another name, and a variant per role
  grows without end. A rule over the existing variants is cheaper.
- **Make Cancel `outline`**, as the code does now. It keeps the overload in section 3
  and puts a bordered Cancel next to a bordered Secondary.
- **Leave it.** The cost is a fresh argument each time a dialog is built.

## 6. Reach and sequencing

This changes how every dialog looks (Cancel moves from `outline` to `ghost`; `secondary`
changes fill), so it is not part of any feature PR. Suggested order, each its own PR:

1. This note, approved or amended.
2. The `secondary` retune, with before and after screenshots of the dialogs that use it
   at 1440, 820 and 390 px in both modes.
3. The Cancel migration (the explicit Cancel/Close buttons), then the lint gate with its
   budget, then raw buttons migrated in batches that the budget ratchets.

## 7. Decisions needed

- Is Cancel `ghost`, as proposed, or should it stay `outline`?
- Is the target for `secondary` 3:1 against both surfaces, or should it stay a quiet fill?
- Does the raw-button gate start at a budget of 242, or does the owner want a faster
  migration first?
