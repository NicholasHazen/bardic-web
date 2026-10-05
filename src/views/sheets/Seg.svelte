<script lang="ts">
  import Glass from '../../components/Glass.svelte';
  import { radioKeydown, tabStop } from './radioNav';

  interface Props {
    options: { value: string; label: string }[];
    value: string;
    label: string;
    fontSize?: number;
    /** The chosen option has the soft inner highlight (the reader sheet) or not (search). */
    raised?: boolean;
    style?: string;
    onchange?: (value: string) => void;
  }
  let { options, value, label, fontSize = 13, raised = false, style = '', onchange }: Props = $props();

  const chosen = $derived(options.findIndex((o) => o.value === value));
</script>

<!-- One choice of a few: a radiogroup with arrow keys; the chosen one is the tab stop. -->
<Glass radius={22} role="radiogroup" aria-label={label} style="padding:3px;height:44px;{style}">
  <div class="seg">
    {#each options as o, i (o.value)}
      <button
        type="button"
        role="radio"
        aria-checked={o.value === value}
        tabindex={tabStop(i, chosen)}
        class:on={o.value === value}
        class:raised
        style:font-size="{fontSize}px"
        onclick={() => onchange?.(o.value)}
        onkeydown={(e) => radioKeydown(e, (n) => onchange?.(options[n]!.value))}>{o.label}</button
      >
    {/each}
  </div>
</Glass>

<style>
  .seg { display: flex; align-items: center; gap: 2px; }
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
    font-weight: 600;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    position: relative;
  }
  /* The segment is 38 px as drawn; this makes the touch target the full 44 px of the control. */
  button::after { content: ''; position: absolute; inset: -3px 0; }
  button.on { background: rgba(255, 255, 255, 0.16); color: var(--ink); }
  button.on.raised { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
</style>
