import type { ElementTransformer } from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
	$applyNodeReplacement,
	$getNodeByKey,
	DecoratorNode,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from 'lexical';
import { Plus, X } from 'lucide-react';
import * as React from 'react';

// ISOLATED PROTOTYPE — the FIRST typed block: a KPI list as a first-class node in
// the Compose DSL, NOT free rich text. This is the fix for the round-trip
// corruption: the nested `1. value / - label / - note` grammar that @lexical/markdown
// flattens is instead OWNED by this node, which serializes itself back to the exact
// Lattice markdown. You still edit it inline in the one-note canvas (no form panel);
// the block just knows how to compile itself. The pattern generalizes to every
// structured component (cards-grid, agenda, …) — KPI proves the model.

export type KpiItem = { value: string; label: string; note: string };
type SerializedKpiNode = Spread<{ items: KpiItem[] }, SerializedLexicalNode>;

export class KpiNode extends DecoratorNode<React.ReactElement> {
	__items: KpiItem[];

	static getType(): string {
		return 'lattice-kpi';
	}
	static clone(node: KpiNode): KpiNode {
		return new KpiNode(node.__items, node.__key);
	}
	constructor(items?: KpiItem[], key?: NodeKey) {
		super(key);
		this.__items = items ?? [];
	}
	static importJSON(json: SerializedKpiNode): KpiNode {
		return $createKpiNode(json.items ?? []);
	}
	exportJSON(): SerializedKpiNode {
		return { ...super.exportJSON(), type: 'lattice-kpi', version: 1, items: this.__items };
	}
	createDOM(): HTMLElement {
		const el = document.createElement('div');
		el.className = 'kpi-block-host';
		return el;
	}
	updateDOM(): boolean {
		return false;
	}
	isInline(): boolean {
		return false;
	}
	getItems(): KpiItem[] {
		return this.getLatest().__items;
	}
	setItems(items: KpiItem[]): void {
		this.getWritable().__items = items;
	}
	/** Compile back to the EXACT Lattice KPI grammar: `N. value` with two nested
	 *  `- ` bullets (label, note). This is what @lexical/markdown could not preserve. */
	getMarkdown(): string {
		return this.getLatest()
			.__items.map((it, i) => {
				const lines = [`${i + 1}. ${it.value}`];
				if (it.label.trim()) lines.push(`   - ${it.label}`);
				if (it.note.trim()) lines.push(`   - ${it.note}`);
				return lines.join('\n');
			})
			.join('\n');
	}
	decorate(): React.ReactElement {
		return <KpiBlock nodeKey={this.getKey()} items={this.getLatest().__items} />;
	}
}

export function $createKpiNode(items: KpiItem[]): KpiNode {
	return $applyNodeReplacement(new KpiNode(items));
}
export function $isKpiNode(node: LexicalNode | null | undefined): node is KpiNode {
	return node instanceof KpiNode;
}

// The markdown EXPORT transformer — @lexical/markdown calls `export` on every
// top-level node, so this catches the KpiNode and emits its grammar. Import is
// handled at seed time (parseKpi below), so the regExp deliberately never matches.
export const KPI_TRANSFORMER: ElementTransformer = {
	dependencies: [KpiNode],
	export: (node) => ($isKpiNode(node) ? node.getMarkdown() : null),
	regExp: /^￿(?!)/,
	replace: () => false,
	type: 'element',
};

/** Parse a KPI skeleton body into { eyebrow, heading, items } so the seeder can
 *  build a KpiNode directly (never a lossy markdown import). */
export function parseKpi(body: string): { eyebrow: string; heading: string; items: KpiItem[] } {
	const lines = body.split('\n');
	let eyebrow = '';
	let heading = '';
	const items: KpiItem[] = [];
	for (const raw of lines) {
		const line = raw.trimEnd();
		const eb = line.match(/^`([^`]+)`\s*$/);
		if (eb && !eyebrow && !items.length) {
			eyebrow = eb[1];
			continue;
		}
		const h = line.match(/^#{1,6}\s+(.*)$/);
		if (h && !heading) {
			heading = h[1];
			continue;
		}
		const num = line.match(/^\d+\.\s+(.*)$/);
		if (num) {
			items.push({ value: num[1], label: '', note: '' });
			continue;
		}
		const bullet = line.match(/^\s+-\s+(.*)$/);
		if (bullet && items.length) {
			const cur = items[items.length - 1];
			if (!cur.label) cur.label = bullet[1];
			else if (!cur.note) cur.note = bullet[1];
			else cur.note += ` ${bullet[1]}`;
		}
	}
	return { eyebrow, heading, items };
}

// The inline block editor — rendered INSIDE the canvas (contentEditable=false so
// Lexical treats it atomically). Reads/writes the node's items; each field edits
// in place. It looks like the slide content, not a settings form.
function KpiBlock({ nodeKey, items }: { nodeKey: NodeKey; items: KpiItem[] }) {
	const [editor] = useLexicalComposerContext();
	const set = React.useCallback(
		(next: KpiItem[]) => {
			editor.update(() => {
				const n = $getNodeByKey(nodeKey);
				if ($isKpiNode(n)) n.setItems(next);
			});
		},
		[editor, nodeKey],
	);
	const patch = (i: number, k: keyof KpiItem, v: string) => set(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
	const add = () => set([...items, { value: '0', label: 'New metric', note: '' }]);
	const remove = (i: number) => set(items.filter((_, idx) => idx !== i));
	return (
		<div className="kpi-block" contentEditable={false}>
			<div className="kpi-block-tag">KPI · a typed block — edits stay structured, compiles to nested markdown</div>
			<div className="kpi-grid">
				{items.map((it, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: prototype block; items are positional and small.
					<div className="kpi-item" key={i}>
						<button type="button" className="kpi-del" title="Remove metric" onClick={() => remove(i)}><X className="size-3" /></button>
						<input className="kpi-value" value={it.value} onChange={(e) => patch(i, 'value', e.target.value)} aria-label={`Metric ${i + 1} value`} />
						<input className="kpi-label" value={it.label} onChange={(e) => patch(i, 'label', e.target.value)} placeholder="Label" aria-label={`Metric ${i + 1} label`} />
						<input className="kpi-note" value={it.note} onChange={(e) => patch(i, 'note', e.target.value)} placeholder="Note (optional)" aria-label={`Metric ${i + 1} note`} />
					</div>
				))}
			</div>
			<button type="button" className="kpi-add" onClick={add}><Plus className="size-3.5" /> Add metric</button>
		</div>
	);
}
