<script lang="ts">
  interface Props {
    id: string;
    label: string;
    value?: string;
    /** Box height in px. */
    height?: number;
    fontSize?: number;
    /** "4 of 40", shown at the end of the box. */
    counter?: string;
    invalid?: boolean;
    describedby?: string;
  }
  let { id, label, value = $bindable(''), height = 48, fontSize = 16, counter, invalid = false, describedby }: Props = $props();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="box" class:invalid style:height="{height}px">
    <input
      {id}
      type="text"
      bind:value
      style:font-size="{fontSize}px"
      autocomplete="off"
      autocapitalize="words"
      spellcheck="false"
      enterkeyhint="done"
      aria-invalid={invalid ? 'true' : undefined}
      aria-describedby={describedby}
    />
    {#if counter}<span class="count">{counter}</span>{/if}
  </div>
</div>

<style>
  span { line-height: 1.35; }
  .field { font-family: var(--font-ui); display: flex; flex-direction: column; gap: 6px; }
  label { line-height: normal; font-size: 12px; font-weight: 600; color: var(--ink); }
  .box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-sizing: border-box;
  }
  .box:focus-within { border-color: var(--accent); }
  .box.invalid { border: 1.5px solid rgba(255, 120, 100, 0.8); }
  input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; min-height: 44px; box-sizing: border-box; font-family: var(--font-ui); color: var(--ink); }
  .count { font-size: 12px; font-weight: 400; color: var(--muted); }
</style>
