# gift-card

> A business card whose QR opens a Lattice gift link: a warm line, the code, and a PIN when the link is locked.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `onboarding` · `reference` · `pitch`

Printed QR gift card. `tools/gift-cards.mjs` writes one card per slide at the `card` or `card-iso` size; the QR carries the whole gift link (a spend-capped OpenRouter key in the URL fragment), and the link is never printed as text. Author the fields as a postfix-key list, the link inside a code span.

## Agent contract

**By venue** no count budget. A fixed card, so there is no count budget. `npm run check:venue-conformance` checks its fit at every venue and canvas instead.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | no | The card's line (e.g. "Make your next deck with Lattice."). |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field. Keys: link\|url (required; the gift link, written inside a code span: ``- `https://lattice.style/gift#v1.…` `link` ``), pin (printed apart from the code when the link is locked), caption, number\|no. The link goes into the QR only and is never shown as text. |
| `eyebrow` | `p:first-child > code` | no | Optional kicker above the heading, as an inline-code first line: `` `A deck on us` ``. |
| `caption` | `ul > li` | no | Optional line under the heading, as a postfix-key bullet: ``- Scan to start. `caption` ``. |

### Common mistakes

- **Writing the link without a code span.** A gift link can hold underscores, which Markdown may read as emphasis and drop, so the QR would carry a broken link. Wrap it in backticks: ``- `https://…` `link` ``.
- **No `link` bullet.** Without a link there is nothing to encode, and the slide renders as authored, not as a card.

## When to use

- **Hand out a trial in person.** A card a visitor scans in a café opens the Studio with a model key ready and nothing to sign up for. The giver's OpenRouter account pays, capped per card.
- **Lock a card with a PIN.** Add a `pin` bullet and the card prints it apart from the code, so a photo of the QR alone opens nothing. The CLI's `--pin` writes both.

## When NOT to use

- **Not for a slide you show.** It is sized for print. On a projected deck, use the contact card with a web link instead.
- **Never print the link as text.** The link is a working key. Keep it in its own bullet, where it becomes only a QR code.

## Authoring

```markdown
<!-- _class: gift-card -->

`A deck on us`

## Make your next deck with Lattice.

- `https://lattice.style/gift#v1.…` `link`
- Scan to start. `caption`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`contact`](../../connect/contact/contact.docs.md) — the card is a person's identity, not a gift

## Demo deck

See [gift-card.gallery.light.pdf](./gift-card.gallery.light.pdf) for rendered examples of every variant.
