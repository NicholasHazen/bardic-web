<script lang="ts">
  import OfflineGlyph from './OfflineGlyph.svelte';

  /** The line at the top of Home and Library away from home ([HomeOffline], O4): what still works. */
  interface Props {
    title?: string;
    text?: string;
  }
  let {
    title = 'Can’t reach your Bardic computer',
    text = 'Books on this device still play. Everything else waits until you are back on your network.',
  }: Props = $props();
</script>

<div class="notice" role="status">
  <OfflineGlyph name="wifi-off" size={20} color="#ffd493" />
  <div class="words">
    <span class="title">{title}</span>
    <span class="text">{text}</span>
  </div>
</div>

<style>
  .notice { margin: 0 20px; border-radius: 16px; background: rgba(246, 185, 92, 0.2); border: 1px solid rgba(255, 255, 255, 0.14); padding: 12px 14px; display: flex; gap: 12px; align-items: flex-start; font-family: var(--font-ui); }
  .words { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .title { font-size: 14px; font-weight: 700; color: #ffd493; line-height: 1.35; }
  .text { font-size: 13px; font-weight: 400; color: var(--ink); line-height: 1.35; }
</style>
