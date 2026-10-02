<script lang="ts">
  import * as fx from '../../../fixtures/manage';
  import FreeSpaceView from '../FreeSpaceView.svelte';
  import BookBackdrop from './BookBackdrop.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame>
  <BookBackdrop />
  <FreeSpaceView bookTitle={fx.book.title} rows={fx.spaceRows} chosen={fx.chosenFree} scrim={0.6} />
</Frame>
