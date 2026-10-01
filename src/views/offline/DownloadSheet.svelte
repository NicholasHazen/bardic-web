<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import OptionCard from '../../components/OptionCard.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SwitchRow from '../sheets/SwitchRow.svelte';
  import type { DownloadPreview, DownloadScope } from '../../offline/types';
  import type { PickChapter } from './types';
  import { canStart, doesNotFitText, downloadLabel, freeSpaceText, previewDetail, sizeText, type ScopeKind } from './logic';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /**
   * Download to this device ([DownloadSheet], O1): what is ready now, the whole book as it is made, or chosen
   * chapters, with the size, the free space (unknown when the browser cannot say, never 0), a Wi-Fi only option and a
   * keep downloading new chapters option. The button names what it does and the size. The numbers come from
   * `OfflineCommands.preview`; `onstart` maps to `OfflineCommands.start(audiobookId, scope, opts)`.
   */
  interface Props {
    /** The voice of the audiobook (the eyebrow). */
    voiceName: string;
    scope?: ScopeKind;
    /** One preview per scope; null while it is being worked out. */
    previews: { ready_now: DownloadPreview | null; whole_book: DownloadPreview | null; chapters: DownloadPreview | null };
    /** Bytes for the whole book including chapters not made yet, when the server can estimate it ("about 240 MB"). */
    wholeBookEstimate?: number | null;
    /** For "Choose chapters". */
    chapters?: PickChapter[];
    selected?: string[];
    wifiOnly?: boolean;
    keepNew?: boolean;
    /** Free space on this device; null when the browser cannot say. */
    freeBytes: number | null;
    /** The connection is Wi-Fi/ethernet; null when the browser cannot say. */
    unmetered?: boolean | null;
    /** The preview or the start failed; the message begins with what is kept. */
    error?: string;
    busy?: boolean;
    onscope?: (kind: ScopeKind) => void;
    onchoose?: (chapterIds: string[]) => void;
    onwifionly?: (on: boolean) => void;
    onkeepnew?: (on: boolean) => void;
    onstart?: (scope: DownloadScope, opts: { wifiOnly: boolean; keepNew: boolean }) => void;
    onopendownloads?: () => void;
    onclose?: () => void;
    placement?: 'bottom' | 'popover';
    fixed?: boolean;
    scrim?: number;
  }
  let {
    voiceName,
    scope = $bindable('ready_now'),
    previews,
    wholeBookEstimate = null,
    chapters = [],
    selected = $bindable([]),
    wifiOnly = $bindable(true),
    keepNew = $bindable(true),
    freeBytes,
    unmetered = null,
    error,
    busy = false,
    onscope,
    onchoose,
    onwifionly,
    onkeepnew,
    onstart,
    onopendownloads,
    onclose,
    placement = 'bottom',
    fixed = false,
    scrim,
  }: Props = $props();

  const active = $derived(previews[scope]);
  const label = $derived(downloadLabel(scope, active));
  const startable = $derived(canStart(active) && !busy);
  const wifiDetail = $derived(unmetered === null && wifiOnly ? 'Skips mobile data. This browser can’t tell Wi-Fi from mobile data, so downloads wait.' : 'Skips mobile data');
  const options: { kind: ScopeKind; title: string }[] = [
    { kind: 'ready_now', title: 'What is ready now' },
    { kind: 'whole_book', title: 'The whole book, as it is made' },
    { kind: 'chapters', title: 'Choose chapters' },
  ];

  function choose(kind: ScopeKind) {
    scope = kind;
    onscope?.(kind);
  }
  function toggleChapter(id: string) {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onchoose?.(selected);
  }
  function start() {
    if (!startable) return;
    const s: DownloadScope = scope === 'chapters' ? { kind: 'chapters', chapterIds: selected } : { kind: scope };
    onstart?.(s, { wifiOnly, keepNew: keepNew || scope === 'whole_book' });
  }
</script>

<Sheet title="Download to this device" eyebrow={voiceName} {onclose} {placement} {fixed} {scrim}>
  <div class="options" role="radiogroup" aria-label="What to download">
    {#each options as o (o.kind)}
      <OptionCard title={o.title} detail={previewDetail(o.kind, previews[o.kind], selected.length, wholeBookEstimate)} selected={scope === o.kind} disabled={busy} onselect={() => choose(o.kind)} />
    {/each}
  </div>
  {#if scope === 'chapters'}
    <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
      <div class="pick" role="group" aria-label="Chapters">
        {#each chapters as c (c.id)}
          {@const on = selected.includes(c.id)}
          {@const off = c.onDevice || !c.ready}
          <button type="button" class="pickrow" role="checkbox" aria-checked={on || c.onDevice} disabled={off || busy} onclick={() => toggleChapter(c.id)}>
            <span class="box" class:on={on || c.onDevice}>{#if on || c.onDevice}<OfflineGlyph name="check" size={14} color="#1a1206" />{/if}</span>
            <span class="num">{c.number}</span>
            <span class="ctitle">{c.title}</span>
            <span class="csub">{c.onDevice ? 'On this device' : !c.ready ? 'Not yet' : c.bytes === null ? '' : sizeText(c.bytes)}</span>
          </button>
        {/each}
      </div>
    </Glass>
  {/if}
  <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
    <div class="r first"><SwitchRow label="Wi-Fi only" detail={wifiDetail} checked={wifiOnly} onchange={(v) => { wifiOnly = v; onwifionly?.(v); }} /></div>
    <div class="r"><SwitchRow label="Keep downloading new chapters" detail="As they become ready, on Wi-Fi" checked={keepNew || scope === 'whole_book'} onchange={(v) => { keepNew = v; onkeepnew?.(v); }} /></div>
  </Glass>
  {#if active && active.fits === false}
    <Callout tone="warn" title="This won’t fit on this device">
      {doesNotFitText(active)}
      {#snippet actions()}{#if onopendownloads}<Button variant="glass" onclick={onopendownloads}>Review downloads</Button>{/if}{/snippet}
    </Callout>
  {/if}
  {#if error}
    <Callout tone="error" title="Couldn’t start the download">{error}</Callout>
  {/if}
  <span class="foot">{freeSpaceText(freeBytes)}. Downloaded chapters play without your Bardic computer.</span>
  <div class="actions">
    <Button size={52} style="width: 100%" disabled={!startable} aria-busy={busy} onclick={start}><OfflineGlyph name="download" size={18} />{label}</Button>
    <Button variant="text" style="width: 100%; color: var(--ink)" onclick={() => onclose?.()}>Not now</Button>
  </div>
</Sheet>

<style>
  .options { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
  .r { min-height: 58px; display: flex; align-items: center; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .r:not(.first) { border-bottom: 0; }
  .foot { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .pick { max-height: 240px; overflow-y: auto; }
  .pickrow { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 14px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: none; text-align: left; cursor: pointer; font-family: var(--font-ui); color: var(--ink); }
  .pickrow:disabled { opacity: 0.72; cursor: default; }
  .pickrow:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .box { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-sizing: border-box; }
  .box.on { background: var(--accent); border-color: var(--accent); }
  .num { font-size: 13px; font-weight: 700; color: var(--muted); width: 22px; }
  .ctitle { font-family: var(--font-book); font-size: 15px; flex: 1; min-width: 0; line-height: 1.35; }
  .csub { font-size: 12px; color: var(--muted); }
</style>
