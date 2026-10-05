<script lang="ts">
  import Sheet from '../../components/Sheet.svelte';
  import { limitLabel, loadServerLimits, serverLimit, type ImportState } from '../../state/imports';
  import { coverColor, realCoverUrl } from '../../state/library';
  import { dismissToast, showToast } from '../../state/toast';
  import { isTablet } from '../shell/viewport';
  import AddBookPanel from './AddBookPanel.svelte';
  import DuplicatePanel from './DuplicatePanel.svelte';
  import { importer } from './importer';
  import type { ExistingBookModel } from './types';

  const st = $derived($importer as ImportState);
  const placement = $derived($isTablet ? 'popover' : 'bottom');
  let limit = $state(limitLabel());
  let maxLoaded = false;

  // The server's own limit (getServer) replaces the default 30 MB in the copy once it has been read.
  $effect(() => {
    if (st.kind !== 'closed' && !maxLoaded) {
      maxLoaded = true;
      void loadServerLimits().then(() => (limit = limitLabel(serverLimit())));
    }
  });

  // A toast would sit on top of the sheet; the sheet has the user's attention.
  $effect(() => {
    if (st.kind !== 'closed' && st.kind !== 'done') dismissToast();
  });

  $effect(() => {
    if (st.kind === 'done') {
      const id = st.bookId;
      importer.finish();
      showToast({ message: 'Book added. Open it to start listening.', actionLabel: id ? 'Open' : undefined, href: id ? `#/book/${id}` : undefined });
    }
  });

  function existing(s: Extract<ImportState, { kind: 'duplicate' }>): ExistingBookModel {
    const e = s.existing;
    return {
      id: e.book_id,
      title: e.title,
      color: coverColor({ id: e.book_id, cover: e.cover ?? null }),
      coverSrc: realCoverUrl(e.cover),
      detail: s.detail,
      removed: e.state === 'removed',
    };
  }

  async function restore() {
    const id = await importer.restoreExisting();
    if (id) showToast({ message: 'Book restored.', actionLabel: 'Open', href: `#/book/${id}` });
  }
  // Each step swaps the panel's buttons; keep the keyboard inside the dialog so Escape and Tab still work.
  let layer: HTMLDivElement | undefined = $state();
  let previousKind = 'closed';
  $effect(() => {
    const initial = previousKind === 'closed';
    previousKind = st.kind;
    if (initial) return; // Sheet captures the opener and moves focus on first mount.
    queueMicrotask(() => {
      const dialog = layer?.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    });
  });
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && st.kind !== 'closed') importer.close();
  }

  function openExisting(id: string) {
    importer.finish();
    location.hash = `#/book/${id}`;
  }
</script>

<svelte:window onkeydown={key} />
<div class="layer" bind:this={layer}>
{#if st.kind === 'duplicate'}
  <Sheet fixed {placement} eyebrow="Add a book" title="Already in your library" onclose={() => importer.close()}>
    <DuplicatePanel
      fileName={st.file.name}
      existing={existing(st)}
      onopen={() => openExisting(st.existing.book_id)}
      onrestore={restore}
      onaddcopy={() => importer.add(true)}
      oncancel={() => importer.close()}
    />
  </Sheet>
{:else if st.kind !== 'closed' && st.kind !== 'done'}
  <Sheet fixed {placement} eyebrow="Library" title="Add a book" onclose={() => importer.close()}>
    {#if st.kind === 'choose'}
      <AddBookPanel phase="choose" {limit} onpick={(f) => importer.pick(f)} />
    {:else if st.kind === 'chosen'}
      <AddBookPanel phase="chosen" file={st.file} {limit} onpick={(f) => importer.pick(f)} onremove={() => importer.remove()} onadd={() => importer.add()} />
    {:else if st.kind === 'checking'}
      <AddBookPanel phase="working" file={st.file} stage="reading" progress={0.02} oncancel={() => importer.close()} />
    {:else if st.kind === 'adding'}
      <AddBookPanel phase="working" file={st.file} stage={st.stage} progress={st.progress} oncancel={() => importer.close()} />
    {:else if st.kind === 'failed'}
      <AddBookPanel phase="failed" file={st.file} error={st.copy} onagain={() => (st.copy.action === 'Try again' ? importer.retry() : importer.again())} />
    {/if}
  </Sheet>
{/if}
</div>

<style>
  .layer { position: relative; z-index: 50; }
</style>
