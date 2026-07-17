import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	FORMAT_TEXT_COMMAND,
	REDO_COMMAND,
	UNDO_COMMAND,
} from 'lexical';
import { Bold, Heading1, Heading2, Italic, Lightbulb, List, ListOrdered, Quote, Redo2, StickyNote, Tag, Undo2 } from 'lucide-react';
import * as React from 'react';
import { COMPOSE_THEME, LATTICE_NODES, LATTICE_TRANSFORMERS } from './lexical-lattice';

// ISOLATED PROTOTYPE — the rich-text "Compose" surface (Lexical). A person who
// has never heard of "markdown" types here: headings, bold/italic, lists,
// quotes — with live markdown shortcuts (type "# " → heading, "- " → bullet,
// "**x**" → bold), the Notion feel. It exports Lattice-ready markdown on every
// change (round-trip proof) and re-seeds when a new component is picked.

function ToolbarButton({ onClick, title, children, active }: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-body)] transition-colors hover:bg-[var(--surface-2,rgba(0,0,0,0.06))] ${active ? 'bg-[var(--surface-2,rgba(0,0,0,0.08))]' : ''}`}
		>
			{children}
		</button>
	);
}

// The trailing below-note node, if the slide already carries one — a paragraph
// whose text starts with an em-dash. Used to keep canonical order (a Key Insight
// blockquote must sit ABOVE the below-note).
function $trailingNote() {
	const kids = $getRoot().getChildren();
	const last = kids[kids.length - 1];
	if (last && last.getType() === 'paragraph' && /^\s*—/.test(last.getTextContent())) return last;
	return null;
}

function Toolbar() {
	const [editor] = useLexicalComposerContext();
	const fmt = React.useCallback(
		(fn: () => void) => {
			editor.update(() => {
				const sel = $getSelection();
				if ($isRangeSelection(sel)) fn();
			});
		},
		[editor],
	);
	// ── Universal authoring markup — DSL operations that place the construct at its
	// canonical slide position and compile to the register the engine auto-detects.
	// Key Insight → trailing `> blockquote`; Note → trailing `— …`; Eyebrow → leading
	// inline-code line. The author expresses intent; placement is the DSL's job.
	const addKeyInsight = React.useCallback(() => {
		editor.update(() => {
			const quote = $createQuoteNode();
			quote.append($createTextNode('Your key takeaway, in one line.'));
			// Sit above a below-note if present (canonical order: content → insight → note).
			const note = $trailingNote();
			if (note) note.insertBefore(quote);
			else $getRoot().append(quote);
			quote.selectEnd();
		});
	}, [editor]);
	const addNote = React.useCallback(() => {
		editor.update(() => {
			const p = $createParagraphNode();
			p.append($createTextNode('— a short note that rides below the slide.'));
			$getRoot().append(p); // always the very last block
			p.selectEnd();
		});
	}, [editor]);
	const addEyebrow = React.useCallback(() => {
		editor.update(() => {
			const p = $createParagraphNode();
			const code = $createTextNode('Section · Context');
			code.setFormat('code'); // inline-code → eyebrow register
			p.append(code);
			const first = $getRoot().getFirstChild();
			if (first) first.insertBefore(p);
			else $getRoot().append(p);
			p.selectEnd();
		});
	}, [editor]);
	return (
		<div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--rule,rgba(0,0,0,0.1))] px-2 py-1.5">
			<ToolbarButton title="Undo" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}><Undo2 className="size-4" /></ToolbarButton>
			<ToolbarButton title="Redo" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}><Redo2 className="size-4" /></ToolbarButton>
			<span className="mx-1 h-5 w-px bg-[var(--rule,rgba(0,0,0,0.12))]" />
			<ToolbarButton title="Bold" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}><Bold className="size-4" /></ToolbarButton>
			<ToolbarButton title="Italic" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}><Italic className="size-4" /></ToolbarButton>
			<span className="mx-1 h-5 w-px bg-[var(--rule,rgba(0,0,0,0.12))]" />
			<ToolbarButton title="Heading 1" onClick={() => fmt(() => { const s = $getSelection(); if ($isRangeSelection(s)) $setBlocksType(s, () => $createHeadingNode('h1')); })}><Heading1 className="size-4" /></ToolbarButton>
			<ToolbarButton title="Heading 2" onClick={() => fmt(() => { const s = $getSelection(); if ($isRangeSelection(s)) $setBlocksType(s, () => $createHeadingNode('h2')); })}><Heading2 className="size-4" /></ToolbarButton>
			<ToolbarButton title="Quote" onClick={() => fmt(() => { const s = $getSelection(); if ($isRangeSelection(s)) $setBlocksType(s, () => $createQuoteNode()); })}><Quote className="size-4" /></ToolbarButton>
			<span className="mx-1 h-5 w-px bg-[var(--rule,rgba(0,0,0,0.12))]" />
			<ToolbarButton title="Bullet list" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}><List className="size-4" /></ToolbarButton>
			<ToolbarButton title="Numbered list" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}><ListOrdered className="size-4" /></ToolbarButton>
			<span className="mx-1 h-5 w-px bg-[var(--rule,rgba(0,0,0,0.12))]" />
			<span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Add</span>
			<LabeledButton title="Add a Key Insight panel — placed at the slide's end" onClick={addKeyInsight}><Lightbulb className="size-3.5" />Key insight</LabeledButton>
			<LabeledButton title="Add a Note — rides below the slide" onClick={addNote}><StickyNote className="size-3.5" />Note</LabeledButton>
			<LabeledButton title="Add an Eyebrow label — sits above the heading" onClick={addEyebrow}><Tag className="size-3.5" />Eyebrow</LabeledButton>
		</div>
	);
}

function LabeledButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
	return (
		<button
			type="button"
			title={title}
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--surface-2,rgba(0,0,0,0.06))]"
		>
			{children}
		</button>
	);
}

// Re-import the seed markdown into the editor when a new component is picked
// (token bump). Keyed on the token, NOT the markdown string, so a normal edit
// (which flows OUT through OnChange) never triggers a re-seed loop.
function SeedPlugin({ markdown, token }: { markdown: string; token: number }) {
	const [editor] = useLexicalComposerContext();
	const last = React.useRef(-1);
	React.useEffect(() => {
		if (token === last.current) return;
		last.current = token;
		editor.update(() => {
			$convertFromMarkdownString(markdown, LATTICE_TRANSFORMERS);
		});
	}, [token, markdown, editor]);
	return null;
}

export function ComposeEditor({ seedMarkdown, seedToken, onMarkdownChange }: { seedMarkdown: string; seedToken: number; onMarkdownChange: (md: string) => void }) {
	const onChangeRef = React.useRef(onMarkdownChange);
	onChangeRef.current = onMarkdownChange;
	// biome-ignore lint/correctness/useExhaustiveDependencies: construct-once — seedMarkdown seeds only the first mount; later seeds flow through SeedPlugin.
	const initialConfig = React.useMemo(
		() => ({
			namespace: 'lattice-compose-proto',
			theme: COMPOSE_THEME,
			nodes: LATTICE_NODES as never,
			editorState: () => {
				// Seed the very first mount inside the composer's own update scope.
				$convertFromMarkdownString(seedMarkdown, LATTICE_TRANSFORMERS);
			},
			onError: (e: Error) => {
				// Surface, don't swallow — a transform gap is a real finding for this spike.
				console.error('[compose-proto] lexical error', e);
			},
		}),
		// Construct-once: seedMarkdown only seeds the first mount; later seeds flow
		// through SeedPlugin. (Deliberately not in deps.)
		[],
	);
	return (
		<LexicalComposer initialConfig={initialConfig}>
			<div className="flex h-full flex-col">
				<Toolbar />
				<div className="relative flex-1 overflow-auto">
					<RichTextPlugin
						contentEditable={<ContentEditable className="compose-editable min-h-full px-6 py-5 outline-none" aria-label="Compose slide content" />}
						placeholder={<div className="pointer-events-none absolute left-6 top-5 text-[var(--text-muted,#888)]">Start typing your slide…</div>}
						ErrorBoundary={LexicalErrorBoundary}
					/>
					<HistoryPlugin />
					<ListPlugin />
					<LinkPlugin />
					<MarkdownShortcutPlugin transformers={LATTICE_TRANSFORMERS} />
					<SeedPlugin markdown={seedMarkdown} token={seedToken} />
					<OnChangePlugin
						onChange={(editorState) => {
							editorState.read(() => {
								try {
									onChangeRef.current($convertToMarkdownString(LATTICE_TRANSFORMERS));
								} catch (e) {
									console.error('[compose-proto] export failed', e);
								}
							});
						}}
					/>
				</div>
			</div>
		</LexicalComposer>
	);
}
