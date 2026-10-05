- **The Studio chat is now an agent on a cloud model.** It used to send one prompt per turn
  carrying a ~26.5K-token list of every layout, with no tools, and it knew nothing about
  front matter, finishes, themes or deck budgets. It now starts from a ~6.7K-token core and
  reads what it needs: any component's full doc, the deck, finish, theme, lens and
  speaker-notes guides, the editorial rules, and every front-matter key. It edits a draft,
  runs the Coach's own linter and Mermaid's parser over it, fixes what they find, and shows
  you one review card for the whole turn — slides and front-matter changes together. Plain
  questions about the deck get plain answers with no tool calls. Under each reply, a line
  lists what it read and checked. On-device models keep the previous one-shot chat.
  (`docs/src/components/studio/architect-agent.ts`)
- **The chat composer no longer squeezes the text field to a sliver in the docked desktop
  column.** Its buttons now wrap below the field when the column is too narrow for both.
