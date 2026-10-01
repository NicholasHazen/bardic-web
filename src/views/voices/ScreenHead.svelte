<script lang="ts">
  import RoundButton from './RoundButton.svelte';

  interface Props {
    title: string;
    onback?: () => void;
  }
  let { title, onback }: Props = $props();
</script>

<div class="head">
  <RoundButton label="Back" icon="back" onclick={() => onback?.()} />
  <h1>{title}</h1>
</div>

<style>
  .head { display: flex; align-items: center; gap: 4px; padding: 8px 12px 0; }
  h1 { line-height: 1.35; margin: 0 0 0 4px; flex: 1; font-family: var(--font-ui); font-size: 20px; font-weight: 700; color: var(--ink); }
</style>
