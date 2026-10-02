<script lang="ts">
  import * as fx from '../../../fixtures/manage';
  import BookMenuView from '../BookMenuView.svelte';
  import BookBackdrop from './BookBackdrop.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame>
  <BookBackdrop />
  <BookMenuView bookTitle={fx.book.title} finish="finish" freeSummary={fx.menuFreeSummary} />
</Frame>
