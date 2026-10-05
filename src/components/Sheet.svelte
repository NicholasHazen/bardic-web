<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';

  interface Props {
    /** The dialog's accessible name; shown as the heading when `eyebrow` or `heading` is not turned off. */
    title?: string;
    /** Small accent line above the title. */
    eyebrow?: string;
    onclose?: () => void;
    /** bottom: a sheet from the bottom edge (phone). popover: a floating card (tablet). */
    placement?: 'bottom' | 'popover';
    /** Position against the viewport (the app) instead of the nearest positioned parent (design boards). */
    fixed?: boolean;
    /** How dark the backdrop is (0 to 1); the default suits sheets over a light screen. Now Playing sheets use 0.3, place conflict 0.6. */
    scrim?: number;
    children: Snippet;
  }
  let { title = '', eyebrow, onclose, placement = 'bottom', fixed = false, scrim, children }: Props = $props();

  let dialog: HTMLDivElement;
  let opener: Element | null = null;

  const focusable = () =>
    Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.tabIndex >= 0 && !el.closest('[inert],[aria-hidden="true"]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');

  onMount(() => {
    opener = document.activeElement;
    // aria-modal describes the sheet; inert also prevents keyboard and assistive
    // technology from reaching the covered page, including the app's tab bar.
    const covered: { el: HTMLElement; inert: boolean }[] = [];
    for (let branch: HTMLElement | null = dialog; branch?.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        // Keep this sheet's dismissible scrim interactive; only the covered page
        // should become inert. The scrim directly precedes the dialog.
        if (sibling === branch || sibling === dialog.previousElementSibling || !(sibling instanceof HTMLElement)) continue;
        covered.push({ el: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
    }
    tick().then(() => {
      // Land on the first thing to type into, otherwise on the dialog itself (not on a close button).
      (focusable().find((el) => el.matches('input:not([type="file"]),textarea,select')) ?? dialog).focus({ preventScroll: true });
    });
    return () => {
      for (const { el, inert } of covered) el.inert = inert;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose?.();
    } else if (e.key === 'Tab') {
      const els = focusable();
      if (!els.length) { e.preventDefault(); dialog.focus(); return; }
      // Safari can skip buttons in its native Tab path. Cycle the visible tab
      // stops explicitly so focus cannot leave the modal on any browser.
      const at = els.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? els.length - 1 : at - 1) : (at + 1) % els.length;
      e.preventDefault();
      els[next]!.focus();
    }
  }
</script>

<!-- The scrim closes the sheet on tap; keyboard users have Escape and the close button. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim {placement}" class:fixed aria-hidden="true" style:background={scrim === undefined ? undefined : `rgba(10, 8, 16, ${scrim})`} onclick={() => onclose?.()}></div>
<div
  bind:this={dialog}
  class="sheet {placement}"
  class:fixed
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  onkeydown={keydown}
>
  {#if placement === 'bottom'}<div class="grab"></div>{/if}
  {#if title}
    <div class="head">
      <div class="titles">
        {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
        <span class="title">{title}</span>
      </div>
      <div class="spacer"></div>
      <button type="button" class="close" aria-label="Close" onclick={() => onclose?.()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    </div>
  {/if}
  {@render children()}
</div>

<style>
  span { line-height: 1.35; }
  .scrim { position: absolute; inset: 0; background: rgba(10, 8, 16, 0.55); }
  .scrim.popover { background: rgba(10, 8, 16, 0.5); }
  /* In the app (fixed to the viewport) a sheet and its backdrop sit above the tab bar and the mini-player. */
  .scrim.fixed, .sheet.fixed { position: fixed; }
  .scrim.fixed { z-index: 50; }
  .sheet.fixed { z-index: 51; }
  .sheet {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 20px;
    background: rgba(22, 18, 32, 0.9);
    -webkit-backdrop-filter: blur(40px) saturate(1.7);
    backdrop-filter: blur(40px) saturate(1.7);
    color: var(--ink);
    font-family: var(--font-ui);
    outline: none;
  }
  .sheet.bottom {
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 20px 28px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 -20px 60px rgba(0, 0, 0, 0.6);
  }
  /* Short viewports scroll the sheet rather than compressing its information cards. */
  .sheet > :global(*) { flex-shrink: 0; }
  .sheet.popover {
    left: 108px;
    bottom: 20px;
    width: 360px;
    padding: 18px;
    background: rgba(22, 18, 32, 0.94);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 20px 60px rgba(0, 0, 0, 0.55);
  }
  .grab { width: 40px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.3); align-self: center; flex-shrink: 0; }
  .head { display: flex; align-items: flex-start; gap: 8px; }
  .titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  .eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: 0.14em; text-transform: uppercase; }
  .title { font-size: 24px; font-weight: 700; color: var(--ink); letter-spacing: -0.02em; }
  .popover .title { font-size: 20px; }
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
  @media (max-width: 300px) {
    .sheet.bottom { padding-inline: 12px; }
    .sheet.popover { left: 8px; right: 8px; width: auto; }
    .title { overflow-wrap: anywhere; }
  }
</style>
