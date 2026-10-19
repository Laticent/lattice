---
marp: true
theme: indaco
paginate: true
header: "Lattice · bg split ratio"
---

<!-- _class: title silent -->

# A Marp ratio keeps the image panel

`Imagery · ![bg left:40%]`

A deck brought in from Marp writes the split as `left:40%`. The image layout reads the side, keeps its panel, and resolves its own share.

---

<!-- _class: image -->

# Panel on the left

![bg left:40%](sample:photo-wide.svg)

The deck says `![bg left:40%]`. The picture sits in the left panel; the share is the layout's own, chosen from the picture's shape.

---

<!-- _class: image -->

# Panel on the right

![bg right:30%](sample:photo-tall.svg)

`![bg right:30%]` puts the panel on the right, again at the layout's own share.

---

<!-- _class: image -->

# The plain spelling

![bg left](sample:photo-square.svg)

`![bg left]` with no ratio draws the same panel. The ratio changes nothing but the lint note.

---

<!-- _class: image -->

# A modifier with a value rides along

![bg left:40% blur:10px](sample:photo-wide.svg)

`![bg left:40% blur:10px]` still reads its side.

---

<!-- _class: image -->

# A tall picture, on the right

![bg right:60%](sample:photo-tall.svg)

`![bg right:60%]` asks for a wide panel; the layout still resolves its own share from the picture's shape.
