<script lang="ts">
  import type { Snippet } from 'svelte';
  import Glyph from './Glyph.svelte';
  import { TABS, type TabId } from './tabs';

  interface Props {
    active: TabId;
    onnavigate?: (tab: TabId) => void;
    /** The listener's avatar button, pinned to the bottom of the rail. */
    avatar?: Snippet;
  }
  let { active, onnavigate, avatar }: Props = $props();
</script>

<nav class="rail" aria-label="Main">
  <div class="logo" aria-hidden="true"><Glyph name="book" color="#1a1206" /></div>
  {#each TABS as t}
    <button type="button" class="item" class:on={t.id === active} aria-current={t.id === active ? 'page' : undefined} onclick={() => onnavigate?.(t.id)}>
      <span class="icon"><Glyph name={t.id} /></span>
      <span class="label">{t.label}</span>
    </button>
  {/each}
  {#if avatar}<div class="who">{@render avatar()}</div>{/if}
</nav>

<style>
  .rail {
    position: relative;
    width: 96px;
    flex-shrink: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding-top: 28px;
    background: rgba(14, 12, 22, 0.45);
    -webkit-backdrop-filter: blur(30px);
    backdrop-filter: blur(30px);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }
  .logo { width: 40px; height: 40px; border-radius: 12px; background: var(--accent); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
  .item { display: flex; flex-direction: column; gap: 4px; align-items: center; padding: 0; border: 0; background: none; color: var(--muted); font-family: var(--font-ui); cursor: pointer; }
  .item.on { color: var(--accent); }
  .icon { width: 48px; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .item.on .icon { background: rgba(255, 255, 255, 0.14); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  .label { font-size: 11px; font-weight: 500; line-height: 1.35; }
  .who { position: absolute; left: 24px; bottom: 28px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
</style>
