<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Callout from '../../components/Callout.svelte';
  import Glass from '../../components/Glass.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import ManageGlyph from './ManageGlyph.svelte';
  import SlideToConfirm from './SlideToConfirm.svelte';
  import type { DeleteRow } from './types';

  /**
   * Delete permanently ([DeleteConfirm], G3): exactly what goes, with sizes, then a slide control. Confirming hides
   * the book at once and schedules the deletion 60 seconds later; Undo stays on screen until then.
   */
  interface Props {
    bookTitle: string;
    rows: DeleteRow[];
    /** The request is on its way. */
    busy?: boolean;
    /** Why it could not be scheduled; begins with what is kept. */
    error?: string;
    scrim?: number;
    fixed?: boolean;
    placement?: 'bottom' | 'popover';
    onconfirm?: () => void;
    onclose?: () => void;
  }
  let { bookTitle, rows, busy = false, error, scrim, fixed = false, placement = 'bottom', onconfirm, onclose }: Props = $props();
</script>

<Sheet title="Delete permanently?" eyebrow={bookTitle} {scrim} {fixed} {placement} {onclose}>
  <p class="intro">This removes everything below from your Bardic computer. Downloads on devices are offered for removal next time they connect.</p>
  <Glass radius={16} style="overflow: hidden; flex-shrink: 0">
    <ul>
      {#each rows as r (r.title)}
        <li class="row">
          <ManageGlyph name="close" color="#ffbcae" />
          <span class="text">
            <span class="name">{r.title}</span>
            <span class="sub">{r.detail}</span>
          </span>
        </li>
      {/each}
    </ul>
  </Glass>
  <Callout tone="info" title="You get 60 seconds to undo">After you confirm, the book is hidden and deleted in one minute. Cancel any time before then.</Callout>
  {#if error}
    <Callout tone="error" title="The book was not deleted">{error}</Callout>
  {/if}
  {#key error}
    <SlideToConfirm label="Slide to delete permanently" disabled={busy} {onconfirm} />
  {/key}
  <Button variant="glass" style="width: 100%; height: 48px; border-radius: 24px" onclick={onclose}>Keep the book</Button>
</Sheet>

<style>
  .intro { margin: 0; font-family: var(--font-ui); font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.5; }
  ul { list-style: none; margin: 0; padding: 0; }
  .row { min-height: 58px; display: flex; align-items: center; gap: 12px; padding: 0 14px; box-sizing: border-box; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .row:last-child { border-bottom: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .name { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .sub { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>
