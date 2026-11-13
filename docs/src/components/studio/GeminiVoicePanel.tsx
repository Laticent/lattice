import { Loader2, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { modelDisplayName } from '@/lib/model-name';
import { selectVoice } from '@/lib/model-selection.js';
import { notify } from '@/lib/notify';
import { getFrontMatter } from '../../lib/front-matter';
import { geminiVoiceCatalog, previewTtsVoice } from './read-aloud';
import { loadActiveDeck, loadSource } from './studio-store';
import { baseLanguage, defaultGeminiLanguage, type GeminiVoiceRecord, geminiLanguages, geminiVoicesFor, voicesForModel } from './tts-voice-catalog';
import { VoicePicker } from './VoicePicker';

type Catalog = Awaited<ReturnType<typeof geminiVoiceCatalog>>;

/** The open deck's `lang:`, read from storage (Workspace › AI has no deck of its own). */
function openDeckLang(): string {
	try {
		const active = loadActiveDeck();
		const src = active ? loadSource(active.deckId) : null;
		return (src && getFrontMatter(src, 'lang')) || '';
	} catch {
		return '';
	}
}
const ANY = 'any';

/**
 * The Gemini voice, on the author's own Gemini key: the live TTS models (curated first, from the
 * provider registry) and the live prebuilt voices. Picking a model or a voice selects the Gemini
 * voice at once. Nothing here calls OpenRouter.
 *
 * The voice list is the 30 named, multilingual voices, plus, behind a language filter, Gemini's
 * locale voices in that language (2,000+ in 39 languages). The filter starts on the open deck's
 * `lang:` when Gemini has voices in it (followups 3079-p3-gemini-locale-voices).
 */
export function GeminiVoicePanel({ model, voice, ready }: { model: string; voice: string; ready: boolean }) {
	const [catalog, setCatalog] = React.useState<Catalog | null>(null);
	const [busy, setBusy] = React.useState(false);
	const [previewing, setPreviewing] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!ready) return;
		let live = true;
		geminiVoiceCatalog().then((c) => {
			if (live) setCatalog(c);
		});
		return () => {
			live = false;
		};
	}, [ready]);
	const models = catalog?.models ?? [];
	const effModel = model || models.find((m) => m.curated)?.id || models[0]?.id || '';
	const records: GeminiVoiceRecord[] = React.useMemo(() => (catalog?.records as GeminiVoiceRecord[] | undefined) ?? [], [catalog]);
	const languages = React.useMemo(() => geminiLanguages(records), [records]);
	// The filter: the author's pick, else the deck's language, else the named voices only. The deck's
	// language and the default are read once per catalog, not on every render (2,114 records).
	const [picked, setPicked] = React.useState<string | null>(null);
	const lang = React.useMemo(() => picked ?? defaultGeminiLanguage(records, openDeckLang()), [picked, records]);
	// The stored voice's own language wins over the default, so a chosen locale voice is never hidden.
	const voiceLang = React.useMemo(() => baseLanguage(records.find((r) => r.id === voice && !r.named)?.language), [records, voice]);
	const shownLang = picked ?? (voiceLang || lang);
	const voices = React.useMemo(() => geminiVoicesFor(records, voicesForModel(effModel, catalog?.voices ?? []).map((v) => v.id), shownLang), [effModel, catalog, records, shownLang]);
	const play = async (v?: string) => {
		setBusy(true);
		const res = await previewTtsVoice({ rung: 'gemini', model: effModel, voice: v ?? voice });
		setBusy(false);
		if (!res.ok) notify(res.error || 'Could not play a sample.');
	};
	return (
		<div>
			<div className="mb-2 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Voice model</div>
			<Select value={effModel} onValueChange={(id) => selectVoice({ provider: 'gemini', model: id })} disabled={!ready || !models.length}>
				<SelectTrigger aria-label="Gemini voice model" className="h-auto w-full border-border px-2.5 py-1.5 text-[12.5px]">
					<SelectValue placeholder={ready ? 'Loading Gemini’s models…' : 'Add a Gemini key to choose'} />
				</SelectTrigger>
				<SelectContent>
					{models.map((m) => (
						<SelectItem key={m.id} value={m.id}>
							{modelDisplayName({ id: m.id, name: m.name })}
							{m.curated ? ' · recommended' : ''}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{languages.length ? (
				<div className="mt-3">
					<div className="mb-2 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">Language</div>
					<Select value={shownLang || ANY} onValueChange={(v) => setPicked(v === ANY ? '' : v)} disabled={!ready}>
						<SelectTrigger aria-label="Voice language" className="h-auto w-full border-border px-2.5 py-1.5 text-[12.5px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ANY}>Multilingual voices only</SelectItem>
							{languages.map((l) => (
								<SelectItem key={l.code} value={l.code}>
									{l.label} · {l.count} voices
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : null}
			<div className="mt-3">
				<VoicePicker
					label="Voice"
					ariaLabel="Gemini TTS voice"
					modelId={effModel}
					voices={voices}
					value={voice}
					onPick={(v) => {
						selectVoice({ provider: 'gemini', model: model || undefined, voice: v });
						void play(v);
					}}
					onPreview={async (v) => {
						setPreviewing(v);
						await previewTtsVoice({ rung: 'gemini', model: effModel, voice: v });
						setPreviewing(null);
					}}
					previewingId={previewing}
					disabled={!ready}
				/>
			</div>
			<div className="mt-2">
				<button
					type="button"
					onClick={() => play()}
					disabled={busy || !ready}
					className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] disabled:opacity-50"
				>
					{busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
					{busy ? 'Playing…' : 'Play sample'}
				</button>
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Speaks on your own Gemini key; Gemini bills it. Speed is not adjustable on Gemini voices.</p>
		</div>
	);
}
