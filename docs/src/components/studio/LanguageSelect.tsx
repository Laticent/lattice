import { Globe } from 'lucide-react';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveSupported, STUDIO_LANGUAGES } from './studio-language';
import { flagSrc } from './tts-voice-catalog';

// The ONE flagged language dropdown, shared by two surfaces (HARD RULE #15 — one
// widget, not a fork per surface): the Workspace General tab (the workspace-wide
// DEFAULT everyone inherits) and the deck Inspector (a per-deck `lang:` OVERRIDE).
// Both render the same rows — a vendored flag SVG + the English label — so the two
// pickers read as one control in two places. Only `includeAuto` differs.

// The deck picker's leading "inherit the workspace default" choice. Radix Select
// can't hold '' as an item value (an empty value clears the control), so the
// Automatic row carries this sentinel; the caller maps it to/from an ABSENT `lang:`
// front-matter key (present key = override, absent = inherit).
export const LANG_AUTO = '__auto__';

// A country flag as a vendored SVG (flagSrc → /flags/<cc>.svg), never an emoji —
// emoji flags don't render on Windows. Decorative (the adjacent label is the name),
// so alt="" + aria-hidden; hidden on a load error rather than a broken image, and
// only fetched when a rendered row uses it.
function Flag({ code }: { code: string }) {
	const [failed, setFailed] = React.useState(false);
	const src = flagSrc(code);
	if (!src || failed) return null;
	return <img src={src} alt="" aria-hidden loading="lazy" onError={() => setFailed(true)} className="h-3 w-4 shrink-0 rounded-[1px] object-cover" />;
}

export function LanguageSelect({
	value,
	onValueChange,
	includeAuto = false,
	autoLabel = 'Automatic — workspace default',
	ariaLabel = 'Language',
	className,
}: {
	/** The selected code — a language `code`, or `LANG_AUTO` when `includeAuto` and nothing is pinned. */
	value: string;
	onValueChange: (code: string) => void;
	/** Prepend the "inherit the workspace default" row (deck override picker only). */
	includeAuto?: boolean;
	/** Label for the Automatic row — pass the resolved default (e.g. "Automatic — English (US)"). */
	autoLabel?: string;
	ariaLabel?: string;
	className?: string;
}) {
	// NORMALIZE the incoming value to a catalog code before matching, so a valid but
	// non-canonical English tag — `en`, `en-us`, `EN-GB`, the ubiquitous document-lang
	// forms the engine/exports/AI all accept — resolves to its item instead of being
	// branded "unsupported" over a spurious exact-string miss. A genuinely-dropped locale
	// (`fr-FR`, `es`) resolves to null and keeps its raw form. `LANG_AUTO` is left as-is.
	const shown = value === LANG_AUTO ? LANG_AUTO : (resolveSupported(value) ?? value);
	// A value with no matching item — a legacy/imported locale no longer in the English-
	// only list — would otherwise leave a Radix Select trigger BLANK. Surface it as its
	// own row (raw code, no flag) so the control stays honest and the user can switch off it.
	const known = shown === LANG_AUTO || STUDIO_LANGUAGES.some((l) => l.code === shown);
	return (
		<Select value={shown} onValueChange={onValueChange}>
			<SelectTrigger className={cn('w-full', className)} aria-label={ariaLabel}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{includeAuto && (
					<SelectItem value={LANG_AUTO}>
						<Globe className="size-3.5 text-muted-foreground" />
						<span>{autoLabel}</span>
					</SelectItem>
				)}
				{STUDIO_LANGUAGES.map((l) => (
					<SelectItem key={l.code} value={l.code}>
						<Flag code={l.flag} />
						<span>{l.label}</span>
					</SelectItem>
				))}
				{!known && shown && (
					<SelectItem value={shown}>
						<Globe className="size-3.5 text-muted-foreground" />
						<span>{shown} (unsupported)</span>
					</SelectItem>
				)}
			</SelectContent>
		</Select>
	);
}
