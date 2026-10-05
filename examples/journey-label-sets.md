---
marp: true
theme: indaco
paginate: true
header: "Lattice · journey label sets"
---

<!-- _class: title silent -->

# Not every scale runs from pain to delight.

`Label sets · journey · the poles were an assertion`

The mood ramp's ends were two string literals, duplicated in both board
builders. They assert a polarity the engine cannot derive — and the ramp
decision record had already argued exactly that, about a different chart.

---

<!-- _class: journey -->
<!-- _footer: "Default · a customer journey really does run pain to delight" -->

## Onboarding, as a customer feels it.

- Discover
  - Search the docs `{who=user, mood=3}`
  - Read the guide `{who=user, mood=4}`
- Install
  - Run the installer `{who=user, mood=2}`
  - Repair the shell path `{who=user, mood=1}`
- Succeed
  - First green build `{who=user, mood=5}`

---

<!-- _class: journey -->
<!-- _footer: "Overridden · the same board, for an on-call rotation" -->

`[{1, Friction}, {5, Flow}]`

## The same board, for an engineer on call.

- Page
  - Alert fires `{who=sre, mood=2}`
  - Find the runbook `{who=sre, mood=1}`
- Triage
  - Reproduce the fault `{who=sre, mood=3}`
  - Size the blast radius `{who=sre, mood=3}`
- Resolve
  - Ship the fix `{who=sre, mood=4}`
  - Write the postmortem `{who=sre, mood=5}`

---

<!-- _class: journey -->
<!-- _footer: "Partial · name one pole, keep the other" -->

`[{1, Blocked}]`

## Naming one pole leaves the other alone.

- Request
  - Submit the form `{who=ops, mood=2}`
  - Wait for approval `{who=ops, mood=1}`
- Fulfill
  - Provision access `{who=ops, mood=4}`
  - Confirm with the requester `{who=ops, mood=5}`

---

<!-- _class: journey curve -->
<!-- _footer: "curve · the key follows every variant" -->

`[{1, Cost}, {5, Value}]`

## Every variant gets the same key.

- Evaluate
  - Trial the product `{who=buyer, mood=3}`
  - Compare vendors `{who=buyer, mood=2}`
- Commit
  - Negotiate terms `{who=buyer, mood=3}`
  - Sign the contract `{who=buyer, mood=4}`
- Expand
  - Add a second team `{who=buyer, mood=5}`

---

<!-- _class: list -->
<!-- _footer: "What the label set changed here" -->

## What changed.

- The poles are a default the manifest declares, not an assertion
- Naming one pole leaves the other on its default
- Only the two poles take words; the steps between carry their number
- The rename reaches the key's accessible name, so both agree
- One builder now, where the two board shapes each had their own copy
