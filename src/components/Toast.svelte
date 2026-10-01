<script lang="ts">
  import Glass from './Glass.svelte';
  interface Props {
    message: string;
    actionLabel?: string;
    onaction?: () => void;
  }
  let { message, actionLabel, onaction }: Props = $props();
</script>

<Glass variant="toast" role="status" style="padding: 12px 18px; display: inline-flex; max-width: 420px">
  <div class="row">
    <span class="msg">{message}</span>
    {#if actionLabel}<button type="button" onclick={onaction}>{actionLabel}</button>{/if}
  </div>
</Glass>

<style>
  .row { display: flex; align-items: center; gap: 12px; }
  .msg { font-family: var(--font-ui); font-size: 13px; font-weight: 500; color: var(--ink); line-height: 1.35; flex: 1; }
  button { padding: 0; border: 0; background: none; font-family: var(--font-ui); font-size: 13px; font-weight: 700; color: var(--accent); line-height: 1.35; cursor: pointer; }
</style>
