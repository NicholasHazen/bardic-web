<script lang="ts">
  import * as fx from '../../../fixtures/manage';
  import DeleteConfirmView from '../DeleteConfirmView.svelte';
  import BookBackdrop from './BookBackdrop.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame>
  <BookBackdrop />
  <DeleteConfirmView bookTitle={fx.book.title} rows={fx.deleteRows} scrim={0.6} />
</Frame>
