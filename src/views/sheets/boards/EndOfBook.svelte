<script lang="ts">
  import Aura from '../../../components/Aura.svelte';
  import { book, endOfBook } from '../../../fixtures/sheets';
  import EndOfBookView from '../EndOfBookView.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}>
  <Aura />
  <div class="screen">
    <EndOfBookView title={book.title} coverColor={book.color} summary={endOfBook.summary} next={endOfBook.next} missingVolume={endOfBook.missingVolume} />
  </div>
</Frame>

<style>
  .screen { position: relative; height: 100%; }
</style>
