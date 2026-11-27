studio: +251

The Studio architect's authoring rules (docs/src/lib/architect-knowledge.js) gain one rule: bold is
emphasis, never structure (W3, #3572). The model that writes decks in the Studio is told that an
item's title is its own first line with the body nested, that a tag or value stays short, and that a
math theorem card's label is a `### heading`. Without it the model keeps writing the retired
`- **Title.** body` form, which now renders as one long title. The growth is that text, in the eager
`architect` chunk.
