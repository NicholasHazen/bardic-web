<script lang="ts">
  import type { Mode } from '../../player/types';

  interface Props {
    value: Mode;
    onchange?: (mode: Mode) => void;
  }
  let { value, onchange }: Props = $props();

  const options: { id: Mode; label: string }[] = [
    { id: 'listen', label: 'Listen' },
    { id: 'read', label: 'Read' },
  ];
  let group: HTMLDivElement | undefined = $state();

  function key(e: KeyboardEvent, i: number) {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = options[(to + options.length) % options.length];
    if (!next) return;
    onchange?.(next.id);
    group?.querySelector<HTMLButtonElement>(`[data-mode="${next.id}"]`)?.focus();
  }
</script>

<!-- The Listen / Read switch: a radio group, arrow keys move the choice (and the mode). -->
<div class="switch" role="radiogroup" aria-label="Listen or read" bind:this={group}>
  <div class="row">
    {#each options as o, i}
      <button
        type="button"
        role="radio"
        data-mode={o.id}
        aria-checked={o.id === value}
        tabindex={o.id === value ? 0 : -1}
        class:on={o.id === value}
        onclick={() => onchange?.(o.id)}
        onkeydown={(e) => key(e, i)}>{o.label}</button>
    {/each}
  </div>
</div>

<style>
  .switch {
    box-sizing: border-box;
    width: min(176px, 100%);
    height: 44px;
    padding: 3px;
    background: rgba(14, 12, 22, 0.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid var(--edge);
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 6px 16px rgba(0, 0, 0, 0.25);
  }
  .row { display: flex; align-items: center; gap: 2px; height: 44px; margin-top: -3px; }
  button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 19px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
    cursor: pointer;
    position: relative;
    isolation: isolate;
  }
  /* Keep the 38 px pill while the button itself occupies the full 44 px touch band. */
  button::before { content: ''; position: absolute; inset: 3px 0; border-radius: 19px; z-index: -1; }
  button.on { color: var(--ink); }
  button.on::before { background: rgba(255, 255, 255, 0.16); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
