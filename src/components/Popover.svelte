<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';

  interface Props {
    /** The dialog's accessible name and its heading. */
    title: string;
    eyebrow?: string;
    onclose?: () => void;
    /** Position and size, as CSS (for example "right:40px;top:96px;width:380px"). */
    style?: string;
    /** Position against the viewport (the app) instead of the nearest positioned parent (design boards). */
    fixed?: boolean;
    children: Snippet;
  }
  let { title, eyebrow, onclose, style = '', fixed = false, children }: Props = $props();

  let dialog: HTMLDivElement;
  let opener: Element | null = null;

  // A floating card beside the reader (tablet): no scrim, the page stays usable. Focus moves in, Escape closes
  // and focus returns to what opened it.
  onMount(() => {
    opener = document.activeElement;
    tick().then(() => dialog.focus({ preventScroll: true }));
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    }
  }
</script>

<div bind:this={dialog} class="pop" class:fixed role="dialog" aria-label={title} tabindex="-1" {style} onkeydown={keydown}>
  <div class="col">
    <div class="head">
      <div class="titles">
        {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
        <span class="title">{title}</span>
      </div>
      <div class="spacer"></div>
      <button type="button" class="close" aria-label="Close" onclick={() => onclose?.()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </div>
    {@render children()}
  </div>
</div>

<style>
  span { line-height: 1.35; }
  .pop {
    position: absolute;
    box-sizing: border-box;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 20px;
    background: rgba(22, 18, 32, 0.94);
    -webkit-backdrop-filter: blur(40px) saturate(1.7);
    backdrop-filter: blur(40px) saturate(1.7);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 20px 60px rgba(0, 0, 0, 0.55);
    color: var(--ink);
    font-family: var(--font-ui);
    outline: none;
    max-height: calc(100% - 24px);
    overflow-y: auto;
  }
  .pop.fixed { position: fixed; }
  .col { display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; align-items: flex-start; gap: 8px; }
  .titles { display: flex; flex-direction: column; gap: 2px; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; }
  .title { font-size: 22px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .spacer { flex: 1; }
  .close {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    padding: 0;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.09);
    -webkit-backdrop-filter: blur(20px) saturate(1.7);
    backdrop-filter: blur(20px) saturate(1.7);
    border: 1px solid rgba(255, 255, 255, 0.18);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 18px rgba(0, 0, 0, 0.25);
    color: var(--ink);
    cursor: pointer;
  }
  .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
