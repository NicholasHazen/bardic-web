<script lang="ts">
  import FirstPlayView from '../FirstPlayView.svelte';
  import BookPageBackdrop from './BookPageBackdrop.svelte';
  import Frame from './Frame.svelte';
</script>

<Frame w={390} h={844}>
  <BookPageBackdrop><FirstPlayView voiceName="Samantha" etaSeconds={10} /></BookPageBackdrop>
</Frame>
