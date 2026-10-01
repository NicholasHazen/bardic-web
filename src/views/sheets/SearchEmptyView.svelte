<script lang="ts">
  import Button from '../../components/Button.svelte';
  import Glyph from '../shell/Glyph.svelte';
  import EmptyState from './EmptyState.svelte';
  import SearchShell from './SearchShell.svelte';

  /**
   * Search with nothing found ([SearchEmpty]): says what was searched, what search covers, and offers to clear it
   * or add a book. The words are the board's: search looks at titles, authors and series.
   */
  interface Props {
    query: string;
    onquery?: (query: string) => void;
    onback?: () => void;
    onclear?: () => void;
    onadd?: () => void;
  }
  let { query = $bindable(), onquery, onback, onclear, onadd }: Props = $props();
</script>

<SearchShell title="Search" bind:query fieldLabel="Find a book" gap={16} barGap={8} {onback} oninput={onquery} {onclear}>
  <EmptyState title="No book matches “{query}”" text="Search looks at titles, authors and series. To search inside a book, open it and use Find in book.">
    {#snippet actions()}
      <Button variant="glass" style="height:48px;border-radius:24px" onclick={() => ((query = ''), onquery?.(''), onclear?.())}>Clear search</Button>
      <Button variant="text" onclick={() => onadd?.()}><Glyph name="plus" size={18} />Add a book</Button>
    {/snippet}
  </EmptyState>
</SearchShell>
