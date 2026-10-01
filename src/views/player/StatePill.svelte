<script lang="ts">
  import type { Pill } from './nowPlaying';

  interface Props {
    pill: Pill;
  }
  let { pill }: Props = $props();
</script>

<span class="pill"><span class="dot" style:background={pill.dot}></span>{pill.word}</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; background: rgba(255, 255, 255, 0.12); color: var(--ink); font-family: var(--font-ui); font-size: 12px; font-weight: 600; }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
</style>
