# wifi

> A network join card: readable Wi-Fi credentials beside a QR a phone scans to connect in one tap.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `reference` · `onboarding` · `kickoff`

Use to get a room onto the Wi-Fi without reading a password aloud. The QR encodes the standard WIFI: payload; the same details render legibly for anyone typing them by hand. Author the fields as a postfix-key list.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | The card heading (e.g. "Join the room."). |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field: `- Offsite-Guest `ssid``. Keys: ssid\|network (required), password\|pass, security\|auth. Omit the password for an open network. Optional keys: `caption` (CTA under the QR); the security row shows exactly what you write. |
| `eyebrow` | `p:first-child > code` | no | Optional kicker above the heading, authored as an inline-code first line: `` `Room Wi-Fi` ``. |
| `caption` | `ul > li` | no | Optional call-to-action under the QR, as a postfix-key bullet: ``- Scan to connect `caption` ``. |

## When to use

- **Get the room connected.** Guests scan to join instead of squinting at a password on the slide — the credentials are still shown for anyone who prefers to type.
- **Open networks are one field short.** Drop the password bullet and the card renders an open network; the QR encodes it as `nopass`.

## When NOT to use

- **Not for secrets that outlive the room.** A rendered deck is persistent and shareable. Use it for guest/offsite networks, not for credentials that must not leak.
- **Don't bold the field values.** The value leads and the key trails as a small tag — ssid last, never first. Writing the key first, bolded, breaks the transform's postfix read.

## Authoring

```markdown
<!-- _class: wifi -->

`Room Wi-Fi`

## Join the room.

- Network-Name `ssid`
- network-password `password`
- WPA2 `security`
- Scan to connect `caption`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`contact`](../../connect/contact/contact.docs.md) — the card is a person's identity rather than a network

## Demo deck

See [wifi.gallery.light.pdf](./wifi.gallery.light.pdf) for rendered examples of every variant.
