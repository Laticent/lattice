---
marp: true
theme: indaco
paginate: true
footer: "Laticent · code highlighting"
---

<!-- _class: title silent -->

# Code reads the same on every slide.

`Feature · the code plugin`

Highlighting is a plugin now. Any fence on any slide sits on the code panel, colored by the theme's syntax roles, and a one-line record above the fence turns on numbers, focus and diff bands.

---

## A fence on an ordinary slide gets the panel.

Before this change, a fence outside the `code` layout painted its syntax colors straight onto the slide, where the pale ones were unreadable on a light theme.

```ts
export async function load(id: string): Promise<User> {
  const hit = cache.get(id);
  if (hit) return hit;
  return api.get(`/users/${id}`);
}
```

---

<!-- _class: code -->

## A record above the fence configures the block.

`@code{title=src/session.ts, numbers, focus=4-6}`
```ts
import { sign } from "./keys";

export function issue(user: User): Session {
  const expires = Date.now() + TTL;
  const token = sign({ sub: user.id, exp: expires });
  return { token, expires };
}
```

---

## A diff block bands each added and removed line.

`@code{diff, title=retry.py}`
```python
 def fetch(url):
-    return requests.get(url)
+    for attempt in range(3):
+        try:
+            return requests.get(url, timeout=5)
+        except Timeout:
+            sleep(2 ** attempt)
```

Each line's `+` or `-` sets its band; the rest of the line is colored as Python.

---

## A command list colors its commands and flags.

```bash
npm install @laticent/lattice
docker compose up -d --build
kubectl apply -f k8s/ --namespace prod
terraform apply -auto-approve -var-file=prod.tfvars
```

Stock highlight.js left this block gray. Lattice's shell grammar colors the commands and flags, in the Studio, the PDF and an Export to Marp.

---

## One command formats every block.

`@code{format, width=48}`
```ts
const total = items
  .filter((i) => i.active)
  .reduce((sum, i) => sum + i.price * i.qty, 0);
```

This was one minified line. `lattice fmt`, or **Format code blocks** in the Studio, rewrote it at the record's 48 columns, so the source, the slide and every export show the same lines.

---

## Each language gets its own formatter.

`@code{format, dialect=postgresql}`
```sql
select
  region,
  sum(amount) as revenue
from
  orders
where
  placed_at > '2026-01-01'
group by
  region
```

Prettier formats the web languages, ruff formats Python, and sql-formatter formats SQL in the dialect you name. Each loads only when you format a block in its language.

---

## Mark a line without dimming the rest.

`@code{mark=4, wrap, format=off}`
```yaml
service: billing
replicas: 3
image: registry.laticent.dev/billing:2.14.0
command: ["billing", "--listen=0.0.0.0:8080", "--db=postgres://billing@db.internal:5432/billing", "--cache=redis://cache.internal:6379/0"]
```

`mark=` tints a line and keeps every other line at full strength. `wrap` breaks a long line instead of clipping it.

---

## Copy buttons, where people read.

`@code{copy}`
```bash
npx lattice fmt deck.md --check
```

`copy` puts two buttons on a block in the Studio, the Playground and the exported webpage: copy the code, or copy it as colored HTML. A PDF like this one never shows them.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

## Any fence, any slide, one record.

`code-plugin · code-format`
