---
marp: true
theme: indaco
paginate: true
header: "Host slots"
plugins: [status-card]
---

<!-- _class: title -->

# Host slots

A plugin draws with `${slots}`; the host fills them with checked values

---

## A word becomes a styled badge

```status-card
status: late
title: Vendor contract

The legal review is **two weeks** behind plan.
```

The plugin returns the word `late`. The host checks it against the words the plugin declared, then fills `${status}`.

---

## A markdown value becomes a table

```status-card
status: at-risk
title: Q3 launch readiness

| Workstream | Owner | State |
|:--|:--|--:|
| Legal review | Dana | 70% |
| Security audit | Ravi | 40% |
| Pricing | Mei | 90% |
```

The table is the host's own rendering of the returned markdown, with no attribute on any tag.

---

## Text shows as typed

```status-card
status: on-track
title: Tom & Jerry's "plan" < Q3

Plain text keeps its `&`, quotes and `<` exactly as typed.
```

A text value is escaped when it is filled, and the check already refuses a value that holds a tag.

---

## One drawing, several values

```status-card
status: on-track
title: Pricing

- Tiers agreed with finance
- Annual discount capped at **15%**
- Launch price signed off
```

Every `${field}` the plugin declared fills from what that block returned. A name it did not declare stays as written.

---

## What the host guarantees

- A slot fills in **visible text** only, never in a link, a style or a class.
- A value outside its declared field **disables the plugin** for the render.
- The plugin's own stylesheet styles **its drawing and nothing else**.
