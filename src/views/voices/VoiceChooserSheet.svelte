<script lang="ts">
  // STUB. The voices agent replaces this with the connected voice chooser ([VoiceFree], [VoicePremium],
  // [VoiceNoAccount]). The book page opens it from the Audiobook card's "Change" action.
  let { bookId, onclose }: { bookId: string; onclose?: () => void } = $props();
</script>

<div role="dialog" aria-label="Choose a voice" data-book={bookId}>
  <p>Voice chooser (coming from the voices work).</p>
  <button type="button" onclick={onclose}>Close</button>
</div>
