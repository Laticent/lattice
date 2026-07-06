---
marp: true
theme: indaco
paginate: true
header: "Lattice · citation-card"
---

<!-- _class: title silent -->

# citation-card

`Evidence · Canvas · Prose`

Single authoritative reference — heading + citation + verbatim quote + plain-English gloss.

---

<!-- _class: citation-card -->
<!-- _footer: "Default · citation-card" -->

## The card quotes the law verbatim, cited.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.


---

<!-- _class: citation-card pull-quote -->
<!-- _footer: "pull-quote · citation-card pull-quote — The operative phrase, lifted." -->

## pull-quote lifts the operative phrase.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- **What we must do.**
  - Audit pixel inventory; treat household IDs as PI in DSAR workflows.


---

<!-- _class: citation-card split -->
<!-- _footer: "split · citation-card split — Quote beside plain reading." -->

## split pairs the quote with its plain reading.

`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating a consumer's personal information to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands.


---

<!-- _class: citation-card margin -->
<!-- _footer: "margin · citation-card margin — The cite in the gutter." -->

## margin hangs the cite in the gutter.

`GDPR Art. 6(1)(f) · legitimate interests`

> Processing is lawful only if and to the extent that processing is necessary for the purposes of the legitimate interests pursued by the controller, except where such interests are overridden by the interests or fundamental rights of the data subject.

- Two-part test.
  - Necessity first, then a balancing exercise against the data subject's rights. Document both halves or the basis fails on audit.


---

<!-- _class: citation-card triptych -->
<!-- _footer: "triptych · citation-card triptych — Three authorities abreast." -->

## triptych sets three authorities abreast.

`GDPR Art. 4(1) · definitions`

> 'Personal data' means any information relating to an identified or identifiable natural person.

- In plain English.
  - Any online identifier that can single out a person — IP address, cookie ID, device fingerprint.
- **What we must do.**
  - Scope notice and retention to cover online identifiers, not just named-person records.


---

<!-- _class: citation-card -->
<!-- stress-slide -->
<!-- _footer: "Stress test · citation-card — The longest quotable block." -->

## The longest quote one card should carry.

`Cal. Civ. Code §1798.140(o)(1) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household. Personal information includes, but is not limited to, the following if it identifies, relates to, describes, is reasonably capable of being associated with, or could be reasonably linked, directly or indirectly, with a particular consumer or household: identifiers such as a real name, alias, postal address, unique personal identifier, online identifier, Internet Protocol address, email address, account name, social security number, driver's license number, passport number, or other similar identifiers.

- Past this length, the quote stops being read and starts being trusted — excerpt with the `pull-quote` variant instead.


---

<!-- _class: citation-card dark -->
<!-- _footer: "Composition: dark · citation-card dark" -->

## The card quotes the law verbatim, cited.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.


---

<!-- _class: citation-card compact -->
<!-- _footer: "Composition: compact · citation-card compact" -->

## The card quotes the law verbatim, cited.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.


---

<!-- _class: citation-card accent -->
<!-- _footer: "Composition: accent · citation-card accent" -->

## The card quotes the law verbatim, cited.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- In plain English: any data tied to a household or device, not just a named person — IP addresses, cookie IDs, and device fingerprints are all in scope.
- **What we must do.**
  - Treat household-level identifiers as PI in our notice, retention, and DSAR workflows. Audit pixel and tag inventory next quarter.


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · citation-card" -->

## When NOT to reach for citation-card.

- **Multiple citations on one slide.** Stacking two or three statutes? Use statute-stack — citation-card gives canvas weight to a single authority.
- **Paraphrased 'quote'.** Rewriting the source? Drop the citation framing for content or a split-panel pullquote — citation-card is for verbatim language with attribution.
- **Gloss longer than the quote.** When the gloss runs three paragraphs, the citation is no longer the focus. Trim it to one sentence plus a `What we must do` action, or use content.
- **Plain gloss under the pull-quote variant.** The `pull-quote` variant shows only a **bold**-led `**What we must do**` action — a plain 'In plain English …' line silently vanishes. Lead with a bold label, or use the default variant.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `statute-stack` — two or three citations need to land on one slide
- `quote` — the source is a person, not a document
- `split-panel` — a quote with three or four implications
- `content` — the citation is one input among several in a prose argument
