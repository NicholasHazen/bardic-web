<script lang="ts">
  import Glass from './Glass.svelte';

  interface Props {
    options: string[];
    value: string;
    label: string;
    /** Pixels, or any CSS width such as '100%'. */
    width?: number | string;
    onchange?: (value: string) => void;
  }
  let { options, value = $bindable(), label, width = 180, onchange }: Props = $props();
  function pick(o: string) {
    value = o;
    onchange?.(o);
  }
</script>

<Glass radius={22} role="radiogroup" aria-label={label} style="width: {typeof width === 'number' ? `${width}px` : width}; padding: 3px; height: 44px">
  <div class="row">
    {#each options as o}
      <button type="button" role="radio" aria-checked={o === value} class:on={o === value} onclick={() => pick(o)}>{o}</button>
    {/each}
  </div>
</Glass>

<style>
  .row { display: flex; align-items: center; gap: 2px; }
  button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0;
    border: 0;
    border-radius: 19px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  button.on { background: rgba(255, 255, 255, 0.16); color: var(--ink); }
</style>
