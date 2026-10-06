---
marp: true
theme: indaco
paginate: true
header: "Lattice · icons on hub-spoke"
---

<!-- _class: title silent -->

# A hub and its spokes can say what each one is.

`Lattice · icons on hub-spoke`

Hub-spoke takes the icons plugin's drawings: `\{icon=…}` puts one in a disc beside the name, and `\{icon=…, icon-only}` lets it stand in for the name.

---

<!-- _class: hub-spoke -->

`Data platform · Sources`

## Five systems feed the warehouse; one is behind.

- Warehouse `{icon=warehouse}`
  - Billing `{icon=invoice}`
  - Web store `{icon=cart}`
  - Mobile app `{icon=mobile}`
  - Call center `{icon=headphones}` `at-risk`
  - Partner feeds `{icon=exchange}`

*The icon sits inside its disc and the name stays beside it. A status still paints its own spoke, and the icon on it keeps 3:1 against the state color.*

---

<!-- _class: hub-spoke -->

`Partner ecosystem · By capability`

## Six partners cover three capabilities, two apiece.

- Lattice platform `{icon=apps}`
  - Northwind Data `{icon=database}` `Data`
  - Quarry Analytics `{icon=chart}` `Data`
  - Halcyon Pay `{icon=credit-card}` `Payments`
  - Ledgerline `{icon=bank}` `Payments`
  - Tessera Cloud `{icon=cloud}` `Infrastructure`
  - Pylon Networks `{icon=network}` `Infrastructure`

*A group disc keeps its hue and its key. The icon draws in the heading ink, which clears 3:1 on every group disc in every palette.*

---

<!-- _class: hub-spoke -->

`Release pipeline · Stages`

## Every stage of the release runs through the build service.

- Build service `{icon=build}`
  - Source `{icon=branch, icon-only}`
  - Tests `{icon=test, icon-only}`
  - Security scan `{icon=shield-check, icon-only}`
  - Package `{icon=package, icon-only}`
  - Deploy `{icon=rocket, icon-only}`
  - Monitor `{icon=monitor, icon-only}`

*`icon-only` drops the label beside the disc. The name is still the disc's hover title and what a screen reader says.*

---

<!-- _class: hub-spoke sized -->

`FY2026 · Partner channel revenue · share of $120M`

## Two partners carry half of channel revenue.

- Channel revenue `$120M` `{icon=coin}`
  - Atlas Distribution `28%` `{icon=truck}`
  - Keystone Resellers `22%` `{icon=store}`
  - Northgate Systems `18%` `{icon=server}`
  - Brightline Retail `13%` `{icon=cart}` `at-risk`
  - Summit Online `11%` `{icon=globe}`
  - Harborview Telecom `8%` `{icon=antenna}`

*Under `sized` the icon scales with its disc and stays inside a flagged disc's inner halo.*

---

<!-- _class: hub-spoke tiered -->

`Platform organization · Service ownership · 2026`

## Four platform teams own eleven services; two are in trouble.

- Platform org `{icon=building, icon-only}`
  - Payments `{icon=payment}`
    - Card issuing
    - Acquiring
    - Fraud scoring `at-risk`
  - Data `{icon=database}`
    - Warehouse
    - Streaming
    - ML platform
  - Identity `{icon=identity}`
    - Login
    - Consent
  - Core banking `{icon=bank}`
    - Ledger `blocked`
    - Accounts
    - Statements

*An `icon-only` hub draws the icon in place of its name. A branch's icon sits in its disc, and the leaves keep their names.*

---

<!-- _class: table table-fill -->

## A record that does not draw is coached, and the disc shows its name.

| Written on a row | `lint:deck` says |
| --- | --- |
| `\{icon=lambda}` | a service, not an icon: use `function` |
| `\{icon-only}`, no `icon=` | names no icon, so it shows its name |
| `\{icon=bucket, at-risk}` | a record carries `icon=` and `icon-only` only |
| `\{icon=database, icon-only}`, no name | no name: keep the words |

With the icons plugin off, every disc shows its name, exactly as if no icon were written.
