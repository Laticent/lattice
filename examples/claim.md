---
theme: indaco
pagination: true
meta: "Lattice · claim"
---

<!-- @meta{layout=title} -->

`Feature demo`

# claim

Give the content the stage.

---

<!-- @meta{layout=content} -->

`The dial`

## Four presets, one purpose.

`claim` is how much of the frame the content claims vs the chrome. Set it deck-wide (`claim: hero`) or per slide (`claim-hero`).

- **framed** — the default: full masthead, footer, section rail.
- **quiet** — recede the section rail + meta bay; keep the title and page number.
- **hero** — drop the bands; the content fills the stage (the page number reads through).
- **bleed** — edge-to-edge, no safe margin. Media and canvas.

---

<!-- @meta{layout=divider} -->

`Section 01`

## The dial, on one chart.

---

<!-- @meta{layout=piechart, class=donut} -->

`Revenue · FY26`

## framed — full chrome.

- Subscriptions `48%`
- Services `27%`
- Licensing `15%`
- Other `10%`

---

<!-- @meta{layout=piechart, class=donut claim-quiet} -->

`Revenue · FY26`

## quiet — the rail and meta recede.

- Subscriptions `48%`
- Services `27%`
- Licensing `15%`
- Other `10%`

---

<!-- @meta{layout=piechart, class=donut claim-hero} -->

`Revenue · FY26`

## hero — the chart takes the stage.

- Subscriptions `48%`
- Services `27%`
- Licensing `15%`
- Other `10%`

Nearly half came from subscriptions this year.

---

<!-- @meta{layout=big-number, class=claim-hero} -->

`Recall`

- 92%
  - of an audience remembers a single number from a deck.

---

<!-- @meta{layout=code, class=claim-hero} -->

`API`

## The new endpoint.

```js
app.post('/api/v2/auth', async (req, res) => {
  const session = await issueSession(req.body);
  res.json({ session });
});
```

---

<!-- @meta{layout=big-number, class=claim-bleed} -->

`bleed`

- 100%
  - of the frame — no safe margin, so a dense table opts out.

---

<!-- @meta{layout=closing} -->

`claim`

## Content takes the stage; you price the cost.

Quiet trades the section rail. Hero trades the bands. Bleed trades the safe margin.
