// THE MATH AND HTML EDITOR — a TeX field with a live preview, and a source field for a block of HTML.
//
// The panel for a math span (`$x^2$`), a math block (`$$ … $$`) and a block of HTML in Compose's editor host
// (InlineObjectEditor.tsx). Design: engineering/decisions/2026-10-21-compose-point-and-click.md §7.
//
//   · `RawPanel` is the controls and nothing else. It is handed the node's text and reports one change per commit; the host
//     writes it through `editInlineMath` / `editRawBlock` (lib/compose/raw-objects.ts), which replace the node as one undo step.
//   · A change is written when the author leaves the field, as every other panel does, not on each key. The preview follows the
//     TeX as it is typed, so a half-typed formula shows its error in the panel and never reaches the deck.
//   · What the document refuses (a blank line inside an HTML block, a `$` inside inline math) is explained in the panel and
//     not written.
//   · The preview is MathML drawn by the engine's own KaTeX (lib/compose/math-draw.ts). The slide preview draws the real slide.
//
// Lazy with the host: none of it is in the Studio's startup JavaScript.

import { Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { drawMath, mathReady, onMathReady } from '@/lib/compose/math-draw';
import { displayTexOf, displayTextFor, inlineTexProblem, type RawObjectKind, rawBlockProblem } from '@/lib/compose/raw-objects';
import { Field, PanelFooter } from './object-controls';

export interface RawPanelProps {
	kind: RawObjectKind;
	/** The node's text as the document has it now: the TeX of a span, the whole text of a block. */
	text: string;
	/** Write the new text. Returns whether the document now holds it; a refusal is shown, never swallowed. */
	onEdit: (text: string) => boolean;
	/** Returns whether the node was taken out. A refusal (a locked slide) is shown, and the panel stays. */
	onRemove: () => boolean;
	onDone: () => void;
}

/** The formula, drawn live; the TeX itself until KaTeX has loaded. */
function Preview({ tex, display }: { tex: string; display: boolean }) {
	const ref = React.useRef<HTMLDivElement>(null);
	const [, redraw] = React.useReducer((n: number) => n + 1, 0);
	React.useEffect(() => (mathReady() ? undefined : onMathReady(redraw)), []);
	React.useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const drawn = tex.trim() ? drawMath(tex, display) : null;
		el.replaceChildren(...(drawn ? [drawn] : [document.createTextNode(tex.trim() ? tex : '')]));
	});
	return <div ref={ref} role="img" aria-label="Preview" data-testid="math-preview" className="flex min-h-12 items-center justify-center overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-[18px]" />;
}

/** A multi-line field that writes when the author leaves it. Enter adds a line, so only leaving commits. */
function AreaRow({ id, label, value, rows, mono, onType, onCommit }: { id: string; label: string; value: string; rows: number; mono?: boolean; onType?: (v: string) => void; onCommit: (v: string) => void }) {
	const [text, setText] = React.useState(value);
	const ref = React.useRef<HTMLTextAreaElement>(null);
	React.useEffect(() => {
		if (document.activeElement !== ref.current) setText(value);
	}, [value]);
	// A panel dismissed with the author still in the field unmounts it with no blur: what was typed is written then (TextRow does the same).
	const latest = React.useRef({ text, value, onCommit });
	latest.current = { text, value, onCommit };
	React.useEffect(
		() => () => {
			const { text: t, value: v, onCommit: c } = latest.current;
			if (t !== v) c(t);
		},
		[],
	);
	return (
		<textarea
			ref={ref}
			id={id}
			aria-label={label}
			value={text}
			rows={rows}
			spellCheck={false}
			autoComplete="off"
			onChange={(e) => {
				setText(e.target.value);
				onType?.(e.target.value);
			}}
			onBlur={() => text !== value && onCommit(text)}
			className={`w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-[13px] leading-snug focus-visible:border-[var(--accent)] focus-visible:outline-none ${mono ? 'font-mono' : ''}`}
		/>
	);
}

export function RawPanel({ kind, text, onEdit, onRemove, onDone }: RawPanelProps) {
	const id = React.useId();
	const [refused, setRefused] = React.useState<string | null>(null);
	// The TeX being typed, for the preview and its error. The document holds the last one that was valid.
	const body = kind === 'inline-math' ? text : kind === 'math' ? displayTexOf(text) : text;
	const [draft, setDraft] = React.useState(body);
	React.useEffect(() => setDraft(body), [body]);

	// The inline field writes on blur or Enter; a panel dismissed with the author still in it unmounts with no blur, so write then too.
	const latestInline = React.useRef({ draft, body, kind });
	const commitRef = React.useRef<(v: string) => void>(() => {});
	latestInline.current = { draft, body, kind };
	React.useEffect(
		() => () => {
			const { draft: d, body: b, kind: k } = latestInline.current;
			if (k === 'inline-math' && d !== b) commitRef.current(d);
		},
		[],
	);

	const commit = (value: string) => {
		setDraft(value);
		if (kind === 'inline-math') {
			const why = inlineTexProblem(value);
			if (why) return setRefused(why);
			return setRefused(onEdit(value) ? null : 'This math cannot be written here. Edit this slide in Markdown.');
		}
		if (kind === 'math') {
			const next = displayTextFor(text, value);
			const why = next ? rawBlockProblem('math', next) : 'A math block needs TeX, and cannot hold a $$ inside it.';
			if (why || !next) return setRefused(why);
			return setRefused(onEdit(next) ? null : 'This math cannot be written here. Edit this slide in Markdown.');
		}
		const why = rawBlockProblem('html', value);
		if (why) return setRefused(why);
		setRefused(onEdit(value) ? null : 'This HTML cannot be written here. Edit this slide in Markdown.');
	};

	commitRef.current = commit;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
				{kind === 'html' ? (
					<Field label="HTML" id={`${id}-src`}>
						<AreaRow id={`${id}-src-input`} label="HTML source" value={text} rows={8} mono onCommit={commit} />
						<p className="text-[11px] text-muted-foreground">Drawn on the slide, not here. A blank line ends an HTML block.</p>
					</Field>
				) : (
					<>
						<Field label="TeX" id={`${id}-tex`}>
							{kind === 'inline-math' ? (
								<Input
									id={`${id}-tex-input`}
									aria-label="TeX"
									value={draft}
									autoComplete="off"
									spellCheck={false}
									className="font-mono"
									onChange={(e) => {
										setDraft(e.target.value);
										setRefused(null);
									}}
									onBlur={() => draft !== body && commit(draft)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											if (draft !== body) commit(draft);
										}
									}}
								/>
							) : (
								<AreaRow
									id={`${id}-tex-input`}
									label="TeX"
									value={body}
									rows={5}
									mono
									onType={(v) => {
										setDraft(v);
										setRefused(null);
									}}
									onCommit={commit}
								/>
							)}
						</Field>
						<Preview tex={draft} display={kind === 'math'} />
					</>
				)}
				{refused ? (
					<p role="alert" className="text-[12px] text-[var(--warn)]">
						{refused}
					</p>
				) : null}
			</div>
			<PanelFooter onDone={onDone}>
				<Button type="button" variant="ghost" size="sm" onClick={() => !onRemove() && setRefused('This cannot be removed here. Edit this slide in Markdown.')}>
					<Trash2 aria-hidden /> Remove
				</Button>
			</PanelFooter>
		</div>
	);
}
