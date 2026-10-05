<script lang="ts">
  interface Props {
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Accessible name. */
    label: string;
    /** What a screen reader says for the value, e.g. "1.25 times". */
    valueText?: string;
    onchange?: (value: number) => void;
  }
  let { value, min, max, step = 1, label, valueText, onchange }: Props = $props();

  const fraction = $derived(max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0);
</script>

<!-- The drawn track and thumb are for the eye; a real range input lies over them (transparent, with a zero width
     native thumb so a press lands exactly where the drawn thumb goes) for pointer, touch and keyboard. -->
<div class="slider">
  <div class="fill" style:width="{fraction * 100}%"></div>
  <div class="thumb" style:left="{fraction * 100}%"></div>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    aria-valuetext={valueText}
    oninput={(e) => onchange?.(Number(e.currentTarget.value))}
  />
</div>

<style>
  .slider { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.2); position: relative; flex: 1; min-width: 0; }
  .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--accent); }
  .thumb { position: absolute; top: -9px; width: 24px; height: 24px; margin-left: -12px; border-radius: 50%; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45); }
  input { position: absolute; left: 0; top: -19px; width: 100%; height: 44px; margin: 0; padding: 0; opacity: 0; cursor: pointer; -webkit-appearance: none; appearance: none; background: transparent; touch-action: pan-y; }
  input::-webkit-slider-thumb { -webkit-appearance: none; width: 0; height: 44px; border: 0; }
  input::-moz-range-thumb { width: 0; height: 44px; border: 0; }
  .slider:has(input:focus-visible) .thumb { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
