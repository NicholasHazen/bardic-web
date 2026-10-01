<script lang="ts">
  import IconButton from '../../components/IconButton.svelte';

  interface Props {
    playing: boolean;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onnext?: () => void;
    onprevious?: () => void;
  }
  let { playing, ontoggle, onskip, onnext, onprevious }: Props = $props();
</script>

<!-- The smaller transport of the expanded bar: 48, 52, 64, 52, 48. -->
<div class="row" role="group" aria-label="Playback">
  <IconButton label="Previous chapter" icon="skip-back" size={48} onclick={onprevious} />
  <IconButton label="Back 15 seconds" icon="back-15" size={52} onclick={() => onskip?.(-15)} />
  <IconButton label={playing ? 'Pause' : 'Play'} icon={playing ? 'pause' : 'play'} tone="accent" size={64} iconSize={26} onclick={ontoggle} />
  <IconButton label="Forward 15 seconds" icon="forward-15" size={52} onclick={() => onskip?.(15)} />
  <IconButton label="Next chapter" icon="skip-forward" size={48} onclick={onnext} />
</div>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; }
</style>
