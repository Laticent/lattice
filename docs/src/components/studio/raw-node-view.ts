// THE RAW-BLOCK AND MATH NODE VIEWS — Compose draws a math span, a `$$` block and a block of HTML as one labeled unit each.
//
//   · A math span (`$x^2$`) is drawn as the formula, inline in the line. A block (`$$ … $$`) is drawn as the formula, centered.
//     Until KaTeX has loaded, or if it cannot, the TeX source is drawn instead; nothing is lost, only less pretty.
//   · A block of HTML is drawn as a labeled box holding its source, a few lines of it. Compose never renders the author's HTML
//     (the slide preview does), so opening a deck puts none of it in the editor.
//
// One button holds each drawing, as the image and the inline objects do, so a press never moves the caret or raises a touch
// keyboard, and the click selects the node and opens its editor (inline-objects.ts `openObjectEditor`, RawPanel.tsx).
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §7 (what shipped second).

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { openObjectEditor } from '@/lib/compose/inline-objects';
import { drawMath, mathReady, onMathReady } from '@/lib/compose/math-draw';
import { displayTexOf } from '@/lib/compose/raw-objects';

const live = new Set<{ paint(): void }>();
const repaintAll = () => {
	for (const v of live) v.paint();
};

/** Ask for KaTeX (a no-op once loaded), and redraw every live math node when it arrives. The same callback each time, so asking again never stacks. */
function ensureMath(): void {
	if (!mathReady()) onMathReady(repaintAll);
}

/** A button that selects its node and opens the editor on it. A press never moves the caret. */
function openButton(view: EditorView, getPos: () => number | undefined, className: string): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = className;
	btn.addEventListener('mousedown', (e) => e.preventDefault());
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		const pos = getPos();
		if (typeof pos === 'number') openObjectEditor(view, pos);
	});
	return btn;
}

class MathInlineView implements NodeView {
	dom: HTMLElement;
	private btn: HTMLButtonElement;
	private node: PMNode;

	constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
		this.node = node;
		this.dom = document.createElement('span');
		this.dom.className = 'cs-math';
		this.dom.contentEditable = 'false';
		this.btn = openButton(view, getPos, 'cs-math-btn');
		this.dom.append(this.btn);
		live.add(this);
		ensureMath();
		this.paint();
	}

	paint(): void {
		const tex = String(this.node.attrs.tex ?? '');
		this.btn.title = 'Edit this math';
		this.btn.setAttribute('aria-label', `Edit math: ${tex}`);
		const drawn = drawMath(tex, false);
		if (!drawn) ensureMath(); // a load that failed or came early is asked for again
		if (drawn) {
			this.btn.classList.remove('cs-math-source');
			this.btn.replaceChildren(drawn);
		} else {
			this.btn.classList.add('cs-math-source');
			this.btn.replaceChildren(document.createTextNode(`$${tex}$`));
		}
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		const changed = node.attrs.tex !== this.node.attrs.tex;
		this.node = node;
		if (changed) this.paint();
		return true;
	}

	stopEvent(e: Event): boolean {
		return e.target instanceof Node && this.btn.contains(e.target);
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		live.delete(this);
	}
}

/** How many lines of an HTML block's source the box shows. The panel holds all of it. */
const HTML_LINES = 6;

class RawBlockView implements NodeView {
	dom: HTMLElement;
	private btn: HTMLButtonElement;
	private node: PMNode;

	constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
		this.node = node;
		this.dom = document.createElement('div');
		this.dom.contentEditable = 'false';
		this.btn = openButton(view, getPos, 'cs-raw-btn');
		this.dom.append(this.btn);
		live.add(this);
		ensureMath();
		this.paint();
	}

	paint(): void {
		const math = this.node.attrs.kind === 'math';
		const text = String(this.node.attrs.text ?? '');
		this.dom.className = `cs-raw cs-raw-${math ? 'math' : 'html'}`;
		this.btn.title = math ? 'Edit this math' : 'Edit this HTML';
		this.btn.setAttribute('aria-label', math ? 'Edit math block' : 'Edit HTML block');
		const tag = document.createElement('span');
		tag.className = 'cs-raw-tag';
		tag.textContent = math ? 'Math' : 'HTML block';
		const body = document.createElement('div');
		body.className = 'cs-raw-body';
		if (math) {
			const tex = displayTexOf(text);
			const drawn = drawMath(tex, true);
			if (drawn) body.append(drawn);
			else {
				body.classList.add('cs-raw-source');
				body.textContent = text;
			}
		} else {
			body.classList.add('cs-raw-source');
			const lines = text.split('\n');
			body.textContent = lines.length > HTML_LINES ? `${lines.slice(0, HTML_LINES).join('\n')}\n…` : text;
		}
		this.btn.replaceChildren(tag, body);
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		const changed = node.attrs.text !== this.node.attrs.text || node.attrs.kind !== this.node.attrs.kind;
		this.node = node;
		if (changed) this.paint();
		return true;
	}

	stopEvent(e: Event): boolean {
		return e.target instanceof Node && this.btn.contains(e.target);
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		live.delete(this);
	}
}

export const mathInlineNodeView = (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => new MathInlineView(node, view, getPos);
export const rawBlockNodeView = (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => new RawBlockView(node, view, getPos);
