<script lang="ts">
  import Cover from './Cover.svelte';
  import Glass from './Glass.svelte';
  import IconButton from './IconButton.svelte';
  import ProgressBar from './ProgressBar.svelte';

  interface Props {
    title: string;
    /** Second line, e.g. "Ch. 4 · 6 min ahead". */
    detail: string;
    color?: string;
    progress: number;
    speed: string;
    playing?: boolean;
    onplaypause?: () => void;
    onspeed?: () => void;
  }
  let { title, detail, color = '#c65a43', progress, speed, playing = true, onplaypause, onspeed }: Props = $props();
</script>

<Glass variant="bar" style="height: 84px; padding: 0 12px 0 9px; display: flex; align-items: center; overflow: hidden">
  <div class="inner">
    <Cover {color} width={44} height={66} radius={11} pad={5} shadowY={5} shadowBlur={11} />
    <div class="text">
      <span class="title">{title}</span>
      <span class="detail">{detail}</span>
      <ProgressBar value={progress} height={4} track="rgba(255,255,255,.22)" style="margin-top: 5px; flex: none" />
    </div>
    <button type="button" class="speed" aria-label="Playback speed" onclick={onspeed}>{speed}</button>
    <IconButton label={playing ? 'Pause' : 'Play'} icon={playing ? 'pause' : 'play'} tone="accent" size={48} iconSize={20} onclick={onplaypause} />
  </div>
</Glass>

<style>
  .inner { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .title { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { font-family: var(--font-ui); font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; white-space: nowrap; }
  .speed { height: 44px; min-width: 56px; padding: 0 10px; border-radius: 22px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3); color: var(--ink); font-family: var(--font-ui); font-size: 13px; font-weight: 700; flex-shrink: 0; cursor: pointer; }
</style>
