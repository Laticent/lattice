# team-profile

> A roster of named people, each under a portrait, with the role they own.

**Function** inventory · **Form** grid · **Substance** structure

**Tags** `org-chart` · `onboarding` · `kickoff` · `pitch`

Use for the people slide — 'meet the leaders', 'your account team', the QBR roll-call. Each person is a portrait, a name, a role and one line. Anyone with no photo gets a monogram of their initials instead, so a half-photographed roster still reads as one designed wall rather than a set of holes: the monogram stays quiet beside real faces, and takes a categorical hue only when nobody in the roster has a photo.

## Agent contract

**Capacity** ~6 items (over 12 overflows) — past that, actors / list-tabular / split across slides.

**Density** aim ~12 words per item; past ~14 it reads as a wall of text — one clause on what this person owns, not a paragraph — and the count includes the name and the image reference beside it, so about four of the allowance is fixed cost before a word of prose.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p > code:only-child` | no | Optional kicker above the headline — a short label in backticks, e.g. `Your account team`. |
| `title` | `h2` | no | Optional headline above the roster. A claim earns its place ('Six people own this program end to end'); a bare label ('The team') does not. |
| `people` | `ul > li` | yes | One top-level bullet per person, and the bullet IS their name. Everything about them nests under it. |
| `portrait` | `ul > li > ul > li > img` | no | The person's photo, nested under their name as `- ![](photo.jpg)`. Leave the alt empty — the name beside it is the accessible label. Omit it entirely and the engine draws a monogram from the initials instead. |
| `role` | `ul > li > ul > li > code` | no | The one backticked nested line is the role, set as a small tracked label under the name — `` `Head of Delivery` ``. Deliberately not a pill: a boxed chip under every one of twelve faces competes with the portraits it is meant to caption. |
| `note` | `ul > li > ul > li` | no | Any remaining plain nested line is the note: one short line on what this person owns. |
| `side` | `h3` | no | `sides` only. Two `### ` subheadings, each followed by its own list, label the two rosters ('Your team' / 'Our team'). |

### Variant decision rule

- **default (no modifier).** Three to six people who each need a face, a role and one line — the workhorse 'meet the team' roster.
- **`lead`.** One person is accountable and the rest report into the work: the hero cell and the rule beneath it say so without a sentence.
- **`bench`.** The roster runs past eight and the notes matter less than the breadth — six up, face and role only.
- **`sides`.** Two teams meet: the QBR roll-call, a joint steering group, a vendor and a client side that need labelling.
- **`bio`.** Four or fewer leaders who each need a real line, and the roles read better scanned down a column than centered under a face.

### Common mistakes

- **Leading with the portrait instead of the name.** The top-level bullet is the person's NAME (`- Ada Okafor`); the portrait, role and note all nest under it. Writing `- ![](ada.jpg)` at the top level makes the photo the person and leaves the card with no name.
- **Writing the role as plain nested text instead of backticks.** The one backticked nested line is the role, set as the label under the name. Written plain it becomes a second note line, so the card shows two body lines and no role.
- **Filling the alt text on the portrait.** Write `![](photo.jpg)` with an empty alt. The name is set right beside the face and IS the accessible label, so alt text only makes a screen reader say it twice — the engine drops it either way.
- **Adding a KEY INSIGHT or a closing note to a full six-person roster.** The coda cell takes its height out of the stage, so the second row clips. Drop to four people, move the line into the headline, or switch to `bench`, whose rows are half the height.

## Authoring

```markdown
<!-- _class: team-profile -->

`Your account team`

## The claim the roster backs up.

- First person
  - ![](portrait.jpg)
  - `Their role`
  - One line on what they own.
- Second person
  - ![](portrait-2.jpg)
  - `Their role`
  - One line on what they own.
- Third person
  - `Their role`
  - One line on what they own.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  YOUR ACCOUNT TEAM                      │
│  Six people own this program.           │
│                                         │
│      ( o )       ( o )       ( o )      │
│       Ada        Marcus      Priya      │
│    (Sponsor)   (Director)  (Delivery)   │
│      Clears     Runs the     Staffs     │
│    blockers.    cadence.   the pods.    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `lead` — lead

The first person takes a hero cell; the rest rank beneath.

```markdown
<!-- _class: team-profile lead -->

`team-profile lead`

## lead gives the first person the hero cell and ranks the rest beneath.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
  - Signs the scope and owns the outcome.
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
- Nia Bello
  - ![](nia.svg)
  - `Data Lead`
```

### `bench` — bench

The long roster, packed to a face, a name and a role.

```markdown
<!-- _class: team-profile bench -->

`team-profile bench`

## bench packs the long roster down to a face, a name, and a role.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
- Hana Suzuki
  - `Field Engineer`
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
- Owen Adeyemi
  - `Revenue Ops`
- Nia Bello
  - ![](nia.svg)
  - `Data Lead`
- Jonah Reyes
  - ![](jonah.svg)
  - `Customer Success`
- Clara Nunes
  - `Quality Lead`
- Sofia Marchetti
  - ![](sofia.svg)
  - `Security Lead`
- Kenji Sato
  - ![](kenji.svg)
  - `Support Manager`
- Idris Khan
  - `Release Manager`
```

### `sides` — sides

Two labeled rosters facing each other across the slide.

```markdown
<!-- _class: team-profile sides -->

`team-profile sides`

## sides faces two rosters across the table, each under its own label.

### Your team

- Ada Okafor
  - `VP Operations`
- Priya Raman
  - `Head of Delivery`
- Nia Bello
  - `Data Lead`

### Our team

- Marcus Vale
  - `Account Director`
- Tomas Lindqvist
  - `Solutions Architect`
- Jonah Reyes
  - `Customer Success`
```

### `bio` — bio

One person per row, with room for a real sentence.

```markdown
<!-- _class: team-profile bio -->

`team-profile bio`

## bio turns the grid on its side and gives the note a line of its own.

- Ada Okafor
  - ![](ada.svg)
  - `Executive Sponsor`
  - Fifteen years running operations across forty sites.
- Marcus Vale
  - ![](marcus.svg)
  - `Program Director`
  - Landed this migration twice under a regulator.
- Priya Raman
  - ![](priya.svg)
  - `Head of Delivery`
  - Owns the pods and the board date.
- Tomas Lindqvist
  - ![](tomas.svg)
  - `Solutions Architect`
  - Wrote the spec the plan hangs from.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Demo deck

See [team-profile.gallery.light.pdf](./team-profile.gallery.light.pdf) for rendered examples of every variant.
