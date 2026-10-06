---
marp: true
theme: indaco
paginate: true
header: "Lattice · icons in charts"
---

<!-- _class: title silent -->

# A node can say what it is before you read it.

`Lattice · icons in charts`

The flowchart and the state chart take the icons plugin's drawings: `icon=` beside the name, `icon-only` in its place.

---

<!-- _class: flowchart lr -->

`System map`

## Uploads reach the warehouse in under a minute.

- Browser `{icon=browser}` => Gateway
- Gateway `{diamond, c2, icon=gateway}` => Queue
- Queue `{icon=queue}` => Worker
- Worker `{c3, icon=function}` => Warehouse
- Warehouse `{cylinder, icon=warehouse}`
- Raw uploads `{c4, icon=bucket}` -> Worker

*`icon=` sits before the name in a left-to-right chart. Inside a node the icon is bare, in the name's ink: the node is already the tile.*

---

<!-- _class: flowchart tb -->

`Paging`

## Every page reaches a human within 15 minutes.

- Alert fires `{pill, icon=notification}` => Severity?
- Severity? `{diamond, icon=scale}`
  - =SEV1=> Page on-call
  - -SEV2-> Open ticket
- Page on-call `{fail, icon=mobile}` => Mitigate
- Open ticket `{icon=mail}` -> Mitigate
- Mitigate `{icon=refresh}` => Postmortem
- Postmortem `{doc, icon=search}`

*Pinned `tb`, the icon sits above the name. The layout places it; the author only names it.*

---

<!-- _class: flowchart lr -->

`Clients`

## Three clients share one API.

- Clients `c1`
  - Phone `{icon=mobile, icon-only}`
  - Laptop `{icon=browser, icon-only}`
  - Terminal `{icon=code, icon-only}`
- Clients -> API
- API `{c2, icon=api}` => Users
- Users `{cylinder, icon=users}`

*`icon-only` draws the icon alone. The name stays as the hover title and as what a screen reader and the chart's description say.*

---

<!-- _class: state-chart lr -->

`Order lifecycle`

## An order moves from cart to doorstep in four steps.

- Cart `{start, icon=cart}`
  - -pay-> Paid
- Paid `{on-track, icon=credit-card}`
  - -pack-> Packed
- Packed `{icon=package}`
  - -ship-> Shipped
- Shipped `{c3, icon=truck}`
  - -deliver-> Delivered
- Delivered `{end, done, icon=home}`

*The state chart reads the same two words in the same record as its lead words and statuses.*

---

<!-- _class: state-chart inline -->

`Order lifecycle`

## The inline rows carry the icon in the label.

- Cart `{start, icon=cart}`
  - -pay-> Paid
- Paid `{on-track, icon=credit-card}`
  - -ship-> Shipped
- Shipped `{c3, icon=truck}`
  - -deliver-> Delivered
- Delivered `{end, done, icon=home}`

---

<!-- _class: flowchart lr icon-etching -->

`Look`

## The deck's icon look still thins the line.

- Browser `{icon=browser}` => Gateway
- Gateway `{c2, icon=gateway}` => Worker
- Worker `{c3, icon=function}` -> Warehouse
- Warehouse `{cylinder, icon=warehouse}`

*`icon-etching` on this slide (or `icon: etching` on the deck) draws every node icon at the thinner etching stroke.*

---

<!-- _class: table table-fill -->

## A name that does not draw is coached, and the node shows its text.

| Written on a shape row | `lint:deck` says |
| --- | --- |
| `\{icon=lambda}` | a service, not an icon: use `function` |
| `icon-only`, no `icon=` | names no icon, so it shows its text |
| `\{icon=database}` on a group | a group's title draws no icon |
| `\{icon=database, icon-only}`, no name | no name: keep the words |

With the icons plugin off, every node shows its name, exactly as if no icon were written.
