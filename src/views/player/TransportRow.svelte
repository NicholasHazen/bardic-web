<script lang="ts">
  import IconButton from '../../components/IconButton.svelte';

  interface Props {
    playing: boolean;
    /** diameter of the play button: 76 on the phone, 72 in the controls sheet, 84 on a tablet */
    playSize?: number;
    padding?: string;
    ontoggle?: () => void;
    onskip?: (seconds: number) => void;
    onnext?: () => void;
    onprevious?: () => void;
  }
  let { playing, playSize = 76, padding = '0 20px', ontoggle, onskip, onnext, onprevious }: Props = $props();
</script>

<div class="row" style:padding role="group" aria-label="Playback">
  <IconButton label="Previous chapter" icon="skip-back" size={52} onclick={onprevious} />
  <IconButton label="Back 15 seconds" icon="back-15" size={52} onclick={() => onskip?.(-15)} />
  <IconButton label={playing ? 'Pause' : 'Play'} icon={playing ? 'pause' : 'play'} tone="accent" size={playSize} iconSize={Math.round(playSize * 0.41)} onclick={ontoggle} />
  <IconButton label="Forward 15 seconds" icon="forward-15" size={52} onclick={() => onskip?.(15)} />
  <IconButton label="Next chapter" icon="skip-forward" size={52} onclick={onnext} />
</div>

<style>
  .row { display: flex; align-items: center; justify-content: space-between; }
</style>
