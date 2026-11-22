---
marp: true
size: story
theme: indaco
paginate: true
header: "Lattice · chart labels inside the canvas"
terms:
  AMER: { expansion: the Americas }
  EMEA: { expansion: "Europe, the Middle East and Africa" }
  APAC: { expansion: Asia Pacific }
---

<!-- _class: title silent -->

# Every chart label stays on the page.

`charts · phone pages · 4:5, story and mobile`

On a phone-shaped page, three charts painted a label past their own canvas. A row name lost its first letter, an axis lost its last digits, and a quadrant name sat on a spoke label. Each slide below used to show one of them.

---

<!-- _class: heatmap -->
<!-- _footer: "heatmap · capitals in the row column" -->

`Gross margin · by region`

## Margin recovered everywhere except EMEA.

|  | Q1 | Q2 | Q3 | Q4 |
| --- | --: | --: | --: | --: |
| AMER | 61 | 63 | 66 | 69 |
| EMEA | 58 | 55 | 54 | 52 |
| APAC | 49 | 54 | 60 | 64 |

---

<!-- _class: heatmap -->
<!-- _footer: "heatmap · a long month name" -->

`Retention · 2026 cohorts`

## The September cohort held on longest.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| January 2026 | 100 | 62 | 48 | 44 |
| February 2026 | 100 | 58 | 44 | 41 |
| September 2026 | 100 | 71 | 59 | 55 |
| October 2026 | 100 | 69 | 57 | |

---

<!-- _class: bar row -->
<!-- _footer: "bar row · a capital-led name" -->

## Support load sits with two teams.

- Billing `412`
- Onboarding `388`
- Data sync `146`
- Reporting `97`
- Admin `64`

---

<!-- _class: stacked-bar row -->
<!-- _footer: "stacked-bar row · period names" -->

## Online overtook Wholesale by the fourth quarter.

- Q1 FY24
  - Retail `12`
  - Wholesale `8`
  - Online `5`
- Q4 FY24
  - Retail `14`
  - Wholesale `7`
  - Online `9`

---

<!-- _class: ep-curve -->
<!-- _footer: "ep-curve · the last return period" -->

## A 1-in-250 year costs $560M.

- `{10, $120M}`
- `{25, $190M}`
- `{50, $300M}`
- `{100, $410M}`
- `{250, $560M}`

---

<!-- _class: radar quadrant -->
<!-- _footer: "radar quadrant · sector names" -->

## Risk is the quarter we under-invest in.

- Our capability
  - People
    - Hiring `4`
    - Retention `3`
    - Bench depth `2`
  - Process
    - Cadence `5`
    - Rigor `4`
  - Technology
    - Platform `4`
    - Tooling `3`
    - Automation `2`
  - Risk
    - Compliance `3`
    - Resilience `4`

---

<!-- _class: title silent -->

# Measured, not guessed.

`text-measure.js · measured widths`

A row column now grows until its widest word fits, measured at the glyph widths the body face actually paints. The ep-curve leaves room for half of its end labels, and a radar sector name moves until it clears every axis name. We recommend checking a new chart kind at 4:5, story and mobile before it ships.
