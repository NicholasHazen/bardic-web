<script lang="ts">
  interface Props {
    label: string;
    checked?: boolean;
    onchange?: (checked: boolean) => void;
  }
  let { label, checked = $bindable(false), onchange }: Props = $props();
  function flip() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button type="button" role="switch" aria-checked={checked} onclick={flip}>
  <span class="label">{label}</span>
  <span class="track" class:on={checked}><span class="knob"></span></span>
</button>

<style>
  button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 0; border: 0; background: none; text-align: left; cursor: pointer; position: relative; }
  /* Row height is 30; this keeps the touch target at 44. */
  button::after { content: ''; position: absolute; inset: -7px 0; }
  .label { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; flex: 1; }
  .track { width: 50px; height: 30px; border-radius: 15px; background: rgba(255, 255, 255, 0.2); position: relative; flex-shrink: 0; box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3); }
  .track.on { background: var(--accent); }
  .knob { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4); }
  .track.on .knob { left: 23px; }
</style>
