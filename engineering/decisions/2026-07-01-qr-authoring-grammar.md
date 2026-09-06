---
status: in-progress
summary: One postfix-key authoring convention across the whole QR family — every structured item is a flat `- value `key`` bullet (no colons, no nesting). `wifi`/`contact` are dedicated structured components (shipped, #649); the general url/text QR is a `qr` variant on existing hosts (`closing qr`, `divider qr`, `split-panel qr`), where the host owns Function/Form and the variant adds only the code. Hardened by an adversarial red-team + independent checker: the general path REUSES the shipped rendered-HTML parse kernel (never a second raw-source parser, HARD RULE #1); a bare-URL bullet auto-resolves as the payload (an `<a>`-rendered value contributes its `href`); the caption is a flat optional `caption` key (superseding an earlier fragile nested child); and every previously-silent ambiguity — missing/duplicate/empty payload, reserved-word metric, metric overflow — becomes a loud lint diagnostic.
---

# QR authoring grammar — one convention across the qr family

**Status:** ratified. `wifi` + `contact` shipped (PR #649); the general url/text
`qr` variant is designed here and deferred to a follow-up branch (it reuses the
`lib/engine/qr.js` encoder, so it lands after #649 merges — one feature, one PR,
HARD RULE #17).

This doc is the durable contract for how an author writes any QR-bearing slide.
It was hardened by an adversarial red-team + an independent checker pass on the
prototype parser (see § Red-team). Read it before implementing the general `qr`
variant.

---

## 1. The model — two shapes, one convention

QR splits by **payload structure**, which coincides with **specialization**:

| | Structured → specialized | Unstructured → general |
|---|---|---|
| Payloads | `wifi`, `contact` | url, text |
| Fit | **dedicated components** (a function + a card form + a field schema) | a **`qr` variant** on existing host components |
| Components | `wifi`, `contact` (shipped) | `closing qr` · `divider qr` · `split-panel qr` |

The QR renderer (`lib/engine/qr.js`) and the parse/section kernel
(`lib/components/connect/_qr-card/qr-card.js`) are **shared infrastructure** all
of these call. `wifi`/`contact` are not "qr variants"; they are components that
*embed* the QR element, the way a slide embeds inline math.

**Why the general url/text is a variant, not its own component:** a lone URL has
no schema to model, and the three designs (closing / divider / companion) are
*existing layouts with a QR added*, not new layouts. Making url/text its own
component forced form (`divider`, `split`) into variant tokens — an axis-mix we
rejected. So the host component owns Function/Form/Finish; the `qr` variant adds
only the code. The companion is `split-panel qr` (its optional metrics are
split-panel's native content, not a QR concern).

---

## 2. The one authoring convention

**Every structured item is a flat bullet: `- <value> \`<key>\``** — value first, a
trailing inline-code key. No colons. No nesting. This is identical across the
whole family, so an author who learned `wifi` already knows `qr`.

Reserved keys:

| Key | Meaning | Where |
|---|---|---|
| `ssid` `password` `security` (+ aliases) | Wi-Fi fields | `wifi` |
| `name` `title` `org` `email` `phone` `url` (+ aliases) | vCard fields | `contact` |
| `caption` | the optional call-to-action under the QR | **whole family** |
| `qr` | force this bullet to be the QR payload | general `qr` |
| *(any other key)* | a metric: `value` + `label` | `split-panel qr` |

The eyebrow is authored the Lattice-standard way — an **optional inline-code-only
first line** (`` `Room Wi-Fi` ``) — not a bullet.

**No unauthored text (load-bearing).** A QR card renders *only* what the author
wrote. Every visible string is an authored field: the eyebrow and `caption` are
optional (omit them → they don't render); field rows (e.g. wifi's Security) show
the authored value verbatim — no appended hints, no editorial defaults, no
"type it if you prefer". The only fixed chrome is the field *labels* derived from
the keys the author did write (NETWORK ← `ssid`, etc.). This was a real defect in
the first shipped cut and is now the contract.

### 2.1 Per-variant

**`wifi` / `contact`** (shipped) — a flat field list:
```
<!-- _class: wifi -->
## Join the room.
- Offsite-Guest `ssid`
- boardroom2026 `password`
- WPA2 `security`
```

**`closing qr` / `divider qr`** — host prose + a payload (+ optional caption):
```
<!-- _class: closing qr -->
`Q3 Board Review`
## Take the deck with you.
Every slide, the appendix, and the workbook — before you go.
- https://laticent.io/decks/q3
- Scan to open `caption`
```

**`split-panel qr`** (the companion) — claim + optional metrics + payload:
```
<!-- _class: split-panel qr -->
`Revenue model`
## The full build is in the workbook.
Every line traces to a driver you can open — three scenarios off one shared set.
- 142% `Net revenue retention`     ← metric (optional, 0+)
- $48M `FY27 ARR, base case`       ← metric
- https://laticent.io/appendix/model   ← payload (bare URL auto-resolves)
- Scan for the live model `caption`         ← caption (optional)
```

Eyebrow = an inline-code-only first line (optional). Heading = `## h2`
(**required** — a missing heading is a lint error, not a blank card).

---

## 3. Payload resolution

- A **bare-URL bullet auto-resolves** as the payload (`- https://…` with no key).
- The **`qr` key forces** a bullet to be the payload — needed only to encode a
  non-URL string that would otherwise read as text or a metric.
- **Type is detected from the value:** `http(s)://…` → URL (opens a browser),
  anything else → literal text.
- If the value renders as a link (`[label](url)` or an autolink `<url>`), the
  **`href` is encoded, not the link text** (see § Red-team P2).

---

## 4. The parse contract (HARD RULE #1)

The general `qr` path **reuses the shipped rendered-HTML kernel** — it must NOT
fork a second raw-source parser. Both the red-team and the independent checker
found that a raw-regex parser silently corrupts payloads; the shipped
`parseFields` already reads rendered HTML correctly:

- Take the **last `<code>`** in a list item as the key; the remainder is the value
  (so a value containing inline code doesn't mis-split).
- **Decode entities** (`&amp;` last) and **strip tags**; **collapse `\r\n\t`** in a
  value so a soft line-break can't inject into a `WIFI:`/vCard/URL line.
- For a payload rendering as `<a>`, read `href`.
- **Escape** every displayed value (fields, metrics, caption) before it enters HTML.
- Encode with the shared `qrSvg` defaults (`ecLevel: 'M'`, `margin: 3`) — never
  ad-hoc.

---

## 5. Red-team hardening — the guards (all silent failures become loud)

The grammar's central weakness was that ambiguous authoring failed **silently**.
Every one of these must be a lint diagnostic, never a quiet mis-render:

| Guard | Trigger | Diagnostic |
|---|---|---|
| Missing payload | a `qr` variant with no resolvable URL/`qr` bullet (the #1 real-world mistake — author writes `- url` in the heading, or forgets it) | **error** |
| Duplicate payload | more than one `qr` / URL payload bullet | **error** |
| Empty payload | `- \`qr\`` with no value | **error** |
| Reserved-word metric | a metric labeled `qr` or `caption` | **warn** (it's hijacked) |
| Metric capacity | more metrics than `split-panel`'s left frame holds (~2) | **warn** (`capacity-overflow`) |
| Caption length | caption longer than the tile width | **warn** |

Rules live in `lib/authoring/lint-core.js` (HARD RULE #7 — pure, shared by CLI /
`validate()` / browser).

---

## 6. Decisions the red-team forced

1. **Flat `\`caption\`` supersedes a nested child.** An earlier sketch put the
   caption as a nested bullet under the payload. The red-team showed it was
   adjacency-fragile (a blank line dropped it) and the *only* nesting in the
   grammar — an author would type it flat and get a metric. Flat `\`caption\``
   parses identically to every other field and matches `wifi`/`contact` exactly.
2. **Auto-detect the URL payload; don't rely on an invisible `qr` token.** The
   trailing `qr` marker is invisible in rendered output and unlike how anyone
   conceives "the QR is this URL," so a bare URL must resolve, and its absence
   must error.
3. **One parser, rendered-HTML, reused.** No second raw-source parser.

---

## 7. Deferred / open

- Implementation of `closing qr` / `divider qr` / `split-panel qr` — a follow-up
  branch off `main` after #649 merges (reuses `qr.js` + `_qr-card`).
- `split-panel`'s left-frame metric slot — the two figures need a home in the
  featured panel (ride the lede vs a small metric row); pin down when building.
- Whether `closing`/`divider` ignore stray metric bullets or lint them.
