<script lang="ts">
  import IconButton from '../../components/IconButton.svelte';
  import Glyph from './Glyph.svelte';
  import PButton from './PButton.svelte';

  interface Props {
    /** "1.25×" */
    speed: string;
    /** "Sleep", or what is running ("12 min") */
    sleep: string;
    sleepActive?: boolean;
    voiceName: string;
    padding?: string;
    onopenSpeed?: () => void;
    onopenSleep?: () => void;
    onopenChapters?: () => void;
    onopenVoice?: () => void;
  }
  let { speed, sleep, sleepActive = false, voiceName, padding = '0 20px', onopenSpeed, onopenSleep, onopenChapters, onopenVoice }: Props = $props();
</script>

<div class="row" style:padding role="group" aria-label="Listening tools">
  <div class="col">
    <PButton label="Speed {speed}" width={56} height={52} saturate={false} onclick={onopenSpeed}><span class="speed">{speed}</span></PButton>
    <span class="cap">Speed</span>
  </div>
  <div class="col">
    <IconButton label={sleepActive ? `Sleep, ${sleep}` : 'Sleep'} icon="moon" size={52} onclick={onopenSleep} />
    <span class="cap" class:on={sleepActive}>{sleep}</span>
  </div>
  <div class="col">
    <IconButton label="Chapters" icon="list" size={52} onclick={onopenChapters} />
    <span class="cap">Chapters</span>
  </div>
  <div class="col">
    <PButton label="{voiceName}, change voice" width={52} height={52} onclick={onopenVoice}><Glyph name="voice" /></PButton>
    <span class="cap voice">{voiceName}</span>
  </div>
</div>

<style>
  .row { display: flex; align-items: center; }
  .col { display: flex; flex-direction: column; gap: 6px; align-items: center; flex: 1; min-width: 0; }
  .speed { font-family: var(--font-ui); font-size: 14px; font-weight: 700; }
  .cap { font-family: var(--font-ui); font-size: 12px; color: var(--muted); max-width: 100%; }
  .cap.on { color: var(--label-accent, var(--accent)); }
  .voice { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
