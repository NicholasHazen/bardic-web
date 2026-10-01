<script lang="ts">
  interface Props {
    /** 0 to 1 */
    value: number;
    label?: string;
    /** Slim: the track is the whole box (inside the Now Playing card). */
    slim?: boolean;
    onchange?: (value: number) => void;
  }
  let { value, label = 'Position', slim = false, onchange }: Props = $props();
  let el: HTMLDivElement | undefined = $state();

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  function fromPointer(e: PointerEvent) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    onchange?.(clamp((e.clientX - r.left) / r.width));
  }
  function down(e: PointerEvent) {
    el?.setPointerCapture(e.pointerId);
    fromPointer(e);
  }
  function move(e: PointerEvent) {
    if (el?.hasPointerCapture(e.pointerId)) fromPointer(e);
  }
  function key(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0;
    if (step) {
      e.preventDefault();
      onchange?.(clamp(value + step));
    }
  }
</script>

<div
  bind:this={el}
  class="scrub"
  class:slim
  role="slider"
  tabindex="0"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(value * 100)}
  onpointerdown={down}
  onpointermove={move}
  onkeydown={key}
>
  <div class="track"></div>
  <div class="fill" style:width="{value * 100}%"></div>
  <div class="thumb" style:left="{value * 100}%"></div>
</div>

<style>
  .scrub { position: relative; height: 20px; touch-action: none; cursor: pointer; }
  .scrub.slim { height: 5px; }
  .track, .fill { position: absolute; top: 7px; height: 5px; border-radius: 3px; }
  .slim .track, .slim .fill { top: 0; }
  .track { left: 0; right: 0; background: rgba(255, 255, 255, 0.2); }
  .fill { left: 0; background: var(--accent); }
  .thumb { position: absolute; top: 1px; width: 17px; height: 17px; margin-left: -8px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); }
  .slim .thumb { top: -6px; }
</style>
