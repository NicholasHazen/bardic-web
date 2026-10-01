<script lang="ts">
  import Callout from '../../components/Callout.svelte';
  import type { VoiceRowModel } from '../../lib/voiceText';
  import ScreenHead from './ScreenHead.svelte';
  import VoiceList from './VoiceList.svelte';

  /** Settings > Default voice (V6): used when the listener presses play on a book with no audiobook yet. */
  interface Props {
    rows: VoiceRowModel[];
    selectedId: string | null;
    playingId?: string | null;
    status?: string;
    error?: string;
    loading?: boolean;
    onback?: () => void;
    onpick?: (id: string) => void;
    onhear?: (id: string) => void;
  }
  let { rows, selectedId, playingId = null, status = '', error = '', loading = false, onback, onpick, onhear }: Props = $props();
</script>

<div class="col">
  <ScreenHead title="Default voice" {onback} />
  <div class="pad strut"><span class="desc">Used when you press play on a book with no audiobook yet. You can always choose another voice for a book.</span></div>
  {#if rows.length}
    {#if status || error}<p class="live" class:err={!!error} role="status">{error || status}</p>{/if}
    <VoiceList {rows} {selectedId} {playingId} label="Default voice" style="margin:0 20px" {onpick} {onhear} />
  {:else}
    <div class="pad"><span class="desc">{loading ? 'Looking for voices…' : 'No voices yet. Set one up in Settings › Voices.'}</span></div>
  {/if}
  <div class="padb">
    <Callout title="If you pick a premium voice">Pressing play on a new book asks for a plan first. Bardic never spends money without one.</Callout>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 14px; }
  .pad { padding: 0 24px; }
  .padb { padding: 0 20px; }
  .desc { font-family: var(--font-ui); font-size: 14px; color: var(--muted); line-height: 1.5; }
  /* The design draws this text inline in a plain block, so the line box also holds the default text strut. */
  .strut { font-family: serif; line-height: normal; }
  .live { margin: 0 24px; font-family: var(--font-ui); font-size: 13px; line-height: 1.35; color: var(--muted); }
  .live.err { color: #ffbcae; }
</style>
