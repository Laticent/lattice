---
marp: true
theme: indaco
paginate: true
footer: "Laticent · code record follow-ups"
---

<!-- _class: title silent -->

# Indentation and quotes are part of the record.

`Feature · @code{indent=…, quotes=…}`

A code block's record now sets how the formatter indents it and which quote it writes, and a tab draws as wide as that indent.

---

## A tab used to draw eight columns wide.

Go indents with tabs, and the browser draws each one eight columns wide. Three levels of nesting used up a third of the panel before the code started.

```go
func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		if s.strict {
			http.Error(w, "method not allowed", 405)
			return
		}
	}
	s.serve(w, r)
}
```

---

## `indent=tab` draws each tab four columns wide.

The same block with `@code{indent=tab}` above it. The source is unchanged, and the panel draws each tab four columns wide.

`@code{indent=tab}`
```go
func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		if s.strict {
			http.Error(w, "method not allowed", 405)
			return
		}
	}
	s.serve(w, r)
}
```

---

## `indent=4, quotes=single` is how this block was formatted.

`lattice fmt` read the record and asked Prettier for four-space indents and single quotes. JSON, Java and SQL keep their own quotes, because in those languages the quote changes what the code means.

`@code{indent=4, quotes=single, numbers}`
```ts
export async function load(id: string): Promise<User> {
    const hit = cache.get(id);
    if (hit) return hit;
    return api.get(`/users/${id}`, { mode: 'strict' });
}
```

---

## Python takes the same fields through ruff.

`@code{indent=2, quotes=single}` on a Python block: ruff indents two spaces and writes single quotes. A deck can set both for every block with `code: indent=2, quotes=single` in its front matter.

`@code{indent=2, quotes=single}`
```py
def load(user_id):
  hit = cache.get(user_id)
  if hit:
    return hit
  return api.get(f'/users/{user_id}', mode='strict')
```

---

## `lint:deck` now checks code lines on plain slides too.

A line wider than its panel is cut off at the edge. The `code-line-clipped` check used to cover only `code` and `compare-code` slides; it now covers a fence on any slide. It skips a `wrap` block like this one, because a wrapped line cannot be cut off.

`@code{wrap}`
```sh
docker run --rm -v "$PWD:/work" -w /work ghcr.io/laticent/lattice:latest lattice fmt slides/quarterly-review.md slides/board-update.md --check
```
