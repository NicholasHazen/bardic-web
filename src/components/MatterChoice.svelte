<script lang="ts">
  interface Props {
    checked: boolean;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }
  let { checked, disabled = false, onchange }: Props = $props();
</script>

<label>
  <input type="checkbox" {checked} {disabled} onchange={(event) => onchange?.(event.currentTarget.checked)} />
  <span>Include front and back matter</span>
</label>

<style>
  label { display: flex; align-items: center; gap: 12px; min-height: 44px; flex-shrink: 0; font-family: var(--font-ui); font-size: 14px; line-height: 1.35; color: var(--ink); cursor: pointer; }
  input { width: 20px; height: 20px; margin: 0; flex-shrink: 0; accent-color: var(--accent); }
  label:has(input:disabled) { cursor: default; }
</style>
