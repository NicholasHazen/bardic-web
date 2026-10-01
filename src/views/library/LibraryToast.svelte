<script lang="ts">
  import Toast from '../../components/Toast.svelte';
  import { dismissToast, toast } from '../../state/toast';
  import { isTablet } from '../shell/viewport';
</script>

{#if $toast}
  <div class="slot" class:tablet={$isTablet}>
    <Toast
      message={$toast.message}
      actionLabel={$toast.actionLabel}
      onaction={() => {
        const t = $toast;
        dismissToast();
        if (t?.href) location.hash = t.href;
        else t?.onaction?.();
      }}
    />
  </div>
{/if}

<style>
  .slot { position: fixed; left: 0; right: 0; bottom: 100px; z-index: 60; display: flex; justify-content: center; padding: 0 16px; pointer-events: none; }
  .slot.tablet { bottom: 124px; }
  .slot :global(*) { pointer-events: auto; }
</style>
