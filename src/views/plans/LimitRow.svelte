<script lang="ts">
  import { tick } from 'svelte';

  /**
   * The row "Limit for this plan": its value is the plan's limit, and pressing the row edits it. The field only appears
   * when asked for, so opening the sheet never raises the keyboard. The amount is checked as it is typed (PL2).
   */
  interface Props {
    /** The limit as typed. */
    value: string;
    /** The limit as shown when not editing. */
    shown: string;
    label?: string;
    invalid?: boolean;
    /** Id of the line that says why the limit is not valid. */
    describedby?: string;
    disabled?: boolean;
    onchange?: (text: string) => void;
  }
  let { value, shown, label = 'Limit for this plan', invalid = false, describedby, disabled = false, onchange }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement>();

  async function start() {
    draft = value.replace(/^\$/, '');
    editing = true;
    await tick();
    input?.focus();
    input?.select();
  }
  function type() {
    onchange?.(draft);
  }
  function done() {
    editing = false;
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      done();
    } else if (e.key === 'Escape') {
      // Only the edit is left; the sheet stays open.
      e.stopPropagation();
      done();
    }
  }
</script>

{#if editing}
  <label class="r">
    <span class="k">{label}</span>
    <input
      bind:this={input}
      bind:value={draft}
      oninput={type}
      onblur={done}
      onkeydown={keydown}
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      aria-invalid={invalid}
      aria-describedby={describedby}
      aria-label="{label}, in dollars"
    />
  </label>
{:else}
  <button type="button" class="r press" {disabled} aria-describedby={describedby} aria-label="{label}: {shown}. Change" onclick={start}>
    <span class="k">{label}</span>
    <span class="v" class:bad={invalid}>{shown}</span>
  </button>
{/if}

<style>
  .r {
    min-height: 46px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    box-sizing: border-box;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    text-align: left;
    font-family: var(--font-ui);
    color: inherit;
  }
  .press { cursor: pointer; }
  .k { font-size: 14px; font-weight: 400; color: var(--muted); line-height: 1.35; flex: 1; }
  .v { font-size: 14px; font-weight: 700; color: var(--accent); line-height: 1.35; text-decoration: underline dotted rgba(255, 255, 255, 0.45) 1px; text-underline-offset: 4px; }
  .v.bad { color: #ffbcae; }
  input {
    width: 8em;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-family: var(--font-ui);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--accent);
    text-align: right;
    outline: none;
    box-shadow: 0 2px 0 var(--accent);
  }
  input[aria-invalid='true'] { color: #ffbcae; box-shadow: 0 2px 0 #ffbcae; }
</style>
