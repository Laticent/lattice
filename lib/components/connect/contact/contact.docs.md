# contact

> An identity card that encodes a vCard: name, title and contact lines beside a QR that saves the presenter to a phone.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `reference` · `onboarding` · `kickoff`

Use as the "scan to add me" close or a speaker-intro slide. The QR encodes a vCard the audience saves in one tap; the card shows the name as hero with title/org and a contact ledger. Author the fields as a postfix-key list.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | no | Optional framing heading; the person's name is the visual hero, drawn from the `name` field. |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field: `- Sharmarke Aden `name``. Keys: name (required), title\|role, org\|company, email, phone\|tel, url\|web. Optional key: `caption` (CTA under the QR). |
| `caption` | `ul > li` | no | Optional call-to-action under the QR, as a postfix-key bullet: ``- Scan to add me `caption` ``. |

### Common mistakes

- **No field is tagged with the `name` key.** Every contact card needs exactly one field trailing `` `name` `` — without it the vCard has no identity and the hero name area renders empty.
- **The trailing key doesn't match a supported alias, e.g. `` `position` `` instead of `` `title`/`role` ``.** Only the documented keys are recognized (name, title|role, org|company, email, phone|tel|mobile, url|web|site, caption) — an unrecognized key isn't mapped to any card field, so the whole bullet is silently dropped from both the rendered card and the vCard, not merely misplaced.

## When to use

- **The scan-to-add-me close.** End a pitch or intro with a code the audience scans to save your contact, instead of trading business cards.
- **Show what you choose, encode the rest.** Every non-empty field goes into the vCard; the card foregrounds the name, title and org and lists email/phone/url beneath.

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

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`wifi`](../../connect/wifi/wifi.docs.md) — the card is a network to join rather than a person

## Demo deck

See [contact.gallery.light.pdf](./contact.gallery.light.pdf) for rendered examples of every variant.
