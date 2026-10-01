<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    chooserDetail,
    freeNote as freeNoteOf,
    geminiReady,
    groupVoices,
    initialVoiceId,
    isPreview,
    needsSetup,
    premiumNote,
    previewVoices,
    sampleCost,
    tabForVoice,
    toRow,
    type Audiobook,
    type ChooserTab,
    type Voice,
  } from '../../lib/voiceText';
  import { listenerStore } from '../../state/listener';
  import { chooseVoiceForBook, listenerSettings, loadBookContext, samples, settingsActions, sources, voiceActions, voices, type BookVoiceContext } from '../../state/voices';
  import ChooserView from './ChooserView.svelte';
  import SetupVoice from './SetupVoice.svelte';

  /**
   * Choose a voice for a book ([VoiceFree], [VoicePremium], [VoiceNoAccount]; V1 to V4), and the first-time
   * set up ([SetupVoice], V8) when no source is set up. The book page opens it from the Audiobook card.
   *
   * - A free voice: choosing it makes (or finds) the book's audiobook, which is free and makes no audio.
   *   "Start listening" and "Make the whole book ready" call `onstart` / `onmakeready` with that audiobook.
   * - A premium voice: choosing it only selects it. Nothing is requested, played or spent; "Plan the whole book" and
   *   "Plan from chapter N" call `onplan`, which the plan flow (W4) supplies.
   * - An example button asks the server for a short sample; a premium one counts toward spending and needs a Gemini key.
   */
  interface Props {
    bookId: string;
    onclose?: () => void;
    /** Start listening with this audiobook (the player, W3). Defaults to closing the sheet. */
    onstart?: (audiobook: Audiobook) => void;
    /** Make this free audiobook ready (the confirmation, W2 book page). Defaults to closing the sheet. */
    onmakeready?: (audiobook: Audiobook) => void;
    /** Open the plan sheet (W4) for a premium voice. Without it the plan buttons do nothing yet. */
    onplan?: (plan: { voice: Voice; scope: 'whole_book' | 'from_chapter' }) => void;
    placement?: 'bottom' | 'popover';
  }
  let { bookId, onclose, onstart, onmakeready, onplan, placement = 'bottom' }: Props = $props();

  const listenerId = $derived($listenerStore.currentId);
  let context = $state<BookVoiceContext>({ audiobooks: [], fromChapter: null });
  let tab = $state<ChooserTab>('Free');
  let selectedId = $state<string | null>(null);
  let ready = $state(false);
  let busy = $state(false);
  let error = $state('');

  const keyOk = $derived(geminiReady($sources.items));
  const real = $derived(groupVoices($voices.items));
  // Before a key is set the server has no Gemini voices; show a few by name so the listener sees what premium is.
  const groups = $derived({ free: real.free, premium: real.premium.length ? real.premium : keyOk ? [] : previewVoices });
  const gemini = $derived($sources.items.find((s) => s.kind === 'gemini'));
  const keyProblem = $derived(keyOk ? null : gemini?.state === 'key_rejected' ? ('rejected' as const) : ('missing' as const));
  const setup = $derived(ready && needsSetup($sources.items, $voices.items.length));
  const hint = (v: Voice) => sampleCost(v, keyOk).note;
  const freeRows = $derived(groups.free.map((v) => ({ ...toRow(v, chooserDetail), hint: hint(v) })));
  const premiumRows = $derived(groups.premium.map((v) => ({ ...toRow(v, chooserDetail), hint: hint(v) })));
  const visibleIds = $derived(new Set((tab === 'Free' ? groups.free : groups.premium).map((v) => v.id)));
  const status = $derived($samples.voiceId && visibleIds.has($samples.voiceId) && $samples.phase !== 'error' ? $samples.message : '');
  const sampleError = $derived($samples.voiceId && visibleIds.has($samples.voiceId) && $samples.phase === 'error' ? $samples.message : '');

  onMount(() => {
    void (async () => {
      const id = $listenerStore.currentId;
      const [, , ctx] = await Promise.all([voiceActions.openVoiceScreen(), id ? settingsActions.load(id) : undefined, id ? loadBookContext(bookId, id) : undefined]);
      if (ctx) context = ctx;
      const first = initialVoiceId($voices.items, context.audiobooks, $listenerSettings.settings);
      const v = $voices.items.find((x) => x.id === first);
      // With nothing chosen yet, the first free voice that can be used is shown as the choice (as the board does); the
      // audiobook is made when the listener presses Start listening or Make ready, or chooses a voice themselves.
      selectedId = first ?? groupVoices($voices.items).free.find((x) => x.available)?.id ?? null;
      tab = v ? tabForVoice(v) : groupVoices($voices.items).free.length === 0 && groupVoices($voices.items).premium.length > 0 ? 'Premium' : 'Free';
      ready = true;
    })();
  });
  onDestroy(() => samples.stop());

  const voiceOf = (id: string) => [...$voices.items, ...previewVoices].find((v) => v.id === id);

  function hear(id: string) {
    const v = voiceOf(id);
    if (v) void samples.hear(v, keyOk);
  }

  /** The audiobook for a free voice: made now if it does not exist (free, no audio). */
  async function audiobookFor(id: string): Promise<Audiobook | null> {
    busy = true;
    error = '';
    const r = await chooseVoiceForBook(bookId, id);
    busy = false;
    if (!r.ok) {
      error = r.code === 'voice_unavailable' ? 'That voice can’t be used until its source is reachable. Nothing was changed.' : `Nothing was changed. ${r.detail}`;
      return null;
    }
    context = { ...context, audiobooks: [...context.audiobooks.filter((a) => a.id !== r.value.id), r.value] };
    return r.value;
  }

  async function pick(id: string) {
    const v = voiceOf(id);
    if (!v) return;
    error = '';
    if (isPreview(id)) return; // an example of what premium offers, not yet a voice of the server
    selectedId = id;
    if (v.tier === 'premium') return; // V4: selecting a premium voice requests nothing
    const ab = await audiobookFor(id);
    if (ab && listenerId && !$listenerSettings.settings?.default_voice_id) {
      // V8: the first voice a listener chooses becomes their default.
      await settingsActions.setDefaultVoice(listenerId, id);
    }
  }

  async function chosenFree(): Promise<Audiobook | null> {
    const v = selectedId ? voiceOf(selectedId) : undefined;
    if (!v || v.tier !== 'free') return null;
    return context.audiobooks.find((a) => a.voice_id === v.id) ?? (await audiobookFor(v.id));
  }

  async function start() {
    const ab = await chosenFree();
    if (!ab) return;
    if (onstart) onstart(ab);
    else onclose?.();
  }
  async function makeReady() {
    const ab = await chosenFree();
    if (!ab) return;
    if (onmakeready) onmakeready(ab);
    else onclose?.();
  }
  function plan(scope: 'whole_book' | 'from_chapter') {
    const v = selectedId ? voiceOf(selectedId) : undefined;
    if (v && v.tier === 'premium') onplan?.({ voice: v, scope });
  }
  function leaveTo(hash: string) {
    location.hash = hash;
    onclose?.();
  }
  async function afterSetup() {
    await voiceActions.openVoiceScreen();
  }
</script>

{#if setup}
  <SetupVoice {onclose} oncomplete={afterSetup} load={false} {placement} />
{:else}
  <ChooserView
    {tab}
    {freeRows}
    {premiumRows}
    {selectedId}
    playingId={$samples.phase === 'loading' || $samples.phase === 'playing' ? $samples.voiceId : null}
    freeNote={freeNoteOf($voices.items.filter((v) => v.tier === 'free'))}
    premiumNote={premiumNote()}
    {keyProblem}
    fromChapter={context.fromChapter}
    {status}
    error={error || sampleError}
    {busy}
    {placement}
    fixed
    {onclose}
    ontab={(t) => (tab = t)}
    onhear={hear}
    onpick={pick}
    onstart={start}
    onmakeready={makeReady}
    onplanwhole={() => plan('whole_book')}
    onplanfrom={() => plan('from_chapter')}
    onaddkey={() => leaveTo('#/settings/premium')}
    onstayfree={() => (tab = 'Free')}
    onsources={() => leaveTo('#/settings/voices')}
  />
{/if}
