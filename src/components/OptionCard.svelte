<script lang="ts">
  interface Props {
    title: string;
    detail?: string;
    selected?: boolean;
    disabled?: boolean;
    onselect?: () => void;
  }
  let { title, detail, selected = false, disabled = false, onselect }: Props = $props();
</script>

<button type="button" role="radio" aria-checked={selected} {disabled} class:on={selected} onclick={onselect}>
  <span class="radio" class:on={selected}>{#if selected}<span class="dot"></span>{/if}</span>
  <span class="text">
    <span class="title">{title}</span>
    {#if detail}<span class="detail">{detail}</span>{/if}
  </span>
</button>

<style>
  button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    min-height: 60px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-sizing: border-box;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-ui);
  }
  button.on { background: rgba(255, 255, 255, 0.14); border: 1.5px solid var(--accent); }
  button:disabled { opacity: 0.72; cursor: default; }
  .radio { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--muted); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .radio.on { border-color: var(--accent); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
  .text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .title { font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.35; }
  .detail { font-size: 12px; font-weight: 400; color: var(--muted); line-height: 1.35; }
</style>
