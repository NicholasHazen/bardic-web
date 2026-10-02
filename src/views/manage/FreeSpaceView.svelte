<script lang="ts">
  import Badge from '../../components/Badge.svelte';
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import { sizeText } from '../offline/logic';
  import { chaptersReadyText, freeButtonLabel, freeTotals, hasAudio, premiumWarning } from './logic';
  import ManageGlyph from './ManageGlyph.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import type { SpaceRow } from './types';

  /**
   * Free up space ([FreeSpace], G2): per book, choosing which audiobooks. It deletes only audio on your Bardic
   * computer that can be made again; places, the book and downloads on devices are not touched. A premium audiobook
   * says that making it again needs a new plan, with the estimate. Nothing here starts anything.
   */
  interface Props {
    bookTitle: string;
    rows: SpaceRow[];
    /** Ids of the audiobooks chosen. */
    chosen: ReadonlySet<string>;
    loading?: boolean;
    busy?: boolean;
    /** What went wrong, in words that begin with what is kept. */
    error?: string;
    scrim?: number;
    fixed?: boolean;
    placement?: 'bottom' | 'popover';
    ontoggle?: (id: string) => void;
    onfree?: () => void;
    onclose?: () => void;
  }
  let { bookTitle, rows, chosen, loading = false, busy = false, error, scrim, fixed = false, placement = 'bottom', ontoggle, onfree, onclose }: Props = $props();

  const totals = $derived(freeTotals(rows, chosen));
  const premiumRows = $derived(rows.filter((r) => r.premium && hasAudio(r)));
</script>

<Sheet title="Free up space" eyebrow={bookTitle} {scrim} {fixed} {placement} {onclose}>
  <p class="intro">Deletes audio on your Bardic computer that can be made again. Your places, the book and downloads on devices are not touched.</p>

  {#if loading}
    <p class="note" role="status">Checking what each audiobook uses…</p>
  {:else if !rows.length}
    <p class="note">This book has no audiobooks, so there is no audio to delete.</p>
  {:else}
    <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
      <div role="group" aria-label="Audiobooks to delete the audio of">
        {#each rows as r (r.id)}
          {@const on = chosen.has(r.id)}
          <button type="button" class="row" role="checkbox" aria-checked={on} disabled={busy || !hasAudio(r)} onclick={() => ontoggle?.(r.id)}>
            <span class="box" class:on><span class="tick">{#if on}<ManageGlyph name="check" size={16} color="#1a1206" />{/if}</span></span>
            <span class="text">
              <span class="line"><span class="name">{r.name}</span><Badge tone={r.premium ? 'paid' : 'ready'}>{r.premium ? 'Premium' : 'Free'}</Badge></span>
              <span class="sub">{chaptersReadyText(r)}</span>
            </span>
            <span class="size">{hasAudio(r) ? sizeText(r.bytes) : 'No audio'}</span>
          </button>
        {/each}
      </div>
    </Glass>

    {#each premiumRows as r (r.id)}
      {@const w = premiumWarning(r)}
      <Callout tone="warn" title={w.title}>{w.body}</Callout>
    {/each}
  {/if}

  {#if error}
    <Callout tone="error" title="Nothing was deleted">{error}</Callout>
  {/if}

  <div class="actions">
    <Button size={52} disabled={busy || loading || totals.count === 0} onclick={onfree}>
      <ManageGlyph name="trash" />{busy ? 'Deleting audio…' : freeButtonLabel(rows, chosen)}
    </Button>
    <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={onclose}>Cancel</Button>
  </div>
</Sheet>

<style>
  .intro { margin: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  .note { margin: 0; font-family: var(--font-ui); font-size: 14px; color: var(--muted); line-height: 1.5; }
  .row { width: 100%; min-height: 68px; display: flex; align-items: center; gap: 12px; padding: 0 14px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: transparent; color: var(--ink); font-family: var(--font-ui); text-align: left; cursor: pointer; box-sizing: border-box; }
  .row:last-child { border-bottom: 0; }
  .row:disabled { cursor: default; opacity: 0.6; }
  .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .box { width: 24px; height: 24px; border-radius: 7px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--muted); }
  .box.on { background: var(--accent); border: 0; }
  .tick { display: flex; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .line { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 15px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  .size { font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.35; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
</style>
