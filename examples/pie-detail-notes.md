---
marp: true
theme: indaco
pagination: true
---

<!-- _class: title silent -->

# Per-slice detail, in the PDF.

`piechart · speaker-notes channel`

A pie slice can carry an indented sub-list. On screen it reveals on hover/tap; in the exported PDF it rides the slide's **speaker note** — so a reader gets the context off the slide face, and the chart pixels stay byte-identical.

---

<!-- _class: statement silent -->

## One source, two surfaces.

The sublist under a slice powers **both** the Present-mode reveal popover **and** the static-PDF speaker note (`Label (value): item · item`). Open this PDF's note annotations — or the `.notes.txt` sidecar — to read each slice's detail.

---

<!-- _class: piechart -->

`FY26 · $4.2M infrastructure`

## Where the infrastructure budget goes.

The chart shows the split; the notes carry the why.

- Cloud `46%`
  - Mostly AWS reserved instances on a 3-year commit.
  - 120 person-hours/mo of platform on-call.
- On-prem `30%`
  - Two datacenters, both depreciating through FY27.
- Edge / CDN `24%`
  - Cloudflare + Fastly, split for redundancy.

---

<!-- _class: piechart donut -->

`Q2 · 1,840 person-hours`

## How the planning quarter was actually spent.

Nearly half went to producing decks; deciding was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each.
- Meetings about meetings `22%`
  - 410 hours across 6 standing forums.
- Realigning on priorities `18%`
- Actually deciding `5%`
  - The part everyone remembers.

---

<!-- _class: piechart -->

`Pipeline · 312 opportunities`

## Where deals stall in the funnel.

- Discovery `38%`
  - Avg 21 days; the longest single stage.
- Procurement `27%`
  - Legal + security review is the bottleneck.
- Pilot `21%`
- Closed-won `14%`

---

<!-- _class: piechart -->

`Headcount · 240 FTE`

## How the org splits by function.

No sublists here — so this pie emits **no note** and exports exactly as a plain pie always has.

- Engineering `44%`
- Go-to-market `31%`
- Operations `15%`
- G&A `10%`

---

<!-- _class: title silent -->

# Read the notes.

`open the annotations`

The detail never crowds the boardroom slide — it waits in the speaker-notes channel for the reader who wants it.
