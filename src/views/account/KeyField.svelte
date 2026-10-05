<script lang="ts">
  interface Props {
    id: string;
    label: string;
    /** What the listener types or pastes. The screen clears it as soon as it is sent. */
    value?: string;
    /** ok: the stored key works (green check). bad: it was rejected (warning, red edge). none: nothing to say. */
    mark?: 'ok' | 'bad' | 'none';
    /** Shown in the empty field. When a key is stored it is a row of dots; the key itself is never read back. */
    placeholder?: string;
    describedby?: string;
    el?: HTMLInputElement | null;
  }
  let { id, label, value = $bindable(''), mark = 'none', placeholder = '', describedby, el = $bindable(null) }: Props = $props();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="box" class:bad={mark === 'bad'}>
    <!-- Write-only: a password field that is never given a value from outside, with autofill and spell checks off. -->
    <input
      bind:this={el}
      {id}
      type="password"
      bind:value
      {placeholder}
      autocomplete="off"
      autocapitalize="off"
      spellcheck={false}
      data-1p-ignore
      data-lpignore="true"
      aria-invalid={mark === 'bad' ? 'true' : undefined}
      aria-describedby={describedby}
    />
    {#if mark === 'ok'}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c3f0ba" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="m5 12 4 4L19 6" /></svg>
    {:else if mark === 'bad'}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffbcae" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M12 4 3 20h18zM12 10v4.5M12 17.3v.4" /></svg>
    {/if}
  </div>
</div>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-family: var(--font-ui); font-size: 12px; font-weight: 600; color: var(--ink); }
  .box { display: flex; align-items: center; height: 48px; padding: 0 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.22); box-sizing: border-box; }
  .box.bad { border: 1.5px solid rgba(255, 120, 100, 0.8); }
  .box:focus-within { border-color: var(--accent); }
  input { border: 0; outline: 0; background: transparent; flex: 1; min-width: 0; min-height: 44px; box-sizing: border-box; font-family: var(--font-ui); font-size: 16px; color: var(--ink); }
  input::placeholder { color: var(--ink); opacity: 1; }
</style>
