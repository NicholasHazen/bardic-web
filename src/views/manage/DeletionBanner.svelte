<script lang="ts">
  import Button from '../../components/Button.svelte';
  import { bannerTitle, countdownBadge, countdownText } from './logic';

  /**
   * "Deleting <book>": the countdown to the permanent deletion, and Undo ([DeleteUndo]). The number is the seconds
   * left; it is drawn from the server's time, so it never tells a different story from the server.
   */
  interface Props {
    title: string;
    seconds: number;
    busy?: boolean;
    /** Why Undo did not work (the deletion is still scheduled). */
    error?: string;
    onundo?: () => void;
  }
  let { title, seconds, busy = false, error, onundo }: Props = $props();
  const name = $derived(bannerTitle(title));
</script>

<div class="banner" role="group" aria-label={name}>
  <div class="row">
    <div class="badge" aria-hidden="true"><span>{countdownBadge(seconds)}</span></div>
    <div class="text">
      <span class="title">{name}</span>
      {#if error}<span class="sub" role="alert">{error}</span>{:else}<span class="sub">{countdownText(seconds)}</span>{/if}
    </div>
    <Button disabled={busy} onclick={onundo} aria-label={title ? `Undo deleting ${title}` : 'Undo deleting this book'}>Undo</Button>
  </div>
</div>

<style>
  .banner { background: rgba(20, 16, 28, 0.92); -webkit-backdrop-filter: blur(30px) saturate(1.7); backdrop-filter: blur(30px) saturate(1.7); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 20px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 12px 32px rgba(0, 0, 0, 0.45); box-sizing: border-box; padding: 10px 12px; display: flex; align-items: center; font-family: var(--font-ui); color: var(--ink); }
  .row { display: flex; align-items: center; gap: 12px; min-width: 0; max-width: 100%; }
  .badge { width: 40px; height: 40px; border-radius: 20px; background: rgba(255, 120, 100, 0.22); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .badge span { font-size: 14px; font-weight: 700; color: #ffbcae; line-height: 1.35; font-variant-numeric: tabular-nums; }
  .text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .title { font-size: 14px; font-weight: 700; color: var(--ink); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
  @media (max-width: 300px) {
    .row { display: grid; grid-template-columns: 40px minmax(0, 1fr); width: 100%; }
    .text { overflow-wrap: anywhere; }
    .title { white-space: normal; }
    .row > :global(.btn) { grid-column: 2; justify-self: start; }
  }
</style>
