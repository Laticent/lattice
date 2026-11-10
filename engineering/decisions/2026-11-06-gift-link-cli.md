---
status: proposed
summary: A stateless "gift link" lets anyone share a spend-capped OpenRouter key made from their own account; an admin CLI creates the keys, renders business cards with a QR code as a Lattice deck, and writes a CSV; the Studio reads the key from the link's fragment. Short typed codes are ruled out without hosted state.
---

# Gift links: a stateless way to share a capped OpenRouter key

**Asked (2026-11-06).** The owner wants people to try Lattice with almost no friction: hand out
business cards in coffee shops whose QR code opens Lattice with a working model key already
set, so the visitor feels welcomed rather than sold to. Lattice stays fully bring-your-own-key
(BYOK) and owns nothing: the giver's own OpenRouter account pays, and the same tool lets anyone
share a key with a friend. The owner asked for a CLI that makes the keys and the cards, with a
CSV, one key by default and many on request, and for the card itself to be a Lattice deck at
business-card size.

**Settled in the conversation (2026-11-06):**

| Question | Answer |
|---|---|
| Hosted state (a server, a table of codes) | **None.** The design must be stateless |
| Short typed codes like `BREW-7K4Q` | **Dropped.** Stateless rules them out (§2) |
| Spending cap per card | **$1**, enforced by OpenRouter on the key itself |
| What the card leads with | The QR code; nothing to type |
| How keys are made | An admin CLI using the giver's own OpenRouter **management key** |
| Card rendering | Reuse Lattice: the cards are a deck, one card per slide |
| Output | The cards (PDF) and a CSV; one key by default, `--count N` for a batch |

## 1. What a gift link is

A gift link is a Lattice URL with the key after the `#`:

```
https://<lattice site>/gift#v1.<key bytes, base64url>.<check>
```

- **The key travels in the fragment.** Browsers never send the part after `#` to the server,
  so Lattice's site never receives the key in a request or a log. The page reads it in the
  browser, stores it where a signed-in author's key goes, through the one writer for that slot
  (`writeOpenRouterKey` in `docs/src/lib/openrouter-key.js`, which owns `lattice-db-or-key`),
  clears the fragment from the address bar, and opens the Studio.
- **The token is 51 characters** (69 with a PIN). The key's fixed prefix is dropped and its hex
  digits are packed as bytes, then written in base64url (§2). A QR code of that size is small and
  sparse, so it scans easily at business-card size. The exact layout is the header of
  `lib/core/gift-link.mjs`.
- **`v1` is a format version** and `<check>` is a short checksum, so a damaged or mistyped link
  fails with a clear message instead of storing a broken key.
- **An optional PIN** (for example 6 digits, printed apart from the QR) can lock the key in the
  link. It stops someone who only photographs the QR code. It does not stop a determined
  attacker, who can try every PIN offline; the spending cap is the real protection (§4).

One small module turns a key into a link and back. The CLI and the Studio both import it, so
the code that writes a card and the code that reads it cannot disagree (HARD RULE #1).

## 2. Why there are no short typed codes

A short code can only point to a key; it cannot contain one. The worked numbers:

- An OpenRouter key is a fixed prefix plus a random part. OpenRouter's OpenAPI spec for
  `POST /api/v1/keys` gives it as `sk-or-v1-` followed by 64 lowercase hex characters (32 bytes,
  256 bits; confirmed 2026-11-10, and the create response returns it once, as `key`, beside
  `data.hash`, the id that later deletes it). That can be written in no fewer than 43
  characters of base64url, 52 of typo-proof base32, or 24 common words.
- An 8-character code carries about 40 bits. Getting 256 bits back from 40 needs the missing
  bits stored somewhere: a lookup table.

The alternatives raised were each checked against that:

| Idea | Why it does not give a stateless short code |
|---|---|
| A deterministic hash, key → short code | It runs one way. Many keys share every code, and nothing in the code says which |
| Protobuf or Avro style encoding | They shrink by removing predictable structure (field names, small numbers). A key is random content with almost no structure; dropping the prefix and packing hex as bytes is all there is |
| Format-preserving encryption (NIST FF1, FF3-1) | Keeps the length exactly; it encrypts, it does not shorten |
| A vendor token vault | Short, but the vault is a hosted table: state |
| A "vaultless" codebook | The codebook is shared state, and the output keeps the input's length |
| A code → key table built into the Studio | The Studio is public, so the table is published, and it cannot know keys someone makes tomorrow; every new key means updating state we host |

So short and typeable means a table someone hosts; stateless means the key travels whole. The
owner chose stateless.

## 3. The admin CLI

A separate tool that lives only in this repository (for example `tools/gift-cards.mjs`, or a
small package with its own name). It is never part of the published `lattice` CLI, the docs
site or the tests: it creates keys on someone's account.

**Authentication.** OpenRouter's browser sign-in (OAuth PKCE, which the Studio already uses)
gives the person signing in a normal key on their own account; it cannot create keys. Creating
keys needs a **management key**, which the account owner creates once on OpenRouter's
Management API Keys page. A management key cannot run model calls; it only creates, caps,
lists and deletes keys, and it can be given an expiry. The CLI reads it from an environment
variable or asks for it, keeps it only on that machine, and never writes it to a file it
outputs.

**Commands (proposed):**

```
gift-cards make [--count 1] [--cap 1] [--label "coffee-2026-11"] [--expires 30d]
                [--size us|iso] [--pin] [--with-links] [--out ./gift-cards/]
gift-cards report [--label …]     # spend per key, from OpenRouter
gift-cards revoke [--label …]     # delete a batch's keys at OpenRouter
```

- **One key by default.** That is the "share with a friend" case: `make` also prints the gift
  link in the terminal, ready to paste into a message.
- **`--count N`** makes a batch for printing.
- **Outputs:**
  - `cards.md`, the deck; `cards.pdf`, rendered by the normal `lattice` render;
  - `cards.csv`, the giver's record: card number, key label, OpenRouter key id (enough to
    revoke), cap, created, expires. **The gift links are left out by default**; `--with-links`
    adds them. The PDF holds working keys inside its QR codes, so the tool says so: treat it
    like cash.

## 4. The security model: a gift card, not a password

- **Whoever holds the link can spend it.** A photo of the card is enough.
- **OpenRouter caps every key**, $1 by default, whatever happens to the card. A batch of 200
  cards can never cost more than $200. Measured on 2026-11-06 (PR #3049 §4.2): five model calls
  on Claude Haiku 5.5 cost $0.0056, about $0.001 per call, and a chat turn takes one or a few
  calls, so most cards will spend cents.
- **The giver can delete any key at any time**, from OpenRouter or with `gift-cards revoke`.
- **Lattice is never in the path.** It never receives the key in a request, so it cannot leak or
  misuse it. HARD RULE #24 is untouched: no key lives in the site, and the site spends nothing.
- **What it does not do:** limit a card to a number of devices, or switch off a code without
  deleting its key. Both need hosted state.

## 5. The card, as a Lattice deck

- **Already there:** a QR encoder (`lib/components/*/_qr-card/`, used by the `contact` layout,
  whose `qr: url` mode encodes just a link).
- **Missing: a business-card page size.** Sizes live in one registry, `lib/core/sizes.js`, which
  says a canvas we do not ship "is a request to add an entry here". Add `card` (US 3.5 × 2 in)
  and/or `card-iso` (85 × 55 mm).
- **A small `gift-card` component:** a warm line ("A deck on us"), the QR code, and one short
  note. With more than one key the deck repeats per key; for double-sided printing the front can
  be one shared slide and the backs carry the codes.
- **Printing.** Lattice's PDF export works in screen pixels. Two routes:
  - **Home printing first:** cards laid out on letter or A4 with cut lines. No export change.
  - **Print-shop PDF:** exact physical size, bleed and crop marks. That changes exported bytes,
    so the Quality Bar requires the owner's sign-off on real PDFs.

## 6. The Studio side

- A `/gift` route that reads the fragment with the shared module, stores the key with
  `writeOpenRouterKey(key, { minted: true })` (never a raw storage write), clears the
  fragment, and opens the Studio with the chat ready and a short welcome, with no signup.
- On a phone, the page says Lattice is at its best on a laptop and offers **Send to my laptop**
  through the phone's own share sheet (AirDrop, Messages, email to yourself). The person's own
  channels carry the link; Lattice stores nothing.
- **A fresh key may not work at once.** OpenRouter can refuse a newly created key for a minute
  or two while it activates (`OPENROUTER_ACTIVATION_MS` in `docs/src/lib/openrouter-key.js`; a real
  sign-in was accepted 94 s after the key was made, 2026-11-09). Cards made days ahead never meet
  this; a link sent to a friend straight after `make` can. Storing the key with `minted: true` makes
  the Studio read an early refusal as "not active yet" rather than "rejected".
- **Gift links are OpenRouter only.** The Studio also takes keys from other providers now (#3058,
  #3079), but the spending cap and management keys this design rests on are OpenRouter's.
- A **"Have a gift link?"** box in the Studio's model setup accepts a whole link or a bare key.
- When the cap is reached, the chat says so kindly and offers the existing OpenRouter sign-in,
  so the person keeps their decks and continues on their own account.

**Built (2026-11-10).** `docs/src/pages/gift.astro` is the route: static HTML and one small
script, no React and no engine, because it is the first page a visitor sees, often on a phone.
It clears the fragment before doing anything else, asks for the PIN when the link is locked,
asks before replacing an OpenRouter key the browser already holds, and stores without checking
the key with OpenRouter (a fresh key may still be activating). Opening the Studio then needs
nothing more: on a browser with no AI record yet, `migrateChat` in
`docs/src/lib/model-selection.js` sets chat to OpenRouter when an OpenRouter key is stored. A
second link opened in the same tab changes only the hash, so the page listens for `hashchange`.
The "Have a gift link?" box is the existing OpenRouter key field in Workspace › AI, which now
takes a whole link too (`saveProviderKey` in `docs/src/components/studio/api-key.ts`); a
PIN-locked link sends the author to the link itself, where the page asks for the PIN. The
"cap reached" message is not built yet: it is an existing OpenRouter 402 path, left as it is.

## 7. Open decisions

| Decision | Options | Recommendation |
|---|---|---|
| Default card size | US 3.5 × 2 in, ISO 85 × 55 mm | Support both; default to where the first cards are handed out |
| Print route | Home sheets first, or a print-shop PDF with bleed | Home sheets first; the print-shop PDF as a later slice with sign-off |
| Gift links in the CSV | Off by default with `--with-links`, or always on | Off by default |
| PIN | Off, optional, or always | Optional, off by default |
| Where the tool lives | `tools/` in this repo, or a separately published package | `tools/` first; publish once the format is stable |

**Taken 2026-11-10, by default.** The owner was away when the build started and the brief said a
safe default beats a question, so each decision took its recommendation. All five are reversible
in one commit:

- **D1 card size:** both, as `card` (US 3.5 × 2 in) and `card-iso` (85 × 55 mm). The CLI
  defaults to `card` (`--size iso` for the other); nothing yet says where the first cards go.
- **D2 print route:** home sheets only. The print-shop PDF stays slice 5, behind sign-off.
- **D3 links in the CSV:** off; `--with-links` adds them.
- **D4 PIN:** optional, off; `--pin` locks every key in a batch with one generated PIN per card.
- **D5 tool home:** `tools/gift-cards.mjs`.

## 8. Slices, in order

1. The shared link module (encode, decode, checksum, optional PIN lock), with tests that run on
   fake keys only, and the key format confirmed against OpenRouter's documentation.
2. The Studio `/gift` route and the "Have a gift link?" box.
3. The CLI `make` (one key, then `--count`), `report` and `revoke`, with the CSV.
4. The `card` size, the `gift-card` component and its demo deck (HARD RULE #9), rendered for home
   printing.
5. Optional, with sign-off: the print-shop PDF.

Verification: slice 2 is a real-surface change (screenshots at 1440 / 820 / 390, a phone run on
WebKit); slice 3 runs against a real management key only on the owner's machine, never in CI or
tests; slice 4 owes a demo deck and a look at printed cards.
