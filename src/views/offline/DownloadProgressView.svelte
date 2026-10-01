<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Glass from '../../components/Glass.svelte';
  import Icon from '../../components/Icon.svelte';
  import ProgressBar from '../../components/ProgressBar.svelte';
  import type { DeviceChapter, DownloadedBook } from '../../offline/types';
  import DeviceChapterRow from './DeviceChapterRow.svelte';
  import { decideAnnounce, percent, progressCard, progressOf, progressSpeech, requestChapters, type AnnounceState, type CardAction } from './logic';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /**
   * What a download of one audiobook is doing ([DownloadProgress], O2, O6): the card (progress, pause, cancel, a
   * full device, waiting for Wi-Fi, offline) and the chapters with their words (Downloading, Couldn't download,
   * Out of date). It sits inside the book page. Every message begins with what is kept. The callbacks map to
   * OfflineCommands: pause, resume, cancel, retry(audiobookId, chapterId?), setOptions({ wifiOnly: false }).
   */
  interface Props {
    book: DownloadedBook;
    /** The connection is Wi-Fi/ethernet (StorageInfo.unmetered); null when the browser cannot say. */
    unmetered?: boolean | null;
    /** The chapters to list; defaults to every chapter of the request. */
    rows?: DeviceChapter[];
    onpause?: () => void;
    onresume?: () => void;
    oncancel?: () => void;
    /** Retry one failed chapter, or all failed chapters when no id is given. */
    onretry?: (chapterId?: string) => void;
    /** "Use mobile data": turns Wi-Fi only off for this download. */
    onusemobile?: () => void;
    /** Opens one chapter's update offer (UpdateAudioSheet). */
    onupdate?: (chapterId: string) => void;
    /** Opens Downloads (to free space). */
    onopendownloads?: () => void;
  }
  let { book, unmetered = null, rows, onpause, onresume, oncancel, onretry, onusemobile, onupdate, onopendownloads }: Props = $props();

  const card = $derived(progressCard(book, unmetered));
  const prog = $derived(progressOf(book));
  const listed = $derived(rows ?? requestChapters(book));
  const pct = $derived(percent(prog.fraction));

  // Progress is spoken politely and rarely.
  let spoken = $state('');
  let last: AnnounceState | null = null;
  let lastKind = '';
  $effect(() => {
    const kind = `${book.status}:${prog.done}`;
    const d = decideAnnounce(last, pct, Date.now(), 5000, kind !== lastKind && last !== null && book.status !== 'running');
    if (d.say) spoken = progressSpeech(book);
    last = d.state;
    lastKind = kind;
  });

  function act(a: CardAction) {
    if (a === 'pause') onpause?.();
    else if (a === 'resume' || a === 'try_again') onresume?.();
    else if (a === 'cancel') oncancel?.();
    else if (a === 'retry') onretry?.();
    else if (a === 'mobile') onusemobile?.();
  }
  const LABEL: Record<CardAction, string> = { pause: 'Pause', resume: 'Resume', cancel: 'Cancel', retry: 'Retry', mobile: 'Use mobile data', try_again: 'Try again' };
</script>

<div class="stack">
  {#if card}
    <Glass radius={16} style="margin: 0 20px; padding: 14px" role="group" aria-label="Download of {book.title}">
      <div class="card">
        <div class="head">
          <div class="disc" class:warn={card.icon === 'full' || card.icon === 'offline' || card.icon === 'wifi'} class:bad={card.icon === 'failed'}>
            {#if card.icon === 'pause'}
              <Icon name="pause" size={20} />
            {:else if card.icon === 'wifi' || card.icon === 'offline'}
              <OfflineGlyph name="wifi-off" size={20} />
            {:else}
              <OfflineGlyph name="download" size={20} />
            {/if}
          </div>
          <div class="words">
            <span class="title">{card.title}</span>
            <span class="detail">{card.detail}</span>
          </div>
        </div>
        {#if card.bar}
          <div role="progressbar" aria-label="Downloaded" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
            <ProgressBar value={Math.round(prog.fraction * 100) / 100} height={6} />
          </div>
        {/if}
        <div class="btns">
          {#each card.actions as a (a)}
            <Button variant="glass" style="flex: 1" onclick={() => act(a)}>
              {#if a === 'pause'}<Icon name="pause" size={18} />{/if}{LABEL[a]}
            </Button>
          {/each}
        </div>
        {#if card.linkToDownloads}
          <Button variant="text" style="align-self: center; color: var(--ink)" onclick={onopendownloads}>Review downloads</Button>
        {/if}
      </div>
    </Glass>
  {/if}
  <div class="sr" role="status" aria-live="polite">{spoken}</div>
  {#if listed.length}
    <div class="chapters">
      <span class="h">Chapters</span>
      <Glass radius={16} style="margin: 0 20px; overflow: hidden">
        {#each listed as c, i (c.chapterId)}
          <DeviceChapterRow chapter={c} last={i === listed.length - 1} onretry={(id) => onretry?.(id)} {onupdate} />
        {/each}
      </Glass>
    </div>
  {/if}
</div>

<style>
  .stack { display: flex; flex-direction: column; gap: 14px; font-family: var(--font-ui); }
  .card { display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .disc { width: 40px; height: 40px; border-radius: 20px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .disc.warn { background: rgba(246, 185, 92, 0.2); color: #ffd493; }
  .disc.bad { background: rgba(255, 120, 100, 0.22); color: #ffbcae; }
  .words { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .title { font-size: 15px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .btns { display: flex; align-items: center; gap: 10px; }
  .chapters { display: flex; flex-direction: column; gap: 8px; }
  .h { font-size: 17px; font-weight: 700; color: var(--ink); line-height: 1.35; padding: 0 24px; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
