---
marp: true
theme: indaco
paginate: true
header: "Lattice · inline icons"
---

<!-- _class: title silent -->

# An icon is a drawing the size of a word.

`Lattice · inline icons`

Written like a spark, colored by the deck, and never a font glyph or an emoji.

---

<!-- _class: table table-fill -->

## One icon, three looks, framed or bare.

| Look | `database` | `bucket` | `shield` | `rocket` |
| --- | --- | --- | --- | --- |
| `pigment`, the default | `^{database, c1}` | `^{bucket, c4}` | `^{shield, c3}` | `^{rocket, c5}` |
| `etching` | `^{database, c1, etching}` | `^{bucket, c4, etching}` | `^{shield, c3, etching}` | `^{rocket, c5, etching}` |
| `tone` | `^{database, c1, tone}` | `^{bucket, c4, tone}` | `^{shield, c3, tone}` | `^{rocket, c5, tone}` |
| `rounded` | `^{database, c1, rounded}` | `^{bucket, c4, etching, rounded}` | `^{shield, c3, tone, rounded}` | `^{rocket, c5, rounded}` |
| `bare` | `^{database, c1, bare}` | `^{bucket, c4, bare}` | `^{shield, c3, bare}` | `^{rocket, c5, bare}` |

---

<!-- _class: split-panel -->

## Framed or bare: the default is yours to pick.

- Framed, the placeholder default
  - Raw files land in `^{bucket, c4}` S3, a `^{function, c3}` Lambda reads each one, and `^{warehouse, c5}` Snowflake holds the model.
  - `{S3, icon=bucket, c4}` `{Lambda, icon=function, c3}` `{Snowflake, icon=warehouse, c5}`
- Bare, the same words
  - Raw files land in `^{bucket, c4, bare}` S3, a `^{function, c3, bare}` Lambda reads each one, and `^{warehouse, c5, bare}` Snowflake holds the model.
  - `{S3, icon=bucket, c4}` `{Lambda, icon=function, c3}` `{Snowflake, icon=warehouse, c5}`

---

<!-- _class: cards-grid -->

## Uploads reach the warehouse in under a minute.

- Gateway `{icon=gateway, c2}`
  - Hands out the URL and rate-limits each customer.
- Ingest `{icon=function, c3}`
  - One function run per upload, under 400 ms.
- Raw store `{icon=bucket, c4}`
  - Every file kept 30 days, then archived.
- Warehouse `{icon=warehouse, c5}`
  - The reporting model, refreshed each minute.

---

<!-- _class: table table-fill -->

## A cloud service is a role icon and its name.

| Role | AWS | Azure | Google Cloud |
| --- | --- | --- | --- |
| Object storage | `{S3, icon=bucket, c1}` | `{Blob Storage, icon=bucket, c2}` | `{Cloud Storage, icon=bucket, c3}` |
| Functions | `{Lambda, icon=function, c1}` | `{Functions, icon=function, c2}` | `{Cloud Functions, icon=function, c3}` |
| Warehouse | `{Redshift, icon=warehouse, c1}` | `{Synapse, icon=warehouse, c2}` | `{BigQuery, icon=warehouse, c3}` |
| Queue | `{SQS, icon=queue, c1}` | `{Service Bus, icon=queue, c2}` | `{Pub/Sub, icon=broadcast, c3}` |
| Identity | `{Cognito, icon=identity, c1}` | `{Entra ID, icon=identity, c2}` | `{Identity Platform, icon=identity, c3}` |

---

<!-- _class: table table-fill -->

## An icon takes the size of the text around it.

| Where | `sm` | `md` | `lg` |
| --- | --- | --- | --- |
| In a sentence | Alerts go to `^{bell, c2, sm}` on-call. | Alerts go to `^{bell, c2}` on-call. | Alerts go to `^{bell, c2, lg}` on-call. |
| Bare | `^{server, sm, bare}` `^{users, sm, bare}` | `^{server, bare}` `^{users, bare}` | `^{server, lg, bare}` `^{users, lg, bare}` |
| Beside a spark | `^{monitor, c3, sm}` `~{3 5 4 6 7 5 8, c3, sm}` | `^{monitor, c3}` `~{3 5 4 6 7 5 8, c3}` | `^{monitor, c3, lg}` `~{3 5 4 6 7 5 8, c3, lg}` |

---

<!-- _class: icon-bare -->

## One class sets every icon on a slide.

This slide carries `_class: icon-bare`, so every icon on it drops its tile: `^{lock, c3}` `^{key, c3}` `^{shield-check, c3}` `^{fingerprint, c3}`.

An icon's own word still wins: `^{lock, c3, framed}` keeps its tile here.

A deck sets the same thing for every slide with `icon: bare` in its front matter, and a slide's own `icon-framed` takes it back, on that axis only.

---

<!-- _class: table table-fill -->

## A name that is not in the set stays code, and lint says why.

| Written | `lint:deck` says |
| --- | --- |
| `\^{s3}` | `s3` is a service, not an icon: use the role icon `bucket` and put S3 in the text beside it |
| `\^{databse}` | not an icon: did you mean `database` or `dataset`? |
| `\^{bucket, c13}` | `c13` is past the limit: this takes `c1`–`c12` |
| `\{X, icon=lambda}` | the same coaching for a pill: use `icon=function` and keep Lambda as the label |

The backslash in front keeps the notation literal, which is how this slide shows it.
