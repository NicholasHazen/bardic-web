<script lang="ts">
  import Glyph from './Glyph.svelte';
  import { TABS, type TabId } from './tabs';

  interface Props {
    active: TabId;
    onnavigate?: (tab: TabId) => void;
  }
  let { active, onnavigate }: Props = $props();
</script>

<nav class="bar" aria-label="Main">
  {#each TABS as t}
    <button type="button" class="tab" class:on={t.id === active} aria-current={t.id === active ? 'page' : undefined} onclick={() => onnavigate?.(t.id)}>
      <Glyph name={t.id} />
      <span>{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 80px;
    box-sizing: border-box;
    display: flex;
    background: rgba(14, 12, 22, 0.86);
    -webkit-backdrop-filter: blur(30px) saturate(1.8);
    backdrop-filter: blur(30px) saturate(1.8);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
  }
  .tab {
    display: flex;
    flex-direction: column;
    gap: 3px;
    align-items: center;
    flex: 1;
    padding: 10px 0 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    cursor: pointer;
  }
  .tab.on { color: var(--accent); }
  span { font-size: 11px; font-weight: 500; line-height: 1.35; }
</style>
