<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { ChooserTab, PremiumNote, VoiceRowModel } from '../../lib/voiceText';
  import Glyph from './Glyph.svelte';
  import VoiceList from './VoiceList.svelte';

  /** Choose a voice for a book: Free (Breeze, then this computer) and Premium (Gemini). V1 to V4. */
  interface Props {
    tab: ChooserTab;
    freeRows: VoiceRowModel[];
    premiumRows: VoiceRowModel[];
    selectedId?: string | null;
    /** The voice whose example is playing. */
    playingId?: string | null;
    freeNote: { title: string; body: string };
    premiumNote: PremiumNote;
    /** Premium needs a Google key the server accepts; otherwise the tab explains and offers to add or fix it. */
    keyProblem?: 'missing' | 'rejected' | null;
    /** "Plan from chapter N", when the listener is past the start. */
    fromChapter?: number | null;
    /** What the last example did, in words (playing, counted, could not play). */
    status?: string;
    error?: string;
    busy?: boolean;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    onclose?: () => void;
    ontab?: (t: ChooserTab) => void;
    onhear?: (id: string) => void;
    onpick?: (id: string) => void;
    onstart?: () => void;
    onmakeready?: () => void;
    onplanwhole?: () => void;
    onplanfrom?: () => void;
    onaddkey?: () => void;
    onstayfree?: () => void;
    onsources?: () => void;
  }
  let {
    tab,
    freeRows,
    premiumRows,
    selectedId = null,
    playingId = null,
    freeNote,
    premiumNote,
    keyProblem = null,
    fromChapter = null,
    status = '',
    error = '',
    busy = false,
    placement = 'bottom',
    fixed = false,
    onclose,
    ontab,
    onhear,
    onpick,
    onstart,
    onmakeready,
    onplanwhole,
    onplanfrom,
    onaddkey,
    onstayfree,
    onsources,
  }: Props = $props();

  const freeChosen = $derived(freeRows.some((r) => r.id === selectedId && !r.unavailable));
  const premiumChosen = $derived(premiumRows.some((r) => r.id === selectedId && !r.unavailable));
</script>

<Sheet title="Choose a voice" eyebrow="Audiobook" {onclose} {placement} {fixed}>
  <Segmented options={['Free', 'Premium']} value={tab} label="Voice tier" width="100%" onchange={(v) => ontab?.(v as ChooserTab)} />

  {#if tab === 'Free'}
    {#if freeRows.length === 0}
      <Callout title="No free voices yet">
        Set up Breeze, or use the voices already on your Bardic computer.
        {#snippet actions()}<Button variant="glass" onclick={() => onsources?.()}>Open Voices</Button>{/snippet}
      </Callout>
    {:else}
      {#if status || error}<p class="live" class:err={!!error} role="status">{error || status}</p>{/if}
      <VoiceList rows={freeRows} {selectedId} {playingId} label="Free voices" scroll {onhear} {onpick} />
      <Callout title={freeNote.title}>{freeNote.body}</Callout>
      <div class="actions">
        <Button size={52} style="width:100%" disabled={!freeChosen || busy} onclick={() => onstart?.()} icon="play">Start listening</Button>
        <Button variant="glass" style="width:100%;min-height:48px;border-radius:24px" disabled={!freeChosen || busy} onclick={() => onmakeready?.()}>
          <Glyph name="sparkle" size={18} />Make the whole book ready
        </Button>
      </div>
    {/if}
  {:else}
    {#if status || error}<p class="live" class:err={!!error} role="status">{error || status}</p>{/if}
    <VoiceList rows={premiumRows} {selectedId} {playingId} label="Premium voices" scroll {onhear} {onpick} />
    {#if keyProblem}
      {#if keyProblem === 'rejected'}
        <Callout tone="error" title="Google rejected your key">Audio already made is kept. Premium examples and plans need a working key.</Callout>
      {:else}
        <Callout title="Premium voices need an account">Add your Google API key once. Bardic shows an estimate and a limit before anything is spent.</Callout>
      {/if}
      <div class="actions">
        <Button size={52} style="width:100%" onclick={() => onaddkey?.()}><Glyph name="key" size={18} />{keyProblem === 'rejected' ? 'Fix Google key' : 'Add Google key'}</Button>
        <Button variant="text" style="width:100%;color:var(--ink)" onclick={() => onstayfree?.()}>Stay with free voices</Button>
      </div>
    {:else}
      <Callout tone="warn" title={premiumNote.title}>{premiumNote.body}</Callout>
      <div class="actions">
        <Button size={52} style="width:100%" disabled={!premiumChosen} onclick={() => onplanwhole?.()}><Glyph name="sparkle" size={18} />Plan the whole book</Button>
        {#if fromChapter}
          <Button variant="glass" style="width:100%;min-height:48px;border-radius:24px" disabled={!premiumChosen} onclick={() => onplanfrom?.()}>
            <Glyph name="sparkle" size={18} />Plan from chapter {fromChapter}
          </Button>
        {/if}
      </div>
    {/if}
  {/if}
</Sheet>

<style>
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .live { margin: 0; font-family: var(--font-ui); font-size: 13px; line-height: 1.35; color: var(--muted); }
  .live.err { color: #ffbcae; }
</style>
