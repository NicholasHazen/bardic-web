<script lang="ts">
  import Glyph from './Glyph.svelte';

  interface Props {
    active: 'home' | 'library' | 'settings';
  }
  let { active }: Props = $props();
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'library', label: 'Library', icon: 'library' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] as const;
</script>

<!-- The phone tab bar as drawn on the listener boards. The app shell owns the real one (A1); boards show it behind the sheets. -->
<div class="bar">
  {#each tabs as t}
    <div class="tab" class:on={t.id === active}>
      <Glyph name={t.icon} size={22} />
      <span>{t.label}</span>
    </div>
  {/each}
</div>

<style>
  span { line-height: 1.35; }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 80px;
    background: rgba(14, 12, 22, 0.86);
    -webkit-backdrop-filter: blur(30px) saturate(1.8);
    backdrop-filter: blur(30px) saturate(1.8);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    display: flex;
    box-sizing: border-box;
    font-family: var(--font-ui);
  }
  .tab { display: flex; flex-direction: column; gap: 3px; align-items: center; flex: 1; padding-top: 10px; color: var(--muted); }
  .tab.on { color: var(--accent); }
  span { font-size: 11px; font-weight: 500; }
</style>
