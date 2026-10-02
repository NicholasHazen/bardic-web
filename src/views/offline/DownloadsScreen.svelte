<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Cover from '../../components/Cover.svelte';
  import Glass from '../../components/Glass.svelte';
  import Segmented from '../../components/Segmented.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { DownloadedBook, OfflineState, RemovedDownload, UpdateOffer } from '../../offline/types';
  import RoundButton from '../shell/RoundButton.svelte';
  import SwitchRow from '../sheets/SwitchRow.svelte';
  import { barPercent, chapterCount, downloadedLine, freeSpaceText, removeConfirmText, removedBookLine, removeFinishedLabel, REMOVE_AFTER_CHOICES, REMOVE_AFTER_DEFAULT, sizeText, usedFraction } from './logic';
  import OfflineGlyph from './OfflineGlyph.svelte';

  /**
   * Downloads ([Downloads], O7, O8): what is held on this device and how much room is left, a way to remove each
   * book, the device rules, and the offers to remove downloads of books taken out of the library. Removing is for this
   * device only; the copy says so and nothing here touches the Bardic computer. Presentational: takes (a slice of)
   * OfflineState. `onremove` maps to `OfflineCommands.remove(audiobookId)`, `onsetremovedays` to
   * `setRemoveFinishedAfterDays`, `onwifionly` to `setOptions(id, { wifiOnly })` for every book.
   */
  interface Props {
    offline: Pick<OfflineState, 'storage' | 'books' | 'updates' | 'removedBooks' | 'removeFinishedAfterDays'>;
    /** The Wi-Fi only rule; defaults to "every downloaded book is Wi-Fi only". */
    wifiOnly?: boolean;
    /** A removal is running. */
    busy?: boolean;
    /** A removal failed; begins with what is kept. */
    error?: string;
    onback?: () => void;
    onopenbook?: (bookId: string) => void;
    /** Remove a book's downloads from this device (after the listener confirmed). */
    onremove?: (audiobookId: string) => void;
    onwifionly?: (on: boolean) => void;
    onsetremovedays?: (days: number | null) => void;
    /** Open the newer audio of an audiobook (UpdateAudioSheet). */
    onreviewupdates?: (audiobookId: string) => void;
    /** Placement of the confirmation sheet; the app uses `fixed`. */
    fixed?: boolean;
  }
  let { offline, wifiOnly, busy = false, error, onback, onopenbook, onremove, onwifionly, onsetremovedays, onreviewupdates, fixed = false }: Props = $props();

  const storage = $derived(offline.storage);
  const fraction = $derived(usedFraction(storage));
  const wifi = $derived(wifiOnly ?? (offline.books.length > 0 && offline.books.every((b) => b.wifiOnly)));
  const days = $derived(offline.removeFinishedAfterDays);
  const updateGroups = $derived(groupUpdates(offline.updates));

  function groupUpdates(updates: UpdateOffer[]): { audiobookId: string; title: string; count: number }[] {
    const out = new Map<string, { audiobookId: string; title: string; count: number }>();
    for (const u of updates) {
      const g = out.get(u.audiobookId) ?? { audiobookId: u.audiobookId, title: offline.books.find((b) => b.audiobookId === u.audiobookId)?.title ?? 'a book', count: 0 };
      g.count++;
      out.set(u.audiobookId, g);
    }
    return [...out.values()];
  }

  /** The book being confirmed for removal. */
  let confirm: { audiobookId: string; title: string; heldBytes: number } | null = $state(null);
  function ask(b: DownloadedBook | RemovedDownload) {
    confirm = { audiobookId: b.audiobookId, title: b.title, heldBytes: b.heldBytes };
  }
  function doRemove() {
    const c = confirm;
    confirm = null;
    if (c) onremove?.(c.audiobookId);
  }
</script>

<div class="page">
  <div class="top">
    <RoundButton label="Back" icon="back" onclick={onback} />
    <h1>Downloads</h1>
  </div>

  <Glass radius={16} style="margin: 0 20px; padding: 14px">
    <div class="used">
      <div class="line">
        <span class="k">On this device</span>
        <span class="v">{sizeText(storage.usedBytes)}</span>
      </div>
      {#if fraction !== null}
        <div class="bar" role="img" aria-label="{sizeText(storage.usedBytes)} used, {sizeText(storage.freeBytes)} free"><div class="fill" style:width="{barPercent(fraction, (storage.usedBytes ?? 0) > 0)}%"></div></div>
      {/if}
      <span class="free">{freeSpaceText(storage.freeBytes)}</span>
    </div>
  </Glass>

  {#if !storage.persisted}
    <div class="msg">
      <Callout tone="warn" title="This browser may clear downloads">
        Downloads stay unless this browser needs the room. Adding Bardic to your home screen asks it to keep them.
      </Callout>
    </div>
  {/if}
  {#if error}
    <div class="msg"><Callout tone="error" title="Couldn’t remove the download">{error}</Callout></div>
  {/if}

  {#each updateGroups as g (g.audiobookId)}
    <div class="msg">
      <Callout tone="info" title="Newer audio is available">
        {g.title} has {chapterCount(g.count)} with newer audio. Nothing changes until you choose.
        {#snippet actions()}<Button variant="glass" onclick={() => onreviewupdates?.(g.audiobookId)}>See what changed</Button>{/snippet}
      </Callout>
    </div>
  {/each}

  {#if offline.removedBooks.length}
    <div class="section">
      <span class="label">Removed from your library · {offline.removedBooks.length}</span>
      <Glass radius={16} style="margin: 0 20px; overflow: hidden">
        {#each offline.removedBooks as r, i (r.audiobookId)}
          <div class="removed" class:last={i === offline.removedBooks.length - 1}>
            <div class="words">
              <span class="name">{r.title}</span>
              <span class="sub">{removedBookLine(r.heldBytes)}</span>
            </div>
            <Button variant="remove" disabled={busy} aria-label="Remove {r.title} from this device" onclick={() => ask(r)}>Remove</Button>
          </div>
        {/each}
      </Glass>
      <span class="note">These books are no longer in your library. Their downloads are still here until you remove them.</span>
    </div>
  {/if}

  <div class="section">
    <span class="label">Downloaded · {offline.books.length}</span>
    {#if offline.books.length}
      <Glass radius={16} style="margin: 0 20px; overflow: hidden">
        {#each offline.books as b, i (b.audiobookId)}
          <div class="book" class:last={i === offline.books.length - 1}>
            <Cover color={b.coverColor} src={b.coverSrc} width={40} height={60} radius={6} pad={5} shadowY={5} shadowBlur={10} />
            <button type="button" class="open" onclick={() => onopenbook?.(b.bookId)}>
              <span class="name">{b.title}</span>
              <span class="sub">{downloadedLine(b)}</span>
            </button>
            <button type="button" class="trash" aria-label="Remove {b.title}" disabled={busy} onclick={() => ask(b)}><OfflineGlyph name="trash" size={18} /></button>
          </div>
        {/each}
      </Glass>
    {:else}
      <span class="note">Nothing is downloaded. Download a book from its page to listen without your Bardic computer.</span>
    {/if}
  </div>

  <div class="section">
    <span class="label">Rules</span>
    <Glass radius={16} style="margin: 0 20px; overflow: hidden">
      <div class="rule first"><SwitchRow label="Wi-Fi only" detail="Skips mobile data" checked={wifi} onchange={(v) => onwifionly?.(v)} /></div>
      <div class="rule tall">
        <SwitchRow label={removeFinishedLabel(days)} detail="Ready audio stays on your Bardic computer" checked={days !== null} onchange={(v) => onsetremovedays?.(v ? REMOVE_AFTER_DEFAULT : null)} />
      </div>
      {#if days !== null}
        <div class="choose">
          <Segmented label="Remove finished books after" width="100%" options={REMOVE_AFTER_CHOICES.map((d) => `${d} days`)} value="{days} days" onchange={(v) => onsetremovedays?.(parseInt(v, 10))} />
        </div>
      {/if}
    </Glass>
  </div>
</div>

{#if confirm}
  <Sheet title="Remove from this device?" eyebrow={confirm.title} {fixed} onclose={() => (confirm = null)}>
    <p class="explain">{removeConfirmText(confirm.title, confirm.heldBytes)}</p>
    <div class="actions">
      <Button variant="remove" size={52} style="width: 100%" onclick={doRemove}>Remove {sizeText(confirm.heldBytes)} from this device</Button>
      <Button variant="text" style="width: 100%; color: var(--ink)" onclick={() => (confirm = null)}>Keep it</Button>
    </div>
  </Sheet>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 14px; font-family: var(--font-ui); }
  .top { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; }
  h1 { margin: 0 0 0 4px; flex: 1; font-size: 20px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .used { display: flex; flex-direction: column; gap: 10px; }
  .line { display: flex; align-items: center; gap: 8px; }
  .k { flex: 1; font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .v { font-size: 13px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .bar { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.18); position: relative; overflow: hidden; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); }
  .free { font-size: 12px; font-weight: 400; color: color-mix(in srgb, var(--muted) 65%, var(--ink)); line-height: 1.35; }
  .msg { margin: 0 20px; }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .label { font-size: 12px; font-weight: 700; color: var(--muted); line-height: 1.35; letter-spacing: 0.1em; text-transform: uppercase; padding: 0 24px; }
  .note { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.45; padding: 0 24px; }
  .book { min-height: 84px; display: flex; align-items: center; gap: 12px; padding: 8px 6px 8px 12px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .book.last, .removed.last { border-bottom: 0; }
  .open { display: flex; flex-direction: column; justify-content: center; gap: 1px; flex: 1; min-width: 0; min-height: 44px; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; font-family: var(--font-ui); color: var(--ink); }
  .open:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 6px; }
  .name { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  @media (min-width: 768px) { .sub { color: var(--ink); } }
  .trash { width: 44px; height: 44px; border-radius: 22px; background: transparent; border: 1px solid transparent; color: var(--ink); display: inline-flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0; cursor: pointer; }
  .trash:disabled { opacity: 0.5; cursor: default; }
  .removed { min-height: 68px; display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 16px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .words { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .rule { min-height: 58px; display: flex; align-items: center; padding: 0 14px; box-sizing: border-box; }
  .rule.first { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .rule.tall { min-height: 62px; }
  .choose { padding: 0 14px 14px; }
  .explain { margin: 0; font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
</style>
