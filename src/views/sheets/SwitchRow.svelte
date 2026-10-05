<script lang="ts">
  interface Props {
    label: string;
    detail?: string;
    checked: boolean;
    onchange?: (checked: boolean) => void;
  }
  let { label, detail, checked, onchange }: Props = $props();
</script>

<button type="button" role="switch" aria-checked={checked} onclick={() => onchange?.(!checked)}>
  <span class="text">
    <span class="label">{label}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </span>
  <span class="track" class:on={checked}><span class="knob"></span></span>
</button>

<style>
  button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; position: relative; font-family: var(--font-ui); color: var(--ink); }
  /* The row is as tall as its text or the 30 px switch; this keeps the touch target at 44. */
  button::after { content: ''; position: absolute; inset: -7px 0; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
  .text { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .label { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .detail { font-size: 12px; font-weight: 400; color: color-mix(in srgb, var(--muted) 60%, var(--ink)); line-height: 1.35; }
  .track { width: 50px; height: 30px; border-radius: 15px; background: rgba(255, 255, 255, 0.2); position: relative; flex-shrink: 0; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3); }
  .track.on { background: var(--accent); }
  .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4); }
  .track.on .knob { left: 23px; }
  @media (prefers-reduced-motion: no-preference) {
    .knob { transition: left 0.15s; }
  }
</style>
