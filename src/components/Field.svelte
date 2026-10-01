<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    label: string;
    id: string;
    value?: string;
  }
  let { label, id, value = $bindable(''), type = 'text', ...rest }: Props = $props();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="box"><input {id} {type} bind:value {...rest} /></div>
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-family: var(--font-ui); font-size: 12px; font-weight: 600; color: var(--ink); }
  .box { display: flex; align-items: center; height: 44px; padding: 0 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.22); box-sizing: border-box; }
  .box:focus-within { border-color: var(--accent); }
  input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; font-family: var(--font-ui); font-size: 14px; color: var(--ink); }
</style>
