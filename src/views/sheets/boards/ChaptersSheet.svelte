<script lang="ts">
  import { book, chapters } from '../../../fixtures/sheets';
  import ChaptersSheet from '../ChaptersSheet.svelte';
  import Frame from './Frame.svelte';
  import ReadBackdrop from './ReadBackdrop.svelte';

  let currentId = $state('ch4');
</script>

<Frame w={390} h={844} scrim={0.3}>
  <ReadBackdrop />
  <ChaptersSheet bookTitle={book.title} {chapters} {currentId} onselect={(id) => (currentId = id)} />
</Frame>
