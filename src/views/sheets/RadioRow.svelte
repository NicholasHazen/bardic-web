<script lang="ts">
  import { radioKeydown } from './radioNav';

  interface Props {
    label: string;
    detail?: string;
    selected: boolean;
    tabindex: 0 | -1;
    onselect: () => void;
    onarrow: (index: number) => void;
  }
  let { label, detail, selected, tabindex, onselect, onarrow }: Props = $props();
</script>

<button type="button" role="radio" aria-checked={selected} {tabindex} class:on={selected} onclick={onselect} onkeydown={(e) => radioKeydown(e, onarrow)}>
  <span class="radio" class:on={selected}>{#if selected}<span class="dot"></span>{/if}</span>
  <span class="text">
    <span class="title">{label}</span>
    <span class="detail">{detail ?? ''}</span>
  </span>
</button>

<style>
  button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    min-height: 52px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-sizing: border-box;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-ui);
    color: var(--ink);
  }
  button.on { background: rgba(255, 255, 255, 0.14); border: 1.5px solid var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .radio.on { border-color: var(--accent); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .title { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>
