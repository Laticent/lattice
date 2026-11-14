# contact

> An identity card that encodes a vCard: name, title and contact lines beside a QR that saves the presenter to a phone.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `reference` · `onboarding` · `kickoff`

Use as the "scan to add me" close or a speaker-intro slide. The QR encodes a vCard the audience saves in one tap, or, with `qr: tel`, a link that dials; the card shows the name as hero with title/org and a contact ledger. Author the fields as a postfix-key list. It reflows by canvas (side by side, then stacked) and holds at every venue.

## Agent contract

**By venue** no count budget. A fixed card, so there is no count budget. `npm run check:venue-conformance` checks its fit at every venue and canvas instead.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | no | Optional framing heading; the person's name is the visual hero, drawn from the `name` field. |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field: `- Sharmarke Aden `name``. Keys: name (required), title\|role, org\|company, email, phone\|tel\|voice, mobile\|cell, office\|work, url\|web\|site. Phone keys are separate lines, each typed in the vCard, and the ledger lists every line in the order you wrote it. Optional keys: `caption` (CTA under the QR) and `qr` (what the code carries: `vcard`, `tel` or `url`). |
| `caption` | `ul > li` | no | Optional call-to-action under the QR, as a postfix-key bullet: ``- Scan to add me `caption` ``. |

### Common mistakes

- **No field is tagged with the `name` key.** Every contact card needs exactly one field trailing `` `name` `` — without it the vCard has no identity and the hero name area renders empty.
- **The trailing key doesn't match a supported alias, e.g. `` `position` `` instead of `` `title`/`role` ``.** Only the documented keys are recognized (name, title|role, org|company, email, phone|tel|voice, mobile|cell, office|work, url|web|site, qr, caption) — an unrecognized key isn't mapped to any card field, so the whole bullet is silently dropped from both the rendered card and the vCard, not merely misplaced.
- **A full vCard QR on a `venue: hall` deck.** The code is dense and the room is far. Add `- tel `qr`` (the code dials the first phone line) or `- url `qr``; the card still lists everything.

## When to use

- **The scan-to-add-me close.** End a pitch or intro with a code the audience scans to save your contact, instead of trading business cards.
- **Show what you choose, encode the rest.** Every non-empty field goes into the vCard; the card foregrounds the name, title and org and lists email/phone/url beneath.
- **A hall or conference room.** A full vCard is a dense code (55-67 modules wide) and the back row cannot resolve it. Add `- tel `qr`` or `- url `qr``: the code carries only a phone link or a web address (27-35 modules, about 2.5 times larger per module) and the ledger still shows every field.
- **Phone numbers that differ.** Write each line with its own key (`mobile`, `office`, `phone`). Each becomes its own typed TEL entry in the vCard, and the card lists them in the order written.

## When NOT to use

- **Not a team roster.** One card is one person. For a set of people use an inventory layout; a contact card is a single identity.
- **Don't bold the field values.** The value leads and the key trails as a small tag — name last, never first. Writing the key first, bolded, breaks the transform's postfix read.

## Authoring

```markdown
<!-- _class: contact -->

## Add me.

- Full Name `name`
- Title `title`
- Organization `org`
- name@example.com `email`
- Scan to add me `caption`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`wifi`](./wifi.md) — the card is a network to join rather than a person

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/connect/contact>
